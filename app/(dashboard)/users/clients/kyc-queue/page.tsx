'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, IdCard, RefreshCw, Search, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { PageGuard } from '@/components/common/page-guard'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { VerifyClientKycDialog } from '@/components/users/verify-client-kyc-dialog'
import { getClientKycQueue, reviewClientKyc, type ClientKycQueueItem } from '@/lib/api'
import { ApiError } from '@/lib/api-client'

function fmtSubmitted(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  const diffH = (Date.now() - d.getTime()) / 36e5
  const ageLabel =
    diffH < 1   ? `${Math.round(diffH * 60)}m ago` :
    diffH < 24  ? `${Math.round(diffH)}h ago` :
                  `${Math.round(diffH / 24)}d ago`
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} · ${ageLabel}`
}

function ageBadgeColour(iso: string | null) {
  if (!iso) return 'text-gray-400'
  const diffH = (Date.now() - new Date(iso).getTime()) / 36e5
  if (diffH >= 24) return 'text-red-600 font-semibold'
  if (diffH >= 6)  return 'text-amber-600'
  return 'text-gray-500'
}

export default function ClientKycQueuePage() {
  const [items, setItems] = useState<ClientKycQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const [selected, setSelected] = useState<ClientKycQueueItem | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [action, setAction] = useState<'approve' | 'reject'>('approve')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [dialogError, setDialogError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getClientKycQueue()
      setItems(res)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load KYC queue')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useAutoRefresh(load)

  function openReview(item: ClientKycQueueItem) {
    setSelected(item)
    setAction('approve')
    setReason('')
    setDialogError('')
    setDialogOpen(true)
  }

  async function handleConfirm() {
    if (!selected) return
    if (action === 'reject' && reason.trim().length < 5) {
      setDialogError('Reason must be at least 5 characters when rejecting.')
      return
    }
    setSubmitting(true)
    setDialogError('')
    try {
      await reviewClientKyc(selected.clientId, action, action === 'reject' ? reason.trim() : (reason.trim() || undefined))
      setDialogOpen(false)
      // Optimistically remove the item from the queue
      setItems(prev => prev.filter(i => i.clientId !== selected.clientId))
    } catch (err) {
      setDialogError(err instanceof ApiError ? err.message : 'Action failed.')
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
          title="Client KYC Queue"
          subtitle="Ghana Card submissions awaiting admin review (oldest first)"
          actions={
            <div className="flex items-center gap-2">
              <Link href="/users/clients">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to Clients
                </Button>
              </Link>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={load} disabled={loading}>
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </Button>
            </div>
          }
        />

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              placeholder="Search by name, phone, or email…"
              className="pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="ml-auto flex items-center gap-2 bg-amber-50 rounded-lg px-3 py-1.5">
            <IdCard className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-sm font-semibold text-amber-700">{items.length}</span>
            <span className="text-xs text-amber-500">pending review</span>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3 mb-4">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {/* Cards grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="aspect-[16/10] bg-gray-100 animate-pulse" />
                <div className="px-4 py-3 space-y-2">
                  <div className="h-4 bg-gray-100 rounded animate-pulse w-2/3" />
                  <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <CheckCircle className="h-10 w-10 text-emerald-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-700">
              {items.length === 0 ? 'Nothing to review' : 'No matches'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {items.length === 0
                ? 'All client Ghana Card submissions have been processed.'
                : 'Try adjusting your search.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(item => (
              <div key={item.clientId} className="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col">
                {/* Card preview */}
                <button
                  type="button"
                  onClick={() => openReview(item)}
                  className="aspect-[16/10] bg-gray-50 border-b border-gray-100 overflow-hidden flex items-center justify-center group hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-orange-300"
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
                      <p className="text-sm font-semibold text-gray-900 truncate">{item.fullName || '—'}</p>
                      <p className="text-xs text-gray-500 font-mono truncate">{item.phone || '—'}</p>
                      {item.email && (
                        <p className="text-[11px] text-gray-400 truncate">{item.email}</p>
                      )}
                    </div>
                    <span className={`text-[11px] whitespace-nowrap shrink-0 ${ageBadgeColour(item.submittedAt)}`}>
                      {fmtSubmitted(item.submittedAt)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    <Button
                      size="sm"
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                      onClick={() => { setSelected(item); setAction('approve'); setReason(''); setDialogError(''); setDialogOpen(true) }}
                    >
                      <CheckCircle className="h-3.5 w-3.5" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 border-red-200 text-red-600 hover:bg-red-50 gap-1.5"
                      onClick={() => { setSelected(item); setAction('reject'); setReason(''); setDialogError(''); setDialogOpen(true) }}
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

      <VerifyClientKycDialog
        open={dialogOpen}
        fullName={selected?.fullName ?? null}
        ghanaCardImageUrl={selected?.ghanaCardImageUrl ?? null}
        submittedAt={selected?.submittedAt ?? null}
        action={action}
        reason={reason}
        loading={submitting}
        error={dialogError}
        onActionChange={a => { setAction(a); setDialogError('') }}
        onReasonChange={r => { setReason(r); setDialogError('') }}
        onConfirm={handleConfirm}
        onClose={() => { if (!submitting) setDialogOpen(false) }}
      />
    </PageGuard>
  )
}
