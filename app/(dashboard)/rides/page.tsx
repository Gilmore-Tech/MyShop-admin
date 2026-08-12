'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { PageGuard } from '@/components/common/page-guard'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, MoreHorizontal, Car, Loader2, AlertTriangle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { useDateRange, PageSizeSelect } from '@/components/common/table-controls'
import { listRides, type AdminRide } from '@/lib/api'
import { paymentMethodLabel } from '@/lib/payment-labels'
import { formatDateTime } from '@/lib/format-date'
import { formatGhs } from '@/lib/money'

export default function RidesPage() {
  const router = useRouter()
  const [rides, setRides] = useState<AdminRide[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [limit, setLimit] = useState(15)
  const [loading, setLoading] = useState(true)
  const { from, to, control: dateControl } = useDateRange('all', { onChange: () => setPage(1) })
  const requestSequence = useRef(0)

  const fetch = useCallback(() => {
    const request = ++requestSequence.current
    setLoading(true)
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
        setTotalPages(Math.max(1, res.totalPages || 1))
      })
      .catch(() => {
        if (request === requestSequence.current) {
          setRides([])
          setTotal(0)
          setTotalPages(1)
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

  return (
    <PageGuard permission="view_rides">
      <div>
        <PageHeader
          title="Rides Management"
          subtitle="All platform ride bookings"
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

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              placeholder="Search ride ID, client, driver…"
              className="pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 bg-white"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="requested">Requested</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="driver_en_route">Driver En Route</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="disputed">Disputed</SelectItem>
            </SelectContent>
          </Select>
          {dateControl}
          <span className="text-xs text-gray-400">
            {statusFilter === 'completed' ? 'By completion date · GMT' : 'By request date · GMT'}
          </span>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-gray-400">{total} rides</span>
            <PageSizeSelect value={limit} onChange={setLimit} />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ride</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Driver</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Client amount</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(8)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(6)].map((_, j) => (
                        <TableCell key={j}>
                          <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : rides.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-gray-400 text-sm">
                      No rides found
                    </TableCell>
                  </TableRow>
                ) : (
                  rides.map(ride => (
                    <TableRow key={ride.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/rides/${ride.id}`)}>
                      <TableCell>
                        <p className="font-mono text-sm font-semibold text-gray-900">{ride.id.slice(-8).toUpperCase()}</p>
                        {/* A completed ride is dated by when it finished — that is the
                            day it settled, and the day any cash debt is stamped on
                            Payments → Money Owed. Showing the booking time here made
                            the two pages look like they disagreed. */}
                        <p className="text-xs text-gray-400 mt-0.5 whitespace-nowrap">
                          {ride.completedAt
                            ? `Completed ${formatDateTime(ride.completedAt)}`
                            : formatDateTime(ride.createdAt)}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm font-medium text-gray-800">{ride.clientName ?? '-'}</TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {ride.driverName ?? <span className="text-amber-600 font-semibold inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Unassigned</span>}
                      </TableCell>
                      <TableCell><StatusBadge status={ride.status} /></TableCell>
                      <TableCell className="text-right">
                        <p className="text-sm font-semibold text-gray-800">{formatGhs(ride.farePesewas)}</p>
                        {/* Method decides whether a debt is expected at all: cash means
                            the driver holds the fare and owes commission back, so a
                            clawback should exist; MoMo/card commission is withheld from
                            the payout and correctly produces none. A completed ride with
                            no payment row never settled — flag it rather than show "-". */}
                        <p className="text-xs text-gray-400">
                          {paymentMethodLabel(ride.paymentMethod)}
                          {' · '}
                          {ride.paymentStatus ? (
                            <span className="capitalize">{ride.paymentStatus}</span>
                          ) : ride.status === 'completed' ? (
                            <span className="text-amber-600 font-semibold">unsettled</span>
                          ) : (
                            '—'
                          )}
                        </p>
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-600">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/rides/${ride.id}`}>View Details</Link>
                            </DropdownMenuItem>
                            {['requested', 'accepted', 'driver_en_route', 'arrived_at_pickup', 'in_progress'].includes(ride.status) && (
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => router.push(`/rides/${ride.id}`)}
                              >
                                Cancel Ride
                              </DropdownMenuItem>
                            )}
                            {ride.status === 'disputed' && (
                              <DropdownMenuItem asChild className="text-amber-600">
                                <Link href={`/disputes?search=${ride.id}`}>Handle Dispute</Link>
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
            <p className="text-xs text-gray-400">
              {loading ? <Loader2 className="h-3 w-3 animate-spin inline" /> : `Page ${page} of ${totalPages} (${total} total)`}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        </div>
      </div>
    </PageGuard>
  )
}
