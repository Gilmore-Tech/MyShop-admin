'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { PageGuard } from '@/components/common/page-guard'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, MoreHorizontal, AlertTriangle, Wrench, Loader2, Trash2, MapPin, Clock, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { useDateRange, PageSizeSelect } from '@/components/common/table-controls'
import { listArtisanJobs, deleteJob, cancelJob, type AdminJob } from '@/lib/api'
import { getAdminUser, ApiError } from '@/lib/api-client'

function formatGhs(pesewas: number | null | undefined) {
  const ghs = Number(pesewas) / 100
  if (!Number.isFinite(ghs) || ghs === 0) return 'GHC 0'
  return 'GHC ' + ghs.toFixed(2)
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

// In-progress jobs have a payout (so 48h+ means a frozen payout); pre-assignment
// jobs (queued, pending_admin, …) are merely stuck awaiting action.
const IN_PROGRESS_STATUSES = ['confirmed', 'en_route', 'arrived', 'in_progress']

// Minimal idle indicator: a clock + hours, coloured by severity. The full
// meaning lives in the tooltip and on the detail page — the table stays clean.
function StalenessFlag({ hours, status }: { hours: number; status: string }) {
  if (!hours || hours === 0) return null
  const inProgress = IN_PROGRESS_STATUSES.includes(status)
  const meaning = hours >= 48
    ? (inProgress ? 'Payout frozen - idle 48h+' : 'Stuck - idle 48h+')
    : hours >= 24
      ? (inProgress ? 'Escalated - idle 24h+' : 'Stuck - idle 24h+')
      : 'Idle'
  const color = hours >= 24 ? 'text-red-600' : 'text-amber-600'
  return (
    <span title={`${meaning} (${hours}h)`} className={`ml-1.5 inline-flex items-center gap-0.5 text-[11px] font-medium align-middle ${color}`}>
      <Clock className="h-3 w-3" /> {hours}h
    </span>
  )
}

// Staleness only applies to jobs that are still live. A finished job (completed,
// cancelled, expired, refunded) is never "stale" no matter how long ago it ended.
const TERMINAL_JOB_STATUSES = ['completed', 'cancelled', 'expired', 'refunded']
function staleHoursOf(job: AdminJob): number {
  return TERMINAL_JOB_STATUSES.includes(job.status) ? 0 : job.staleHours
}

// Backend only permits *deleting* terminal records. Anything live (incl.
// queued / pending_admin) returns 400 JOB_NOT_DELETABLE — those are cancelled.
const DELETABLE_JOB_STATUSES = ['completed', 'cancelled', 'expired', 'refunded']
// States the backend allows an admin to cancel (the remedy for stuck jobs).
const CANCELLABLE_JOB_STATUSES = ['queued', 'pending_admin', 'admin_assigned', 'open_for_bids', 'bids_received', 'confirmed']

export default function ArtisanJobsPage() {
  const router = useRouter()
  const adminUser = getAdminUser()
  // An admin scoped to a region only sees/acts on that region's jobs. Prefer the
  // new region name; fall back to the legacy free-text regionScope.
  const lockedRegion = adminUser?.regionName ?? adminUser?.regionScope ?? null

  const [jobs, setJobs] = useState<AdminJob[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [regionFilter, setRegionFilter] = useState(lockedRegion ?? 'all')
  const [limit, setLimit] = useState(15)
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<AdminJob | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<AdminJob | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const { from, to, control: dateControl } = useDateRange()

  const fetchJobs = useCallback(() => {
    setLoading(true)
    const activeRegion = lockedRegion ?? (regionFilter === 'all' ? undefined : regionFilter)
    listArtisanJobs({
      status: statusFilter === 'all' ? undefined : statusFilter,
      search: search || undefined,
      from,
      to,
      page,
      limit,
      region: activeRegion,
    })
      .then(res => {
        setJobs(res.items)
        setTotal(res.total)
        setTotalPages(res.totalPages)
      })
      .catch(() => setJobs([]))
      .finally(() => setLoading(false))
  }, [statusFilter, search, from, to, page, limit, regionFilter, lockedRegion])

  useEffect(() => { fetchJobs() }, [fetchJobs])
  useAutoRefresh(fetchJobs)
  useEffect(() => { setPage(1) }, [statusFilter, search, from, to, limit, regionFilter])

  const staleJobs = jobs.filter(j => staleHoursOf(j) >= 24)
  const unassignedCount = jobs.filter(j => j.status === 'queued').length
  const activeCount = jobs.filter(j => ['en_route', 'arrived', 'in_progress', 'confirmed'].includes(j.status)).length

  function apiMessage(e: unknown, fallback: string): string {
    if (e instanceof ApiError) return e.message || fallback
    return fallback
  }

  // Delete is only offered on terminal records (completed/cancelled/expired).
  async function handleDeleteOne() {
    if (!deleteTarget) return
    setDeleting(true); setDeleteError(null)
    try {
      await deleteJob(deleteTarget.id, 'Deleted from artisan jobs admin queue')
      setJobs(prev => prev.filter(j => j.id !== deleteTarget.id))
      setTotal(prev => prev - 1)
      setDeleteTarget(null)
    } catch (e) {
      setDeleteError(apiMessage(e, 'Failed to delete job.'))
    } finally {
      setDeleting(false)
    }
  }

  // Cancel is the remedy for stuck/live jobs (queued, pending_admin, …).
  async function handleCancelJob() {
    if (!cancelTarget) return
    setCancelling(true); setCancelError(null)
    try {
      await cancelJob(cancelTarget.id, cancelReason.trim())
      setJobs(prev => prev.map(j => j.id === cancelTarget.id ? { ...j, status: 'cancelled' } : j))
      setCancelTarget(null)
      setCancelReason('')
    } catch (e) {
      setCancelError(apiMessage(e, 'Failed to cancel job.'))
    } finally {
      setCancelling(false)
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
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-1.5">
                <Wrench className="h-3.5 w-3.5 text-gray-600" />
                <span className="text-sm font-semibold text-gray-700">{activeCount}</span>
                <span className="text-xs text-gray-400">active</span>
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
              <strong>{staleJobs.length} job{staleJobs.length > 1 ? 's' : ''}</strong> have been idle for 24+ hours and require admin attention.
              {jobs.some(j => staleHoursOf(j) >= 48) && ' Payouts are frozen on jobs over 48h.'}
              {' '}Use <strong>Cancel</strong> on a stuck job, or Force-complete from its details.
            </p>
          </div>
        )}

        {deleteError && (
          <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-700 flex-1">{deleteError}</p>
            <button onClick={() => setDeleteError(null)} className="text-xs text-red-500 hover:text-red-700">Dismiss</button>
          </div>
        )}

        {/* Filters */}
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
              <SelectItem value="pending_admin">Pending Admin</SelectItem>
              <SelectItem value="admin_assigned">Awaiting Quote</SelectItem>
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
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-gray-100 text-gray-600">
              <MapPin className="h-3 w-3" /> {lockedRegion}
            </span>
          ) : (
            <Select value={regionFilter} onValueChange={setRegionFilter}>
              <SelectTrigger className="w-40 bg-white"><SelectValue placeholder="All Regions" /></SelectTrigger>
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

          {dateControl}

          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-gray-400">{total} jobs</span>
            <PageSizeSelect value={limit} onChange={setLimit} />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Job</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Artisan</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Price</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(8)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(6)].map((_, j) => (
                        <TableCell key={j}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : jobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-gray-400 text-sm">
                      No jobs found
                    </TableCell>
                  </TableRow>
                ) : (
                  jobs.map(job => {
                    const sh = staleHoursOf(job)
                    return (
                    <TableRow key={job.id} className={`hover:bg-gray-50 cursor-pointer ${sh >= 24 ? 'bg-red-50/40' : ''}`} onClick={() => router.push(`/artisan-jobs/${job.id}`)}>
                      <TableCell>
                        <p className="font-mono text-sm font-semibold text-gray-900">
                          {job.id.slice(-8).toUpperCase()}
                          {sh > 0 && <StalenessFlag hours={sh} status={job.status} />}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5 whitespace-nowrap">
                          {formatDateTime(job.createdAt)}
                          {job.region && !lockedRegion && <span className="ml-1.5">· {job.region}</span>}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm font-medium text-gray-800">{job.clientName ?? '-'}</TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {job.artisanName
                          ? job.artisanName
                          : <span className="text-amber-600 font-semibold inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Unassigned</span>
                        }
                      </TableCell>
                      <TableCell><StatusBadge status={job.status} /></TableCell>
                      <TableCell className="text-right text-sm font-semibold text-gray-800">
                        {formatGhs(job.agreedPricePesewas)}
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
                            {CANCELLABLE_JOB_STATUSES.includes(job.status) && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600 focus:text-red-600 focus:bg-red-50 gap-1.5"
                                  onClick={() => { setCancelTarget(job); setCancelReason(''); setCancelError(null) }}
                                >
                                  <X className="h-3.5 w-3.5" /> Cancel Job
                                </DropdownMenuItem>
                              </>
                            )}
                            {DELETABLE_JOB_STATUSES.includes(job.status) && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600 focus:text-red-600 focus:bg-red-50 gap-1.5"
                                  onClick={() => setDeleteTarget(job)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" /> Delete Record
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )})
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
            <p className="text-xs text-gray-400">
              {loading
                ? <Loader2 className="h-3 w-3 animate-spin inline" />
                : `Page ${page} of ${totalPages} (${total} total)`
              }
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        </div>
      </div>

      {/* Cancel job dialog (remedy for stuck/live jobs) */}
      <Dialog open={!!cancelTarget} onOpenChange={open => { if (!open && !cancelling) { setCancelTarget(null); setCancelError(null) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <X className="h-5 w-5" /> Cancel Job
            </DialogTitle>
            <DialogDescription>
              Cancel job{' '}
              <strong className="font-mono">{cancelTarget?.id.slice(-8).toUpperCase()}</strong>
              {cancelTarget?.clientName && <> for <strong>{cancelTarget.clientName}</strong></>}
              ? The client{cancelTarget?.artisanName ? ' and artisan' : ''} will be notified. This is audit-logged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-1">
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Reason</Label>
            <Textarea
              rows={3}
              placeholder="e.g. No artisan available in region; job abandoned by client."
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              className="text-sm resize-none"
            />
            <p className={`text-[11px] ${cancelReason.trim().length >= 10 ? 'text-emerald-600' : 'text-gray-400'}`}>
              {cancelReason.trim().length >= 10 ? 'Looks good' : `Minimum 10 characters - ${Math.max(0, 10 - cancelReason.trim().length)} more needed`}
            </p>
          </div>
          {cancelError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{cancelError}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={cancelling}>Keep Job</Button>
            <Button
              onClick={handleCancelJob}
              disabled={cancelling || cancelReason.trim().length < 10}
              className="bg-red-600 hover:bg-red-700 text-white gap-2"
            >
              {cancelling && <Loader2 className="h-4 w-4 animate-spin" />}
              {cancelling ? 'Cancelling…' : 'Cancel Job'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete record dialog (terminal jobs only) */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) { setDeleteTarget(null); setDeleteError(null) } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" /> Delete Record
            </DialogTitle>
            <DialogDescription>
              Permanently delete the record for job{' '}
              <strong className="font-mono">{deleteTarget?.id.slice(-8).toUpperCase()}</strong>
              {deleteTarget?.clientName && <> ({deleteTarget.clientName})</>}
              ? This removes a finished job and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{deleteError}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              onClick={handleDeleteOne}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white gap-2"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {deleting ? 'Deleting…' : 'Delete Record'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageGuard>
  )
}
