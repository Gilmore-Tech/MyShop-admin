'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { PageGuard } from '@/components/common/page-guard'
import { PageHeader } from '@/components/common/page-header'
import {
  DollarSign, UserCheck,
  Scale, AlertCircle, RefreshCw, Activity, ArrowUpRight,
  CheckCircle2, XCircle, Siren, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getRecentActivity, type ActivityItem, type ActivityEventType } from '@/lib/api'
import { useDateRange } from '@/components/common/date-range-filter'
import { formatDateTime } from '@/lib/format-date'

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
  kyc_submitted:    { label: 'KYC Submitted',    icon: UserCheck,    color: 'text-gray-600',   bg: 'bg-gray-100',    border: 'border-gray-200' },
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

const ACTOR_BG: Record<string, string> = {
  driver:  '#9CA3AF',
  artisan: '#9CA3AF',
  client:  '#9CA3AF',
  system:  '#9CA3AF',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)    return `${diff}s ago`
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function fmtAmount(p: number) {
  return 'GHS ' + (p / 100).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function initials(name: string | null) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

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

  return (
    <PageGuard permission="view_activity">
      <div>
        <PageHeader
          title="Activity Feed"
          subtitle="Platform-wide events by occurred date (GMT) - rides, jobs, payments, and safety."
          actions={
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={load}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          }
        />

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

        {/* Filters */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-48 h-8 text-sm bg-gray-50">
              <SelectValue placeholder="Event type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              {availableTypes.map(k => (
                <SelectItem key={k} value={k}>{eventLabel(k)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={roleFilter} onValueChange={v => setRoleFilter(v as typeof roleFilter)}>
            <SelectTrigger className="w-40 h-8 text-sm bg-gray-50">
              <SelectValue placeholder="Actor role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
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
              className="h-8 text-xs text-gray-500"
              onClick={() => {
                setTypeFilter('all'); setRoleFilter('all')
                setDateRange('all'); setCustomFrom(''); setCustomTo('')
              }}
            >
              Clear filters
            </Button>
          )}

          <span className="text-xs text-gray-400 ml-auto">
            {filtered.length} loaded event{filtered.length !== 1 ? 's' : ''} · up to latest 100 in range
          </span>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="overflow-hidden rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-50">
                {[...Array(8)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(6)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: `${50 + (j * 13) % 40}%` }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 border border-red-100">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={load}>Retry</Button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Activity className="h-10 w-10 text-gray-200" />
            <p className="text-sm text-gray-400">No events match the current filters</p>
          </div>
        )}

        {/* Table */}
        {!loading && !error && filtered.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Event</th>
                  <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Actor</th>
                  <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Details</th>
                  <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Amount</th>
                  <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Time</th>
                  <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pageItems.map(item => {
                  const meta = EVENT_META[item.eventType] ?? {
                    label: (item.eventType ?? 'unknown').replace(/_/g, ' '), icon: Activity,
                    color: 'text-gray-500', bg: 'bg-gray-100', border: 'border-gray-200',
                  }
                  const Icon = meta.icon
                  const isSos = item.eventType === 'emergency' || item.eventType === 'sos_triggered'

                  return (
                    <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${isSos ? 'bg-red-50/40' : ''}`}>

                      {/* Event */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${meta.bg} ${meta.color} ${meta.border}`}>
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </span>
                      </td>

                      {/* Actor */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                            style={{ backgroundColor: ACTOR_BG[item.actorRole] ?? '#9CA3AF' }}
                          >
                            {initials(item.actorName)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate max-w-[120px]">
                              {item.actorName ?? <span className="text-gray-400 italic">Unknown</span>}
                            </p>
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${ROLE_COLOR[item.actorRole] ?? 'text-gray-400 bg-gray-100'}`}>
                              {ROLE_LABEL[item.actorRole] ?? item.actorRole}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Details / description */}
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px]">
                        <span className="line-clamp-2 leading-relaxed">{item.description}</span>
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {item.amountPesewas != null ? (
                          <span className={`text-sm font-semibold ${
                            item.eventType === 'escrow_released' ? 'text-blue-700'
                            : item.eventType === 'ride_completed' || item.eventType === 'job_completed' ? 'text-emerald-700'
                            : 'text-gray-800'
                          }`}>
                            {fmtAmount(item.amountPesewas)}
                          </span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>

                      {/* Time */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-xs font-medium text-gray-700">{timeAgo(item.occurredAt)}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{formatDateTime(item.occurredAt)}</p>
                      </td>

                      {/* Booking ref + link */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {item.bookingId ? (
                          <button
                            onClick={() => navigateToBooking(item)}
                            className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-orange-600 hover:text-orange-800 hover:underline transition-colors"
                            title={`View ${item.bookingType ?? 'booking'} ${item.bookingId}`}
                          >
                            {shortId(item.bookingId)}
                            <ArrowUpRight className="h-3 w-3" />
                          </button>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>

                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && !error && filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-gray-400">
              Showing {pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-xs"
                disabled={currentPage <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </Button>
              <span className="text-xs text-gray-500 tabular-nums px-1">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-xs"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </PageGuard>
  )
}
