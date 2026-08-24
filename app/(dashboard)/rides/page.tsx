'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { PageGuard } from '@/components/common/page-guard'
import Link from 'next/link'
import { AlertTriangle, Car } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { DataTable, type DataTableColumn } from '@/components/common/data-table'
import { FilterBar, FilterSearch } from '@/components/common/filter-bar'
import { EmptyState } from '@/components/common/empty-state'
import { useDateRange } from '@/components/common/table-controls'
import { useLinkedParam } from '@/components/common/date-range-filter'
import { listRides, type AdminRide } from '@/lib/api'
import { paymentMethodLabel } from '@/lib/payment-labels'
import { statusLabel } from '@/lib/status-labels'
import { formatDateTime } from '@/lib/format-date'
import { formatGhs } from '@/lib/money'
import { dateBasisCaption } from '@/lib/date-range'

// Status values the filter accepts; also validates ?status= deep links.
const RIDE_STATUS_FILTERS = ['all', 'requested', 'accepted', 'driver_en_route', 'in_progress', 'completed', 'cancelled', 'disputed'] as const

export default function RidesPage() {
  const [rides, setRides] = useState<AdminRide[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [limit, setLimit] = useState(15)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { from, to, control: dateControl } = useDateRange('all', { onChange: () => setPage(1), readUrl: true })
  // Trip Outcomes deep-links here with ?status=…
  useLinkedParam('status', RIDE_STATUS_FILTERS, setStatusFilter)
  const requestSequence = useRef(0)

  const fetch = useCallback(() => {
    const request = ++requestSequence.current
    setLoading(true)
    setError(null)
    listRides({
      status: statusFilter === 'all' ? undefined : statusFilter,
      search: search || undefined,
      from,
      to,
      // When the list is narrowed to completed rides, a date range means "rides
      // that finished in this window" — the same day Payments → Money Owed
      // stamps the debt on. Filtering those by booking date instead drops every
      // ride booked before midnight and finished after it, which is what made
      // "N rides completed today" and "no debts today" look contradictory.
      dateBasis: statusFilter === 'completed' ? 'completed' : undefined,
      page,
      limit,
    })
      .then(res => {
        if (request !== requestSequence.current) return
        setRides(res.items)
        setTotal(res.total)
      })
      .catch(() => {
        if (request === requestSequence.current) {
          setRides([])
          setTotal(0)
          setError('Could not load rides. Check your connection and try again.')
        }
      })
      .finally(() => { if (request === requestSequence.current) setLoading(false) })
  }, [statusFilter, search, from, to, page, limit])

  useEffect(() => { fetch() }, [fetch])
  useAutoRefresh(fetch)

  // Reset to page 1 when any filter or page-size changes
  useEffect(() => { setPage(1) }, [statusFilter, search, from, to, limit])

  const activeCount = rides.filter(r => ['en_route', 'in_progress', 'accepted', 'driver_en_route'].includes(r.status)).length
  const completedCount = rides.filter(r => r.status === 'completed').length
  const disputedCount = rides.filter(r => r.status === 'disputed').length

  const columns: DataTableColumn<AdminRide>[] = [
    {
      key: 'ride',
      header: 'Ride',
      render: row => (
        <>
          <p className="font-mono text-sm font-semibold text-gray-900">{row.id.slice(-8).toUpperCase()}</p>
          {/* A completed ride is dated by when it finished — that is the day it
              settled, and the day any cash debt is stamped on Payments → Money
              Owed. Showing the booking time here made the two pages look like
              they disagreed. */}
          <p className="text-xs text-gray-400 mt-0.5 whitespace-nowrap">
            {row.completedAt ? `Completed ${formatDateTime(row.completedAt)}` : formatDateTime(row.createdAt)}
          </p>
        </>
      ),
    },
    {
      key: 'client',
      header: 'Client',
      render: row => <span className="text-sm font-medium text-gray-800">{row.clientName ?? '-'}</span>,
    },
    {
      key: 'driver',
      header: 'Driver',
      render: row => row.driverName
        ? <span className="text-sm text-gray-500">{row.driverName}</span>
        : (
          <span className="text-amber-600 font-semibold inline-flex items-center gap-1 text-sm">
            <AlertTriangle className="h-3.5 w-3.5" /> Unassigned
          </span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: row => <StatusBadge status={row.status} />,
    },
    {
      key: 'amount',
      header: 'Client amount',
      align: 'right',
      render: row => (
        <>
          <p className="text-sm font-semibold text-gray-800">{formatGhs(row.farePesewas)}</p>
          {/* Method decides whether a debt is expected at all: cash means the
              driver holds the fare and owes commission back, so a clawback
              should exist; MoMo/card commission is withheld from the payout
              and correctly produces none. A completed ride with no payment
              row never settled — flag it rather than show "-". */}
          <p className="text-xs text-gray-400">
            {paymentMethodLabel(row.paymentMethod)}
            {' - '}
            {row.paymentStatus ? (
              <span className="capitalize">{row.paymentStatus}</span>
            ) : row.status === 'completed' ? (
              <span className="text-amber-600 font-semibold">unsettled</span>
            ) : (
              '-'
            )}
          </p>
        </>
      ),
    },
  ]

  const filtersActive = search.trim().length > 0 || statusFilter !== 'all'

  return (
    <PageGuard permission="view_rides">
      <div>
        <PageHeader
          title="Rides"
          subtitle="All ride bookings and their fares"
          actions={
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-1.5">
                <Car className="h-3.5 w-3.5 text-gray-600" />
                <span className="text-sm font-semibold text-gray-700">{activeCount}</span>
                <span className="text-xs text-gray-400">active on this page</span>
              </div>
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-1.5">
                <span className="text-sm font-semibold text-gray-700">{completedCount}</span>
                <span className="text-xs text-gray-400">completed on this page</span>
              </div>
              {disputedCount > 0 && (
                <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-1.5">
                  <span className="text-sm font-semibold text-gray-700">{disputedCount}</span>
                  <span className="text-xs text-gray-400">disputed on this page</span>
                </div>
              )}
            </div>
          }
        />

        <FilterBar onRefresh={fetch} refreshing={loading} meta={dateBasisCaption('Rides', 'requested')}>
          <FilterSearch value={search} onChange={setSearch} placeholder="Search ride ID, client, driver" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-40 bg-white"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {RIDE_STATUS_FILTERS.filter(s => s !== 'all').map(s => (
                <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {dateControl}
        </FilterBar>

        <DataTable
          columns={columns}
          rows={rides}
          rowKey={row => row.id}
          loading={loading}
          error={error}
          onRetry={fetch}
          rowHref={row => `/rides/${row.id}`}
          rowAriaLabel={row => `Open ride ${row.id.slice(-8).toUpperCase()}`}
          rowMenu={row => (
            <>
              <DropdownMenuItem asChild>
                <Link href={`/rides/${row.id}`}>View details</Link>
              </DropdownMenuItem>
              {['requested', 'accepted', 'driver_en_route', 'arrived_at_pickup', 'in_progress'].includes(row.status) && (
                <DropdownMenuItem asChild className="text-red-600">
                  <Link href={`/rides/${row.id}`}>Cancel ride</Link>
                </DropdownMenuItem>
              )}
              {row.status === 'disputed' && (
                <DropdownMenuItem asChild className="text-amber-600">
                  <Link href={`/disputes?search=${row.id}`}>Handle dispute</Link>
                </DropdownMenuItem>
              )}
            </>
          )}
          empty={
            <EmptyState
              title={filtersActive ? 'No rides match these filters' : 'No rides yet'}
              description={filtersActive ? 'Try a different search, or clear the status and date filters.' : 'Ride bookings will appear here once clients start booking.'}
            />
          }
          caption={`${total} ride${total === 1 ? '' : 's'}`}
          pagination={{ page, pageSize: limit, total, onPage: setPage, onPageSize: setLimit }}
        />
      </div>
    </PageGuard>
  )
}
