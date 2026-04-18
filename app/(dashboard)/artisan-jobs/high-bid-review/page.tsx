'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageGuard } from '@/components/common/page-guard'
import Link from 'next/link'
import {
  ArrowLeft, CheckCircle2, XCircle, Loader2,
  AlertTriangle, RefreshCw, TrendingUp, Clock, Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/common/page-header'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { getHighBidQueue, reviewHighBid, type FlaggedBid } from '@/lib/api'
import { ApiError } from '@/lib/api-client'

function formatGhs(pesewas: number) {
  return 'GHS ' + (pesewas / 100).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDateTime(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function timeAgo(iso: string) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

type DialogState = { bid: FlaggedBid; decision: 'approved' | 'rejected' } | null

export default function HighBidReviewPage() {
  const [bids, setBids] = useState<FlaggedBid[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState<DialogState>(null)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [reviewed, setReviewed] = useState<Record<string, 'approved' | 'rejected'>>({})

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    getHighBidQueue()
      .then(data => setBids(data))
      .catch(err => {
        if (err instanceof ApiError && err.status === 404) {
          setError('The flagged bids endpoint is not yet available on the backend. Please ask the backend team to implement GET /admin/bids/flagged.')
        } else {
          setError(err instanceof ApiError ? err.message : 'Failed to load flagged bids.')
        }
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  function openDialog(bid: FlaggedBid, decision: 'approved' | 'rejected') {
    setReason('')
    setSubmitError('')
    setDialog({ bid, decision })
  }

  async function handleConfirm() {
    if (!dialog) return
    if (dialog.decision === 'rejected' && reason.trim().length < 10) {
      setSubmitError('Rejection reason must be at least 10 characters.')
      return
    }
    setSubmitting(true)
    setSubmitError('')
    try {
      await reviewHighBid(dialog.bid.id, dialog.decision, reason.trim())
      setReviewed(prev => ({ ...prev, [dialog.bid.id]: dialog.decision }))
      setBids(prev => prev.filter(b => b.id !== dialog.bid.id))
      setDialog(null)
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Action failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const pendingCount = bids.length
  const reviewedCount = Object.keys(reviewed).length

  return (
    <PageGuard permission="review_bid">
      <div>
        <PageHeader
          title="High Bid Review"
          subtitle="Bids exceeding the category threshold require approval before the client sees them"
          actions={
            <div className="flex items-center gap-2">
              {reviewedCount > 0 && (
                <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full font-medium">
                  {reviewedCount} reviewed this session
                </span>
              )}
              <Link href="/artisan-jobs">
                <Button variant="outline" size="sm" className="gap-2">
                  <ArrowLeft className="h-4 w-4" /> Artisan Jobs
                </Button>
              </Link>
              <Button variant="outline" size="sm" className="gap-2" onClick={load} disabled={loading}>
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          }
        />

        {/* Info banner */}
        <div className="mb-5 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <TrendingUp className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            These bids exceed the per-category high-bid threshold (PRD edge case #44).
            They are hidden from the client until an admin approves or rejects them.
            Rejecting a bid returns the job to open bidding.
          </p>
        </div>

        {/* Error state */}
        {error && (
          <div className="mb-5 flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-700">{error}</p>
              <button onClick={load} className="mt-1.5 text-xs text-red-600 underline underline-offset-2">
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl p-5 shadow-sm animate-pulse">
                <div className="flex items-start justify-between mb-4">
                  <div className="space-y-2">
                    <div className="h-4 w-32 bg-gray-100 rounded" />
                    <div className="h-3 w-48 bg-gray-100 rounded" />
                  </div>
                  <div className="h-8 w-24 bg-gray-100 rounded-lg" />
                </div>
                <div className="grid grid-cols-4 gap-4">
                  {[...Array(4)].map((_, j) => (
                    <div key={j} className="h-10 bg-gray-100 rounded" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && bids.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm p-16 text-center">
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">No bids awaiting review</h3>
            <p className="text-sm text-gray-400">
              {reviewedCount > 0
                ? `You reviewed ${reviewedCount} bid${reviewedCount > 1 ? 's' : ''} this session. All clear.`
                : 'All bids are within the category thresholds.'}
            </p>
          </div>
        )}

        {/* Bid cards */}
        {!loading && bids.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-500">
              {pendingCount} bid{pendingCount !== 1 ? 's' : ''} awaiting review
            </p>

            {bids.map(bid => {
              const overagePercent = Math.round(((bid.amountPesewas - bid.flagThresholdPesewas) / bid.flagThresholdPesewas) * 100)
              return (
                <div
                  key={bid.id}
                  className="bg-white rounded-xl shadow-sm border border-amber-100 overflow-hidden"
                >
                  {/* Top stripe */}
                  <div className="h-1 w-full bg-gradient-to-r from-amber-400 to-orange-400" />

                  <div className="p-5">
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm font-bold text-orange-600">
                            BID-{bid.id.slice(-8).toUpperCase()}
                          </span>
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                            Awaiting Review
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                          <Clock className="h-3 w-3" />
                          <span>{formatDateTime(bid.submittedAt)}</span>
                          <span className="text-gray-300">·</span>
                          <span>{timeAgo(bid.submittedAt)}</span>
                        </div>
                      </div>

                      {/* Bid amount — prominent */}
                      <div className="text-right shrink-0">
                        <p className="text-2xl font-bold text-gray-900">{formatGhs(bid.amountPesewas)}</p>
                        <p className="text-xs text-red-500 font-medium mt-0.5">
                          +{overagePercent}% above {formatGhs(bid.flagThresholdPesewas)} threshold
                        </p>
                      </div>
                    </div>

                    {/* Detail grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                      {[
                        { label: 'Artisan',  value: bid.artisanName,  icon: <Wrench className="h-3.5 w-3.5" /> },
                        { label: 'Client',   value: bid.clientName,   icon: null },
                        { label: 'Category', value: bid.categoryName, icon: null },
                        { label: 'Job ID',   value: bid.jobId.slice(-8).toUpperCase(), icon: null, mono: true },
                      ].map(({ label, value, icon, mono }) => (
                        <div key={label} className="bg-gray-50 rounded-lg px-3 py-2.5">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 flex items-center gap-1">
                            {icon}{label}
                          </p>
                          <p className={`text-sm font-medium text-gray-800 truncate ${mono ? 'font-mono text-orange-600' : ''}`}>
                            {value || '—'}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3">
                      <Button
                        size="sm"
                        className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => openDialog(bid, 'approved')}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Approve Bid
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => openDialog(bid, 'rejected')}
                      >
                        <XCircle className="h-4 w-4" />
                        Reject Bid
                      </Button>
                      <span className="ml-auto text-xs text-gray-400">
                        Job returns to open bidding if rejected
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Confirm dialog */}
        <Dialog open={!!dialog} onOpenChange={open => { if (!open) setDialog(null) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className={dialog?.decision === 'approved' ? 'text-emerald-700' : 'text-red-600'}>
                {dialog?.decision === 'approved' ? 'Approve' : 'Reject'} Bid — {dialog && formatGhs(dialog.bid.amountPesewas)}
              </DialogTitle>
              <DialogDescription>
                {dialog?.decision === 'approved'
                  ? 'The bid will be made visible to the client and the artisan will be notified.'
                  : 'The bid will be hidden from the client and the job will return to open bidding.'
                }
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-1">
              {dialog && (
                <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm text-gray-600 space-y-1">
                  <p><span className="font-medium">Artisan:</span> {dialog.bid.artisanName}</p>
                  <p><span className="font-medium">Amount:</span> {formatGhs(dialog.bid.amountPesewas)} ({Math.round(((dialog.bid.amountPesewas - dialog.bid.flagThresholdPesewas) / dialog.bid.flagThresholdPesewas) * 100)}% over threshold)</p>
                  <p><span className="font-medium">Category:</span> {dialog.bid.categoryName}</p>
                </div>
              )}
              <div>
                <Label className="text-xs text-gray-500">
                  Reason{' '}
                  <span className="text-gray-400">
                    {dialog?.decision === 'rejected' ? '(min 10 chars, required)' : '(optional)'}
                  </span>
                </Label>
                <textarea
                  className="mt-1.5 w-full rounded-lg border border-gray-200 text-sm px-3 py-2 h-20 resize-none focus:outline-none focus:ring-2 focus:ring-orange-200"
                  placeholder={
                    dialog?.decision === 'rejected'
                      ? 'Explain why this bid is being rejected…'
                      : 'Note for the audit log (optional)…'
                  }
                  value={reason}
                  onChange={e => { setReason(e.target.value); setSubmitError('') }}
                />
              </div>
              {submitError && <p className="text-xs text-red-600">{submitError}</p>}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
              <Button
                disabled={submitting || (dialog?.decision === 'rejected' && reason.trim().length < 10)}
                onClick={handleConfirm}
                className={dialog?.decision === 'approved'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-red-600 hover:bg-red-700 text-white'
                }
              >
                {submitting
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : `Confirm ${dialog?.decision === 'approved' ? 'Approval' : 'Rejection'}`
                }
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageGuard>
  )
}
