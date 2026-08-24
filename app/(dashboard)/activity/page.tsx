'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { PageGuard } from '@/components/common/page-guard'
import { PageHeader } from '@/components/common/page-header'
import { FilterBar } from '@/components/common/filter-bar'
import { DataTable, AvatarCell, type DataTableColumn } from '@/components/common/data-table'
import { EmptyState } from '@/components/common/empty-state'
import {
  DollarSign, UserCheck,
  Scale, Activity, ArrowUpRight,
  CheckCircle2, XCircle, Siren,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getRecentActivity, type ActivityItem, type ActivityEventType } from '@/lib/api'
import { useDateRange } from '@/components/common/date-range-filter'
import { formatDateTime, timeAgo } from '@/lib/format-date'
import { formatGhs } from '@/lib/money'
import { dateBasisCaption } from '@/lib/date-range'

// ─── Event metadata ───────────────────────────────────────────────────────────

const EVENT_META: Record<ActivityEventType, {
  label: string
  icon: React.ElementType
  color: string
  bg: string
  border: string
}> = {
  ride_completed:   { label: 'Ride Completed',   icon: CheckCircle2, color: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-100' },
  ride_cancelled:   { label: 'Ride Cancelled',   icon: XCircle,      color: 'text-gray-500',   bg: 'bg-gray-100',    border: 'border-gray-200' },
  ride_disputed:    { label: 'Ride Disputed',    icon: Scale,        color: 'text-red-600',    bg: 'bg-red-50',      border: 'border-red-100' },
  job_completed:    { label: 'Job Completed',    icon: CheckCircle2, color: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-100' },
  job_disputed:     { label: 'Job Disputed',     icon: Scale,        color: 'text-red-600',    bg: 'bg-red-50',      border: 'border-red-100' },
  escrow_released:  { label: 'Escrow Released',  icon: DollarSign,   color: 'text-gray-600',   bg: 'bg-gray-100',    border: 'border-gray-200' },
  sos_triggered:    { label: 'SOS Triggered',    icon: Siren,        color: 'text-red-700',    bg: 'bg-red-100',     border: 'border-red-200' },
  kyc_submitted:    { label: 'Client ID Check Submitted', icon: UserCheck, color: 'text-gray-600', bg: 'bg-gray-100', border: 'border-gray-200' },
  dispute_resolved: { label: 'Dispute Resolved', icon: Scale,        color: 'text-gray-600',   bg: 'bg-gray-100',    border: 'border-gray-200' },
  emergency:        { label: 'Emergency / SOS',  icon: Siren,        color: 'text-red-700',    bg: 'bg-red-100',     border: 'border-red-200' },
  dispute:          { label: 'Dispute',          icon: Scale,        color: 'text-red-600',    bg: 'bg-red-50',      border: 'border-red-100' },
  verification:     { label: 'Document Submitted', icon: UserCheck,  color: 'text-gray-600',   bg: 'bg-gray-100',    border: 'border-gray-200' },
  ride:             { label: 'Ride Activity',    icon: Activity,     color: 'text-gray-600',   bg: 'bg-gray-100',    border: 'border-gray-200' },
  job:              { label: 'Job Activity',     icon: Activity,     color: 'text-gray-600',   bg: 'bg-gray-100',    border: 'border-gray-200' },
  payout:           { label: 'Payout Activity',  icon: DollarSign,   color: 'text-gray-600',   bg: 'bg-gray-100',    border: 'border-gray-200' },
}

const ROLE_LABEL: Record<string, string> = {
  driver:  'Driver',
  artisan: 'Artisan',
  client:  'Client',
  system:  'System',
}

const ROLE_COLOR: Record<string, string> = {
  driver:  'text-gray-600 bg-gray-100',
  artisan: 'text-gray-600 bg-gray-100',
  client:  'text-gray-600 bg-gray-100',
  system:  'text-gray-500 bg-gray-100',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function shortId(id: string | null) {
  if (!id) return null
  return id.slice(0, 8).toUpperCase()
}

// Turn a raw DB event-type string into a readable label.
// e.g. "ride_completed" / "RIDE.COMPLETED" -> "Ride Completed"
function humanizeType(t: string) {
  return t.replace(/[_.]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/\b\w/g, c => c.toUpperCase())
}

// Prefer our curated label when the type is known, otherwise humanize the raw value.
function eventLabel(t: string) {
  return EVENT_META[t as ActivityEventType]?.label ?? humanizeType(t)
}

const FETCH_LIMIT = 100   // backend-capped recent events within the selected range
const PAGE_SIZE = 15      // rows shown per page

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ActivityPage() {
  const router = useRouter()
  const {
    from, to, preset: dateRange, setPreset: setDateRange,
    setCustomFrom, setCustomTo, control: dateControl,
  } = useDateRange('all')
  const [items, setItems]             = useState<ActivityItem[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [typeFilter, setTypeFilter]   = useState<string>('all')
  const [roleFilter, setRoleFilter]   = useState<'all' | 'client' | 'driver' | 'artisan' | 'system'>('all')
  const [page, setPage]               = useState(1)
  const requestSequence = useRef(0)

  const load = useCallback(() => {
    const request = ++requestSequence.current
    setLoading(true); setError(null)
    setItems([])
    getRecentActivity({ limit: FETCH_LIMIT, from, to })
      .then(data => { if (request === requestSequence.current) setItems(data) })
      .catch(() => { if (request === requestSequence.current) setError('Failed to load activity feed.') })
      .finally(() => { if (request === requestSequence.current) setLoading(false) })
  }, [from, to])

  useEffect(() => { load() }, [load])
  useAutoRefresh(load)

  // Build the event-type filter options from the actual values in the data, so the
  // options always match what the DB returns (regardless of its exact naming).
  const availableTypes = Array.from(
    new Set(items.map(i => i.eventType).filter(Boolean))
  ).sort()

  const filtered = items.filter(item => {
    const matchType = typeFilter === 'all' || item.eventType === typeFilter
    const matchRole = roleFilter === 'all' || item.actorRole === roleFilter
    return matchType && matchRole
  })

  // Reset to the first page whenever the filters change so results stay visible.
  useEffect(() => { setPage(1) }, [typeFilter, roleFilter, dateRange, from, to])

  // Client-side pagination over the filtered list.
  const totalPages   = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage  = Math.min(page, totalPages)
  const pageStart    = (currentPage - 1) * PAGE_SIZE
  const pageItems    = filtered.slice(pageStart, pageStart + PAGE_SIZE)

  // Summary counts
  const counts = {
    sos: filtered.filter(i => i.eventType === 'emergency' || i.eventType === 'sos_triggered').length,
    disputed: filtered.filter(i => i.eventType === 'dispute' || i.eventType === 'ride_disputed' || i.eventType === 'job_disputed').length,
    kyc: filtered.filter(i => i.eventType === 'verification' || i.eventType === 'kyc_submitted').length,
  }

  function navigateToBooking(item: ActivityItem) {
    if (!item.bookingId) return
    if (item.bookingType === 'ride') router.push(`/rides?search=${item.bookingId}`)
    else if (item.bookingType === 'job') router.push(`/artisan-jobs/${item.bookingId}`)
  }

  const columns: DataTableColumn<ActivityItem>[] = [
    {
      key: 'event', header: 'Event',
      render: item => {
        const meta = EVENT_META[item.eventType] ?? {
          label: (item.eventType ?? 'unknown').replace(/_/g, ' '), icon: Activity,
          color: 'text-gray-500', bg: 'bg-gray-100', border: 'border-gray-200',
        }
        const Icon = meta.icon
        const isSos = item.eventType === 'emergency' || item.eventType === 'sos_triggered'
        return (
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${meta.bg} ${meta.color} ${meta.border} ${isSos ? 'ring-1 ring-red-200' : ''}`}>
            <Icon className="h-3 w-3" />
            {meta.label}
          </span>
        )
      },
    },
    {
      key: 'actor', header: 'Actor',
      render: item => (
        <AvatarCell
          name={item.actorName || 'Unknown'}
          size={28}
          sub={
            <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full ${ROLE_COLOR[item.actorRole] ?? 'text-gray-400 bg-gray-100'}`}>
              {ROLE_LABEL[item.actorRole] ?? item.actorRole}
            </span>
          }
        />
      ),
    },
    {
      key: 'details', header: 'Details', className: 'max-w-[220px] whitespace-normal',
      render: item => <span className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{item.description}</span>,
    },
    {
      key: 'amount', header: 'Amount', align: 'right',
      render: item => item.amountPesewas != null ? (
        <span className={`text-sm font-semibold ${
          item.eventType === 'escrow_released' ? 'text-blue-700'
          : item.eventType === 'ride_completed' || item.eventType === 'job_completed' ? 'text-emerald-700'
          : 'text-gray-800'
        }`}>
          {formatGhs(item.amountPesewas)}
        </span>
      ) : <span className="text-gray-300">-</span>,
    },
    {
      key: 'time', header: 'Time',
      render: item => (
        <>
          <p className="text-xs font-medium text-gray-700">{timeAgo(item.occurredAt)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{formatDateTime(item.occurredAt)}</p>
        </>
      ),
    },
    {
      key: 'ref', header: 'Ref',
      render: item => item.bookingId ? (
        <button
          onClick={() => navigateToBooking(item)}
          className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-orange-600 hover:text-orange-800 hover:underline transition-colors"
          title={`View ${item.bookingType ?? 'booking'} ${item.bookingId}`}
        >
          {shortId(item.bookingId)}
          <ArrowUpRight className="h-3 w-3" />
        </button>
      ) : <span className="text-gray-300">-</span>,
    },
  ]

  return (
    <PageGuard permission="view_activity">
      <div>
        <PageHeader title="Activity feed" subtitle="Recent platform activity" />

        {/* Summary pills */}
        {!loading && items.length > 0 && (counts.sos > 0 || counts.disputed > 0 || counts.kyc > 0) && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {counts.sos > 0 && (
              <span title="Count among loaded events" className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-700 border border-red-200">
                <Siren className="h-3 w-3" /> {counts.sos} loaded emergency/SOS
              </span>
            )}
            {counts.disputed > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-600 border border-red-100">
                <Scale className="h-3 w-3" /> {counts.disputed} loaded dispute{counts.disputed !== 1 ? 's' : ''}
              </span>
            )}
            {counts.kyc > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                <UserCheck className="h-3 w-3" /> {counts.kyc} loaded document submission{counts.kyc !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        <FilterBar
          onRefresh={load}
          refreshing={loading}
          meta={
            <span className="text-xs text-gray-400">
              {filtered.length} event{filtered.length !== 1 ? 's' : ''} loaded - up to the latest 100 in range. {dateBasisCaption('Events', 'recorded')}
            </span>
          }
        >
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9 w-44 bg-white">
              <SelectValue placeholder="Event type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {availableTypes.map(k => (
                <SelectItem key={k} value={k}>{eventLabel(k)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={roleFilter} onValueChange={v => setRoleFilter(v as typeof roleFilter)}>
            <SelectTrigger className="h-9 w-36 bg-white">
              <SelectValue placeholder="Actor role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="client">Client</SelectItem>
              <SelectItem value="driver">Driver</SelectItem>
              <SelectItem value="artisan">Artisan</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>

          {dateControl}

          {(typeFilter !== 'all' || roleFilter !== 'all' || dateRange !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-xs text-gray-500"
              onClick={() => {
                setTypeFilter('all'); setRoleFilter('all')
                setDateRange('all'); setCustomFrom(''); setCustomTo('')
              }}
            >
              Clear filters
            </Button>
          )}
        </FilterBar>

        <DataTable
          columns={columns}
          rows={pageItems}
          rowKey={item => item.id}
          loading={loading}
          error={error}
          onRetry={load}
          empty={<EmptyState icon={Activity} title="No events match the current filters" />}
          pagination={{ page: currentPage, pageSize: PAGE_SIZE, total: filtered.length, onPage: setPage }}
          minWidth={860}
        />
      </div>
    </PageGuard>
  )
}
