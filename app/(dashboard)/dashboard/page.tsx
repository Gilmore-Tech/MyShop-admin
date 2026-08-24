'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  AlertTriangle, CheckCircle2, Phone, Navigation, ChevronRight,
  UserCheck, TrendingUp, Scale, Car, Wrench, RefreshCw, Receipt, IdCard, Download,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  getOverviewReport, getRevenueReport, getRecentActivity, getEmergencyAlerts, acknowledgeEmergency,
  getBookingOutcomesReport, getClientKycQueue, getOnlineProviderCounts,
  type OverviewReport, type RevenueDataPoint, type ActivityItem, type EmergencyAlert,
  type BookingOutcomesReport, type OnlineProviderCounts,
} from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { formatDayShort, timeAgo } from '@/lib/format-date'
import { formatGhs, ghsToPesewas } from '@/lib/money'
import { sumGhs } from '@/lib/revenue-report-contract'
import { useDateRange } from '@/components/common/date-range-filter'
import { StatCard, SectionLabel } from '@/components/common/stat-card'
import { dateRangeLabel } from '@/lib/date-range'
import { useRole } from '@/hooks/use-role'
import { exportOverviewCsv } from '@/lib/report-export'
import { PAYMENT_SUCCESS_TARGET_PCT } from '@/lib/targets'
import { Button } from '@/components/ui/button'
import { useAutoRefresh, AUTO_REFRESH_DISABLED } from '@/hooks/use-auto-refresh'

// ─── Activity helpers ─────────────────────────────────────────────────────────

function activityMeta(item: ActivityItem): {
  statusText: string
  statusColor: string
} {
  switch (item.eventType) {
    case 'ride_completed':
    case 'job_completed':
      return { statusText: 'completed', statusColor: 'text-gray-600 bg-gray-100' }
    case 'ride_cancelled':
      return { statusText: 'cancelled', statusColor: 'text-gray-600 bg-gray-100' }
    case 'ride_disputed':
    case 'job_disputed':
      return { statusText: 'disputed', statusColor: 'text-red-600 bg-red-50' }
    case 'escrow_released':
      return { statusText: 'released', statusColor: 'text-gray-600 bg-gray-100' }
    case 'sos_triggered':
      return { statusText: 'emergency', statusColor: 'text-red-600 bg-red-50' }
    case 'kyc_submitted':
      return { statusText: 'pending', statusColor: 'text-gray-600 bg-gray-100' }
    case 'dispute_resolved':
      return { statusText: 'resolved', statusColor: 'text-gray-600 bg-gray-100' }
    default:
      return { statusText: 'event', statusColor: 'text-gray-500 bg-gray-100' }
  }
}

function actorInitials(name: string | null): string {
  if (!name) return '??'
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

// ─── Avatar circle (monochrome regardless of role) ────────────────────────────
function Avatar({ initials }: { initials: string }) {
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 bg-gray-400">
      {initials}
    </div>
  )
}

// ─── Actionable "needs attention" card ────────────────────────────────────────
function AttentionCard({
  icon: Icon, label, value, href, cta, accent, loading, progress,
}: {
  icon: React.ElementType; label: string; value: number; href: string
  cta: string; accent: 'red' | 'amber'; loading: boolean
  /** Folded-in context bar, e.g. share of providers already verified. */
  progress?: { pct: number; label: string }
}) {
  const active = value > 0
  const tone = accent === 'red'
    ? { ring: 'border-red-200 bg-red-50/60 hover:bg-red-50', icon: 'bg-red-100 text-red-500', num: 'text-red-600', cta: 'text-red-600' }
    : { ring: 'border-amber-200 bg-amber-50/60 hover:bg-amber-50', icon: 'bg-amber-100 text-amber-500', num: 'text-amber-600', cta: 'text-amber-600' }
  const calm = { ring: 'border-gray-100 bg-white hover:bg-gray-50', icon: 'bg-emerald-50 text-emerald-500', num: 'text-gray-800', cta: 'text-gray-400' }
  const s = active ? tone : calm
  return (
    <Link href={href} className={`group rounded-xl border ${s.ring} p-4 flex items-center gap-3.5 transition-colors`}>
      <div className={`w-11 h-11 rounded-xl ${s.icon} flex items-center justify-center shrink-0`}>
        {active ? <Icon className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-2xl font-bold leading-tight ${loading ? 'text-gray-300' : s.num}`}>{loading ? '-' : value}</p>
        <p className="text-xs text-gray-500 font-medium mt-0.5">{label}</p>
        {progress && !loading && (
          <>
            <div className="h-1.5 rounded-full bg-gray-200/70 mt-2 overflow-hidden">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, progress.pct))}%` }} />
            </div>
            <p className="text-[11px] text-gray-500 mt-1">{progress.label}</p>
          </>
        )}
      </div>
      <span className={`flex items-center gap-0.5 text-xs font-semibold shrink-0 ${s.cta}`}>
        <span className="hidden sm:inline">{active ? cta : 'All clear'}</span>
        <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
      </span>
    </Link>
  )
}

// ─── "Live now" strip ─────────────────────────────────────────────────────────
function LiveTile({ label, value, sub, loading, href }: {
  label: string; value: number | null; sub?: string; loading: boolean; href?: string
}) {
  const body = (
    <>
      <p className={`text-xl font-bold leading-tight tabular-nums ${loading ? 'text-gray-300' : 'text-gray-900'}`}>
        {loading ? '-' : value == null ? '-' : value.toLocaleString()}
      </p>
      <p className="text-[11px] text-gray-500 font-medium mt-0.5 truncate">{label}</p>
      {sub && <p className="text-[11px] text-gray-400 truncate">{sub}</p>}
    </>
  )
  const classes = 'min-w-0 px-4 py-2.5 border-l border-gray-100 first:border-l-0'
  return href ? <Link href={href} className={`${classes} hover:bg-gray-50 transition-colors`}>{body}</Link> : <div className={classes}>{body}</div>
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { can } = useRole()
  const { from, to, preset, control: dateControl } = useDateRange('today', { includeAll: false })
  const [overview, setOverview] = useState<OverviewReport | null>(null)
  const [revenueData, setRevenueData] = useState<RevenueDataPoint[]>([])
  const [outcomes, setOutcomes] = useState<BookingOutcomesReport | null>(null)
  const [outcomesUnavailable, setOutcomesUnavailable] = useState(false)
  const [activity, setActivity] = useState<ActivityItem[] | null>(null)
  const [emergencies, setEmergencies] = useState<EmergencyAlert[] | null>(null)
  const [liveCounts, setLiveCounts] = useState<OnlineProviderCounts | null>(null)
  const [liveUnavailable, setLiveUnavailable] = useState(false)
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<Date | null>(null)
  const [kycWaiting, setKycWaiting] = useState<number | null>(null)
  const [loadingKpis, setLoadingKpis] = useState(true)
  const [loadingOutcomes, setLoadingOutcomes] = useState(true)
  const [loadingActivity, setLoadingActivity] = useState(true)
  const [loadingEmergencies, setLoadingEmergencies] = useState(true)
  const [loadingLive, setLoadingLive] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoadingKpis(true)
    setOverview(null)
    setRevenueData([])
    Promise.allSettled([
      getOverviewReport({ from, to }),
      getRevenueReport({ groupBy: 'day', from, to }),
    ])
      .then(([ovResult, revResult]) => {
        if (cancelled) return
        if (ovResult.status === 'fulfilled') setOverview(ovResult.value)
        if (revResult.status === 'fulfilled') setRevenueData(revResult.value.periods ?? [])
      })
      .finally(() => { if (!cancelled) setLoadingKpis(false) })
    return () => { cancelled = true }
  }, [from, to])

  useEffect(() => {
    let cancelled = false
    setLoadingOutcomes(true)
    setOutcomes(null)
    setOutcomesUnavailable(false)
    getBookingOutcomesReport({ from, to, groupBy: 'day', vertical: 'all' })
      .then(data => { if (!cancelled) setOutcomes(data) })
      .catch(e => {
        if (cancelled) return
        setOutcomes(null)
        setOutcomesUnavailable(e instanceof ApiError && e.status === 404)
      })
      .finally(() => { if (!cancelled) setLoadingOutcomes(false) })
    return () => { cancelled = true }
  }, [from, to])

  useEffect(() => {
    let cancelled = false
    setLoadingActivity(true)
    setActivity(null)
    getRecentActivity({ limit: 10, from, to })
      .then(data => { if (!cancelled) setActivity(data) })
      .catch(() => { if (!cancelled) setActivity(null) })
      .finally(() => { if (!cancelled) setLoadingActivity(false) })
    return () => { cancelled = true }
  }, [from, to])

  useEffect(() => {
    let cancelled = false
    getClientKycQueue()
      .then(items => { if (!cancelled) setKycWaiting(items.length) })
      .catch(() => { if (!cancelled) setKycWaiting(null) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    getEmergencyAlerts()
      .then(setEmergencies)
      .catch(() => setEmergencies(null))
      .finally(() => setLoadingEmergencies(false))
  }, [])

  // Live workload: online providers (new endpoint; hidden until deployed) plus
  // the active ride/job counts the overview already carries.
  const loadLive = useCallback(() => {
    setLoadingLive(true)
    Promise.allSettled([getOnlineProviderCounts(), getOverviewReport()])
      .then(([countsResult, overviewResult]) => {
        if (countsResult.status === 'fulfilled') {
          setLiveCounts(countsResult.value)
          setLiveUnavailable(false)
        } else {
          setLiveCounts(null)
          setLiveUnavailable(true)
        }
        if (overviewResult.status === 'fulfilled') {
          setOverview(prev => prev
            ? { ...prev, activeRides: overviewResult.value.activeRides, activeJobs: overviewResult.value.activeJobs }
            : overviewResult.value)
        }
        setLiveUpdatedAt(new Date())
      })
      .finally(() => setLoadingLive(false))
  }, [])
  useEffect(() => { loadLive() }, [loadLive])
  useAutoRefresh(loadLive, 30_000)

  function handleAcknowledge(id: string) {
    acknowledgeEmergency(id).then(() => {
      setEmergencies(prev => prev
        ? prev.map(e => e.id === id ? { ...e, acknowledgedAt: new Date().toISOString() } : e)
        : prev
      )
    }).catch(() => {})
  }

  const rangeLabel = dateRangeLabel(preset)

  // Actionable items - surfaced first so admins see what needs doing. The
  // audit found the old card mislabelled this count (it is provider verifications)
  // (it is provider verifications); client ID checks get their own card.
  const totalProvidersForBar = (overview?.registeredDrivers ?? 0) + (overview?.registeredArtisans ?? 0)
  const verifiedProviders = Math.max(0, totalProvidersForBar - (overview?.pendingVerifications ?? 0))
  const attention = [
    {
      label: 'Provider verifications waiting', value: overview?.pendingVerifications ?? 0,
      href: '/verifications', icon: AlertTriangle, accent: 'amber' as const, cta: 'Review',
      progress: overview && totalProvidersForBar > 0
        ? { pct: (verifiedProviders / totalProvidersForBar) * 100, label: `${verifiedProviders.toLocaleString()} of ${totalProvidersForBar.toLocaleString()} providers verified` }
        : undefined,
    },
    ...(kycWaiting != null
      ? [{ label: 'Client ID checks waiting', value: kycWaiting, href: '/users/clients/kyc-queue', icon: IdCard, accent: 'amber' as const, cta: 'Review' }]
      : []),
    { label: 'Open disputes', value: overview?.openDisputes ?? 0, href: '/disputes', icon: Scale, accent: 'red' as const, cta: 'Resolve' },
  ]

  // Revenue for the selected range. Gross = platform commission on pre-promo
  // fares; Net = what MyShop kept after funding promos. Falls back to the
  // overview's commission figure when the revenue report is not readable.
  const grossRevenuePesewas = revenueData.length
    ? ghsToPesewas(sumGhs(revenueData, 'commissionGhs'))
    : ghsToPesewas(overview?.period?.commissionRevenueGhs)
  const promoPesewas = revenueData.length ? ghsToPesewas(sumGhs(revenueData, 'subsidyGhs')) : null
  const netRevenuePesewas = revenueData.length ? ghsToPesewas(sumGhs(revenueData, 'netCommissionAfterPromoGhs')) : null

  const primaryKpis = [
    { label: 'Ride requests', value: overview?.period ? overview.period.ridesCreated.toLocaleString() : '-', sub: overview ? `${overview.activeRides} active now` : undefined, icon: Navigation, href: '/rides' },
    { label: 'Job requests', value: overview?.period ? overview.period.jobsCreated.toLocaleString() : '-', sub: overview ? `${overview.activeJobs} active now` : undefined, icon: UserCheck, href: '/artisan-jobs' },
    { label: 'Commission earned', value: grossRevenuePesewas != null ? formatGhs(grossRevenuePesewas) : '-', sub: promoPesewas != null ? `Promo funded ${formatGhs(promoPesewas)}` : '20% of pre-promo fares', icon: TrendingUp, href: '/insights/revenue' },
    { label: 'Kept after promos', value: netRevenuePesewas != null ? formatGhs(netRevenuePesewas) : '-', sub: 'Commission minus promo money MyShop funded', icon: Receipt, href: '/insights/revenue' },
    { label: 'Payment success', value: overview?.period?.paymentSuccessRatePct != null ? overview.period.paymentSuccessRatePct + '%' : '-', sub: overview?.period ? `${overview.period.successfulPayments} of ${overview.period.totalPayments} - target ${PAYMENT_SUCCESS_TARGET_PCT}%` : rangeLabel, icon: CheckCircle2, href: '/payments/transactions' },
  ]

  const activeEmergencies = (emergencies ?? []).filter(alert =>
    alert.type === 'sos'
      ? !alert.acknowledgedAt
      : alert.welfareCheck?.status === 'escalated',
  )

  const growthData = revenueData.map(d => ({
    date: formatDayShort(d.period),
    'Money received': d.collectionsGhs,
    'Commission earned': d.commissionGhs,
  }))


  const outcomeRows = useMemo(() => {
    const t = outcomes?.totals
    const mk = (label: string, pickValue: (c: { requested: number; completed: number; cancelled: number; unassigned: number; active: number }) => number) => ({
      label,
      rides: t ? pickValue(t.byVertical.rides) : null,
      artisans: t ? pickValue(t.byVertical.artisans) : null,
      total: t ? pickValue(t) : null,
    })
    return [
      mk('Completed', c => c.completed),
      mk('Cancelled', c => c.cancelled),
      mk('Unassigned', c => c.unassigned),
      mk('Still active', c => c.active),
      mk('Total requested', c => c.requested),
    ]
  }, [outcomes])


  return (
    <div className="flex flex-col gap-6">

      {/* ── Top row: what needs doing, plus the reporting period ─────────── */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <SectionLabel>Needs attention</SectionLabel>
        <div className="flex items-start gap-2">
          <div>
            {dateControl}
            <p className="text-[11px] text-gray-400 mt-1 text-right">Calendar dates use GMT (Africa/Accra)</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => overview && exportOverviewCsv(overview, null)}
            disabled={!overview}
          >
            <Download className="h-3.5 w-3.5" /> Download CSV
          </Button>
        </div>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 -mt-2">
        {attention.map(a => (
          <AttentionCard
            key={a.label}
            icon={a.icon} label={a.label} value={a.value}
            href={a.href} cta={a.cta} accent={a.accent} loading={loadingKpis}
            progress={'progress' in a ? a.progress : undefined}
          />
        ))}
      </section>

      {/* ── Live now - real-time workload, independent of the date filter ── */}
      <section className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" /> LIVE NOW
            </span>
            {liveUnavailable && (
              <span className="text-[11px] text-gray-400">Online-provider counts not yet available from the server</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-gray-400">
            {liveUpdatedAt && <span>Updated {timeAgo(liveUpdatedAt.toISOString())}</span>}
            {AUTO_REFRESH_DISABLED && <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Auto-refresh off</span>}
            <button
              type="button"
              onClick={loadLive}
              disabled={loadingLive}
              aria-label="Refresh live counts"
              className="p-1 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingLive ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <LiveTile label="Drivers online" value={liveCounts?.driversOnline ?? null} sub={liveCounts ? `${liveCounts.driversOnBooking} on a ride` : undefined} loading={loadingLive && !liveCounts} href={can('view_live_map') ? '/online-providers' : undefined} />
          <LiveTile label="Artisans online" value={liveCounts?.artisansOnline ?? null} sub={liveCounts ? `${liveCounts.artisansOnBooking} on a job` : undefined} loading={loadingLive && !liveCounts} href={can('view_live_map') ? '/online-providers' : undefined} />
          <LiveTile label="Active rides" value={overview?.activeRides ?? null} loading={loadingKpis && !overview} href={can('view_live_map') ? '/live-map' : undefined} />
          <LiveTile label="Active jobs" value={overview?.activeJobs ?? null} loading={loadingKpis && !overview} href={can('view_live_map') ? '/live-map' : undefined} />
          <LiveTile label="Open disputes" value={overview?.openDisputes ?? null} loading={loadingKpis && !overview} href="/disputes" />
          <LiveTile label="Active emergencies" value={emergencies ? activeEmergencies.length : null} loading={loadingEmergencies} href="/emergency" />
        </div>
      </section>


      {/* ── Selected-period performance ──────────────────────────────────── */}
      <section className="space-y-2.5">
        <SectionLabel>{rangeLabel} at a glance</SectionLabel>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {primaryKpis.map(kpi => (
            <StatCard
              key={kpi.label}
              icon={kpi.icon} label={kpi.label} value={kpi.value} sub={kpi.sub}
              loading={loadingKpis} href={kpi.href}
            />
          ))}
        </div>
      </section>

      {/* ── Row 2: Booking outcomes + money chart ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Booking outcomes for the range */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Booking outcomes</h2>
              <p className="text-xs text-gray-400">Bookings requested - {rangeLabel}</p>
            </div>
            {can('view_reports') && (
              <Link href="/insights/trips" className="text-xs font-medium text-primary">By date</Link>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px]">
              <thead className="bg-gray-50 border-y border-gray-100">
                <tr>
                  <th className="px-5 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Outcome</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wide"><span className="inline-flex items-center gap-1"><Car className="h-3 w-3" /> Rides</span></th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wide"><span className="inline-flex items-center gap-1"><Wrench className="h-3 w-3" /> Artisans</span></th>
                  <th className="px-5 py-2 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loadingOutcomes ? (
                  outcomeRows.map(row => (
                    <tr key={row.label}>
                      <td className="px-5 py-2.5 text-sm text-gray-600">{row.label}</td>
                      {[0, 1, 2].map(i => <td key={i} className="px-3 py-2.5"><div className="h-3 bg-gray-100 rounded animate-pulse w-10 ml-auto" /></td>)}
                    </tr>
                  ))
                ) : !outcomes ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-sm text-gray-400">
                      {outcomesUnavailable ? 'Booking outcomes report not yet available' : 'Booking outcomes could not be loaded'}
                    </td>
                  </tr>
                ) : (
                  outcomeRows.map((row, i) => {
                    const isTotal = i === outcomeRows.length - 1
                    return (
                      <tr key={row.label} className={isTotal ? 'bg-gray-50 font-semibold' : ''}>
                        <td className="px-5 py-2.5 text-sm text-gray-700">{row.label}</td>
                        <td className="px-3 py-2.5 text-sm text-right tabular-nums text-gray-700">{row.rides?.toLocaleString() ?? '-'}</td>
                        <td className="px-3 py-2.5 text-sm text-right tabular-nums text-gray-700">{row.artisans?.toLocaleString() ?? '-'}</td>
                        <td className="px-5 py-2.5 text-sm text-right tabular-nums text-gray-900">{row.total?.toLocaleString() ?? '-'}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          {outcomes && (
            <p className="px-5 py-2 text-[11px] text-gray-400 mt-auto">
              Unassigned = no driver found or still searching (rides); no bids or awaiting admin (jobs).
            </p>
          )}
        </div>

        {/* Money received & commission earned */}
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Money received & commission earned</h2>
              <p className="text-xs text-gray-400">Daily totals - {rangeLabel}</p>
            </div>
            {can('view_payments') && (
              <Link href="/insights/revenue" className="text-xs font-medium text-primary">Revenue</Link>
            )}
          </div>
          {growthData.length === 0 && !loadingKpis ? (
            <div className="flex items-center justify-center h-[200px] text-sm text-gray-400">No revenue data for this range</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={growthData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} interval={growthData.length > 10 ? 2 : 0} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <Tooltip formatter={value => [`GHS ${Number(value).toFixed(2)}`, undefined]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="Money received" stroke="#C27D12" strokeWidth={2} dot={growthData.length === 1 ? { r: 3 } : false} />
                <Line type="monotone" dataKey="Commission earned" stroke="#2F6FAD" strokeWidth={2} dot={growthData.length === 1 ? { r: 3 } : false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Row 3: Activity + Safety Console + Compliance ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Recent Platform Activity */}
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Recent Platform Activity</h2>
              <p className="text-xs text-gray-400">Platform events - {rangeLabel}</p>
            </div>
            <Link href="/activity" className="text-xs font-medium" style={{ color: '#F5A623' }}>View Full Logs</Link>
          </div>

          <div className="overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead className="bg-gray-50 border-y border-gray-100">
              <tr>
                <th className="px-5 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Actor</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Description / Amount</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                <th className="px-5 py-2 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loadingActivity ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse shrink-0" />
                        <div className="space-y-1.5">
                          <div className="h-3 bg-gray-100 rounded animate-pulse w-24" />
                          <div className="h-2.5 bg-gray-100 rounded animate-pulse w-14" />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse w-40" /></td>
                    <td className="px-3 py-3"><div className="h-5 bg-gray-100 rounded-full animate-pulse w-16" /></td>
                    <td className="px-5 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse w-12 ml-auto" /></td>
                  </tr>
                ))
              ) : activity === null ? (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-sm text-gray-400">Activity feed not yet available</td>
                </tr>
              ) : activity.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-sm text-gray-400">No recent activity</td>
                </tr>
              ) : (
                activity.slice(0, 6).map(item => {
                  const { statusText, statusColor } = activityMeta(item)
                  const roleLabel = item.actorRole.charAt(0).toUpperCase() + item.actorRole.slice(1)
                  return (
                    <tr key={item.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar initials={actorInitials(item.actorName)} />
                          <div>
                            <p className="text-sm font-medium text-gray-800">
                              {item.actorName ?? roleLabel}
                            </p>
                            {item.actorName && (
                              <p className="text-xs text-gray-400">{roleLabel}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-sm text-gray-600 leading-snug">{item.description}</p>
                        {item.amountPesewas != null && (
                          <p className="text-xs font-semibold mt-0.5" style={{ color: '#F5A623' }}>
                            {formatGhs(item.amountPesewas)}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColor}`}>
                          {statusText}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-400 whitespace-nowrap text-right">
                        {timeAgo(item.occurredAt)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
          </div>
        </div>

        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Safety Console */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3.5">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Safety Console</h2>
                <p className="text-xs text-gray-400">Active emergencies</p>
              </div>
              <span className="flex items-center gap-1 text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" /> LIVE
              </span>
            </div>

            <div className="flex-1 divide-y divide-gray-50 overflow-y-auto">
              {loadingEmergencies ? (
                <>
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="px-4 py-3.5 flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-gray-100 animate-pulse shrink-0 mt-0.5" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 bg-gray-100 rounded animate-pulse w-36" />
                        <div className="h-2.5 bg-gray-100 rounded animate-pulse w-28" />
                      </div>
                    </div>
                  ))}
                </>
              ) : emergencies === null ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-gray-400">Safety feed not yet available</p>
                </div>
              ) : activeEmergencies.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  </div>
                  <p className="text-sm font-medium text-gray-700">All clear</p>
                  <p className="text-xs text-gray-400 mt-0.5">No active emergencies</p>
                </div>
              ) : (
                activeEmergencies
                  .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
                  .slice(0, 6)
                  .map(alert => {
                    const sos = alert.type === 'sos'
                    return (
                      <div
                        key={alert.id}
                        className={`px-4 py-2.5 flex items-center gap-3 ${sos ? 'bg-red-50/50' : ''}`}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${sos ? 'bg-red-100' : 'bg-amber-100'}`}>
                          {sos
                            ? <Phone className="h-4 w-4 text-red-500" />
                            : <Navigation className="h-4 w-4 text-amber-500" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">
                            {alert.actorName ?? 'Unknown'}
                          </p>
                          <p className="text-xs text-gray-400 truncate">
                            {sos ? 'SOS' : 'Welfare check'} - {timeAgo(alert.occurredAt)}
                          </p>
                        </div>
                        {sos ? (
                          <button
                            type="button"
                            onClick={() => handleAcknowledge(alert.id)}
                            className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors bg-red-500 text-white hover:bg-red-600"
                          >
                            Respond
                          </button>
                        ) : (
                          <Link
                            href="/emergency"
                            className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200"
                          >
                            Resolve
                          </Link>
                        )}
                      </div>
                    )
                  })
              )}
            </div>

            <div className="px-5 py-3">
              <Link href="/emergency" className="flex items-center gap-1 text-xs font-medium" style={{ color: '#F5A623' }}>
                View all Safety Logs <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

        </div>
      </div>

    </div>
  )
}
