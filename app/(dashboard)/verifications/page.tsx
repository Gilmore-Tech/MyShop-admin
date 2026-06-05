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
  getVerificationQueue, reviewDocument, reviewVerification,
  type VerificationItem, type ProviderDocument,
} from '@/lib/api'
import { ApiError } from '@/lib/api-client'

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

      {saveError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-red-700">Save failed</p>
            <p className="text-xs text-red-600 mt-0.5">{saveError}</p>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
        <Button variant="outline" size="sm" onClick={onPrev} disabled={index === 0} className="gap-1">
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
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
        {isLast ? (
          <Button size="sm" variant="outline" onClick={onFinish} className="gap-1">
            Finish <ChevronRight className="h-4 w-4" />
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
}: {
  item: VerificationItem
  documents: ProviderDocument[]
  reviews: Map<string, DocReview>
  onBack: () => void
  onSubmit: (action: 'approve' | 'reject', reason: string) => Promise<void>
  submitting: boolean
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
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Final Step</p>
        <p className="text-base font-semibold text-gray-900 mt-0.5">Overall Provider Decision</p>
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
              ? <><CheckCircle className="h-4 w-4" /> Approve Provider</>
              : <><XCircle className="h-4 w-4" /> Reject Provider</>
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
  // Sort: pending_review → uploaded → approved/rejected
  const statusRank = (s: string) => s === 'pending_review' ? 0 : s === 'uploaded' ? 1 : 2
  const documents: ProviderDocument[] = [...(item.documents ?? [])].sort(
    (a, b) => statusRank(a.status) - statusRank(b.status)
  )

  const [currentIndex, setCurrentIndex] = useState(0)
  const [reviews, setReviews] = useState<Map<string, DocReview>>(new Map())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [step, setStep] = useState<'docs' | 'final'>('docs')
  const [submitting, setSubmitting] = useState(false)

  const currentDoc = documents[currentIndex]

  // Clear save error when the user navigates to a different document.
  useEffect(() => { setSaveError(null) }, [currentIndex])

  async function handleDocSave(review: DocReview) {
    if (!currentDoc) return
    setSaving(true)
    setSaveError(null)
    try {
      await reviewDocument(currentDoc.id, item.provider_type, review.action, review.reason || (review.action === 'approve' ? 'Approved.' : ''))
      setReviews(prev => new Map(prev).set(currentDoc.id, review))
    } catch (err) {
      const e = err as { status?: number; code?: string; message?: string }
      console.error('[verifications] reviewDocument failed', { docId: currentDoc.id, status: e?.status, code: e?.code, message: e?.message, error: err })
      const status = e?.status ? `${e.status} ` : ''
      const code = e?.code && e.code !== String(e?.status) ? ` (${e.code})` : ''
      setSaveError(`${status}${e?.message ?? 'Failed to save document review.'}${code}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleFinalSubmit(action: 'approve' | 'reject', reason: string) {
    setSubmitting(true)
    try {
      await reviewVerification(item.provider_id, item.provider_type, action, reason)
      onDone()
    } catch {
      setSubmitting(false)
      throw new Error('Failed to submit provider decision.')
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
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-md hover:bg-gray-100"
          >
            <XCircle className="h-5 w-5" />
          </button>
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
            />
          ) : step === 'final' ? (
            <FinalDecisionStep
              item={item}
              documents={documents}
              reviews={reviews}
              onBack={() => setStep('docs')}
              onSubmit={handleFinalSubmit}
              submitting={submitting}
            />
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
  const [items, setItems] = useState<VerificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [reviewing, setReviewing] = useState<VerificationItem | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getVerificationQueue()
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
  }, [])

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
        subtitle="Review and approve provider identity and document submissions"
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
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Documents</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">First Upload</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-gray-400">
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
