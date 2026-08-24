'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { PageGuard } from '@/components/common/page-guard'
import {
  CheckCircle, XCircle, RefreshCw, FileText,
  ChevronLeft, ChevronRight, ExternalLink, Loader2,
  ImageOff, AlertCircle, Check, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { PageHeader } from '@/components/common/page-header'
import { FilterBar, FilterSearch } from '@/components/common/filter-bar'
import { DataTable, AvatarCell } from '@/components/common/data-table'
import { EmptyState } from '@/components/common/empty-state'
import { DetailSheet } from '@/components/common/detail-sheet'
import { StatusBadge } from '@/components/common/status-badge'
import { PdfViewer } from '@/components/common/pdf-viewer'
import {
  getVerificationQueue, getVerificationItem, reviewDocument,
  submitVerification, validateVerification, finalizeVerification, getVerificationHistory,
  getVerificationDocumentAccess,
  documentTypeTracksExpiry,
  type VerificationItem, type ProviderDocument, type VerificationStage, type VerificationHistory,
} from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { useRole } from '@/hooks/use-role'
import { ROLE_DEFINITIONS, type Permission } from '@/lib/roles'
import { DocumentExpiryControl } from '@/components/common/document-expiry-control'
import {
  canAdminReviewProviderDocument,
  isRmRejectionCandidate,
  providerDocumentStatusPresentation,
  stageOneDocumentResolution,
  validateRmRejectedDocumentIds,
} from '@/lib/provider-verification-contract'

// Which pipeline step the viewer acts on, derived from their permissions. The
// queue is filtered to that stage; the drawer renders the matching action.
type PipelineRole = 'admin' | 'coordinator' | 'rm' | 'viewer'
const STAGE_FOR_ROLE: Record<PipelineRole, VerificationStage | undefined> = {
  admin: 'pending_documents',
  coordinator: 'docs_verified',
  rm: 'coordinator_validated',
  viewer: undefined,
}

const STAGE_LABEL: Record<string, string> = {
  pending_documents: 'Stage 1 - Document check',
  docs_verified: 'Stage 2 - Coordinator validation',
  coordinator_validated: 'Stage 3 - Regional Manager decision',
  // The backend's historical stage value is "online", but final verification
  // only makes the provider eligible to go online. Availability is a separate
  // provider-controlled state.
  online: 'Verified',
}

// The single action available on an item is decided by the item's CURRENT stage
// (not the viewer's role) intersected with the viewer's permission. A viewer who
// can see an item but holds no permission for its stage gets a read-only inspect.
type DrawerAction = 'admin' | 'coordinator' | 'rm' | 'none'
function effectiveAction(stage: VerificationStage | null, can: (p: Permission) => boolean): DrawerAction {
  if (stage === 'pending_documents' && can('verify_documents')) return 'admin'
  if (stage === 'docs_verified' && can('validate_verification')) return 'coordinator'
  if (stage === 'coordinator_validated' && can('finalize_verification')) return 'rm'
  return 'none'
}

function initials(name: string | null) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function DocsProgress({ pending, approved, rejected, total }: {
  pending: number; approved: number; rejected: number; total: number
}) {
  if (total === 0) return <span className="text-xs text-gray-400">No docs</span>
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {approved > 0 && <span className="inline-flex items-center gap-0.5 text-[11px] text-emerald-700 bg-emerald-50 px-1.5 rounded">{approved} <Check className="h-3 w-3" /></span>}
        {pending > 0 && <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-600 bg-gray-100 px-1.5 rounded">{pending}</span>}
        {rejected > 0 && <span className="inline-flex items-center gap-0.5 text-[11px] text-red-700 bg-red-50 px-1.5 rounded">{rejected} <X className="h-3 w-3" /></span>}
      </div>
      <span className="text-xs text-gray-400">/ {total}</span>
    </div>
  )
}

function DocStatusBadge({ status }: { status: string }) {
  const presentation = providerDocumentStatusPresentation(status)
  const classes =
    presentation.kind === 'approved' ? 'bg-emerald-100 text-emerald-700'
      : presentation.kind === 'rejected' ? 'bg-red-100 text-red-700'
      : presentation.kind === 'progress' ? 'bg-blue-50 text-blue-700'
      : presentation.kind === 'incomplete' || presentation.kind === 'unknown' ? 'bg-amber-50 text-amber-700'
      : 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${classes}`}>
      {presentation.kind === 'approved' && <CheckCircle className="h-3 w-3" />}
      {presentation.kind === 'rejected' && <XCircle className="h-3 w-3" />}
      {(presentation.kind === 'incomplete' || presentation.kind === 'unknown') && <AlertCircle className="h-3 w-3" />}
      {presentation.label}
    </span>
  )
}

function detectFileType(doc: ProviderDocument): 'pdf' | 'video' | 'image' | 'unknown' {
  if (doc.mime_type === 'application/pdf') return 'pdf'
  if (doc.mime_type?.startsWith('image/')) return 'image'
  if (doc.mime_type?.startsWith('video/')) return 'video'
  const lower = (doc.file_url ?? '').toLowerCase()
  if (lower.includes('.pdf') || lower.includes('/raw/upload/')) return 'pdf'
  if (lower.includes('.mp4') || lower.includes('.mov') || lower.includes('.webm')) return 'video'
  if (lower.match(/\.(jpe?g|png|webp|gif|avif)/) || lower.includes('/image/upload/')) return 'image'
  return 'unknown'
}

// ── Document image/pdf viewer ──────────────────────────────────────────────────
function DocViewer({ doc }: { doc: ProviderDocument }) {
  const [imgError, setImgError] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [url, setUrl] = useState('')
  const [loadingUrl, setLoadingUrl] = useState(true)
  const [urlError, setUrlError] = useState(false)

  const loadDocument = useCallback(async (refresh = false) => {
    setLoadingUrl(true)
    setUrlError(false)
    setImgError(false)
    setImgLoaded(false)
    try {
      const resolved = await getVerificationDocumentAccess(doc.id, { refresh })
      setUrl(resolved)
    } catch {
      setUrl('')
      setUrlError(true)
    } finally {
      setLoadingUrl(false)
    }
  }, [doc.id])

  useEffect(() => {
    let active = true
    setLoadingUrl(true)
    setUrlError(false)
    setImgError(false)
    setImgLoaded(false)
    getVerificationDocumentAccess(doc.id)
      .then(resolved => {
        if (active) setUrl(resolved)
      })
      .catch(() => {
        if (active) {
          setUrl('')
          setUrlError(true)
        }
      })
      .finally(() => {
        if (active) setLoadingUrl(false)
      })
    return () => { active = false }
  }, [doc.id])

  const fileType = detectFileType(doc)
  const isPdf = fileType === 'pdf'
  const isVideo = fileType === 'video'

  const OpenLink = url ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-orange-500 hover:text-orange-700 font-medium"
    >
      <ExternalLink className="h-3 w-3" /> Open in new tab
    </a>
  ) : null

  if (loadingUrl) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-56 bg-gray-50 rounded-xl border border-gray-100">
        <Loader2 className="h-7 w-7 animate-spin text-orange-400" />
        <p className="text-sm text-gray-500">Opening secure document…</p>
      </div>
    )
  }

  if (urlError || !url.startsWith('http')) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-56 bg-gray-50 rounded-xl border border-dashed border-gray-200">
        <ImageOff className="h-8 w-8 text-gray-300" />
        <p className="text-sm text-gray-500">This document could not be opened.</p>
        <p className="text-xs text-gray-400">The verification queue remains available. Retry only this file.</p>
        <Button size="sm" variant="outline" onClick={() => { loadDocument(true).catch(() => {}) }}>
          Retry document
        </Button>
      </div>
    )
  }

  if (isPdf) {
    return <PdfViewer url={url} label={doc.label || doc.type} height={480} />
  }

  if (isVideo) {
    return (
      <div className="rounded-xl overflow-hidden bg-black">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video src={url} controls className="w-full max-h-64" />
        <div className="flex justify-end px-2 py-1 bg-gray-900">{OpenLink}</div>
      </div>
    )
  }

  if (imgError) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
        <ImageOff className="h-8 w-8 text-gray-300" />
        <p className="text-sm text-gray-400">Image preview failed</p>
        <p className="text-[11px] text-gray-300 font-mono px-4 text-center break-all max-w-xs">{url}</p>
        {OpenLink}
      </div>
    )
  }

  return (
    <div className="rounded-xl overflow-hidden border border-gray-100 bg-gray-50">
      <div className="relative bg-black">
        {!imgLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={doc.label || doc.type}
          className="w-full max-h-72 object-contain"
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
        />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-md p-1.5 transition-colors"
          title="Open full size"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
      <div className="px-3 py-2 flex items-center justify-end gap-2 bg-gray-50">
        {OpenLink}
      </div>
    </div>
  )
}

// ── Per-document review step ──────────────────────────────────────────────────
type DocReview = { action: 'approve' | 'reject'; reason: string }

function DocumentStep({
  doc,
  index,
  total,
  existingReview,
  onSave,
  onPrev,
  onNext,
  onFinish,
  saving,
  saveError,
  refreshNote,
  readOnly = false,
  finishLabel = 'Finish',
  onExpiryStale,
}: {
  doc: ProviderDocument
  index: number
  total: number
  existingReview: DocReview | undefined
  onSave: (review: DocReview) => Promise<void>
  onPrev: () => void
  onNext: () => void
  onFinish: () => void
  saving: boolean
  saveError: string | null
  refreshNote: string | null
  // When true the per-document approve/reject controls are hidden — used by the
  // coordinator/RM who view (not re-decide) the admin's document verdicts.
  readOnly?: boolean
  finishLabel?: string
  // Called when the expiry PATCH 404s (stale/superseded id) so the drawer reloads.
  onExpiryStale?: () => void
}) {
  const defaultAction: 'approve' | 'reject' = doc.status === 'rejected' ? 'reject' : 'approve'
  const [action, setAction] = useState<'approve' | 'reject'>(existingReview?.action ?? defaultAction)
  const [reason, setReason] = useState(existingReview?.reason ?? doc.rejection_reason ?? '')
  const [error, setError] = useState('')

  useEffect(() => {
    setAction(existingReview?.action ?? (doc.status === 'rejected' ? 'reject' : 'approve'))
    setReason(existingReview?.reason ?? doc.rejection_reason ?? '')
    setError('')
  }, [doc.id, existingReview, doc.status, doc.rejection_reason])

  const isLast = index === total - 1
  const canReview = !readOnly && !existingReview && canAdminReviewProviderDocument(doc.status)
  const nonReviewMessage = !readOnly && !canReview
    ? doc.status === 'rejected' || doc.status === 'expired'
      ? 'This document is rejected. Wait for the provider to upload and confirm a replacement.'
      : doc.status === 'confirmed'
        ? 'Admin review is already saved. This document remains ready for submission and does not need to be reviewed again.'
        : doc.status === 'coordinator_validated'
          ? 'This document already passed Coordinator validation and remains ready while the provider replaces only the rejected documents.'
        : doc.status === 'uploaded'
          ? 'The upload was started but not confirmed. The provider must finish or retry the upload.'
          : existingReview
            ? 'This decision has been saved. Continue through the remaining documents.'
            : 'This document is not reviewable at its current status.'
    : null

  async function handleSave() {
    if (action === 'reject' && reason.trim().length < 5) {
      setError('Rejection reason must be at least 5 characters.')
      return
    }
    setError('')
    await onSave({ action, reason: reason.trim() })
  }

  // Progress dots — all docs, highlight current
  return (
    <div className="flex flex-col gap-4">
      {/* Progress bar */}
      <div className="flex items-center gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < index ? 'bg-emerald-400'
              : i === index ? 'bg-orange-400'
              : 'bg-gray-200'
            }`}
          />
        ))}
      </div>

      {/* Doc header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
            Document {index + 1} of {total}
          </p>
          <p className="text-base font-semibold text-gray-900 mt-0.5">{doc.label || doc.type}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <p className="text-xs text-gray-400">Uploaded {formatDate(doc.uploaded_at)}</p>
            {doc.version > 1 && (
              <span className="text-[11px] bg-gray-100 text-gray-600 px-1.5 rounded font-medium">v{doc.version}</span>
            )}
            {documentTypeTracksExpiry(doc.type) ? (
              <DocumentExpiryControl
                documentId={doc.id}
                documentType={doc.type}
                expiresAt={doc.expires_at}
                onStale={onExpiryStale}
              />
            ) : doc.expires_at ? (
              <span className="text-[11px] bg-gray-100 text-gray-500 px-1.5 rounded">
                Expires {new Date(doc.expires_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            ) : null}
          </div>
        </div>
        <DocStatusBadge status={existingReview ? (existingReview.action === 'approve' ? 'confirmed' : 'rejected') : doc.status} />
      </div>

      {/* Prior rejection warning */}
      {doc.status === 'rejected' && doc.rejection_reason && !existingReview && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-red-700">Previously rejected</p>
            <p className="text-xs text-red-600 mt-0.5">{doc.rejection_reason}</p>
          </div>
        </div>
      )}

      {/* Document viewer */}
      <DocViewer doc={doc} />

      {/* Review controls */}
      {nonReviewMessage && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <p>{nonReviewMessage}</p>
        </div>
      )}
      {canReview && (<>
      <div className="flex gap-2">
        {(['approve', 'reject'] as const).map(a => (
          <button
            key={a}
            type="button"
            onClick={() => { setAction(a); setError('') }}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors border ${
              action === a
                ? a === 'approve'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-red-50 text-red-700 border-red-200'
                : 'text-gray-500 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {a === 'approve'
              ? <><CheckCircle className="h-4 w-4" /> Approve</>
              : <><XCircle className="h-4 w-4" /> Reject</>
            }
          </button>
        ))}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          {action === 'reject'
            ? <>Reason <span className="text-gray-400">(required, min 5 chars)</span></>
            : <span className="text-gray-400">Note (optional)</span>
          }
        </label>
        <textarea
          value={reason}
          onChange={e => { setReason(e.target.value); setError('') }}
          rows={2}
          className="w-full rounded-lg border border-gray-200 text-sm px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-200"
          placeholder={action === 'approve' ? 'Document looks valid.' : 'Describe the issue…'}
        />
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />{error}
        </p>
      )}
      </>)}

      {saveError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-red-700">Save failed</p>
            <p className="text-xs text-red-600 mt-0.5">{saveError}</p>
          </div>
        </div>
      )}

      {refreshNote && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          <RefreshCw className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-amber-700">Document reloaded</p>
            <p className="text-xs text-amber-600 mt-0.5">{refreshNote}</p>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
        <Button variant="outline" size="sm" onClick={onPrev} disabled={index === 0} className="gap-1">
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        {canReview && (
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 gap-1.5 text-white"
            style={{ backgroundColor: action === 'approve' ? '#059669' : '#DC2626' }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : action === 'approve' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {saving ? 'Saving…' : action === 'approve' ? 'Approve' : 'Reject'}
          </Button>
        )}
        {isLast ? (
          <Button size="sm" variant={readOnly ? 'default' : 'outline'} onClick={onFinish} className={readOnly ? 'flex-1 gap-1 text-white' : 'gap-1'} style={readOnly ? { backgroundColor: '#F5A623' } : undefined}>
            {finishLabel} <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={onNext} className="gap-1">
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Final provider decision ───────────────────────────────────────────────────
function FinalDecisionStep({
  item,
  documents,
  reviews,
  onBack,
  onSubmit,
  submitting,
  canReviewTiers,
  approveLabel = 'Approve Provider',
  rejectLabel = 'Reject Provider',
  heading = 'Overall Provider Decision',
  showTiers = true,
  requireRejectedDocuments = false,
}: {
  item: VerificationItem
  documents: ProviderDocument[]
  reviews: Map<string, DocReview>
  onBack: () => void
  onSubmit: (action: 'approve' | 'reject', reason: string, rejectedDocumentIds?: string[]) => Promise<void>
  submitting: boolean
  canReviewTiers: boolean
  approveLabel?: string
  rejectLabel?: string
  heading?: string
  showTiers?: boolean
  requireRejectedDocuments?: boolean
}) {
  const needsReview = (s: string) => s === 'pending_review' || s === 'uploaded'
  const isVerifiedAtThisStage = (s: string) =>
    s === 'confirmed' || s === 'coordinator_validated' || s === 'approved'
  const resolved = documents.map(d => ({
    doc: d,
    review: reviews.get(d.id) ?? (!needsReview(d.status)
      ? { action: isVerifiedAtThisStage(d.status) ? 'approve' : 'reject' as 'approve' | 'reject', reason: d.rejection_reason ?? '' }
      : null),
  }))
  const allApproved = resolved.length > 0 && resolved.every(r => r.review?.action === 'approve')
  const anyRejected = resolved.some(r => r.review?.action === 'reject')
  const anyUnresolved = resolved.some(r => r.review == null)
  const suggested: 'approve' | 'reject' = allApproved ? 'approve' : 'reject'

  const [action, setAction] = useState<'approve' | 'reject'>(suggested)
  const [reason, setReason] = useState(suggested === 'approve' ? 'All documents reviewed and verified.' : '')
  const [rejectedDocumentIds, setRejectedDocumentIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const rejectionCandidates = documents.filter(document => isRmRejectionCandidate({
    id: document.id,
    status: document.status,
    isCurrent: document.isCurrent,
  }))
  const needsRejectionSelection = requireRejectedDocuments && action === 'reject'
  const rejectionSelectionComplete = !needsRejectionSelection || rejectedDocumentIds.size > 0

  function toggleRejectedDocument(documentId: string, checked: boolean) {
    setRejectedDocumentIds(previous => {
      const next = new Set(previous)
      if (checked) next.add(documentId)
      else next.delete(documentId)
      return next
    })
    setError('')
  }

  async function handleSubmit() {
    if (reason.trim().length < 5) { setError('Reason must be at least 5 characters.'); return }
    if (action === 'approve' && !allApproved) {
      setError('Every current document must be independently approved before the provider can be approved.')
      return
    }
    let selectedIds: string[] | undefined
    if (needsRejectionSelection) {
      try {
        selectedIds = validateRmRejectedDocumentIds(
          documents.map(document => ({
            id: document.id,
            status: document.status,
            isCurrent: document.isCurrent,
          })),
          [...rejectedDocumentIds],
        )
      } catch (selectionError) {
        setError(selectionError instanceof Error ? selectionError.message : 'Select the documents that need replacement.')
        return
      }
    }
    setError('')
    try {
      await onSubmit(action, reason.trim(), selectedIds)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to submit provider decision.')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Decision</p>
        <p className="text-base font-semibold text-gray-900 mt-0.5">{heading}</p>
      </div>

      {/* Doc summary */}
      <div className="bg-gray-50 rounded-xl p-3 space-y-2 max-h-44 overflow-y-auto">
        {resolved.map(({ doc, review }) => (
          <div key={doc.id} className="flex items-center justify-between gap-2">
            <p className="text-sm text-gray-700 truncate">{doc.label || doc.type}</p>
            {review
              ? <DocStatusBadge status={reviews.has(doc.id) ? (review.action === 'approve' ? 'confirmed' : 'rejected') : doc.status} />
              : <span className="text-xs text-gray-400 italic">Not reviewed</span>
            }
          </div>
        ))}
      </div>

      {/* BR-46: category authority belongs to a physical vehicle. Never expose
          the legacy driver-level approval endpoint on a release surface. */}
      {showTiers && item.provider_type === 'driver' && (
        <div className="border border-gray-100 rounded-xl p-3 text-sm">
          <p className="font-medium text-gray-800">Vehicle-specific ride categories</p>
          <p className="text-xs text-gray-500 mt-1">
            Vehicle approval and category approval are separate decisions.
          </p>
          <Link className="inline-block mt-2 text-xs font-medium text-orange-600" href="/verifications/vehicles">
            {canReviewTiers ? 'Review vehicle categories' : 'View vehicle categories'}
          </Link>
        </div>
      )}

      {anyRejected && (
        <div className="flex items-start gap-2 bg-red-50 text-red-700 text-xs rounded-lg px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          One or more documents rejected - approval not recommended.
        </div>
      )}
      {anyUnresolved && (
        <div className="flex items-start gap-2 bg-amber-50 text-amber-700 text-xs rounded-lg px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          One or more documents still require an independent decision. Provider approval is blocked.
        </div>
      )}
      {documents.length === 0 && (
        <div className="flex items-start gap-2 bg-red-50 text-red-700 text-xs rounded-lg px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          No current documents were returned. Provider approval is blocked.
        </div>
      )}
      {allApproved && (
        <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 text-xs rounded-lg px-3 py-2">
          <CheckCircle className="h-3.5 w-3.5 shrink-0" />
          All documents approved - provider can be verified.
        </div>
      )}

      <div className="flex gap-2">
        {(['approve', 'reject'] as const).map(a => (
          <button
            key={a}
            type="button"
            onClick={() => {
              setAction(a)
              setReason(a === 'approve' ? 'All documents reviewed and verified.' : '')
            }}
            disabled={a === 'approve' && !allApproved}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors border ${
              action === a
                ? a === 'approve'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-red-50 text-red-700 border-red-200'
                : 'text-gray-500 border-gray-200 hover:bg-gray-50'
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {a === 'approve'
              ? <><CheckCircle className="h-4 w-4" /> {approveLabel}</>
              : <><XCircle className="h-4 w-4" /> {rejectLabel}</>
            }
          </button>
        ))}
      </div>

      {needsRejectionSelection && (
        <div className="space-y-3 rounded-xl border border-red-200 bg-red-50/40 p-3">
          <div>
            <p className="text-sm font-semibold text-red-800">Select documents that require replacement</p>
            <p className="text-xs text-red-700 mt-1">
              Select one or more current documents. Only the selected documents will be marked rejected and shown to the provider for re-upload.
            </p>
          </div>
          {rejectionCandidates.length === 0 ? (
            <div className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              No current Coordinator-validated document is eligible. Reload the provider before making a final decision.
            </div>
          ) : (
            <div className="space-y-2">
              {rejectionCandidates.map(document => {
                const checkboxId = `reject-document-${document.id}`
                return (
                  <label key={document.id} htmlFor={checkboxId} className="flex items-start gap-2 rounded-lg border border-red-100 bg-white px-3 py-2 cursor-pointer">
                    <Checkbox
                      id={checkboxId}
                      checked={rejectedDocumentIds.has(document.id)}
                      onCheckedChange={checked => toggleRejectedDocument(document.id, checked === true)}
                      className="mt-0.5 border-red-300 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-800">{document.label || document.type}</span>
                      <span className="block text-[11px] text-gray-500">Version {document.version} · {document.id.slice(0, 8)}…</span>
                    </span>
                  </label>
                )
              })}
            </div>
          )}
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            The provider will be unable to complete verification until replacements for the selected documents are uploaded and pass the review chain again.
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Reason <span className="text-gray-400">(required, min 5 chars)</span>
        </label>
        <textarea
          value={reason}
          onChange={e => { setReason(e.target.value); setError('') }}
          rows={3}
          className="w-full rounded-lg border border-gray-200 text-sm px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-200"
          placeholder={action === 'approve' ? 'All documents reviewed and verified.' : 'Provide a reason for rejection…'}
        />
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />{error}
        </p>
      )}

      <div className="flex gap-2 pt-2 border-t border-gray-100">
        <Button variant="outline" size="sm" onClick={onBack} className="gap-1">
          <ChevronLeft className="h-4 w-4" /> Back to Docs
        </Button>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={submitting || (action === 'approve' && !allApproved) || !rejectionSelectionComplete || (needsRejectionSelection && rejectionCandidates.length === 0)}
          className="flex-1 text-white"
          style={{ backgroundColor: action === 'approve' ? '#059669' : '#DC2626' }}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitting ? 'Submitting…' : `Confirm ${action === 'approve' ? 'Approval' : 'Rejection'}`}
        </Button>
      </div>
    </div>
  )
}

// ── Admin submit-to-coordinator step ──────────────────────────────────────────
function AdminSubmitStep({
  documents,
  reviews,
  onBack,
  onSubmit,
  submitting,
  reviewOnly = false,
}: {
  documents: ProviderDocument[]
  reviews: Map<string, DocReview>
  onBack: () => void
  onSubmit: () => Promise<void>
  submitting: boolean
  reviewOnly?: boolean
}) {
  const resolved = documents.map(d => ({
    doc: d,
    review: reviews.get(d.id),
    resolution: stageOneDocumentResolution(d.status, reviews.get(d.id)?.action),
  }))
  const allReady = resolved.length > 0 && resolved.every(row => row.resolution === 'ready')
  const awaitingProvider = resolved.filter(row => row.resolution === 'waiting_for_provider').length
  const awaitingReview = resolved.filter(row => row.resolution === 'needs_review').length
  const incompleteUploads = resolved.filter(row => row.resolution === 'upload_incomplete').length
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (documents.length === 0) { setError('At least one current document is required before submitting.'); return }
    if (!allReady) { setError('Every current document must pass Admin review before it can be submitted.'); return }
    setError('')
    try {
      await onSubmit()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to submit to coordinator.')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Stage 1 of 3 — Admin</p>
        <p className="text-base font-semibold text-gray-900 mt-0.5">Submit to Coordinator</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {reviewOnly
            ? 'The provider account remains independent, but this document is not approved until the category Coordinator and Regional Manager complete their reviews.'
            : 'Confirm each document is authentic, then hand off to the category coordinator.'}
        </p>
      </div>

      <div className="bg-gray-50 rounded-xl p-3 space-y-2 max-h-56 overflow-y-auto">
        {resolved.map(({ doc, review }) => (
          <div key={doc.id} className="flex items-center justify-between gap-2">
            <p className="text-sm text-gray-700 truncate">{doc.label || doc.type}</p>
            <DocStatusBadge status={review ? (review.action === 'approve' ? 'confirmed' : 'rejected') : doc.status} />
          </div>
        ))}
      </div>

      {awaitingProvider > 0 && (
        <div className="flex items-start gap-2 bg-red-50 text-red-700 text-xs rounded-lg px-3 py-2">
          <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          {awaitingProvider} rejected or expired document{awaitingProvider === 1 ? '' : 's'} must be replaced by the provider before submission.
        </div>
      )}
      {awaitingReview > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 text-amber-700 text-xs rounded-lg px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          {awaitingReview} document{awaitingReview === 1 ? '' : 's'} still require{awaitingReview === 1 ? 's' : ''} Admin review.
        </div>
      )}
      {incompleteUploads > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 text-amber-700 text-xs rounded-lg px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          {incompleteUploads} upload{incompleteUploads === 1 ? ' was' : 's were'} not completed. Wait for the provider to finish or retry.
        </div>
      )}
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />{error}
        </p>
      )}

      <div className="flex gap-2 pt-2 border-t border-gray-100">
        <Button variant="outline" size="sm" onClick={onBack} className="gap-1">
          <ChevronLeft className="h-4 w-4" /> Back to Docs
        </Button>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={submitting || !allReady}
          className="flex-1 text-white"
          style={{ backgroundColor: '#F5A623' }}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitting ? 'Submitting…' : 'Submit to Coordinator'}
        </Button>
      </div>
    </div>
  )
}

// ── Read-only inspect (viewer has no action at this item's stage) ──────────────
function InspectStep({
  stage,
  onBack,
  onClose,
}: {
  stage: VerificationStage | null
  onBack: () => void
  onClose: () => void
}) {
  const label = stage ? (STAGE_LABEL[stage] ?? stage) : 'Unknown stage'
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Inspect</p>
        <p className="text-base font-semibold text-gray-900 mt-0.5">No action at this stage</p>
      </div>
      <div className="flex items-start gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-3">
        <AlertCircle className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
        <p className="text-sm text-gray-600">
          This provider is at <strong>{label}</strong>. You can review the documents above, but the next
          action belongs to a different level of the pipeline — there is nothing for you to submit here.
        </p>
      </div>
      <div className="flex gap-2 pt-2 border-t border-gray-100">
        <Button variant="outline" size="sm" onClick={onBack} className="gap-1">
          <ChevronLeft className="h-4 w-4" /> Back to Docs
        </Button>
        <Button size="sm" variant="outline" className="flex-1" onClick={onClose}>Close</Button>
      </div>
    </div>
  )
}

// ── Approval chain (who did each stage) — gated to coordinator/RM/global ───────
function ApprovalChain({ history, showStages }: { history: VerificationHistory; showStages: VerificationStage[] }) {
  const rows: { key: VerificationStage; label: string; who: { by: string; at: string } | null; decision?: string }[] = [
    { key: 'pending_documents' as VerificationStage, label: 'Document check · Admin', who: history.stage1 },
    { key: 'docs_verified' as VerificationStage, label: 'Validation · Coordinator', who: history.stage2 },
    { key: 'coordinator_validated' as VerificationStage, label: 'Final · Regional Manager', who: history.stage3, decision: history.stage3?.decision },
  ].filter(r => showStages.includes(r.key))
  if (rows.length === 0) return null
  return (
    <div className="rounded-xl border border-gray-100 p-3 mb-4">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Approval chain</p>
      <div className="space-y-1.5">
        {rows.map(r => (
          <div key={r.key} className="flex items-center justify-between gap-2 text-sm">
            <span className="text-gray-500">{r.label}</span>
            {r.who ? (
              <span className="text-gray-800 font-medium">
                {r.decision === 'rejected' && <span className="text-red-600 mr-1">Rejected by</span>}
                {r.who.by}
                <span className="text-gray-400 font-normal ml-1.5">
                  {new Date(r.who.at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </span>
            ) : (
              <span className="text-gray-300 text-xs italic">Awaiting</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// Sort active reviews first. A timely replacement is intentionally non-current
// until RM approval, so keep that one review candidate while dropping history.
const docStatusRank = (s: string) =>
  ['pending_review', 'confirmed', 'coordinator_validated'].includes(s) ? 0 : s === 'uploaded' ? 1 : 2
function sortReviewDocs(docs: ProviderDocument[]): ProviderDocument[] {
  return [...docs]
    .filter(d => d.isCurrent !== false || d.isReplacement)
    .sort((a, b) => docStatusRank(a.status) - docStatusRank(b.status))
}

// ── Review drawer ─────────────────────────────────────────────────────────────
function ReviewDrawer({
  item,
  onClose,
  onDone,
}: {
  item: VerificationItem
  onClose: () => void
  onDone: () => void
}) {
  const { can, role } = useRole()
  // The available action is decided by the item's current stage + the viewer's
  // permission — not the viewer's "home" role. This prevents, e.g., an RM
  // opening a pending_documents item from being offered "Approve & Send Online".
  const action = effectiveAction(item.verification_stage, can)
  const canReviewTiers = can('finalize_verification')
  // The approval chain (who did each stage) is restricted: admins (entry level)
  // don't see it; coordinators see Stages 1–2; RM/global see all stages.
  const isGlobal = role ? (ROLE_DEFINITIONS[role]?.global ?? false) : false
  const chainStages: VerificationStage[] =
    isGlobal || can('finalize_verification') ? ['pending_documents', 'docs_verified', 'coordinator_validated']
      : can('validate_verification') ? ['pending_documents', 'docs_verified']
      : []
  const [history, setHistory] = useState<VerificationHistory | null>(null)
  useEffect(() => {
    if (chainStages.length === 0) return
    getVerificationHistory(item.provider_id, item.provider_type as 'driver' | 'artisan')
      .then(setHistory)
      .catch(() => setHistory(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.provider_id, item.provider_type])
  // Only the admin document-check step edits per-document verdicts; every other
  // action (and the read-only inspect) views them.
  const docsReadOnly = action !== 'admin'

  const [documents, setDocuments] = useState<ProviderDocument[]>(() => sortReviewDocs(item.documents ?? []))
  const [currentIndex, setCurrentIndex] = useState(0)
  const [reviews, setReviews] = useState<Map<string, DocReview>>(new Map())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [refreshNote, setRefreshNote] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [step, setStep] = useState<'docs' | 'final'>('docs')
  const [submitting, setSubmitting] = useState(false)

  const currentDoc = documents[currentIndex]

  // Clear transient banners when the user navigates to a different document.
  useEffect(() => { setSaveError(null); setRefreshNote(null) }, [currentIndex])

  // Refetch this provider's queue row so document ids reflect the latest
  // versions. A re-upload supersedes the version we're holding, so a stale
  // snapshot points at a non-current id the backend rejects with
  // DOCUMENT_NOT_FOUND. Returns the refreshed (sorted, current-only) list.
  const refresh = useCallback(async (): Promise<ProviderDocument[]> => {
    setRefreshing(true)
    try {
      const fresh = await getVerificationItem(item.provider_id, item.provider_type)
      const docs = sortReviewDocs(fresh?.documents ?? [])
      setDocuments(docs)
      setCurrentIndex(i => Math.min(i, Math.max(0, docs.length - 1)))
      return docs
    } finally {
      setRefreshing(false)
    }
  }, [item.provider_id, item.provider_type])

  async function handleDocSave(review: DocReview) {
    if (!currentDoc) return
    setSaving(true)
    setSaveError(null)
    setRefreshNote(null)
    try {
      await reviewDocument(currentDoc.id, item.provider_type, review.action, review.reason || (review.action === 'approve' ? 'Approved.' : ''))
      setReviews(prev => new Map(prev).set(currentDoc.id, review))
    } catch (err) {
      const e = err instanceof ApiError ? err : null
      console.error('[verifications] reviewDocument failed', {
        status: e?.status,
        code: e?.code,
        supportReference: e?.supportReference,
      })
      // A re-upload supersedes the version we're holding — refetch the current
      // version and prompt a retry instead of surfacing a raw 404.
      if (e?.code === 'DOCUMENT_NOT_FOUND' || e?.status === 404) {
        try {
          await refresh()
          setRefreshNote('This document was re-uploaded since you opened the queue. The latest version is now loaded — please review it again.')
        } catch {
          setSaveError('This document was re-uploaded and the latest version could not be reloaded. Close and reopen the review to continue.')
        }
      } else {
        setSaveError(e?.message ?? 'Failed to save document review.')
      }
    } finally {
      setSaving(false)
    }
  }

  const providerType = item.provider_type as 'driver' | 'artisan'

  // Coordinator (validate) / RM (finalize) decision — chosen by the item's stage.
  async function handleDecisionSubmit(
    decision: 'approve' | 'reject',
    reason: string,
    rejectedDocumentIds?: string[],
  ) {
    setSubmitting(true)
    try {
      if (action === 'rm') {
        await finalizeVerification(
          item.provider_id,
          providerType,
          decision,
          reason,
          rejectedDocumentIds,
        )
      } else {
        await validateVerification(item.provider_id, providerType, decision, reason)
      }
      onDone()
    } catch (err) {
      setSubmitting(false)
      throw err
    }
  }

  // Admin submit-to-coordinator.
  async function handleAdminSubmit() {
    setSubmitting(true)
    try {
      await submitVerification(item.provider_id, providerType)
      onDone()
    } catch (err) {
      setSubmitting(false)
      throw err
    }
  }

  return (
    <DetailSheet
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-gray-100 text-gray-600 text-sm font-bold">
              {initials(item.provider_name)}
            </AvatarFallback>
          </Avatar>
          <span>{item.provider_name ?? 'Unknown provider'}</span>
        </span>
      }
      subtitle={<span className="font-mono">{item.provider_id.slice(0, 8)}...</span>}
      status={
        <>
          <StatusBadge status={item.provider_type} />
          <button
            type="button"
            onClick={() => { refresh().catch(() => {}) }}
            disabled={refreshing}
            aria-label="Reload latest document versions"
            title="Reload latest document versions"
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-md hover:bg-gray-100 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </>
      }
    >
      <div>
          {history && chainStages.length > 0 && (
            <ApprovalChain history={history} showStages={chainStages} />
          )}
          {documents.length === 0 ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col items-center justify-center h-32 gap-2 text-center">
                <FileText className="h-8 w-8 text-gray-200" />
                <p className="text-sm font-medium text-gray-600">Documents not returned by API</p>
                <p className="text-xs text-gray-400 max-w-xs">
                  The queue shows {item.total_docs} document{item.total_docs !== 1 ? 's' : ''} for this provider,
                  but the <code className="font-mono bg-gray-100 px-1 rounded">GET /admin/verifications</code> endpoint
                  returned an empty <code className="font-mono bg-gray-100 px-1 rounded">documents</code> array.
                  The backend query needs to include a <code className="font-mono bg-gray-100 px-1 rounded">JSON_AGG</code> of the document rows.
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={onClose}>Close</Button>
                <Button size="sm" variant="brand" className="flex-1" onClick={() => { refresh().catch(() => {}) }} disabled={refreshing}>
                  {refreshing ? 'Reloading…' : 'Reload Documents'}
                </Button>
              </div>
            </div>
          ) : step === 'docs' && currentDoc ? (
            <DocumentStep
              doc={currentDoc}
              index={currentIndex}
              total={documents.length}
              existingReview={reviews.get(currentDoc.id)}
              onSave={handleDocSave}
              onPrev={() => setCurrentIndex(i => Math.max(0, i - 1))}
              onNext={() => setCurrentIndex(i => Math.min(documents.length - 1, i + 1))}
              onFinish={() => setStep('final')}
              saving={saving}
              saveError={saveError}
              refreshNote={refreshNote}
              readOnly={docsReadOnly}
              finishLabel={action === 'admin' ? 'Finish' : action === 'none' ? 'Done' : 'Continue'}
              onExpiryStale={() => { refresh().catch(() => {}) }}
            />
          ) : step === 'final' ? (
            action === 'none' ? (
              <InspectStep stage={item.verification_stage} onBack={() => setStep('docs')} onClose={onClose} />
            ) : action === 'admin' ? (
              <AdminSubmitStep
                documents={documents}
                reviews={reviews}
                onBack={() => setStep('docs')}
                onSubmit={handleAdminSubmit}
                submitting={submitting}
                reviewOnly={item.document_review_only}
              />
            ) : (
              <FinalDecisionStep
                item={item}
                documents={documents}
                reviews={reviews}
                onBack={() => setStep('docs')}
                onSubmit={handleDecisionSubmit}
                submitting={submitting}
                canReviewTiers={canReviewTiers}
                showTiers={action === 'rm'}
                heading={action === 'rm' ? 'Final verification' : 'Validate documents'}
                approveLabel={action === 'rm' ? 'Approve provider' : 'Send to Regional Manager'}
                rejectLabel={action === 'rm' ? 'Reject provider' : 'Return to admin'}
                requireRejectedDocuments={action === 'rm'}
              />
            )
          ) : null}
      </div>
    </DetailSheet>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function VerificationsPage() {
  const { can, role } = useRole()
  // The stages a viewer may see, mirroring the server-side boundary: admin →
  // Stage 1 only; coordinator → Stages 1–2; RM and any global role → all three.
  const isGlobal = role ? (ROLE_DEFINITIONS[role]?.global ?? false) : false
  const allowedStages: VerificationStage[] =
    isGlobal || can('finalize_verification') ? ['pending_documents', 'docs_verified', 'coordinator_validated']
    : can('validate_verification') ? ['pending_documents', 'docs_verified']
    : can('verify_documents') ? ['pending_documents']
    : ['pending_documents', 'docs_verified', 'coordinator_validated']
  // A single allowed stage (admin) needs no filter — lock to it and hide the UI.
  const defaultStage: VerificationStage | 'all' =
    allowedStages.length === 1 ? allowedStages[0] : 'all'

  const [items, setItems] = useState<VerificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [stageFilter, setStageFilter] = useState<VerificationStage | 'all'>(defaultStage)
  const [reviewing, setReviewing] = useState<VerificationItem | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getVerificationQueue(stageFilter === 'all' ? undefined : { stage: stageFilter })
      if (Array.isArray(data)) {
        setItems(data)
      } else if (data && typeof data === 'object' && Array.isArray((data as any).items)) {
        setItems((data as any).items)
      } else {
        setItems([])
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load verification queue.')
    } finally {
      setLoading(false)
    }
  }, [stageFilter])

  useEffect(() => { load() }, [load])
  useAutoRefresh(load)

  const filtered = items.filter(v => {
    const name = v.provider_name?.toLowerCase() ?? ''
    const matchSearch = name.includes(search.toLowerCase()) || v.provider_id.includes(search)
    const matchType = typeFilter === 'all' || v.provider_type === typeFilter
    return matchSearch && matchType
  })

  const pendingCount = items.filter(v => Number(v.docs_pending) > 0).length

  return (
    <PageGuard permission="view_verifications">
    <div>
      <PageHeader
        title="Provider verifications"
        subtitle="Documents and approval stages for drivers and artisans"
      />

      <FilterBar onRefresh={load} refreshing={loading} meta={`${pendingCount} pending docs - ${items.length} providers`}>
        <FilterSearch value={search} onChange={setSearch} placeholder="Search by name or ID..." />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-9 w-36 bg-white"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="driver">Drivers</SelectItem>
            <SelectItem value="artisan">Artisans</SelectItem>
          </SelectContent>
        </Select>
        {allowedStages.length > 1 && (
          <Select value={stageFilter} onValueChange={v => setStageFilter(v as VerificationStage | 'all')}>
            <SelectTrigger className="h-9 w-56 bg-white"><SelectValue placeholder="Stage" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {allowedStages.map(s => (
                <SelectItem key={s} value={s}>{STAGE_LABEL[s] ?? s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FilterBar>

      <DataTable
        columns={[
          {
            key: 'provider',
            header: 'Provider',
            render: v => (
              <AvatarCell
                name={v.provider_name}
                sub={<span className="font-mono">{v.provider_id.slice(0, 8)}...</span>}
              />
            ),
          },
          {
            key: 'type',
            header: 'Type',
            render: v => <StatusBadge status={v.provider_type} />,
          },
          {
            key: 'stage',
            header: 'Stage',
            render: v => (
              <span className="text-xs text-gray-500">
                {v.verification_stage
                  ? `${STAGE_LABEL[v.verification_stage] ?? v.verification_stage}${v.document_review_only ? ' - Document' : ''}`
                  : '-'}
              </span>
            ),
          },
          {
            key: 'documents',
            header: 'Documents',
            render: v => (
              <DocsProgress
                pending={Number(v.docs_pending)}
                approved={Number(v.docs_approved)}
                rejected={Number(v.docs_rejected)}
                total={Number(v.total_docs)}
              />
            ),
          },
          {
            key: 'first_upload',
            header: 'First upload',
            render: v => <span className="text-sm text-gray-500">{formatDate(v.first_upload_at)}</span>,
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: v => (
              <Button
                size="sm"
                variant="brand"
                className="gap-1.5 text-xs h-7"
                onClick={e => { e.stopPropagation(); setReviewing(v) }}
              >
                Review
              </Button>
            ),
          },
        ]}
        rows={filtered}
        rowKey={v => v.provider_id}
        loading={loading}
        error={error || null}
        onRetry={load}
        onRowClick={v => setReviewing(v)}
        rowAriaLabel={v => `Review ${v.provider_name ?? 'provider'}`}
        empty={
          <EmptyState
            icon={FileText}
            title={search || typeFilter !== 'all' ? 'No results match your filters' : 'Verification queue is empty'}
          />
        }
        caption={loading ? 'Loading...' : `Showing ${filtered.length} of ${items.length} providers`}
      />

      {reviewing && (
        <ReviewDrawer
          item={reviewing}
          onClose={() => { setReviewing(null); load() }}
          onDone={() => { setReviewing(null); load() }}
        />
      )}
    </div>
    </PageGuard>
  )
}
