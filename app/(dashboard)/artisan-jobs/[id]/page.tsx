'use client'

import { useState, useEffect, use } from 'react'
import { PageGuard } from '@/components/common/page-guard'
import { StatusBadge } from '@/components/common/status-badge'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Loader2, User, Wrench, Tag, MapPin, Clock,
  Calendar, AlertTriangle, CheckCircle, Hammer, ShieldAlert, ImageIcon, X, RefreshCw, CreditCard,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  getJobDetail, lockJob, assignJob, forceCompleteJob, unexpireBid, cancelJob,
  type JobDetail, type JobBid,
} from '@/lib/api'
import { ApiError } from '@/lib/api-client'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtGhs(pesewas: number | null | undefined) {
  if (pesewas == null) return '-'
  return 'GHS ' + (pesewas / 100).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function fmtDateShort(iso: string | null | undefined) {
  if (!iso) return null
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function paymentMethodLabel(method: string | null): string | null {
  if (!method) return null
  if (method === 'cash') return 'Cash'
  if (method === 'card') return 'Card'
  if (method.startsWith('momo')) {
    const net = method.split('_')[1]
    const nice: Record<string, string> = { mtn: 'MTN', vodafone: 'Vodafone', telecel: 'Telecel', airteltigo: 'AirtelTigo' }
    return net ? `${nice[net] ?? net.toUpperCase()} MoMo` : 'Mobile Money'
  }
  return method.replace(/_/g, ' ')
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ')
}

// Compact metric tile used in the hero header.
function Stat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2.5">
      <p className="text-[11px] text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-bold mt-0.5 ${accent ?? 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

// ── Timeline ──────────────────────────────────────────────────────────────────

function TimelineRow({ label, value, highlight }: { label: string; value: string | null; highlight?: boolean }) {
  if (!value) return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-2 h-2 rounded-full bg-gray-200 shrink-0" />
      <span className="text-xs text-gray-400 w-36 shrink-0">{label}</span>
      <span className="text-xs text-gray-300">-</span>
    </div>
  )
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className={`w-2 h-2 rounded-full shrink-0 ${highlight ? 'bg-gray-400' : 'bg-gray-400'}`} />
      <span className="text-xs text-gray-500 w-36 shrink-0">{label}</span>
      <span className={`text-xs font-medium ${highlight ? 'text-orange-600' : 'text-gray-700'}`}>{value}</span>
    </div>
  )
}

// ── Bid card ─────────────────────────────────────────────────────────────────

function BidCard({ bid, isAssigned, onAssign, assigning, onUnexpire, unexpiring }: {
  bid: JobBid
  isAssigned: boolean
  onAssign: (bid: JobBid) => void
  assigning: boolean
  onUnexpire: (bid: JobBid) => void
  unexpiring: boolean
}) {
  const statusColors: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-600',
    accepted: 'bg-gray-100 text-gray-600',
    rejected: 'bg-gray-100 text-gray-600',
    expired: 'bg-gray-100 text-gray-500',
    bid_expired: 'bg-gray-100 text-gray-500',
    admin_review: 'bg-gray-100 text-gray-600',
  }
  const isExpired = bid.status === 'expired' || bid.status === 'bid_expired' || bid.status?.toLowerCase().includes('expir')
  return (
    <div className={`rounded-lg border p-3 ${isAssigned ? 'border-emerald-300 bg-emerald-50' : isExpired ? 'border-gray-200 bg-gray-50/60 opacity-80' : 'border-gray-100 bg-gray-50'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{bid.artisanName ?? 'Unknown Artisan'}</p>
          <p className="text-xs text-gray-500">{bid.artisanPhone ?? '-'}</p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-sm font-bold ${isExpired ? 'text-gray-400' : 'text-gray-900'}`}>{fmtGhs(bid.amountPesewas)}</p>
          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${statusColors[bid.status] ?? 'bg-gray-100 text-gray-500'}`}>
            {bid.status}
          </span>
        </div>
      </div>
      {bid.message && (
        <p className="mt-1.5 text-xs text-gray-600 italic">&ldquo;{bid.message}&rdquo;</p>
      )}
      <div className="flex items-center justify-between mt-2 gap-2 flex-wrap">
        <p className="text-[11px] text-gray-400">
          Submitted {fmtDateShort(bid.createdAt)}
          {isExpired && bid.expiresAt && (
            <span className="ml-1.5 text-gray-400">- expired {fmtDateShort(bid.expiresAt)}</span>
          )}
        </p>
        <div className="flex items-center gap-1.5">
          {isAssigned && <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Assigned</span>}
          {!isAssigned && bid.status === 'pending' && (
            <Button size="sm" variant="outline" className="h-6 text-xs px-2 gap-1" onClick={() => onAssign(bid)} disabled={assigning}>
              {assigning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Hammer className="h-3 w-3" />}
              Assign
            </Button>
          )}
          {isExpired && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs px-2 gap-1 border-red-300 text-red-600 hover:bg-red-50"
              onClick={() => onUnexpire(bid)}
              disabled={unexpiring}
              title="Restore this bid so the artisan can participate again"
            >
              {unexpiring ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Restore Bid
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Photo Gallery ─────────────────────────────────────────────────────────────

function PhotoGallery({ photos }: { photos: string[] }) {
  const [lightbox, setLightbox] = useState<string | null>(null)

  if (photos.length === 0) return (
    <div className="flex flex-col items-center justify-center py-6 text-gray-300 gap-2">
      <ImageIcon className="h-8 w-8" />
      <p className="text-xs">No photos attached</p>
    </div>
  )

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((url, i) => (
          <button
            key={i}
            onClick={() => setLightbox(url)}
            className="aspect-square rounded-lg overflow-hidden border border-gray-100 hover:border-orange-300 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Job photo ${i + 1}`} className="w-full h-full object-cover" />
          </button>
        ))}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
            onClick={() => setLightbox(null)}
          >
            <X className="h-6 w-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Job photo"
            className="max-w-full max-h-[90vh] rounded-xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}

// ── Force-Complete Dialog ─────────────────────────────────────────────────────

function ForceCompleteDialog({ open, onClose, onConfirm, loading }: {
  open: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
  loading: boolean
}) {
  const [reason, setReason] = useState('')
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-600">
            <ShieldAlert className="h-5 w-5" /> Force Complete Job
          </DialogTitle>
          <DialogDescription>
            This releases payment to the artisan and marks the job complete. Provide a clear reason for the audit log (minimum 5 characters).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-1">
          <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Reason</Label>
          <Textarea
            placeholder="e.g. Artisan provided photo evidence; client unresponsive for 48+ hours"
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
          />
          <p className="text-[11px] text-gray-400">{reason.length} / min 5 characters</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onConfirm(reason)}
            disabled={loading || reason.trim().length < 5}
            className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm Force Complete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Cancel Job Dialog ─────────────────────────────────────────────────────────

function CancelJobDialog({ open, onClose, onConfirm, loading }: {
  open: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
  loading: boolean
}) {
  const [reason, setReason] = useState('')
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" /> Cancel Job
          </DialogTitle>
          <DialogDescription>
            This will cancel the job and notify both the client and artisan. Provide a clear reason for the audit log (minimum 10 characters).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-1">
          <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Reason</Label>
          <Textarea
            placeholder="e.g. Client requested cancellation; no artisan available in region"
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
          />
          <p className={`text-[11px] ${reason.trim().length >= 10 ? 'text-emerald-600' : 'text-gray-400'}`}>
            {reason.trim().length} / 10 characters minimum
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Back</Button>
          <Button
            onClick={() => onConfirm(reason.trim())}
            disabled={loading || reason.trim().length < 10}
            className="bg-red-500 hover:bg-red-600 text-white gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = use(params)
  const router = useRouter()

  const [job, setJob] = useState<JobDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [actionError, setActionError] = useState<string | null>(null)
  const [assigning, setAssigning] = useState(false)
  const [unexpiringBidId, setUnexpiringBidId] = useState<string | null>(null)
  const [forceCompleteOpen, setForceCompleteOpen] = useState(false)
  const [forcingComplete, setForcingComplete] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    setLoading(true)
    getJobDetail(jobId)
      .then(setJob)
      .catch(e => setError(e instanceof ApiError ? e.message : 'Failed to load job.'))
      .finally(() => setLoading(false))
  }, [jobId])

  async function handleAssignBid(bid: JobBid) {
    if (!job) return
    setActionError(null)
    setAssigning(true)
    try {
      // Acquire lock first, then assign
      await lockJob(jobId)
      await assignJob(jobId, { artisanId: bid.artisanId, agreedPricePesewas: bid.amountPesewas })
      const updated = await getJobDetail(jobId)
      setJob(updated)
    } catch (e: unknown) {
      setActionError(
        e instanceof ApiError && e.code === 'LOCK_NOT_HELD'
          ? 'Could not acquire lock. Please try again.'
          : e instanceof ApiError ? e.message : 'Assignment failed.',
      )
    } finally {
      setAssigning(false)
    }
  }

  async function handleUnexpireBid(bid: JobBid) {
    setActionError(null)
    setUnexpiringBidId(bid.id)
    try {
      await unexpireBid(bid.id)
      const updated = await getJobDetail(jobId)
      setJob(updated)
    } catch (e: unknown) {
      setActionError(e instanceof ApiError ? e.message : 'Failed to restore bid.')
    } finally {
      setUnexpiringBidId(null)
    }
  }

  async function handleForceComplete(reason: string) {
    setForcingComplete(true)
    setActionError(null)
    try {
      await forceCompleteJob(jobId, reason)
      const updated = await getJobDetail(jobId)
      setJob(updated)
      setForceCompleteOpen(false)
    } catch (e: unknown) {
      setActionError(e instanceof ApiError ? e.message : 'Force complete failed.')
    } finally {
      setForcingComplete(false)
    }
  }

  async function handleCancelJob(reason: string) {
    setCancelling(true)
    setActionError(null)
    try {
      await cancelJob(jobId, reason)
      const updated = await getJobDetail(jobId)
      setJob(updated)
      setCancelOpen(false)
    } catch (e: unknown) {
      setActionError(e instanceof ApiError ? e.message : 'Cancel failed.')
    } finally {
      setCancelling(false)
    }
  }

  const TERMINAL_STATUSES = ['completed', 'cancelled', 'expired', 'refunded']
  const isStale = job ? !TERMINAL_STATUSES.includes(job.status) && job.hoursInactive >= 24 : false
  const canAssign = job ? ['queued', 'pending_admin'].includes(job.status) : false
  const canForceComplete = job ? job.status === 'in_progress' && isStale : false
  const canCancel = job ? ['queued', 'pending_admin', 'open_for_bids', 'bids_received', 'confirmed'].includes(job.status) : false
  const assignedArtisanId = job?.artisan?.id ?? null

  return (
    <PageGuard permission="view_jobs">
      <div>
        {(loading || error) && (
          <div className="mb-4">
            <Link href="/artisan-jobs">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ArrowLeft className="h-4 w-4" /> Back to Jobs
              </Button>
            </Link>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading job…</span>
          </div>
        )}

        {!loading && error && (
          <div className="bg-white rounded-xl shadow-sm p-10 text-center text-red-500 text-sm">{error}</div>
        )}

        {!loading && job && (
          <div className="space-y-4">

            {/* Hero header */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <Link href="/artisan-jobs">
                  <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 text-gray-500 hover:text-gray-700">
                    <ArrowLeft className="h-4 w-4" /> Back to Jobs
                  </Button>
                </Link>
                <div className="flex items-center gap-2">
                  {canForceComplete && (
                    <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white gap-1.5" onClick={() => setForceCompleteOpen(true)}>
                      <ShieldAlert className="h-3.5 w-3.5" /> Force Complete
                    </Button>
                  )}
                  {canCancel && (
                    <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 gap-1.5" onClick={() => setCancelOpen(true)}>
                      <X className="h-3.5 w-3.5" /> Cancel Job
                    </Button>
                  )}
                  {canAssign && (
                    <Link href="/artisan-jobs/manual-assignment">
                      <Button size="sm" variant="outline" className="gap-1.5">
                        <Hammer className="h-3.5 w-3.5" /> Manual Assignment
                      </Button>
                    </Link>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                  <Wrench className="h-6 w-6 text-gray-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl font-bold font-mono text-gray-900">#{job.id.slice(-8).toUpperCase()}</h1>
                    <StatusBadge status={job.status} />
                    {isStale && (
                      <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
                        <Clock className="h-3 w-3" /> {job.hoursInactive}h idle
                      </span>
                    )}
                    {job.assignedByAdmin && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">Manually Assigned</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400 mt-1">
                    {job.category?.name ?? 'Uncategorised'} - Created {fmtDate(job.createdAt)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-gray-100">
                <Stat label="Agreed Price" value={fmtGhs(job.agreedPricePesewas)} />
                <Stat label="Payment" value={paymentMethodLabel(job.paymentMethod) ?? (job.paymentStatus ? cap(job.paymentStatus) : '-')} />
                <Stat label="Bids" value={String(job.bids.length)} />
                <Stat label="Idle" value={isStale ? `${job.hoursInactive}h` : '-'} accent={isStale ? 'text-red-600' : undefined} />
              </div>
            </div>

            {actionError && (
              <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {actionError}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

              {/* Left column — job info + timeline */}
              <div className="lg:col-span-2 space-y-4">

                {/* Job overview */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Tag className="h-4 w-4 text-gray-600" /> Job Overview
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Description</p>
                      <p className="text-sm text-gray-800">{job.description}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Category</p>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                          {job.category.name}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Agreed Price</p>
                        <p className="text-sm font-bold text-gray-900">{fmtGhs(job.agreedPricePesewas)}</p>
                        {job.originalBidPesewas && job.originalBidPesewas !== job.agreedPricePesewas && (
                          <p className="text-[11px] text-gray-400">Original bid: {fmtGhs(job.originalBidPesewas)}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Min Bid (category)</p>
                        <p className="text-sm text-gray-600">{fmtGhs(job.category.minBidPesewas)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">High-Bid Flag</p>
                        <p className="text-sm text-gray-600">{fmtGhs(job.category.highBidFlagPesewas)}</p>
                      </div>
                    </div>
                    {job.addressText && (
                      <div className="flex items-start gap-2">
                        <MapPin className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
                        <p className="text-sm text-gray-700">{job.addressText}</p>
                      </div>
                    )}
                    {job.scheduledFor && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <p className="text-sm text-gray-700">Scheduled: {fmtDate(job.scheduledFor)}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Photos */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <ImageIcon className="h-4 w-4 text-gray-400" /> Client Photos
                      </span>
                      <span className="text-xs font-normal text-gray-400">{(job.photos ?? []).length} photo{(job.photos ?? []).length !== 1 ? 's' : ''}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <PhotoGallery photos={job.photos ?? []} />
                  </CardContent>
                </Card>

                {/* Supplement request */}
                {job.supplementRequest && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-gray-600" /> Supplement Request
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-700">Additional amount</p>
                        <p className="text-sm font-bold text-amber-600">{fmtGhs(job.supplementRequest.additionalAmountPesewas)}</p>
                      </div>
                      <p className="text-xs text-gray-600 italic">&ldquo;{job.supplementRequest.reason}&rdquo;</p>
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <StatusBadge status={job.supplementRequest.status} />
                        <span>Requested {fmtDateShort(job.supplementRequest.createdAt)}</span>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Payment */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-gray-600" /> Payment
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Status</span>
                      {job.paymentStatus ? <StatusBadge status={job.paymentStatus} /> : <span className="text-gray-300">-</span>}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Method</span>
                      <span className="text-gray-800 font-medium">{paymentMethodLabel(job.paymentMethod) ?? '-'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Amount paid</span>
                      <span className="text-gray-800 font-medium">{job.amountPaidPesewas != null ? fmtGhs(job.amountPaidPesewas) : '-'}</span>
                    </div>
                    {job.paidAt && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Paid</span>
                        <span className="text-gray-700">{fmtDate(job.paidAt)}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Timeline */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Clock className="h-4 w-4 text-gray-400" /> Timeline
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TimelineRow label="Requested" value={fmtDateShort(job.createdAt)} />
                    <TimelineRow label="Confirmed" value={fmtDateShort(job.confirmedAt)} />
                    {job.assignedAt && <TimelineRow label="Admin Assigned" value={fmtDateShort(job.assignedAt)} highlight />}
                    <TimelineRow label="Artisan En Route" value={fmtDateShort(job.artisanEnRouteAt)} />
                    <TimelineRow label="Arrived" value={fmtDateShort(job.arrivedAt)} />
                    <TimelineRow label="Work Started" value={fmtDateShort(job.startedAt)} />
                    <TimelineRow label="Artisan Marked Done" value={fmtDateShort(job.artisanMarkedCompleteAt)} />
                    <TimelineRow label="Client Confirmed" value={fmtDateShort(job.clientConfirmedCompleteAt)} />
                    <TimelineRow label="Completed" value={fmtDateShort(job.completedAt)} />
                    {job.cancelledAt && <TimelineRow label="Cancelled" value={fmtDateShort(job.cancelledAt)} highlight />}
                    {job.cancellationReason && (
                      <p className="mt-2 text-xs text-red-600 bg-red-50 rounded px-3 py-2">
                        Reason: {job.cancellationReason}
                      </p>
                    )}
                  </CardContent>
                </Card>

              </div>

              {/* Right column — parties + bids */}
              <div className="space-y-4">

                {/* Client */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <User className="h-4 w-4 text-gray-600" /> Client
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <p className="text-sm font-semibold text-gray-900">{job.client.name ?? '-'}</p>
                    <p className="text-xs text-gray-500">{job.client.phone ?? '-'}</p>
                  </CardContent>
                </Card>

                {/* Artisan */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-gray-600" /> Artisan
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {job.artisan ? (
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-gray-900">{job.artisan.name ?? '-'}</p>
                        <p className="text-xs text-gray-500">{job.artisan.phone ?? '-'}</p>
                        <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
                          job.artisan.verificationStatus === 'approved'
                            ? 'bg-gray-100 text-gray-600'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {job.artisan.verificationStatus}
                        </span>
                      </div>
                    ) : (
                      <p className="text-sm text-amber-600 font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" /> Unassigned
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Bids */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Hammer className="h-4 w-4 text-gray-600" /> Bids
                      </span>
                      <span className="text-xs font-normal text-gray-400">{job.bids.length} total</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {job.bids.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-3">No bids yet</p>
                    ) : (
                      job.bids.map(bid => (
                        <BidCard
                          key={bid.id}
                          bid={bid}
                          isAssigned={bid.artisanId === assignedArtisanId}
                          onAssign={handleAssignBid}
                          assigning={assigning}
                          onUnexpire={handleUnexpireBid}
                          unexpiring={unexpiringBidId === bid.id}
                        />
                      ))
                    )}
                  </CardContent>
                </Card>

              </div>
            </div>
          </div>
        )}

        <ForceCompleteDialog
          open={forceCompleteOpen}
          onClose={() => setForceCompleteOpen(false)}
          onConfirm={handleForceComplete}
          loading={forcingComplete}
        />
        <CancelJobDialog
          open={cancelOpen}
          onClose={() => setCancelOpen(false)}
          onConfirm={handleCancelJob}
          loading={cancelling}
        />
      </div>
    </PageGuard>
  )
}
