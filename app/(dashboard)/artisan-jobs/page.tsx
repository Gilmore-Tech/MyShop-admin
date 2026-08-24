'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { PageGuard } from '@/components/common/page-guard'
import Link from 'next/link'
import { AlertTriangle, Wrench, MapPin, Clock, X, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { DataTable, type DataTableColumn } from '@/components/common/data-table'
import { FilterBar, FilterSearch } from '@/components/common/filter-bar'
import { EmptyState } from '@/components/common/empty-state'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { useDateRange } from '@/components/common/table-controls'
import { useLinkedParam } from '@/components/common/date-range-filter'
import { listArtisanJobs, deleteJob, cancelJob, type AdminJob } from '@/lib/api'
import { getAdminUser, ApiError } from '@/lib/api-client'
import { formatDateTime } from '@/lib/format-date'
import { formatGhs } from '@/lib/money'
import { statusLabel } from '@/lib/status-labels'
import { dateBasisCaption } from '@/lib/date-range'

// In-progress jobs have a payout (so 48h+ means a frozen payout); pre-assignment
// jobs (queued, pending_admin, ...) are merely stuck awaiting action.
const IN_PROGRESS_STATUSES = ['confirmed', 'en_route', 'arrived', 'in_progress']

// Minimal idle indicator: a clock + hours, coloured by severity. The full
// meaning lives in the tooltip and on the detail page - the table stays clean.
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
// queued / pending_admin) returns 400 JOB_NOT_DELETABLE - those are cancelled.
const DELETABLE_JOB_STATUSES = ['completed', 'cancelled', 'expired', 'refunded']
// States the backend allows an admin to cancel (the remedy for stuck jobs).
const CANCELLABLE_JOB_STATUSES = ['queued', 'pending_admin', 'admin_assigned', 'open_for_bids', 'bids_received', 'confirmed']

// Status values the filter accepts; also validates ?status= deep links.
const JOB_STATUS_FILTERS = ['all', 'queued', 'pending_admin', 'admin_assigned', 'open_for_bids', 'bids_received', 'confirmed', 'en_route', 'arrived', 'in_progress', 'completed', 'cancelled', 'disputed'] as const

const REGION_OPTIONS = ['Ashanti', 'Greater Accra', 'Western', 'Central', 'Eastern', 'Northern', 'Volta', 'Upper East', 'Upper West', 'Brong-Ahafo']

export default function ArtisanJobsPage() {
  const adminUser = getAdminUser()
  // An admin scoped to a region only sees/acts on that region's jobs. Prefer the
  // new region name; fall back to the legacy free-text regionScope.
  const lockedRegion = adminUser?.regionName ?? adminUser?.regionScope ?? null

  const [jobs, setJobs] = useState<AdminJob[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [regionFilter, setRegionFilter] = useState(lockedRegion ?? 'all')
  const [limit, setLimit] = useState(15)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminJob | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<AdminJob | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const { from, to, control: dateControl } = useDateRange('all', { onChange: () => setPage(1), readUrl: true })
  // Booking outcomes deep-links here with ?status=...
  useLinkedParam('status', JOB_STATUS_FILTERS, setStatusFilter)
  const requestSequence = useRef(0)

  const fetchJobs = useCallback(() => {
    const request = ++requestSequence.current
    setLoading(true)
    setError(null)
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
        if (request !== requestSequence.current) return
        setJobs(res.items)
        setTotal(res.total)
      })
      .catch(() => {
        if (request === requestSequence.current) {
          setJobs([])
          setTotal(0)
          setError('Could not load artisan jobs. Check your connection and try again.')
        }
      })
      .finally(() => { if (request === requestSequence.current) setLoading(false) })
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

  // Cancel is the remedy for stuck/live jobs (queued, pending_admin, ...).
  async function handleCancelJob(reason: string) {
    if (!cancelTarget) return
    setCancelling(true); setCancelError(null)
    try {
      await cancelJob(cancelTarget.id, reason)
      setJobs(prev => prev.map(j => j.id === cancelTarget.id ? { ...j, status: 'cancelled' } : j))
      setCancelTarget(null)
    } catch (e) {
      setCancelError(apiMessage(e, 'Failed to cancel job.'))
    } finally {
      setCancelling(false)
    }
  }

  const columns: DataTableColumn<AdminJob>[] = [
    {
      key: 'job',
      header: 'Job',
      render: row => {
        const sh = staleHoursOf(row)
        return (
          <>
            <p className="font-mono text-sm font-semibold text-gray-900">
              {row.id.slice(-8).toUpperCase()}
              {sh > 0 && <StalenessFlag hours={sh} status={row.status} />}
            </p>
            <p className="text-xs text-gray-400 mt-0.5 whitespace-nowrap">
              {formatDateTime(row.createdAt)}
              {row.region && !lockedRegion && <span className="ml-1.5">- {row.region}</span>}
            </p>
          </>
        )
      },
    },
    {
      key: 'client',
      header: 'Client',
      render: row => <span className="text-sm font-medium text-gray-800">{row.clientName ?? '-'}</span>,
    },
    {
      key: 'artisan',
      header: 'Artisan',
      render: row => row.artisanName
        ? <span className="text-sm text-gray-500">{row.artisanName}</span>
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
      key: 'price',
      header: 'Price',
      align: 'right',
      render: row => <span className="text-sm font-semibold text-gray-800">{formatGhs(row.agreedPricePesewas)}</span>,
    },
  ]

  const filtersActive = search.trim().length > 0 || statusFilter !== 'all' || (!lockedRegion && regionFilter !== 'all')

  return (
    <PageGuard permission="view_jobs">
      <div>
        <PageHeader
          title="Artisan jobs"
          subtitle="All artisan service bookings"
          actions={
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-1.5">
                <Wrench className="h-3.5 w-3.5 text-gray-600" />
                <span className="text-sm font-semibold text-gray-700">{activeCount}</span>
                <span className="text-xs text-gray-400">active on this page</span>
              </div>
              {staleJobs.length > 0 && (
                <div className="flex items-center gap-2 bg-red-50 rounded-lg px-3 py-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                  <span className="text-sm font-semibold text-red-700">{staleJobs.length}</span>
                  <span className="text-xs text-red-400">stale on this page</span>
                </div>
              )}
              <Link href="/artisan-jobs/manual-assignment">
                <Button size="sm" variant="brand" className="gap-1.5">
                  Manual assignment
                  {unassignedCount > 0 && (
                    <span className="ml-1 bg-white text-xs font-bold px-1.5 py-0.5 rounded-full text-primary">
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
              {' '}Use <strong>Cancel</strong> on a stuck job, or force-complete from its details.
            </p>
          </div>
        )}

        <FilterBar onRefresh={fetchJobs} refreshing={loading} meta={dateBasisCaption('Jobs', 'requested')}>
          <FilterSearch value={search} onChange={setSearch} placeholder="Search job ID, client, artisan, category" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-44 bg-white"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {JOB_STATUS_FILTERS.filter(s => s !== 'all').map(s => (
                <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Region filter: locked for regional admins, selectable for super/ops */}
          {lockedRegion ? (
            <span className="inline-flex h-9 items-center gap-1.5 text-xs font-semibold px-3 rounded-full bg-gray-100 text-gray-600">
              <MapPin className="h-3 w-3" /> {lockedRegion}
            </span>
          ) : (
            <Select value={regionFilter} onValueChange={setRegionFilter}>
              <SelectTrigger className="h-9 w-40 bg-white"><SelectValue placeholder="All regions" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All regions</SelectItem>
                {REGION_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {dateControl}
        </FilterBar>

        <DataTable
          columns={columns}
          rows={jobs}
          rowKey={row => row.id}
          loading={loading}
          error={error}
          onRetry={fetchJobs}
          rowHref={row => `/artisan-jobs/${row.id}`}
          rowAriaLabel={row => `Open job ${row.id.slice(-8).toUpperCase()}`}
          rowMenu={row => (
            <>
              <DropdownMenuItem asChild>
                <Link href={`/artisan-jobs/${row.id}`}>View details</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/artisan-jobs/${row.id}`}>Bid history</Link>
              </DropdownMenuItem>
              {row.status === 'queued' && (
                <DropdownMenuItem asChild className="text-amber-600">
                  <Link href="/artisan-jobs/manual-assignment">Assign manually</Link>
                </DropdownMenuItem>
              )}
              {row.status === 'disputed' && (
                <DropdownMenuItem asChild className="text-amber-600">
                  <Link href={`/disputes?search=${row.id}`}>Handle dispute</Link>
                </DropdownMenuItem>
              )}
              {CANCELLABLE_JOB_STATUSES.includes(row.status) && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-600 focus:text-red-600 focus:bg-red-50 gap-1.5"
                    onClick={() => { setCancelTarget(row); setCancelError(null) }}
                  >
                    <X className="h-3.5 w-3.5" /> Cancel job
                  </DropdownMenuItem>
                </>
              )}
              {DELETABLE_JOB_STATUSES.includes(row.status) && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-600 focus:text-red-600 focus:bg-red-50 gap-1.5"
                    onClick={() => { setDeleteTarget(row); setDeleteError(null) }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete record
                  </DropdownMenuItem>
                </>
              )}
            </>
          )}
          empty={
            <EmptyState
              title={filtersActive ? 'No jobs match these filters' : 'No jobs yet'}
              description={filtersActive ? 'Try a different search, or clear the filters.' : 'Artisan job bookings will appear here once clients start booking.'}
            />
          }
          caption={`${total} job${total === 1 ? '' : 's'}`}
          pagination={{ page, pageSize: limit, total, onPage: setPage, onPageSize: setLimit }}
        />
      </div>

      {/* Cancel job dialog (remedy for stuck/live jobs) */}
      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => { setCancelTarget(null); setCancelError(null) }}
        title="Cancel this job?"
        description={<>The client{cancelTarget?.artisanName ? ' and artisan' : ''} will be notified. This is recorded in the audit log.</>}
        confirmLabel="Cancel job"
        onConfirm={handleCancelJob}
        destructive
        loading={cancelling}
        error={cancelError}
        requireReason
        minReason={10}
        reasonPlaceholder="e.g. No artisan available in region; job abandoned by client."
      >
        {cancelTarget && (
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
            <span className="font-mono">{cancelTarget.id.slice(-8).toUpperCase()}</span>
            {cancelTarget.clientName && <span> - {cancelTarget.clientName}</span>}
          </div>
        )}
      </ConfirmDialog>

      {/* Delete record dialog (terminal jobs only) */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteError(null) }}
        title="Delete this job record?"
        description="This removes a finished job and cannot be undone."
        confirmLabel="Delete record"
        onConfirm={() => handleDeleteOne()}
        destructive
        loading={deleting}
        error={deleteError}
      >
        {deleteTarget && (
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
            <span className="font-mono">{deleteTarget.id.slice(-8).toUpperCase()}</span>
            {deleteTarget.clientName && <span> ({deleteTarget.clientName})</span>}
          </div>
        )}
      </ConfirmDialog>
    </PageGuard>
  )
}
