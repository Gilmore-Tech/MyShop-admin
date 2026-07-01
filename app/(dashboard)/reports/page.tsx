'use client'

import { useState, useEffect } from 'react'
import { PageGuard } from '@/components/common/page-guard'
import { useRole } from '@/hooks/use-role'
import type { Permission, CategoryScope } from '@/lib/roles'
import { Download, FileText, Calendar, Loader2, TrendingUp, Car, Wrench, Star, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/common/page-header'
import {
  getOverviewReport, getRevenueReport, getProviderReport, getPilotReport, listUsers,
  type OverviewReport, type RevenueReport, type RevenueDataPoint, type ProviderReport, type PilotMetric,
} from '@/lib/api'
import {
  exportOverviewCsv, exportRevenueCsv, exportRidesCsv, exportArtisansCsv, exportPilotCsv,
} from '@/lib/report-export'
import { formatDate } from '@/lib/format-date'

// Shared pagination control.
function Pager({ page, pageSize, total, onPage }: {
  page: number; pageSize: number; total: number; onPage: (p: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null
  const start = (page - 1) * pageSize
  return (
    <div className="flex items-center justify-between mt-3">
      <p className="text-xs text-gray-400">
        Showing {start + 1}-{Math.min(start + pageSize, total)} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </Button>
        <span className="text-xs text-gray-500 tabular-nums px-1">Page {page} of {totalPages}</span>
        <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Next <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

function fmt(ghs: number) {
  return 'GHS ' + ghs.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function pct(n: number) { return n.toFixed(1) + '%' }

// ── Overview panel ────────────────────────────────────────────────────────────

function OverviewPanel({ data, userTotal }: { data: OverviewReport; userTotal: number | null }) {
  // Distinct accounts from /admin/users — summing role counts double-counts
  // users who hold more than one role (e.g. a client who is also a driver).
  const roleSum = data.registeredClients + data.registeredDrivers + data.registeredArtisans
  const totalUsers = userTotal ?? roleSum
  const stats = [
    { label: 'Total Users',           value: totalUsers.toLocaleString() },
    { label: 'Registered Clients',    value: data.registeredClients.toLocaleString() },
    { label: 'Registered Drivers',    value: data.registeredDrivers.toLocaleString() },
    { label: 'Registered Artisans',   value: data.registeredArtisans.toLocaleString() },
    { label: 'Active Rides',          value: data.activeRides.toLocaleString() },
    { label: 'Active Jobs',           value: data.activeJobs.toLocaleString() },
    { label: 'Pending Verifications', value: data.pendingVerifications.toLocaleString() },
    { label: 'Open Disputes',         value: data.openDisputes.toLocaleString() },
    { label: 'Commission (month)',    value: fmt(data.commissionRevenue.monthGhs) },
    { label: 'Commission (week)',     value: fmt(data.commissionRevenue.weekGhs) },
    { label: 'Commission (today)',    value: fmt(data.commissionRevenue.todayGhs) },
    { label: 'Payment Success',       value: data.paymentSuccessRatePct != null ? data.paymentSuccessRatePct + '%' : '-' },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {stats.map(s => (
        <div key={s.label} className="bg-gray-50 rounded-lg px-4 py-3">
          <p className="text-xs text-gray-500 mb-0.5">{s.label}</p>
          <p className="text-sm font-semibold text-gray-900">{s.value}</p>
        </div>
      ))}
    </div>
  )
}

// ── Revenue panel ─────────────────────────────────────────────────────────────

const REVENUE_PAGE_SIZE = 12

function RevenuePanel({ data, lockedCategory }: { data: RevenueReport; lockedCategory: CategoryScope | null }) {
  // Revenue by category: coordinators are locked to their vertical; RM/global
  // can toggle All / Rides / Artisan.
  const [view, setView] = useState<'all' | 'rides' | 'artisan'>(lockedCategory ?? 'all')
  const effective = lockedCategory ?? view
  const pick = (d: RevenueDataPoint) => {
    if (effective === 'all' || !d.byVertical)
      return { collectionsGhs: d.collectionsGhs, commissionGhs: d.commissionGhs, payoutsGhs: d.payoutsGhs, totalPayments: d.totalPayments }
    return effective === 'rides' ? d.byVertical.rides : d.byVertical.artisans
  }

  const totalCollections = data.periods.reduce((s, d) => s + pick(d).collectionsGhs, 0)
  const totalCommission  = data.periods.reduce((s, d) => s + pick(d).commissionGhs, 0)
  const totalPayouts     = data.periods.reduce((s, d) => s + pick(d).payoutsGhs, 0)
  const totalPayments    = data.periods.reduce((s, d) => s + pick(d).totalPayments, 0)

  // Most recent first, paginated.
  const rows = [...data.periods].sort((a, b) => b.period.localeCompare(a.period))
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(rows.length / REVENUE_PAGE_SIZE))
  const current = Math.min(page, totalPages)
  const start = (current - 1) * REVENUE_PAGE_SIZE
  const pageRows = rows.slice(start, start + REVENUE_PAGE_SIZE)
  return (
    <div className="space-y-3">
      {!lockedCategory && (
        <div className="flex items-center gap-1.5">
          {(['all', 'rides', 'artisan'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                view === v ? 'bg-orange-50 text-orange-600 border-orange-200 font-medium' : 'text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {v === 'all' ? 'All' : v === 'rides' ? 'Rides' : 'Artisan'}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Collections', value: fmt(totalCollections) },
          { label: 'Commission',        value: fmt(totalCommission) },
          { label: 'Total Payouts',     value: fmt(totalPayouts) },
          { label: 'Total Payments',    value: totalPayments.toLocaleString() },
        ].map(s => (
          <div key={s.label} className="bg-gray-50 rounded-lg px-4 py-3">
            <p className="text-xs text-gray-500 mb-0.5">{s.label}</p>
            <p className="text-sm font-semibold text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>
      {data.periods.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 pr-4 text-gray-500 font-medium">Period</th>
                <th className="text-right py-2 pr-4 text-gray-500 font-medium">Collections</th>
                <th className="text-right py-2 pr-4 text-gray-500 font-medium">Commission</th>
                <th className="text-right py-2 text-gray-500 font-medium">Payments</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(row => {
                const v = pick(row)
                return (
                <tr key={row.period} className="border-b border-gray-50">
                  <td className="py-1.5 pr-4 text-gray-700">{formatDate(row.period)}</td>
                  <td className="py-1.5 pr-4 text-right text-gray-900 font-medium">{fmt(v.collectionsGhs)}</td>
                  <td className="py-1.5 pr-4 text-right text-gray-600">{fmt(v.commissionGhs)}</td>
                  <td className="py-1.5 text-right text-gray-600">{v.totalPayments}</td>
                </tr>
                )
              })}
            </tbody>
          </table>
          <Pager page={current} pageSize={REVENUE_PAGE_SIZE} total={rows.length} onPage={setPage} />
        </div>
      )}
    </div>
  )
}

// ── Vertical KPI strip ────────────────────────────────────────────────────────

// Small per-vertical stat strip shown atop the Rides / Artisans tabs. The wider
// cross-platform KPIs (commission, disputes, payment success) live on Overview.
function VerticalStats({ stats }: { stats: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
      {stats.map(s => (
        <div key={s.label} className="bg-gray-50 rounded-lg px-4 py-3">
          <p className="text-xs text-gray-500 mb-0.5">{s.label}</p>
          <p className="text-sm font-semibold text-gray-900">{s.value}</p>
        </div>
      ))}
    </div>
  )
}

// ── Rides (drivers) panel ─────────────────────────────────────────────────────

const PROVIDER_PAGE_SIZE = 8

function RidesPanel({ data, overview }: { data: ProviderReport; overview: OverviewReport | null }) {
  // Sort by performance: highest earners first.
  const drivers = [...data.drivers].sort((a, b) => b.totalEarningsGhs - a.totalEarningsGhs)
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(drivers.length / PROVIDER_PAGE_SIZE))
  const start = (Math.min(page, totalPages) - 1) * PROVIDER_PAGE_SIZE
  const rows = drivers.slice(start, start + PROVIDER_PAGE_SIZE)

  return (
    <div>
      {overview && (
        <VerticalStats stats={[
          { label: 'Registered Drivers', value: overview.registeredDrivers.toLocaleString() },
          { label: 'Active Rides',       value: overview.activeRides.toLocaleString() },
          { label: 'Drivers Listed',     value: drivers.length.toLocaleString() },
          { label: 'Commission (month)', value: fmt(overview.commissionRevenue.monthGhs) },
        ]} />
      )}
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Driver Performance</p>
      <div className="space-y-2">
        {rows.map(d => (
          <div key={d.driverId} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{d.name}</p>
              <p className="text-xs text-gray-500">{d.cancellationCount30d} cancellations (30d) - {d.verificationStatus}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-semibold text-gray-800">{fmt(d.totalEarningsGhs)}</p>
              <p className="text-xs text-amber-500">
                {d.ratingCount > 0 && d.avgRating != null ? `★ ${d.avgRating.toFixed(1)}` : <span className="text-gray-300">No ratings</span>}
              </p>
            </div>
          </div>
        ))}
        {drivers.length === 0 && <p className="text-xs text-gray-400 py-4 text-center">No driver data</p>}
      </div>
      <Pager page={Math.min(page, totalPages)} pageSize={PROVIDER_PAGE_SIZE} total={drivers.length} onPage={setPage} />
    </div>
  )
}

// ── Artisan services (artisans) panel ─────────────────────────────────────────

function ArtisansPanel({ data, overview }: { data: ProviderReport; overview: OverviewReport | null }) {
  // Sort by performance: most completed jobs first.
  const artisans = [...data.artisans].sort((a, b) => b.completedJobsCount - a.completedJobsCount)
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(artisans.length / PROVIDER_PAGE_SIZE))
  const start = (Math.min(page, totalPages) - 1) * PROVIDER_PAGE_SIZE
  const rows = artisans.slice(start, start + PROVIDER_PAGE_SIZE)
  const flaggedCount = artisans.filter(a => a.flagged).length

  return (
    <div>
      {overview && (
        <VerticalStats stats={[
          { label: 'Registered Artisans', value: overview.registeredArtisans.toLocaleString() },
          { label: 'Active Jobs',         value: overview.activeJobs.toLocaleString() },
          { label: 'Artisans Listed',     value: artisans.length.toLocaleString() },
          { label: 'Flagged',             value: flaggedCount.toLocaleString() },
        ]} />
      )}
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Artisan Performance</p>
      <div className="space-y-2">
        {rows.map(a => (
          <div key={a.artisanId} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{a.name}</p>
              <p className="text-xs text-gray-500">
                {a.completedJobsCount} jobs - {a.supplementRatePct != null ? pct(a.supplementRatePct) : '-'} suppl. rate
                {a.flagged && <span className="ml-1 text-red-500 font-semibold">- Flagged</span>}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-amber-500">
                {a.ratingCount > 0 && a.avgRating != null ? `★ ${a.avgRating.toFixed(1)}` : <span className="text-gray-300">No ratings</span>}
              </p>
            </div>
          </div>
        ))}
        {artisans.length === 0 && <p className="text-xs text-gray-400 py-4 text-center">No artisan data</p>}
      </div>
      <Pager page={Math.min(page, totalPages)} pageSize={PROVIDER_PAGE_SIZE} total={artisans.length} onPage={setPage} />
    </div>
  )
}

// ── Pilot panel ───────────────────────────────────────────────────────────────

function PilotPanel({ metrics }: { metrics: PilotMetric[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {metrics.map(m => {
        const progress = m.target > 0 ? Math.min((m.actual / m.target) * 100, 100) : 0
        const met = m.target > 0 && m.actual >= m.target
        return (
          <div key={m.key} className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-xs text-gray-600 leading-tight">{m.label}</p>
              {met && <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />}
            </div>
            <div className="flex items-baseline gap-1 mb-1.5">
              <span className={`text-base font-bold ${met ? 'text-emerald-600' : 'text-gray-900'}`}>
                {m.actual.toLocaleString()}{m.unit}
              </span>
              <span className="text-xs text-gray-400">/ {m.target.toLocaleString()}{m.unit}</span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${met ? 'bg-emerald-500' : 'bg-orange-400'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1 text-right">{progress.toFixed(0)}% of target</p>
          </div>
        )
      })}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type ReportTab = 'overview' | 'rides' | 'artisans' | 'revenue' | 'pilot'

export default function ReportsPage() {
  const { can, category } = useRole()
  const [tab, setTab] = useState<ReportTab>('overview')
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day')

  const [overview,   setOverview]   = useState<OverviewReport | null>(null)
  const [userTotal,  setUserTotal]  = useState<number | null>(null)
  const [revenue,    setRevenue]    = useState<RevenueReport | null>(null)
  const [providers,  setProviders]  = useState<ProviderReport | null>(null)
  const [pilot,      setPilot]      = useState<PilotMetric[] | null>(null)

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)

    let p: Promise<void>
    if (tab === 'overview')   p = Promise.all([getOverviewReport(), listUsers({ limit: 1 })])
      .then(([ov, u]) => { setOverview(ov); setUserTotal(u.total) })
      .catch(e => { setError(e.message) })
    // Rides & Artisans share the provider report; each also shows a vertical KPI
    // strip sourced from the overview report.
    else if (tab === 'rides' || tab === 'artisans') p = Promise.all([getProviderReport(), getOverviewReport()])
      .then(([pr, ov]) => { setProviders(pr); setOverview(ov) })
      .catch(e => { setError(e.message) })
    else if (tab === 'revenue') p = getRevenueReport({ groupBy }).then(setRevenue).catch(e => { setError(e.message) })
    else p = getPilotReport().then(setPilot).catch(e => { setError(e.message) })

    p.finally(() => setLoading(false))
  }, [tab, groupBy])

  // Export the active tab's report as CSV. Data is already loaded client-side,
  // so this is instant. `canExport` gates the button until the data is present.
  const canExport =
    (tab === 'overview' && !!overview) ||
    (tab === 'rides'    && !!providers) ||
    (tab === 'artisans' && !!providers) ||
    (tab === 'revenue'  && !!revenue) ||
    (tab === 'pilot'    && !!pilot)

  function handleExport() {
    if (tab === 'overview' && overview)  exportOverviewCsv(overview, userTotal)
    else if (tab === 'rides'    && providers) exportRidesCsv(providers)
    else if (tab === 'artisans' && providers) exportArtisansCsv(providers)
    else if (tab === 'revenue'  && revenue)   exportRevenueCsv(revenue)
    else if (tab === 'pilot'    && pilot)     exportPilotCsv(pilot)
  }

  // Each report type is gated by its own permission. `view_reports` covers page
  // access + the overview tab (it's required to reach this page at all); the
  // other verticals are opt-in grants. Only tabs the admin holds are shown.
  const allTabs: { id: ReportTab; label: string; icon: React.ElementType; permission: Permission }[] = [
    { id: 'overview',   label: 'Overview KPIs',    icon: TrendingUp, permission: 'view_reports' },
    { id: 'rides',      label: 'Rides',            icon: Car,        permission: 'view_rides_report' },
    { id: 'artisans',   label: 'Artisan Services', icon: Wrench,     permission: 'view_artisans_report' },
    { id: 'revenue',    label: 'Revenue',          icon: Download,   permission: 'view_revenue_report' },
    { id: 'pilot',      label: 'Pilot Targets',    icon: Star,       permission: 'view_pilot_report' },
  ]
  // A category-scoped coordinator sees their vertical's report + Revenue (locked
  // to their category) + Pilot; the cross-platform Overview and the other
  // vertical are hidden. RM/global see everything and can filter.
  const tabs = allTabs.filter(t => {
    if (!can(t.permission)) return false
    if (!category) return true
    if (t.id === 'overview') return false
    if (t.id === 'rides') return category === 'rides'
    if (t.id === 'artisans') return category === 'artisan'
    return true
  })
  // Keep the active tab valid when filtered out (coordinator default).
  useEffect(() => {
    if (tabs.length && !tabs.some(t => t.id === tab)) setTab(tabs[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category])

  return (
    <PageGuard permission="view_reports">
      <div>
        <PageHeader
          title="Reports & Exports"
          subtitle="Platform analytics and pilot target metrics"
        />

        {/* Tab switcher */}
        <div className="flex items-center gap-1 mb-5 bg-white rounded-xl shadow-sm p-1.5 w-fit">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                tab === t.id ? 'bg-orange-50 text-orange-500 font-medium' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Revenue group-by control */}
        {tab === 'revenue' && (
          <div className="flex items-center gap-3 mb-4 bg-white rounded-xl shadow-sm p-3 w-fit">
            <Calendar className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Group by:</span>
            <Select value={groupBy} onValueChange={v => setGroupBy(v as typeof groupBy)}>
              <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Day</SelectItem>
                <SelectItem value="week">Week</SelectItem>
                <SelectItem value="month">Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">{tabs.find(t => t.id === tab)?.label}</CardTitle>
                {tab === 'pilot' && (
                  <CardDescription className="text-xs">
                    10 PRD §1.3 pilot success targets - Ashanti Region open beta
                  </CardDescription>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs shrink-0"
                disabled={!canExport}
                onClick={handleExport}
              >
                <Download className="h-3.5 w-3.5" /> Download CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            )}
            {!loading && error && (
              <div className="flex items-center gap-2 text-red-500 text-sm py-4">
                <FileText className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            {!loading && !error && tab === 'overview' && overview  && <OverviewPanel data={overview} userTotal={userTotal} />}
            {!loading && !error && tab === 'rides'    && providers && <RidesPanel    data={providers} overview={overview} />}
            {!loading && !error && tab === 'artisans' && providers && <ArtisansPanel data={providers} overview={overview} />}
            {!loading && !error && tab === 'revenue'  && revenue   && <RevenuePanel  data={revenue} lockedCategory={category} />}
            {!loading && !error && tab === 'pilot'    && pilot     && <PilotPanel    metrics={pilot} />}
          </CardContent>
        </Card>
      </div>
    </PageGuard>
  )
}
