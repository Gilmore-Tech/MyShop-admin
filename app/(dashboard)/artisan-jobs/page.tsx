'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { PageGuard } from '@/components/common/page-guard'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, MoreHorizontal, AlertTriangle, Wrench, Loader2, Trash2, MapPin } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { listArtisanJobs, deleteJob, type AdminJob } from '@/lib/api'
import { getAdminUser } from '@/lib/api-client'

function formatGhs(pesewas: number) {
  return 'GHS ' + (pesewas / 100).toFixed(2)
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function StalenessFlag({ hours }: { hours: number }) {
  if (!hours || hours === 0) return null
  if (hours >= 48) return <span className="ml-1.5 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-semibold">Payout Frozen</span>
  if (hours >= 24) return <span className="ml-1.5 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">Escalated {hours}h</span>
  return <span className="ml-1.5 text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-medium">{hours}h inactive</span>
}

export default function ArtisanJobsPage() {
  const router = useRouter()
  const adminUser = getAdminUser()
  // An admin scoped to a region only sees/acts on that region's jobs. Region
  // scope is now independent of any role — it's driven solely by regionScope.
  const lockedRegion = adminUser?.regionScope ?? null

  const [jobs, setJobs] = useState<AdminJob[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [regionFilter, setRegionFilter] = useState(lockedRegion ?? 'all')
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<AdminJob | null>(null)
  const [deletingAll, setDeletingAll] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const LIMIT = 50

  const fetchJobs = useCallback(() => {
    setLoading(true)
    const activeRegion = lockedRegion ?? (regionFilter === 'all' ? undefined : regionFilter)
    listArtisanJobs({
      status: statusFilter === 'all' ? undefined : statusFilter,
      search: search || undefined,
      page,
      limit: LIMIT,
      region: activeRegion,
    })
      .then(res => {
        setJobs(res.items)
        setTotal(res.total)
        setTotalPages(res.totalPages)
      })
      .catch(() => setJobs([]))
      .finally(() => setLoading(false))
  }, [statusFilter, search, page, regionFilter, lockedRegion])

  useEffect(() => { fetchJobs() }, [fetchJobs])
  useAutoRefresh(fetchJobs)
  useEffect(() => { setPage(1) }, [statusFilter, search, regionFilter])

  const staleJobs = jobs.filter(j => j.staleHours >= 24)
  const unassignedCount = jobs.filter(j => j.status === 'queued').length
  const activeCount = jobs.filter(j => ['en_route', 'arrived', 'in_progress', 'confirmed'].includes(j.status)).length

  async function handleDeleteOne() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteJob(deleteTarget.id, 'Deleted from artisan jobs admin queue')
      setJobs(prev => prev.filter(j => j.id !== deleteTarget.id))
      setTotal(prev => prev - 1)
    } catch {
      // keep dialog open so user can retry
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  async function handleDeleteAllStale() {
    setDeletingAll(true)
    try {
      await Promise.all(staleJobs.map(j => deleteJob(j.id, 'Bulk cleanup — job idle for 24+ hours')))
      const staleIds = new Set(staleJobs.map(j => j.id))
      setJobs(prev => prev.filter(j => !staleIds.has(j.id)))
      setTotal(prev => prev - staleJobs.length)
    } catch {
      // partial failure — refresh to get real state
      fetchJobs()
    } finally {
      setDeletingAll(false)
    }
  }

  return (
     <PageGuard permission="view_jobs">
    <div>
      <PageHeader
        title="Artisan Jobs"
        subtitle={lockedRegion ? `Artisan service bookings · ${lockedRegion} region` : 'Manage all artisan service bookings'}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-purple-50 rounded-lg px-3 py-1.5">
              <Wrench className="h-3.5 w-3.5 text-purple-500" />
              <span className="text-sm font-semibold text-purple-700">{activeCount}</span>
              <span className="text-xs text-purple-400">active</span>
            </div>
            {staleJobs.length > 0 && (
              <div className="flex items-center gap-2 bg-red-50 rounded-lg px-3 py-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                <span className="text-sm font-semibold text-red-700">{staleJobs.length}</span>
                <span className="text-xs text-red-400">stale</span>
              </div>
            )}
            <Link href="/artisan-jobs/manual-assignment">
              <Button size="sm" className="text-white gap-1.5" style={{ backgroundColor: '#F5A623' }}>
                Manual Assignment
                {unassignedCount > 0 && (
                  <span className="ml-1 bg-white text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ color: '#F5A623' }}>
                    {unassignedCount}
                  </span>
                )}
              </Button>
            </Link>
          </div>
        }
      />

      {staleJobs.length > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-red-50 rounded-xl px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 flex-1">
            <strong>{staleJobs.length} job{staleJobs.length > 1 ? 's' : ''}</strong> have been in-progress for 24+ hours and require admin attention.
            {jobs.some(j => j.staleHours >= 48) && ' Payouts are frozen on jobs over 48h.'}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-red-300 text-red-600 hover:bg-red-100 gap-1.5 h-7 text-xs"
            disabled={deletingAll}
            onClick={handleDeleteAllStale}
          >
            {deletingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Delete All Stale ({staleJobs.length})
          </Button>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input
            placeholder="Search job ID, client, artisan, category…"
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44 bg-white"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
            <SelectItem value="open_for_bids">Open for Bids</SelectItem>
            <SelectItem value="bids_received">Bids Received</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="en_route">En Route</SelectItem>
            <SelectItem value="arrived">Arrived</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="disputed">Disputed</SelectItem>
          </SelectContent>
        </Select>

        {/* Region filter: locked for regional admins, selectable for super/ops */}
        {lockedRegion ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-purple-100 text-purple-700">
            <MapPin className="h-3 w-3" /> {lockedRegion}
          </span>
        ) : (
          <Select value={regionFilter} onValueChange={setRegionFilter}>
            <SelectTrigger className="w-44 bg-white"><SelectValue placeholder="All Regions" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Regions</SelectItem>
              <SelectItem value="Ashanti">Ashanti</SelectItem>
              <SelectItem value="Greater Accra">Greater Accra</SelectItem>
              <SelectItem value="Western">Western</SelectItem>
              <SelectItem value="Central">Central</SelectItem>
              <SelectItem value="Eastern">Eastern</SelectItem>
              <SelectItem value="Northern">Northern</SelectItem>
              <SelectItem value="Volta">Volta</SelectItem>
              <SelectItem value="Upper East">Upper East</SelectItem>
              <SelectItem value="Upper West">Upper West</SelectItem>
              <SelectItem value="Brong-Ahafo">Brong-Ahafo</SelectItem>
            </SelectContent>
          </Select>
        )}

        <div className="ml-auto text-sm text-gray-400">{total} jobs</div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Job ID</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date / Time</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Artisan</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</TableHead>
              {!lockedRegion && <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Region</TableHead>}
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Agreed Price</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Supplement</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pay Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(8)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(lockedRegion ? 10 : 11)].map((_, j) => (
                    <TableCell key={j}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={lockedRegion ? 10 : 11} className="text-center py-12 text-gray-400 text-sm">
                  No jobs found
                </TableCell>
              </TableRow>
            ) : (
              jobs.map(job => (
                <TableRow key={job.id} className={`hover:bg-gray-50 cursor-pointer ${job.staleHours >= 24 ? 'bg-red-50/40' : ''}`} onClick={() => router.push(`/artisan-jobs/${job.id}`)}>
                  <TableCell className="font-mono text-sm font-semibold text-orange-600">
                    {job.id.slice(-8).toUpperCase()}
                    {job.staleHours > 0 && <StalenessFlag hours={job.staleHours} />}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500 whitespace-nowrap">{formatDateTime(job.createdAt)}</TableCell>
                  <TableCell className="text-sm font-medium text-gray-800">{job.clientName ?? '—'}</TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {job.artisanName
                      ? job.artisanName
                      : <span className="text-amber-600 font-semibold">⚠ Unassigned</span>
                    }
                  </TableCell>
                  <TableCell>
                    <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                      {job.categoryName ?? '—'}
                    </span>
                  </TableCell>
                  {!lockedRegion && (
                    <TableCell>
                      {job.region
                        ? <span className="inline-flex items-center gap-1 text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full font-medium"><MapPin className="h-2.5 w-2.5" />{job.region}</span>
                        : <span className="text-gray-300">—</span>
                      }
                    </TableCell>
                  )}
                  <TableCell><StatusBadge status={job.status} /></TableCell>
                  <TableCell className="text-right text-sm font-semibold text-gray-800">
                    {job.agreedPricePesewas != null ? formatGhs(job.agreedPricePesewas) : '—'}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {job.supplementPesewas && job.supplementPesewas > 0
                      ? <span className="text-amber-600 font-semibold">+{formatGhs(job.supplementPesewas)}</span>
                      : <span className="text-gray-400">—</span>
                    }
                  </TableCell>
                  <TableCell><StatusBadge status={job.paymentStatus ?? 'pending'} /></TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-600">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/artisan-jobs/${job.id}`}>View Details</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/artisan-jobs/${job.id}`}>Bid History</Link>
                        </DropdownMenuItem>
                        {job.status === 'queued' && (
                          <DropdownMenuItem asChild className="text-amber-600">
                            <Link href="/artisan-jobs/manual-assignment">Assign Manually</Link>
                          </DropdownMenuItem>
                        )}
                        {job.status === 'disputed' && (
                          <DropdownMenuItem asChild className="text-amber-600">
                            <Link href={`/disputes?search=${job.id}`}>Handle Dispute</Link>
                          </DropdownMenuItem>
                        )}
                        {job.staleHours >= 24 && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600 focus:text-red-600 focus:bg-red-50 gap-1.5"
                              onClick={() => setDeleteTarget(job)}
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete Stale Job
                            </DropdownMenuItem>
                          </>
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
            {loading
              ? <Loader2 className="h-3 w-3 animate-spin inline" />
              : `Showing page ${page} of ${totalPages} (${total} total)`
            }
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      </div>
    </div>

    <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null) }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="h-5 w-5" /> Delete Stale Job
          </DialogTitle>
          <DialogDescription>
            Permanently delete job{' '}
            <strong className="font-mono">{deleteTarget?.id.slice(-8).toUpperCase()}</strong>
            {deleteTarget?.clientName && <> for <strong>{deleteTarget.clientName}</strong></>}
            ? This job has been inactive for <strong>{deleteTarget?.staleHours}h</strong> and cannot be recovered.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            onClick={handleDeleteOne}
            disabled={deleting}
            className="bg-red-600 hover:bg-red-700 text-white gap-2"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {deleting ? 'Deleting…' : 'Delete Job'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </PageGuard>
  )
}
