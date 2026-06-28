'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { PageGuard } from '@/components/common/page-guard'
import {
  Search, CheckCircle, XCircle, RefreshCw, FileText,
  ChevronLeft, ChevronRight, ExternalLink, Loader2,
  ImageOff, AlertCircle, Check, X,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { PdfViewer } from '@/components/common/pdf-viewer'
import {
  getVerificationQueue, getVerificationItem, reviewDocument,
  submitVerification, validateVerification, finalizeVerification,
  type VerificationItem, type ProviderDocument, type VerificationStage,
} from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { useRole } from '@/hooks/use-role'
import { ROLE_DEFINITIONS, type Permission } from '@/lib/roles'
import { DriverRideCategoriesSection } from '@/components/users/driver-ride-categories-section'

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
  pending_documents: 'Stage 1 — Document check',
  docs_verified: 'Stage 2 — Coordinator',
  coordinator_validated: 'Stage 3 — RM final',
  online: 'Online',
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
  if (status === 'approved' || status === 'confirmed') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
      <CheckCircle className="h-3 w-3" /> Approved
    </span>
  )
  if (status === 'rejected') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
      <XCircle className="h-3 w-3" /> Rejected
    </span>
  )
  if (status === 'uploaded') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
      Awaiting Upload
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
      Pending Review
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

  const url: string = doc.file_url ?? ''
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

  // fileUrl is only a real URL after confirmDocumentUpload — status 'uploaded' stores a storage key path
  if (!url || !url.startsWith('http')) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-56 bg-gray-50 rounded-xl border border-dashed border-gray-200">
        <ImageOff className="h-8 w-8 text-gray-300" />
        <p className="text-sm text-gray-400">
          {!url ? 'No file URL attached' : 'File not yet confirmed by the app - waiting for upload to complete'}
        </p>
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
  pendingOnly,
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
}: {
  doc: ProviderDocument
  index: number
  total: number
  pendingOnly: ProviderDocument[]
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
            {doc.expires_at && (
              <span className="text-[11px] bg-gray-100 text-gray-500 px-1.5 rounded">
                Expires {new Date(doc.expires_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
        </div>
        <DocStatusBadge status={existingReview ? (existingReview.action === 'approve' ? 'approved' : 'rejected') : doc.status} />
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
      {!readOnly && (<>
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
        {!readOnly && (
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
}: {
  item: VerificationItem
  documents: ProviderDocument[]
  reviews: Map<string, DocReview>
  onBack: () => void
  onSubmit: (action: 'approve' | 'reject', reason: string) => Promise<void>
  submitting: boolean
  canReviewTiers: boolean
  approveLabel?: string
  rejectLabel?: string
  heading?: string
  showTiers?: boolean
}) {
  const needsReview = (s: string) => s === 'pending_review' || s === 'uploaded'
  const resolved = documents.map(d => ({
    doc: d,
    review: reviews.get(d.id) ?? (!needsReview(d.status)
      ? { action: (d.status === 'approved' || d.status === 'confirmed') ? 'approve' : 'reject' as 'approve' | 'reject', reason: d.rejection_reason ?? '' }
      : null),
  }))
  const allApproved = resolved.every(r => r.review?.action === 'approve')
  const anyRejected = resolved.some(r => r.review?.action === 'reject')
  const suggested: 'approve' | 'reject' = allApproved ? 'approve' : 'reject'

  const [action, setAction] = useState<'approve' | 'reject'>(suggested)
  const [reason, setReason] = useState(suggested === 'approve' ? 'All documents reviewed and verified.' : '')
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (reason.trim().length < 5) { setError('Reason must be at least 5 characters.'); return }
    setError('')
    await onSubmit(action, reason.trim())
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
              ? <DocStatusBadge status={review.action === 'approve' ? 'approved' : 'rejected'} />
              : <span className="text-xs text-gray-400 italic">Not reviewed</span>
            }
          </div>
        ))}
      </div>

      {/* Ride-tier verification — drivers pick tiers at signup; an admin must
          confirm the vehicle qualifies for each before the driver is matched.
          Reuses the same surface as the driver profile sheet. */}
      {showTiers && item.provider_type === 'driver' && (
        <div className="border border-gray-100 rounded-xl p-3">
          <DriverRideCategoriesSection driverId={item.provider_id} canReview={canReviewTiers} />
        </div>
      )}

      {anyRejected && (
        <div className="flex items-start gap-2 bg-red-50 text-red-700 text-xs rounded-lg px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          One or more documents rejected - approval not recommended.
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
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors border ${
              action === a
                ? a === 'approve'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-red-50 text-red-700 border-red-200'
                : 'text-gray-500 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {a === 'approve'
              ? <><CheckCircle className="h-4 w-4" /> {approveLabel}</>
              : <><XCircle className="h-4 w-4" /> {rejectLabel}</>
            }
          </button>
        ))}
      </div>

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
          disabled={submitting}
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
}: {
  documents: ProviderDocument[]
  reviews: Map<string, DocReview>
  onBack: () => void
  onSubmit: () => Promise<void>
  submitting: boolean
}) {
  const needsReview = (s: string) => s === 'pending_review' || s === 'uploaded'
  const resolved = documents.map(d => ({
    doc: d,
    review: reviews.get(d.id) ?? (!needsReview(d.status)
      ? { action: (d.status === 'approved' || d.status === 'confirmed') ? 'approve' : 'reject' as 'approve' | 'reject', reason: d.rejection_reason ?? '' }
      : null),
  }))
  const allDecided = resolved.every(r => r.review != null)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!allDecided) { setError('Review every document (approve or reject) before submitting.'); return }
    setError('')
    await onSubmit()
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Stage 1 of 3 — Admin</p>
        <p className="text-base font-semibold text-gray-900 mt-0.5">Submit to Coordinator</p>
        <p className="text-xs text-gray-400 mt-0.5">Confirm each document is authentic, then hand off to the category coordinator.</p>
      </div>

      <div className="bg-gray-50 rounded-xl p-3 space-y-2 max-h-56 overflow-y-auto">
        {resolved.map(({ doc, review }) => (
          <div key={doc.id} className="flex items-center justify-between gap-2">
            <p className="text-sm text-gray-700 truncate">{doc.label || doc.type}</p>
            {review
              ? <DocStatusBadge status={review.action === 'approve' ? 'approved' : 'rejected'} />
              : <span className="text-xs text-gray-400 italic">Not reviewed</span>
            }
          </div>
        ))}
      </div>

      {!allDecided && (
        <div className="flex items-start gap-2 bg-amber-50 text-amber-700 text-xs rounded-lg px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          Every document must be approved or rejected before submitting.
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
          disabled={submitting || !allDecided}
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

// Sort: pending_review → uploaded → approved/rejected. Historical versions
// (isCurrent === false) are dropped — only the current version is reviewable.
const docStatusRank = (s: string) => s === 'pending_review' ? 0 : s === 'uploaded' ? 1 : 2
function sortReviewDocs(docs: ProviderDocument[]): ProviderDocument[] {
  return [...docs]
    .filter(d => d.isCurrent !== false)
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
  const { can } = useRole()
  // The available action is decided by the item's current stage + the viewer's
  // permission — not the viewer's "home" role. This prevents, e.g., an RM
  // opening a pending_documents item from being offered "Approve & Send Online".
  const action = effectiveAction(item.verification_stage, can)
  const canReviewTiers = can('finalize_verification')
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
      const e = err as { status?: number; code?: string; message?: string }
      console.error('[verifications] reviewDocument failed', { docId: currentDoc.id, status: e?.status, code: e?.code, message: e?.message, error: err })
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
        const status = e?.status ? `${e.status} ` : ''
        const code = e?.code && e.code !== String(e?.status) ? ` (${e.code})` : ''
        setSaveError(`${status}${e?.message ?? 'Failed to save document review.'}${code}`)
      }
    } finally {
      setSaving(false)
    }
  }

  const providerType = item.provider_type as 'driver' | 'artisan'

  // Coordinator (validate) / RM (finalize) decision — chosen by the item's stage.
  async function handleDecisionSubmit(decision: 'approve' | 'reject', reason: string) {
    setSubmitting(true)
    try {
      if (action === 'rm') {
        await finalizeVerification(item.provider_id, providerType, decision, reason)
      } else {
        await validateVerification(item.provider_id, providerType, decision, reason)
      }
      onDone()
    } catch {
      setSubmitting(false)
      throw new Error('Failed to submit decision.')
    }
  }

  // Admin submit-to-coordinator.
  async function handleAdminSubmit() {
    setSubmitting(true)
    try {
      await submitVerification(item.provider_id, providerType)
      onDone()
    } catch {
      setSubmitting(false)
      throw new Error('Failed to submit to coordinator.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40" onClick={onClose}>
      <div
        className="relative h-full w-full max-w-lg bg-white shadow-2xl flex flex-col"
        style={{ animation: 'slideInRight 0.25s ease-out' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-gray-100 text-gray-600 text-sm font-bold">
                {initials(item.provider_name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-sm text-gray-900">{item.provider_name ?? 'Unknown Provider'}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <StatusBadge status={item.provider_type} />
                <span className="text-xs text-gray-400 font-mono">{item.provider_id.slice(0, 8)}…</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { refresh().catch(() => {}) }}
              disabled={refreshing}
              title="Reload latest document versions"
              className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-md hover:bg-gray-100 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-md hover:bg-gray-100"
            >
              <XCircle className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
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
                <Button size="sm" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
                <Button size="sm" className="flex-1 text-white" style={{ backgroundColor: '#F5A623' }} onClick={() => setStep('final')}>
                  Skip to Provider Decision
                </Button>
              </div>
            </div>
          ) : step === 'docs' && currentDoc ? (
            <DocumentStep
              doc={currentDoc}
              index={currentIndex}
              total={documents.length}
              pendingOnly={documents.filter(d => d.status === 'pending_review' || d.status === 'uploaded')}
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
                heading={action === 'rm' ? 'Final Verification' : 'Validate Documents'}
                approveLabel={action === 'rm' ? 'Approve & Send Online' : 'Send to RM'}
                rejectLabel={action === 'rm' ? 'Reject Provider' : 'Bounce to Admin'}
              />
            )
          ) : null}
        </div>
      </div>

      <style jsx>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function VerificationsPage() {
  const { can, role } = useRole()
  // Global oversight roles (owner/director/accountant) are not pinned to a single
  // pipeline stage — they see the whole queue and can drill into a stage on
  // demand. Scoped action roles default to the stage they act on.
  const isGlobal = role ? (ROLE_DEFINITIONS[role]?.global ?? false) : false
  const homeRole: PipelineRole =
    can('finalize_verification') ? 'rm'
    : can('validate_verification') ? 'coordinator'
    : can('verify_documents') ? 'admin'
    : 'viewer'
  const defaultStage: VerificationStage | 'all' =
    isGlobal ? 'all' : (STAGE_FOR_ROLE[homeRole] ?? 'all')

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
        title="Provider Verification Queue"
        subtitle={
          isGlobal ? 'All providers across the verification pipeline'
          : homeRole === 'admin' ? 'Stage 1 — check each document for authenticity, then submit to the coordinator'
          : homeRole === 'coordinator' ? 'Stage 2 — validate the admin-approved documents for your category'
          : homeRole === 'rm' ? 'Stage 3 — final verification that sends the provider online'
          : 'Provider identity and document submissions'
        }
        actions={
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-500 bg-white rounded-lg px-3 py-1.5 flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
                {pendingCount} Pending Docs
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
                {items.length} Providers
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={load} className="gap-2">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input placeholder="Search by name or ID…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36 bg-white"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="driver">Drivers</SelectItem>
            <SelectItem value="artisan">Artisans</SelectItem>
          </SelectContent>
        </Select>
        <Select value={stageFilter} onValueChange={v => setStageFilter(v as VerificationStage | 'all')}>
          <SelectTrigger className="w-52 bg-white"><SelectValue placeholder="Stage" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            <SelectItem value="pending_documents">Stage 1 — Document check</SelectItem>
            <SelectItem value="docs_verified">Stage 2 — Coordinator</SelectItem>
            <SelectItem value="coordinator_validated">Stage 3 — RM final</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-sm text-gray-400">{filtered.length} in queue</div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Provider</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Stage</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Documents</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">First Upload</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-gray-400">
                  <FileText className="h-8 w-8 mx-auto mb-2 text-gray-200" />
                  {search || typeFilter !== 'all' ? 'No results match your filters.' : 'Verification queue is empty.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(v => (
                <TableRow key={v.provider_id} className="hover:bg-gray-50">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-gray-100 text-gray-600 text-xs font-bold">
                          {initials(v.provider_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm text-gray-900">{v.provider_name ?? 'Unknown'}</p>
                        <p className="text-xs text-gray-400 font-mono">{v.provider_id.slice(0, 8)}…</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><StatusBadge status={v.provider_type} /></TableCell>
                  <TableCell className="text-xs text-gray-500">
                    {v.verification_stage ? (STAGE_LABEL[v.verification_stage] ?? v.verification_stage) : '—'}
                  </TableCell>
                  <TableCell>
                    <DocsProgress
                      pending={Number(v.docs_pending)}
                      approved={Number(v.docs_approved)}
                      rejected={Number(v.docs_rejected)}
                      total={Number(v.total_docs)}
                    />
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">{formatDate(v.first_upload_at)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 justify-end">
                      <Button
                        size="sm"
                        className="gap-1.5 text-xs h-7 text-white"
                        style={{ backgroundColor: '#F5A623' }}
                        onClick={() => setReviewing(v)}
                      >
                        Review
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
          <p className="text-xs text-gray-400">
            {loading ? 'Loading…' : `Showing ${filtered.length} of ${items.length} providers`}
          </p>
        </div>
      </div>

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
