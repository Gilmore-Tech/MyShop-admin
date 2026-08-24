'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { PageGuard } from '@/components/common/page-guard'
import { ChevronRight, CheckCircle2, Scale } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/common/page-header'
import { FilterBar, FilterSearch } from '@/components/common/filter-bar'
import { DataTable } from '@/components/common/data-table'
import { EmptyState } from '@/components/common/empty-state'
import { StatusBadge } from '@/components/common/status-badge'
import { getDisputes, type Dispute } from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { formatGhs } from '@/lib/money'
import { formatDateTime } from '@/lib/format-date'

// Spec: docs/admin-frontend-spec-payment-panel.md §4.3.

function ageHours(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000
}

function ageLabel(iso: string): string {
  const h = ageHours(iso)
  if (h < 1) return `${Math.round(h * 60)}m old`
  if (h < 24) return `${Math.floor(h)}h ${Math.round((h - Math.floor(h)) * 60)}m old`
  const d = Math.floor(h / 24)
  return `${d}d ${Math.floor(h - d * 24)}h old`
}

interface ResolvedFlash {
  id: string
  refundedPesewas: number | null
  mode: 'REFUND_FULL' | 'REFUND_PARTIAL' | 'REJECT'
  status?: string
}

function readResolvedFlash(): ResolvedFlash | null {
  try {
    const raw = sessionStorage.getItem('disputes:resolved')
    if (!raw) return null
    sessionStorage.removeItem('disputes:resolved')
    return JSON.parse(raw) as ResolvedFlash
  } catch {
    return null
  }
}

export default function DisputesPage() {
  const searchParams = useSearchParams()
  const [items, setItems] = useState<Dispute[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '')
  const [statusFilter, setStatusFilter] = useState('all')
  const [flash, setFlash] = useState<ResolvedFlash | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getDisputes()
      setItems(data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load disputes.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useAutoRefresh(load)

  // One-shot success banner after returning from /disputes/:id resolve.
  useEffect(() => { setFlash(readResolvedFlash()) }, [])

  const filtered = items.filter(d => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      d.id.toLowerCase().includes(q) ||
      (d.clientName ?? '').toLowerCase().includes(q) ||
      (d.providerName ?? '').toLowerCase().includes(q) ||
      (d.description ?? '').toLowerCase().includes(q)
    const matchStatus = statusFilter === 'all' || d.status === statusFilter
    return matchSearch && matchStatus
  })

  // Spec: sort oldest-first so the most-at-risk-of-SLA-breach surfaces top.
  const sorted = [...filtered].sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )

  const openCount = items.filter(d => d.status === 'open').length
  const underReviewCount = items.filter(d => d.status === 'under_review').length
  return (
    <PageGuard permission="view_disputes">
      <div>
        <PageHeader
          title="Disputes"
          subtitle="Open and resolved disputes across rides and artisan jobs"
        />

        {flash && (
          <div className="mb-4 flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <p className="text-sm text-emerald-700 font-medium">
              {flash.mode === 'REJECT'
                ? 'Dispute rejected - no refund issued.'
                : flash.status === 'refund_pending'
                  ? `Refund approved - ${formatGhs(flash.refundedPesewas)} is being processed. The provider is not charged until the refund succeeds.`
                : flash.refundedPesewas != null
                  ? `Refund update - ${formatGhs(flash.refundedPesewas)}.`
                  : 'Dispute resolved.'}
            </p>
            <button
              onClick={() => setFlash(null)}
              className="ml-auto text-emerald-600 hover:text-emerald-800 text-xs"
            >Dismiss</button>
          </div>
        )}

        <div className="mb-4 text-xs text-gray-500 bg-amber-50 rounded-lg px-4 py-2.5 flex items-center gap-2">
          <span className="text-amber-600 font-semibold">Rule:</span>
          Clients may raise a dispute for <strong>2 hours</strong> from ride completion or client-confirmed artisan completion. The corresponding provider amount remains held during that window and stays blocked while a dispute is open.
        </div>

        <FilterBar
          onRefresh={load}
          refreshing={loading}
          meta={`${openCount} open - ${underReviewCount} in review - ${sorted.length} shown`}
        >
          <FilterSearch value={search} onChange={setSearch} placeholder="Search by ID, client, provider..." />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-44 bg-white"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="under_review">Under review</SelectItem>
              <SelectItem value="refund_pending">Refund processing</SelectItem>
              <SelectItem value="refund_failed">Refund needs attention</SelectItem>
              <SelectItem value="resolved_refund">Resolved (full refund)</SelectItem>
              <SelectItem value="resolved_partial_refund">Resolved (partial refund)</SelectItem>
              <SelectItem value="resolved_no_refund">Resolved (no refund)</SelectItem>
            </SelectContent>
          </Select>
        </FilterBar>

        <DataTable
          columns={[
            {
              key: 'dispute',
              header: 'Dispute',
              render: d => <span className="font-mono text-sm font-semibold text-primary">{d.id.slice(0, 8)}...</span>,
            },
            {
              key: 'raised',
              header: 'Raised',
              render: d => {
                const isActive = d.status === 'open' || d.status === 'under_review'
                return (
                  <span className="whitespace-nowrap">
                    <span className="block">{formatDateTime(d.createdAt)}</span>
                    {isActive && <span className="block text-[10px] text-gray-400">{ageLabel(d.createdAt)}</span>}
                  </span>
                )
              },
            },
            {
              key: 'type',
              header: 'Type',
              render: d => <StatusBadge status={d.type} />,
            },
            {
              key: 'client',
              header: 'Client',
              render: d => d.clientName ?? <span className="text-gray-400 italic">-</span>,
            },
            {
              key: 'provider',
              header: 'Provider',
              render: d => d.providerName ?? <span className="text-gray-400 italic">-</span>,
            },
            {
              key: 'description',
              header: 'Description',
              className: 'max-w-48 truncate',
              render: d => <span className="text-sm text-gray-500">{d.description ?? '-'}</span>,
            },
            {
              key: 'amount',
              header: 'Amount',
              align: 'right',
              render: d => <span className="font-medium">{formatGhs(d.amountPesewas)}</span>,
            },
            {
              key: 'status',
              header: 'Status',
              render: d => <StatusBadge status={d.status} />,
            },
            {
              key: 'chevron',
              header: '',
              className: 'w-10',
              render: () => <ChevronRight className="h-4 w-4 text-gray-300" />,
            },
          ]}
          rows={sorted}
          rowKey={d => d.id}
          loading={loading}
          error={error || null}
          onRetry={load}
          rowHref={d => `/disputes/${d.id}`}
          rowAriaLabel={d => `Open dispute ${d.id.slice(0, 8)}`}
          empty={
            <EmptyState
              icon={Scale}
              title={search || statusFilter !== 'all' ? 'No results match your filters' : 'No disputes found'}
            />
          }
          caption={loading ? 'Loading...' : `Showing ${sorted.length} of ${items.length} disputes (oldest first)`}
        />
      </div>
    </PageGuard>
  )
}
