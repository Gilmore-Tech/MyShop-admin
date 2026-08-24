'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { PageGuard } from '@/components/common/page-guard'
import { useRole } from '@/hooks/use-role'
import { RoleGate } from '@/components/common/role-gate'
import Link from 'next/link'
import {
  ArrowLeft, MapPin, Clock, User, Star, Loader2, AlertTriangle,
  CheckCircle2, Search, RefreshCw, Wrench, Phone, CalendarClock,
  BadgeCheck, Wifi, WifiOff, ChevronRight, Navigation, Info, Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { PageHeader } from '@/components/common/page-header'
import { PageSkeleton } from '@/components/common/load-state'
import { EmptyState } from '@/components/common/empty-state'
import {
  getUnassignedJobs, lockJob, assignJob, deleteJob, searchArtisans, getAllConfig,
  type UnassignedJob, type ArtisanSearchResult,
} from '@/lib/api'
import { ApiError, FEATURES, safeAdminErrorDiagnostic } from '@/lib/api-client'
import { annotateDistancesFromLiveMap } from '@/lib/distance'

// Manual assignment only kicks in once the artisan bid window has elapsed without
// any bids. Spec: PRD §"If zero bids received after 5 minutes, job escalates to
// admin queue" + EDD `job_bid_window_secs`. The window is sourced from the
// platform config key `bid_window_minutes`; this is the fallback if config is
// unavailable or malformed.
const DEFAULT_BID_WINDOW_MINUTES = 5

// Pre-set radii for the proximity filter. `null` means no cap.
const RADIUS_PRESETS: Array<{ label: string; km: number | null }> = [
  { label: '5 km', km: 5 },
  { label: '10 km', km: 10 },
  { label: '25 km', km: 25 },
  { label: 'Any', km: null },
]
// If platform config doesn't supply `manual_assign_default_radius_km`.
const DEFAULT_RADIUS_KM: number | null = null

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string | null | undefined) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function ghsCurrency(pesewas: number) {
  return `₵${(pesewas / 100).toFixed(2)}`
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  if (h > 0) return `${h}h ${m}m ago`
  return `${m}m ago`
}

function distanceLabel(km: number | null): string {
  if (km == null) return '-'
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(km < 10 ? 1 : 0)} km`
}

// Stale-location warning: how old before we badge an artisan's coords as stale.
const STALE_LOCATION_MS = 30 * 60 * 1000

function isStaleLocation(iso: string | null): boolean {
  if (!iso) return false
  return Date.now() - new Date(iso).getTime() > STALE_LOCATION_MS
}

function StatusPill({ status }: { status: string }) {
  if (status === 'queued')
    return <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">No Artisans</span>
  if (status === 'pending_admin')
    return <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">No Bids</span>
  return <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{status}</span>
}

// ── Artisan card ──────────────────────────────────────────────────────────────

function ArtisanCard({
  artisan, onAssign, busy, showDistance, canAssign,
}: {
  artisan: ArtisanSearchResult
  onAssign: (id: string) => void
  busy: boolean
  showDistance: boolean
  canAssign: boolean
}) {
  const online = artisan.onlineStatus === 'online'
  const stale = isStaleLocation(artisan.lastLocationAt)
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-3 hover:border-orange-200 transition-colors">
      <div className="relative shrink-0">
        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-sm font-bold">
          {initials(artisan.fullName)}
        </div>
        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${online ? 'bg-gray-400' : 'bg-gray-300'}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-semibold text-gray-900">{artisan.fullName}</p>
          <BadgeCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
        </div>
        <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
          <Phone className="h-3 w-3" /> {artisan.phone ?? '-'}
        </p>
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500 flex-wrap">
          {artisan.rating != null && (
            <span className="flex items-center gap-0.5">
              <Star className="h-3 w-3 text-gray-600 fill-gray-600" />
              {artisan.rating.toFixed(1)}
            </span>
          )}
          <span>{artisan.completedJobsCount} jobs done</span>
          <span className={`flex items-center gap-0.5 ${online ? 'text-gray-600' : 'text-gray-400'}`}>
            {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {online ? 'Online' : 'Offline'}
          </span>
          {showDistance && (
            <span
              className={`flex items-center gap-0.5 font-medium ${
                artisan.distanceKm == null ? 'text-gray-300' : stale ? 'text-amber-600' : 'text-gray-700'
              }`}
              title={
                artisan.distanceKm == null
                  ? 'Location unavailable for this artisan.'
                  : stale && artisan.lastLocationAt
                    ? `Last seen ${timeAgo(artisan.lastLocationAt)} - distance may be outdated.`
                    : undefined
              }
            >
              <Navigation className="h-3 w-3" />
              {distanceLabel(artisan.distanceKm)}
              {stale && artisan.distanceKm != null && <span className="text-[10px] ml-1">stale</span>}
            </span>
          )}
        </div>
      </div>

      {canAssign && (
        <Button
          size="sm"
          variant="brand"
          disabled={busy}
          onClick={() => onAssign(artisan.id)}
          className="shrink-0 text-xs px-3"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Assign'}
        </Button>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ManualAssignmentPage() {
  // Anyone with view_jobs can browse the queue (e.g. the artisan coordinator);
  // only assign_job holders see the Assign button and can act.
  const canAssign = useRole().can('assign_job')
  // `allJobs` holds the server's eligible queue (status + 0 bids + no lock).
  // `jobs` (derived below) further filters out anything still inside its 5-minute
  // bid window — those aren't ready for manual assignment yet.
  const [allJobs, setAllJobs] = useState<UnassignedJob[]>([])
  const [, setTick] = useState(0)
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [bidWindowMinutes, setBidWindowMinutes] = useState(DEFAULT_BID_WINDOW_MINUTES)
  const [radiusKm, setRadiusKm] = useState<number | null>(DEFAULT_RADIUS_KM)

  const [artisans, setArtisans] = useState<ArtisanSearchResult[]>([])
  const [loadingArtisans, setLoadingArtisans] = useState(false)
  const [artisanSearch, setArtisanSearch] = useState('')

  const [assigning, setAssigning] = useState<string | null>(null) // artisanId being assigned
  const [assignedJobId, setAssignedJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Delete-job dialog state
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deletedJobId, setDeletedJobId] = useState<string | null>(null)

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const now = Date.now()
  const bidWindowMs = bidWindowMinutes * 60 * 1000
  const jobs = allJobs.filter(j => now - new Date(j.createdAt).getTime() >= bidWindowMs)
  const pendingWindowCount = allJobs.length - jobs.length
  const selectedJob = jobs.find(j => j.id === selectedJobId) ?? null

  // Load unassigned jobs
  const loadJobs = useCallback(async () => {
    setLoadingJobs(true)
    try {
      const res = await getUnassignedJobs()
      // Defensive: the endpoint is spec'd as "jobs with zero bids or artisans"
      // (admin-module.md §Artisan Jobs). Admin manual assignment is ONLY
      // appropriate when:
      //   1. The job is still actually waiting (status `queued` or `pending_admin`),
      //   2. No artisan has been assigned yet, AND
      //   3. No active bids exist (the client should accept a bid instead).
      // The 5-minute bid-window gate is applied at render time so jobs surface
      // automatically once their window expires.
      const ELIGIBLE_STATUSES = new Set(['queued', 'pending_admin'])
      const isAdminAssignable = (j: UnassignedJob) =>
        ELIGIBLE_STATUSES.has(j.status) && (j.bidCount ?? 0) === 0 && !j.adminLock

      const dropped = res.jobs.filter(j => !isAdminAssignable(j))
      if (dropped.length > 0) {
        console.warn(
          `[manual-assignment] backend returned ${dropped.length} ineligible job(s); dropped client-side`,
        )
      }
      setAllJobs(res.jobs.filter(isAdminAssignable))
    } catch (err) {
      console.error(
        '[manual-assignment] getUnassignedJobs failed',
        safeAdminErrorDiagnostic(err),
      )
      setAllJobs([])
    } finally {
      setLoadingJobs(false)
    }
  }, [])

  useEffect(() => { loadJobs() }, [loadJobs])

  // Pull the bid window + default search radius from platform config so they
  // stay in sync with the values ops sets in System Settings. Falls back to
  // defaults on any failure.
  useEffect(() => {
    let cancelled = false
    getAllConfig()
      .then(rows => {
        if (cancelled) return
        const window = rows.find(r => r.key === 'bid_window_minutes')?.value
        const windowParsed = window != null ? Number(window) : NaN
        if (Number.isFinite(windowParsed) && windowParsed > 0) {
          setBidWindowMinutes(windowParsed)
        }
        const radius = rows.find(r => r.key === 'manual_assign_default_radius_km')?.value
        const radiusParsed = radius != null ? Number(radius) : NaN
        if (Number.isFinite(radiusParsed) && radiusParsed > 0) {
          setRadiusKm(radiusParsed)
        }
      })
      .catch(err => console.warn(
        '[manual-assignment] could not load platform config; using defaults',
        safeAdminErrorDiagnostic(err),
      ))
    return () => { cancelled = true }
  }, [])

  // Re-render every 30s so jobs become visible when their bid window elapses,
  // without burning an API call.
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  // Close the right pane when the selected job leaves the queue (assigned,
  // deleted, bid placed elsewhere, or refreshed). We do NOT auto-open a job —
  // the pane only opens when the admin clicks one.
  useEffect(() => {
    if (selectedJobId && !jobs.some(j => j.id === selectedJobId)) {
      setSelectedJobId(null)
    }
  }, [jobs, selectedJobId])

  // Whether proximity features are usable for the currently selected job.
  const hasJobCoords = selectedJob?.lat != null && selectedJob?.lng != null

  // Load artisans when job, search, or radius changes
  useEffect(() => {
    if (!selectedJob) return
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    setLoadingArtisans(true)
    searchTimeout.current = setTimeout(async () => {
      try {
        const useCoords = selectedJob.lat != null && selectedJob.lng != null
        let results = await searchArtisans({
          categoryId: selectedJob.categoryId,
          q: artisanSearch || undefined,
          limit: 30,
          ...(useCoords
            ? {
                lat: selectedJob.lat as number,
                lng: selectedJob.lng as number,
                maxKm: radiusKm ?? undefined,
                sort: 'nearest',
              }
            : {}),
        })

        // Option C — live-map Haversine fallback. Only kicks in when the flag
        // is on AND the backend hasn't shipped first-class distances yet AND
        // the job has coordinates. Best-effort: only annotates artisans that
        // currently appear on the live map (i.e. busy ones).
        const backendHasDistance = results.some(r => r.distanceKm != null)
        if (
          FEATURES.nearbyArtisanHaversine &&
          useCoords &&
          !backendHasDistance &&
          results.length > 0
        ) {
          results = await annotateDistancesFromLiveMap(results, {
            lat: selectedJob.lat as number,
            lng: selectedJob.lng as number,
          })
          // Honour the radius cap the backend would have enforced.
          if (radiusKm != null) {
            results = results.filter(r => r.distanceKm == null || r.distanceKm <= radiusKm)
          }
          // Local sort: known distance ascending, unknowns last (alphabetical).
          results = [...results].sort((a, b) => {
            const ad = a.distanceKm
            const bd = b.distanceKm
            if (ad == null && bd == null) return a.fullName.localeCompare(b.fullName)
            if (ad == null) return 1
            if (bd == null) return -1
            return ad - bd
          })
        }

        setArtisans(results)
      } catch {
        setArtisans([])
      } finally {
        setLoadingArtisans(false)
      }
    }, artisanSearch ? 400 : 0)
  }, [selectedJob, artisanSearch, radiusKm])

  // Reset state when job changes
  useEffect(() => {
    if (selectedJobId) {
      setError(null)
      setAssignedJobId(null)
    }
  }, [selectedJobId])

  async function handleAssign(artisanId: string) {
    if (!selectedJob) return
    setError(null)
    setAssigning(artisanId)

    try {
      await lockJob(selectedJob.id)
    } catch (e: unknown) {
      const code = e instanceof ApiError ? e.code : ''
      setError(code === 'JOB_LOCKED_BY_ANOTHER_ADMIN' ? 'Another admin locked this job. Try again.' : 'Could not lock job. Please try again.')
      setAssigning(null)
      return
    }

    try {
      // Directed quote: park the job in `admin_assigned` and ask the artisan to
      // submit a quote for the client to confirm. No agreedPricePesewas — the
      // backend would otherwise default to `confirm` mode and instant-confirm at
      // the category minimum, which this page does NOT want.
      await assignJob(selectedJob.id, { artisanId, mode: 'request_quote' })
      setAssignedJobId(selectedJob.id)
      setAllJobs(prev => prev.filter(j => j.id !== selectedJob.id))
      // selectedJobId clears via the auto-select effect once `jobs` updates.
    } catch (e: unknown) {
      const code = e instanceof ApiError ? e.code : ''
      if (code === 'LOCK_NOT_HELD') setError('Lock expired - please try again.')
      else if (code === 'ARTISAN_NOT_FOUND') setError('Artisan is no longer eligible. Refresh and try another.')
      else setError('Assignment failed. Please try again.')
    } finally {
      setAssigning(null)
    }
  }

  function openDeleteDialog() {
    setDeleteReason('')
    setDeleteError(null)
    setDeleteOpen(true)
  }

  async function handleDeleteJob() {
    if (!selectedJob) return
    const reason = deleteReason.trim()
    if (reason.length < 10) {
      setDeleteError('Reason must be at least 10 characters (audit-logged).')
      return
    }
    setDeleteError(null)
    setDeleting(true)
    try {
      await deleteJob(selectedJob.id, reason)
      setDeletedJobId(selectedJob.id)
      setAllJobs(prev => prev.filter(j => j.id !== selectedJob.id))
      setDeleteOpen(false)
    } catch (e: unknown) {
      const code = e instanceof ApiError ? e.code : ''
      if (code === 'JOB_NOT_DELETABLE') {
        setDeleteError('This job is active or in-progress - force-complete or cancel it first.')
      } else if (code === 'JOB_NOT_FOUND') {
        setDeleteError('Job no longer exists. Refreshing the queue.')
        setAllJobs(prev => prev.filter(j => j.id !== selectedJob.id))
      } else {
        setDeleteError(e instanceof ApiError ? e.message : 'Failed to delete job. Please try again.')
      }
    } finally {
      setDeleting(false)
    }
  }

  return (
    <PageGuard permission="view_jobs">
      <div className="space-y-4">
        <PageHeader
          title="Manual assignment"
          subtitle="Assign an artisan to a job - they will bid and the client confirms the price"
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={loadJobs} disabled={loadingJobs} className="gap-1.5">
                <RefreshCw className={`h-3.5 w-3.5 ${loadingJobs ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Link href="/artisan-jobs">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <ArrowLeft className="h-3.5 w-3.5" /> Jobs
                </Button>
              </Link>
            </div>
          }
        />

        {/* Success banner */}
        {assignedJobId && (
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <p className="text-sm text-emerald-700 font-medium">Artisan assigned. They will submit a bid for the client to review and confirm.</p>
          </div>
        )}

        {/* Deleted banner */}
        {deletedJobId && (
          <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
            <Trash2 className="h-4 w-4 text-gray-500 shrink-0" />
            <p className="text-sm text-gray-700 font-medium">Job deleted and removed from the queue.</p>
            <button
              onClick={() => setDeletedJobId(null)}
              className="ml-auto text-xs text-gray-500 hover:text-gray-800"
            >Dismiss</button>
          </div>
        )}

        {loadingJobs ? (
          <PageSkeleton variant="cards" />
        ) : jobs.length === 0 && !assignedJobId ? (
          <EmptyState
            icon={CheckCircle2}
            title="Queue is clear"
            description={
              pendingWindowCount > 0
                ? `${pendingWindowCount} job${pendingWindowCount === 1 ? '' : 's'} still in the ${bidWindowMinutes}-minute bidding window. Anything not bid on will appear here automatically.`
                : 'No jobs are waiting for manual assignment.'
            }
            className="bg-white rounded-2xl shadow-sm"
          />
        ) : (
          <>
            {/* ── Job queue (card grid) ── */}
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-1 mb-2">
              Queue ({jobs.length})
              {pendingWindowCount > 0 && (
                <span className="ml-2 normal-case tracking-normal text-gray-300">- {pendingWindowCount} awaiting bid</span>
              )}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {jobs.map(job => (
                <button
                  key={job.id}
                  onClick={() => setSelectedJobId(job.id)}
                  className="text-left rounded-xl border border-gray-100 bg-white p-4 transition-all hover:border-gray-200 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="font-mono text-xs font-bold text-gray-900">#{job.id.slice(-8).toUpperCase()}</span>
                    <StatusPill status={job.status} />
                  </div>
                  <p className="text-sm font-semibold text-gray-900 truncate">{job.categoryName}</p>
                  <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{job.description}</p>
                  <div className="flex items-center justify-between mt-2 text-[11px] text-gray-400">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {timeAgo(job.createdAt)}</span>
                    <span className="inline-flex items-center gap-0.5 text-gray-500 font-medium">Assign <ChevronRight className="h-3 w-3" /></span>
                  </div>
                </button>
              ))}
            </div>

            {/* ── Right pane (Sheet) ── */}
            <Sheet open={!!selectedJob} onOpenChange={o => { if (!o) setSelectedJobId(null) }}>
              <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0">
                {selectedJob && (
                  <>
                    <SheetHeader className="px-6 py-4 border-b border-gray-100">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <SheetTitle className="flex items-center gap-2 text-base">
                            <Wrench className="h-4 w-4 text-gray-600 shrink-0" />
                            <span className="truncate">{selectedJob.categoryName}</span>
                            <StatusPill status={selectedJob.status} />
                          </SheetTitle>
                          <p className="font-mono text-xs text-gray-400 mt-1">#{selectedJob.id.slice(-12).toUpperCase()}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <p className="text-[11px] text-gray-400">Min price</p>
                            <p className="text-sm font-bold text-gray-900">{ghsCurrency(selectedJob.minBidPesewas)}</p>
                          </div>
                          <RoleGate permission="delete_job">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-gray-300 hover:text-red-600"
                              onClick={openDeleteDialog}
                              title="Delete this job (super_admin)"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </RoleGate>
                        </div>
                      </div>
                    </SheetHeader>

                    <div className="px-6 py-5 space-y-5">
                      {/* Job details */}
                      <div className="space-y-3">
                        <p className="text-sm text-gray-700 leading-relaxed">{selectedJob.description}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {selectedJob.addressText && (
                            <div className="flex items-start gap-2 text-sm text-gray-600">
                              <MapPin className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                              <span className="text-xs leading-snug">{selectedJob.addressText}</span>
                            </div>
                          )}
                          {selectedJob.clientName && (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <User className="h-4 w-4 text-gray-400 shrink-0" />
                              <div>
                                <p className="text-xs font-medium">{selectedJob.clientName}</p>
                                {selectedJob.clientPhone && <p className="text-[11px] text-gray-400">{selectedJob.clientPhone}</p>}
                              </div>
                            </div>
                          )}
                          {selectedJob.scheduledFor && (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <CalendarClock className="h-4 w-4 text-gray-400 shrink-0" />
                              <p className="text-xs">{new Date(selectedJob.scheduledFor).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Clock className="h-4 w-4 text-gray-400 shrink-0" />
                            <p className="text-xs">In queue {selectedJob.hoursInQueue}h ({timeAgo(selectedJob.createdAt)})</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2 pt-3 border-t border-gray-50">
                          <AlertTriangle className="h-3.5 w-3.5 text-gray-600 shrink-0 mt-0.5" />
                          <p className="text-[11px] text-gray-400 leading-snug">
                            No price is set at assignment. Once assigned, the artisan will submit a bid
                            through the app and the client will confirm before work begins.
                            {selectedJob.minBidPesewas > 0 && (
                              <> Client&apos;s minimum: <span className="font-semibold text-gray-600">{ghsCurrency(selectedJob.minBidPesewas)}</span>.</>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Assign error (kept inside the pane so it's visible) */}
                      {error && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                          <p className="text-sm text-red-700">{error}</p>
                        </div>
                      )}

                      {/* Artisan picker */}
                      <div className="space-y-3 border-t border-gray-100 pt-4">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                            Artisans - {selectedJob.categoryName}
                            {hasJobCoords && <span className="ml-2 normal-case tracking-normal text-gray-300">- nearest first</span>}
                          </p>
                          {loadingArtisans && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
                        </div>

                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                          <Input
                            placeholder="Search by name"
                            value={artisanSearch}
                            onChange={e => setArtisanSearch(e.target.value)}
                            className="pl-8 text-sm"
                          />
                        </div>

                        {hasJobCoords ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] text-gray-400 uppercase tracking-wider mr-1">Within</span>
                            {RADIUS_PRESETS.map(p => {
                              const active = radiusKm === p.km
                              return (
                                <button
                                  key={p.label}
                                  type="button"
                                  onClick={() => setRadiusKm(p.km)}
                                  className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
                                    active
                                      ? 'bg-orange-50 border-orange-300 text-orange-700'
                                      : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                                  }`}
                                >
                                  {p.label}
                                </button>
                              )
                            })}
                            {FEATURES.nearbyArtisanHaversine && (
                              <span className="ml-auto text-[10px] text-gray-300 flex items-center gap-1">
                                <Info className="h-3 w-3" /> distance via live-map fallback
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                            <Info className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-gray-500 leading-snug">
                              This job has no recorded location, so artisans cannot be sorted by distance. Showing alphabetically.
                            </p>
                          </div>
                        )}

                        {artisans.length === 0 && !loadingArtisans ? (
                          <div className="text-center py-10">
                            <p className="text-sm text-gray-400">
                              {hasJobCoords && radiusKm != null
                                ? `No approved artisans found within ${radiusKm} km. Try widening the radius.`
                                : 'No approved artisans found for this category.'}
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {artisans.map(a => (
                              <ArtisanCard
                                key={a.id}
                                artisan={a}
                                busy={assigning === a.id}
                                onAssign={handleAssign}
                                showDistance={hasJobCoords}
                                canAssign={canAssign}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </SheetContent>
            </Sheet>
          </>
        )}

        {/* Delete job dialog */}
        <Dialog open={deleteOpen} onOpenChange={open => { if (!open && !deleting) setDeleteOpen(false) }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-red-600 flex items-center gap-2">
                <Trash2 className="h-4 w-4" /> Delete job
              </DialogTitle>
              <DialogDescription>
                Soft-deletes the job. The backend only allows this in pre-acceptance states (queued / pending_admin) or terminal states.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-1">
              {selectedJob && (
                <div className="bg-gray-50 rounded-lg p-3 text-xs">
                  <p className="font-mono text-gray-500">#{selectedJob.id.slice(-12).toUpperCase()}</p>
                  <p className="text-gray-700 mt-0.5 font-medium">{selectedJob.categoryName}</p>
                  <p className="text-gray-500 mt-0.5 line-clamp-2">{selectedJob.description}</p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Reason <span className="text-gray-400">(min 10 chars, audit-logged)</span>
                </Label>
                <Textarea
                  rows={3}
                  placeholder="Why is this job being deleted?"
                  value={deleteReason}
                  onChange={e => setDeleteReason(e.target.value)}
                  className="text-sm"
                />
                <p className={`text-[11px] ${deleteReason.trim().length >= 10 ? 'text-emerald-600' : 'text-gray-400'}`}>
                  {deleteReason.trim().length} / 10 characters
                </p>
              </div>
              {deleteError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{deleteError}</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancel</Button>
              <Button
                disabled={deleting || deleteReason.trim().length < 10}
                onClick={handleDeleteJob}
                className="bg-red-600 hover:bg-red-700 text-white gap-2"
              >
                {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Delete Job
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageGuard>
  )
}
