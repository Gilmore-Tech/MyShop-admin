'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { PageGuard } from '@/components/common/page-guard'
import Link from 'next/link'
import {
  ArrowLeft, MapPin, Clock, User, Star, Loader2, AlertTriangle,
  CheckCircle2, Search, RefreshCw, Wrench, Phone, CalendarClock,
  BadgeCheck, Wifi, WifiOff, ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/common/page-header'
import {
  getUnassignedJobs, lockJob, assignJob, searchArtisans,
  type UnassignedJob, type ArtisanSearchResult,
} from '@/lib/api'
import { ApiError } from '@/lib/api-client'

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

function StatusPill({ status }: { status: string }) {
  if (status === 'queued')
    return <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">No Artisans</span>
  if (status === 'pending_admin')
    return <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">No Bids</span>
  return <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{status}</span>
}

// ── Artisan card ──────────────────────────────────────────────────────────────

function ArtisanCard({
  artisan, onAssign, busy,
}: {
  artisan: ArtisanSearchResult
  onAssign: (id: string) => void
  busy: boolean
}) {
  const online = artisan.onlineStatus === 'online'
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-3 hover:border-orange-200 transition-colors">
      <div className="relative shrink-0">
        <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 text-sm font-bold">
          {initials(artisan.fullName)}
        </div>
        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${online ? 'bg-emerald-500' : 'bg-gray-300'}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-semibold text-gray-900">{artisan.fullName}</p>
          <BadgeCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
        </div>
        <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
          <Phone className="h-3 w-3" /> {artisan.phone ?? '—'}
        </p>
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500">
          {artisan.rating != null && (
            <span className="flex items-center gap-0.5">
              <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
              {artisan.rating.toFixed(1)}
            </span>
          )}
          <span>{artisan.completedJobsCount} jobs done</span>
          <span className={`flex items-center gap-0.5 ${online ? 'text-emerald-600' : 'text-gray-400'}`}>
            {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {online ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      <Button
        size="sm"
        disabled={busy}
        onClick={() => onAssign(artisan.id)}
        className="shrink-0 text-white text-xs px-3"
        style={{ backgroundColor: '#F5A623' }}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Assign'}
      </Button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ManualAssignmentPage() {
  const [jobs, setJobs] = useState<UnassignedJob[]>([])
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [selectedJob, setSelectedJob] = useState<UnassignedJob | null>(null)

  const [artisans, setArtisans] = useState<ArtisanSearchResult[]>([])
  const [loadingArtisans, setLoadingArtisans] = useState(false)
  const [artisanSearch, setArtisanSearch] = useState('')

  const [assigning, setAssigning] = useState<string | null>(null) // artisanId being assigned
  const [assignedJobId, setAssignedJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load unassigned jobs
  const loadJobs = useCallback(async () => {
    setLoadingJobs(true)
    try {
      const res = await getUnassignedJobs()
      const list = res.jobs
      setJobs(list)
      if (list.length > 0 && !selectedJob) {
        setSelectedJob(list[0])
      }
    } catch {
      setJobs([])
    } finally {
      setLoadingJobs(false)
    }
  }, [selectedJob])

  useEffect(() => { loadJobs() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load artisans when job or search changes
  useEffect(() => {
    if (!selectedJob) return
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    setLoadingArtisans(true)
    searchTimeout.current = setTimeout(async () => {
      try {
        const results = await searchArtisans({
          categoryId: selectedJob.categoryId,
          q: artisanSearch || undefined,
          limit: 30,
        })
        setArtisans(results)
      } catch {
        setArtisans([])
      } finally {
        setLoadingArtisans(false)
      }
    }, artisanSearch ? 400 : 0)
  }, [selectedJob, artisanSearch])

  // Reset state when job changes
  useEffect(() => {
    if (selectedJob) {
      setError(null)
      setAssignedJobId(null)
    }
  }, [selectedJob?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAssign(artisanId: string) {
    if (!selectedJob) return
    setError(null)
    setAssigning(artisanId)

    try {
      await lockJob(selectedJob.id)
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : ''
      setError(msg.includes('LOCKED') ? 'Another admin locked this job. Try again.' : 'Could not lock job. Please try again.')
      setAssigning(null)
      return
    }

    try {
      // No agreedPricePesewas — artisan submits a bid for the client to confirm
      await assignJob(selectedJob.id, { artisanId })
      setAssignedJobId(selectedJob.id)
      const remaining = jobs.filter(j => j.id !== selectedJob.id)
      setJobs(remaining)
      setSelectedJob(remaining[0] ?? null)
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : ''
      if (msg.includes('LOCK_NOT_HELD')) setError('Lock expired — please try again.')
      else if (msg.includes('ARTISAN_NOT_FOUND')) setError('Artisan is no longer eligible. Refresh and try another.')
      else setError('Assignment failed. Please try again.')
    } finally {
      setAssigning(null)
    }
  }

  return (
    <PageGuard permission="assign_job">
      <div className="space-y-4">
        <PageHeader
          title="Manual Assignment"
          subtitle="Assign an artisan to a job — they will bid and the client confirms the price"
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

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {loadingJobs ? (
          <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading queue…</span>
          </div>
        ) : jobs.length === 0 && !assignedJobId ? (
          <div className="bg-white rounded-2xl shadow-sm p-14 text-center">
            <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-7 w-7 text-emerald-500" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">Queue is clear</h3>
            <p className="text-sm text-gray-400">No jobs are waiting for manual assignment.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-5">

            {/* ── Job queue list ── */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-1">
                Queue ({jobs.length})
              </p>
              {jobs.map(job => {
                const active = selectedJob?.id === job.id
                return (
                  <button
                    key={job.id}
                    onClick={() => setSelectedJob(job)}
                    className={`w-full text-left rounded-xl border p-3.5 transition-all ${
                      active
                        ? 'border-orange-300 bg-orange-50/60 shadow-sm'
                        : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="font-mono text-xs font-bold text-orange-600">
                        #{job.id.slice(-8).toUpperCase()}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <StatusPill status={job.status} />
                        {active && <ChevronRight className="h-3.5 w-3.5 text-orange-400" />}
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 truncate">{job.categoryName}</p>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{job.description}</p>
                    <div className="flex items-center justify-between mt-2 text-[11px] text-gray-400">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {timeAgo(job.createdAt)}</span>
                      <span>{job.bidCount} bid{job.bidCount !== 1 ? 's' : ''}</span>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* ── Right panel ── */}
            {selectedJob ? (
              <div className="space-y-4">

                {/* Job detail card */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <Wrench className="h-4 w-4 text-orange-400" />
                        <h2 className="font-bold text-gray-900">{selectedJob.categoryName}</h2>
                        <StatusPill status={selectedJob.status} />
                      </div>
                      <p className="font-mono text-xs text-gray-400">#{selectedJob.id.slice(-12).toUpperCase()}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-gray-400">Min price</p>
                      <p className="text-sm font-bold text-gray-900">{ghsCurrency(selectedJob.minBidPesewas)}</p>
                    </div>
                  </div>

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

                  {/* Price note */}
                  <div className="flex items-start gap-2 pt-3 border-t border-gray-50">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-gray-400 leading-snug">
                      No price is set at assignment. Once assigned, the artisan will submit a bid
                      through the app and the client will confirm before work begins.
                      {selectedJob.minBidPesewas > 0 && (
                        <> Client&apos;s minimum: <span className="font-semibold text-gray-600">{ghsCurrency(selectedJob.minBidPesewas)}</span>.</>
                      )}
                    </p>
                  </div>
                </div>

                {/* Artisan picker */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                      Artisans — {selectedJob.categoryName}
                    </p>
                    {loadingArtisans && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <Input
                      placeholder="Search by name…"
                      value={artisanSearch}
                      onChange={e => setArtisanSearch(e.target.value)}
                      className="pl-8 text-sm"
                    />
                  </div>

                  {artisans.length === 0 && !loadingArtisans ? (
                    <div className="text-center py-10">
                      <p className="text-sm text-gray-400">No approved artisans found for this category.</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                      {artisans.map(a => (
                        <ArtisanCard
                          key={a.id}
                          artisan={a}
                          busy={assigning === a.id}
                          onAssign={handleAssign}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 bg-white rounded-2xl border border-gray-100">
                <p className="text-sm text-gray-400">Select a job from the queue to assign an artisan.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </PageGuard>
  )
}
