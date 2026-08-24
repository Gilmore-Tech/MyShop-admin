'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle, ExternalLink, IdCard, XCircle } from 'lucide-react'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { PageGuard } from '@/components/common/page-guard'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { FilterBar, FilterSearch } from '@/components/common/filter-bar'
import { PageSkeleton } from '@/components/common/load-state'
import { ErrorState } from '@/components/common/error-state'
import { EmptyState } from '@/components/common/empty-state'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { formatDayShort, timeAgo, formatDateTime } from '@/lib/format-date'
import { getClientKycQueue, reviewClientKyc, type ClientKycQueueItem } from '@/lib/api'
import { ApiError } from '@/lib/api-client'

type Decision = 'approve' | 'reject'

function submittedCaption(iso: string | null) {
  if (!iso) return '-'
  return `${formatDayShort(iso)} - ${timeAgo(iso)}`
}

// Submissions waiting 24h+ get a heavier tone so an admin can spot the oldest
// backlog at a glance; everything else reads at the same neutral weight.
function ageTone(iso: string | null) {
  if (!iso) return 'text-gray-400'
  const diffH = (Date.now() - new Date(iso).getTime()) / 36e5
  return diffH >= 24 ? 'text-gray-600 font-semibold' : 'text-gray-500'
}

export default function ClientKycQueuePage() {
  const [items, setItems] = useState<ClientKycQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const [selected, setSelected] = useState<ClientKycQueueItem | null>(null)
  const [decision, setDecision] = useState<Decision>('approve')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getClientKycQueue()
      setItems(res)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load the queue.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useAutoRefresh(load)

  function openReview(item: ClientKycQueueItem, initialDecision: Decision = 'approve') {
    setSelected(item)
    setDecision(initialDecision)
    setSubmitError('')
  }

  async function handleConfirm(reason: string) {
    if (!selected) return
    setSubmitting(true)
    setSubmitError('')
    try {
      await reviewClientKyc(selected.clientId, decision, decision === 'reject' ? reason : (reason || undefined))
      setSelected(null)
      // Optimistically remove the item from the queue.
      setItems(prev => prev.filter(i => i.clientId !== selected.clientId))
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Action failed.')
    } finally {
      setSubmitting(false)
    }
  }

  const filtered = items.filter(i => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      i.fullName.toLowerCase().includes(q) ||
      i.phone.toLowerCase().includes(q) ||
      (i.email ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <PageGuard permission="view_verifications">
      <div>
        <PageHeader
          title="Client ID checks"
          subtitle="Ghana Card checks for cash-paying clients (KYC)"
          actions={
            <Link href="/users/clients">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ArrowLeft className="h-3.5 w-3.5" /> Back to clients
              </Button>
            </Link>
          }
        />

        <FilterBar onRefresh={load} refreshing={loading} meta={`${items.length} pending - oldest first`}>
          <FilterSearch value={search} onChange={setSearch} placeholder="Search by name, phone, or email" />
        </FilterBar>

        {error ? (
          <ErrorState title="Could not load the queue" detail={error} onRetry={load} />
        ) : loading ? (
          <PageSkeleton variant="cards" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={CheckCircle}
            title={items.length === 0 ? 'Nothing to review' : 'No matches'}
            description={items.length === 0
              ? 'All client Ghana Card checks have been processed.'
              : 'Try a different search.'}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(item => (
              <div key={item.clientId} className="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col">
                {/* Card preview */}
                <button
                  type="button"
                  onClick={() => openReview(item)}
                  className="aspect-[16/10] bg-gray-50 border-b border-gray-100 overflow-hidden flex items-center justify-center group hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {item.ghanaCardImageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={item.ghanaCardImageUrl}
                      alt="Ghana Card"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 text-gray-300">
                      <IdCard className="h-8 w-8" />
                      <span className="text-xs">No image</span>
                    </div>
                  )}
                </button>

                {/* Body */}
                <div className="px-4 py-3 flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{item.fullName || '-'}</p>
                      <p className="text-xs text-gray-500 font-mono truncate">{item.phone || '-'}</p>
                      {item.email && (
                        <p className="text-[11px] text-gray-400 truncate">{item.email}</p>
                      )}
                    </div>
                    <span className={`text-[11px] whitespace-nowrap shrink-0 ${ageTone(item.submittedAt)}`}>
                      {submittedCaption(item.submittedAt)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    <Button
                      size="sm"
                      variant="brand"
                      className="flex-1 gap-1.5"
                      onClick={() => openReview(item, 'approve')}
                    >
                      <CheckCircle className="h-3.5 w-3.5" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 border-red-200 text-red-600 hover:bg-red-50 gap-1.5"
                      onClick={() => openReview(item, 'reject')}
                    >
                      <XCircle className="h-3.5 w-3.5" /> Reject
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!selected}
        onClose={() => { if (!submitting) setSelected(null) }}
        title={decision === 'approve'
          ? `Approve ${selected?.fullName ?? 'this'}'s Ghana Card?`
          : `Reject ${selected?.fullName ?? 'this'}'s Ghana Card?`}
        description={decision === 'approve'
          ? 'The client is verified and can pay with cash. This is recorded in the audit log.'
          : 'The client keeps their current status and is asked to resubmit. This is recorded in the audit log.'}
        confirmLabel={decision === 'approve' ? 'Approve card' : 'Reject card'}
        destructive={decision === 'reject'}
        requireReason={decision === 'reject'}
        minReason={5}
        reasonLabel={decision === 'reject' ? 'Reason (shown to the client)' : 'Reason (kept in the audit log)'}
        reasonPlaceholder={decision === 'approve'
          ? 'Card verified - name and number match (optional).'
          : 'e.g. Image is blurry. Please re-upload a clearer photo of the front.'}
        loading={submitting}
        error={submitError || null}
        onConfirm={handleConfirm}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Ghana Card</p>
            {selected?.submittedAt && (
              <p className="text-[11px] text-gray-400">Submitted {formatDateTime(selected.submittedAt)}</p>
            )}
          </div>
          {selected?.ghanaCardImageUrl ? (
            <div className="rounded-lg border border-gray-100 bg-gray-50 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selected.ghanaCardImageUrl} alt="Ghana Card" className="w-full max-h-56 object-contain bg-gray-50" />
              <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-end">
                <a
                  href={selected.ghanaCardImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  Open full size <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 py-8 text-center bg-gray-50 rounded-lg">
              <IdCard className="h-6 w-6 text-gray-300" />
              <p className="text-xs text-gray-400">No Ghana Card image uploaded</p>
            </div>
          )}
          <div className="flex gap-2">
            {(['approve', 'reject'] as const).map(d => (
              <button
                key={d}
                type="button"
                onClick={() => setDecision(d)}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium border transition-colors ${
                  decision === d
                    ? 'bg-gray-100 text-gray-800 border-gray-300'
                    : 'text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {d === 'approve' ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                {d === 'approve' ? 'Approve' : 'Reject'}
              </button>
            ))}
          </div>
        </div>
      </ConfirmDialog>
    </PageGuard>
  )
}
