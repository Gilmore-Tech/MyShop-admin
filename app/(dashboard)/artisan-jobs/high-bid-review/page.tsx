'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageGuard } from '@/components/common/page-guard'
import Link from 'next/link'
import {
  ArrowLeft, CheckCircle2, XCircle,
  RefreshCw, TrendingUp, Clock, Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/common/page-header'
import { PageSkeleton } from '@/components/common/load-state'
import { ErrorState } from '@/components/common/error-state'
import { EmptyState } from '@/components/common/empty-state'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { getHighBidQueue, reviewHighBid, type FlaggedBid } from '@/lib/api'
import { ApiError, FEATURES } from '@/lib/api-client'
import { formatGhs } from '@/lib/money'
import { formatDateTime, timeAgo } from '@/lib/format-date'

type DialogState = { bid: FlaggedBid; decision: 'approved' | 'rejected' } | null

export default function HighBidReviewPage() {
  const [bids, setBids] = useState<FlaggedBid[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState<DialogState>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [reviewed, setReviewed] = useState<Record<string, 'approved' | 'rejected'>>({})

  const load = useCallback(() => {
    if (!FEATURES.highBidReview) { setLoading(false); return }
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

  if (!FEATURES.highBidReview) {
    return (
      <PageGuard permission="review_bid">
        <div>
          <PageHeader title="High bid review" subtitle="Bids exceeding the category threshold require approval before the client sees them" />
          <div className="mt-6 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-4 max-w-2xl">
            <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900">Feature pending backend rollout</p>
              <p className="text-sm text-amber-800 mt-1">
                The <code className="bg-amber-100 px-1 rounded text-[12px]">GET /admin/bids/flagged</code> endpoint is not yet available.
                Once the backend team implements it, set <code className="bg-amber-100 px-1 rounded text-[12px]">NEXT_PUBLIC_FEATURE_HIGH_BID_REVIEW=true</code> in your env to enable this page and the sidebar link.
              </p>
            </div>
          </div>
        </div>
      </PageGuard>
    )
  }

  function openDialog(bid: FlaggedBid, decision: 'approved' | 'rejected') {
    setSubmitError('')
    setDialog({ bid, decision })
  }

  async function handleConfirm(reason: string) {
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
          title="High bid review"
          subtitle="Bids exceeding the category threshold require approval before the client sees them"
          actions={
            <div className="flex items-center gap-2">
              {reviewedCount > 0 && (
                <span className="text-xs bg-gray-100 text-gray-600 border border-gray-200 px-2.5 py-1 rounded-full font-medium">
                  {reviewedCount} reviewed this session
                </span>
              )}
              <Link href="/artisan-jobs">
                <Button variant="outline" size="sm" className="gap-2">
                  <ArrowLeft className="h-4 w-4" /> Artisan jobs
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
          <ErrorState title="Could not load flagged bids" detail={error} onRetry={load} className="mb-5" />
        )}

        {/* Loading skeleton */}
        {loading && <PageSkeleton variant="cards" />}

        {/* Empty state */}
        {!loading && !error && bids.length === 0 && (
          <EmptyState
            icon={CheckCircle2}
            title="No bids awaiting review"
            description={
              reviewedCount > 0
                ? `You reviewed ${reviewedCount} bid${reviewedCount > 1 ? 's' : ''} this session. All clear.`
                : 'All bids are within the category thresholds.'
            }
            className="bg-white rounded-xl shadow-sm"
          />
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
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                            Awaiting Review
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                          <Clock className="h-3 w-3" />
                          <span>{formatDateTime(bid.submittedAt)}</span>
                          <span className="text-gray-300">-</span>
                          <span>{timeAgo(bid.submittedAt)}</span>
                        </div>
                      </div>

                      {/* Bid amount - prominent */}
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
                            {value || '-'}
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
                        Approve bid
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => openDialog(bid, 'rejected')}
                      >
                        <XCircle className="h-4 w-4" />
                        Reject bid
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

        {/* Approve / reject dialog */}
        <ConfirmDialog
          open={!!dialog}
          onClose={() => setDialog(null)}
          title={dialog?.decision === 'approved' ? 'Approve this bid?' : 'Reject this bid?'}
          description={
            dialog?.decision === 'approved'
              ? 'The bid will be made visible to the client and the artisan will be notified.'
              : 'The bid will be hidden from the client and the job will return to open bidding.'
          }
          confirmLabel={dialog?.decision === 'approved' ? 'Approve bid' : 'Reject bid'}
          onConfirm={handleConfirm}
          destructive={dialog?.decision === 'rejected'}
          loading={submitting}
          error={submitError || null}
          requireReason
          minReason={dialog?.decision === 'rejected' ? 10 : 0}
          reasonLabel={dialog?.decision === 'rejected' ? 'Reason (required, kept in the audit log)' : 'Reason (optional, kept in the audit log)'}
          reasonPlaceholder={dialog?.decision === 'rejected' ? 'Explain why this bid is being rejected' : 'Note for the audit log (optional)'}
        >
          {dialog && (
            <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm text-gray-600 space-y-1">
              <p><span className="font-medium">Artisan:</span> {dialog.bid.artisanName}</p>
              <p><span className="font-medium">Amount:</span> {formatGhs(dialog.bid.amountPesewas)} ({Math.round(((dialog.bid.amountPesewas - dialog.bid.flagThresholdPesewas) / dialog.bid.flagThresholdPesewas) * 100)}% over threshold)</p>
              <p><span className="font-medium">Category:</span> {dialog.bid.categoryName}</p>
            </div>
          )}
        </ConfirmDialog>
      </div>
    </PageGuard>
  )
}
