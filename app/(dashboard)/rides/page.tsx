'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { PageGuard } from '@/components/common/page-guard'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, MapPin, MoreHorizontal, Car, Loader2, AlertTriangle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { listRides, type AdminRide } from '@/lib/api'

function formatGhs(pesewas: number) {
  return 'GHS ' + (pesewas / 100).toFixed(2)
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function RidesPage() {
  const router = useRouter()
  const [rides, setRides] = useState<AdminRide[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const LIMIT = 50

  const fetch = useCallback(() => {
    setLoading(true)
    listRides({
      status: statusFilter === 'all' ? undefined : statusFilter,
      search: search || undefined,
      page,
      limit: LIMIT,
    })
      .then(res => {
        setRides(res.items)
        setTotal(res.total)
        setTotalPages(res.totalPages)
      })
      .catch(() => setRides([]))
      .finally(() => setLoading(false))
  }, [statusFilter, search, page])

  useEffect(() => { fetch() }, [fetch])
  useAutoRefresh(fetch)

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1) }, [statusFilter, search])

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
              <span className="text-xs text-gray-400">active</span>
            </div>
            <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-1.5">
              <span className="text-sm font-semibold text-gray-700">{completedCount}</span>
              <span className="text-xs text-gray-400">completed</span>
            </div>
            {disputedCount > 0 && (
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-1.5">
                <span className="text-sm font-semibold text-gray-700">{disputedCount}</span>
                <span className="text-xs text-gray-400">disputed</span>
              </div>
            )}
          </div>
        }
      />

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
        <div className="ml-auto text-sm text-gray-400">{total} rides</div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ride ID</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date / Time</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Driver</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Route</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Fare</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Payment</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pay Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(8)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(10)].map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rides.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-12 text-gray-400 text-sm">
                  No rides found
                </TableCell>
              </TableRow>
            ) : (
              rides.map(ride => (
                <TableRow key={ride.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/rides/${ride.id}`)}>
                  <TableCell className="font-mono text-sm font-semibold text-orange-600">
                    {ride.id.slice(-8).toUpperCase()}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500 whitespace-nowrap">{formatDateTime(ride.createdAt)}</TableCell>
                  <TableCell className="text-sm font-medium text-gray-800">{ride.clientName ?? '-'}</TableCell>
                  <TableCell className="text-sm text-gray-500">{ride.driverName ?? <span className="text-amber-600 font-semibold flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Unassigned</span>}</TableCell>
                  <TableCell>
                    <div className="flex items-start gap-1 text-xs text-gray-500">
                      <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-gray-600" />
                      <div>
                        <p>{ride.pickupAddress}</p>
                        <p className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-gray-600" />{ride.dropoffAddress}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><StatusBadge status={ride.status} /></TableCell>
                  <TableCell className="text-right text-sm font-semibold text-gray-800">{formatGhs(ride.farePesewas)}</TableCell>
                  <TableCell className="text-sm text-gray-500">{ride.paymentMethod ?? '-'}</TableCell>
                  <TableCell><StatusBadge status={ride.paymentStatus} /></TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-600" onClick={e => e.stopPropagation()}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/rides/${ride.id}`} onClick={e => e.stopPropagation()}>View Details</Link>
                        </DropdownMenuItem>
                        {['requested', 'accepted', 'driver_en_route', 'arrived_at_pickup', 'in_progress'].includes(ride.status) && (
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={e => { e.stopPropagation(); router.push(`/rides/${ride.id}`) }}
                          >
                            Cancel Ride
                          </DropdownMenuItem>
                        )}
                        {ride.status === 'disputed' && (
                          <DropdownMenuItem asChild className="text-amber-600">
                            <Link href={`/disputes?search=${ride.id}`} onClick={e => e.stopPropagation()}>Handle Dispute</Link>
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
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
          <p className="text-xs text-gray-400">
            {loading ? <Loader2 className="h-3 w-3 animate-spin inline" /> : `Showing page ${page} of ${totalPages} (${total} total)`}
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
