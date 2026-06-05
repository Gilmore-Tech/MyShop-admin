'use client'

import { useState, useEffect } from 'react'
import { PageGuard } from '@/components/common/page-guard'
import { Download, FileText, Calendar, Loader2, TrendingUp, Users, Star, CheckCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/common/page-header'
import {
  getOverviewReport, getRevenueReport, getProviderReport, getPilotReport,
  type OverviewReport, type RevenueReport, type ProviderReport, type PilotMetric,
} from '@/lib/api'

function fmt(ghs: number) {
  return 'GHS ' + ghs.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function pct(n: number) { return n.toFixed(1) + '%' }

// ── Overview panel ────────────────────────────────────────────────────────────

function OverviewPanel({ data }: { data: OverviewReport }) {
  const totalUsers = data.registeredClients + data.registeredDrivers + data.registeredArtisans
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
    { label: 'Payment Success',       value: data.paymentSuccessRatePct + '%' },
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

function RevenuePanel({ data }: { data: RevenueReport }) {
  const totalCollections = data.periods.reduce((s, d) => s + d.collectionsGhs, 0)
  const totalCommission  = data.periods.reduce((s, d) => s + d.commissionGhs, 0)
  const totalPayouts     = data.periods.reduce((s, d) => s + d.payoutsGhs, 0)
  const totalPayments    = data.periods.reduce((s, d) => s + d.totalPayments, 0)
  return (
    <div className="space-y-3">
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
              {data.periods.slice(0, 14).map(row => (
                <tr key={row.period} className="border-b border-gray-50">
                  <td className="py-1.5 pr-4 text-gray-700">{row.period.slice(0, 10)}</td>
                  <td className="py-1.5 pr-4 text-right text-gray-900 font-medium">{fmt(row.collectionsGhs)}</td>
                  <td className="py-1.5 pr-4 text-right text-gray-600">{fmt(row.commissionGhs)}</td>
                  <td className="py-1.5 text-right text-gray-600">{row.totalPayments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Provider panel ────────────────────────────────────────────────────────────

function ProviderPanel({ data }: { data: ProviderReport }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Drivers</p>
        <div className="space-y-2">
          {data.drivers.slice(0, 5).map(d => (
            <div key={d.driverId} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{d.name}</p>
                <p className="text-xs text-gray-500">{d.cancellationCount30d} cancellations (30d) · {d.verificationStatus}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-semibold text-gray-800">{fmt(d.totalEarningsGhs)}</p>
                <p className="text-xs text-amber-500">★ {d.avgRating != null ? d.avgRating.toFixed(1) : '—'}</p>
              </div>
            </div>
          ))}
          {data.drivers.length === 0 && <p className="text-xs text-gray-400 py-4 text-center">No driver data</p>}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Artisans</p>
        <div className="space-y-2">
          {data.artisans.slice(0, 5).map(a => (
            <div key={a.artisanId} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{a.name}</p>
                <p className="text-xs text-gray-500">
                  {a.completedJobsCount} jobs · {a.supplementRatePct != null ? pct(a.supplementRatePct) : '—'} suppl. rate
                  {a.flagged && <span className="ml-1 text-red-500 font-semibold">· Flagged</span>}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-amber-500">★ {a.avgRating != null ? a.avgRating.toFixed(1) : '—'}</p>
              </div>
            </div>
          ))}
          {data.artisans.length === 0 && <p className="text-xs text-gray-400 py-4 text-center">No artisan data</p>}
        </div>
      </div>
    </div>
  )
}

// ── Pilot panel ───────────────────────────────────────────────────────────────

function PilotPanel({ metrics }: { metrics: PilotMetric[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {metrics.map(m => {
        const progress = Math.min((m.actual / m.target) * 100, 100)
        const met = m.actual >= m.target
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

type ReportTab = 'overview' | 'revenue' | 'providers' | 'pilot'

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>('overview')
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day')

  const [overview,   setOverview]   = useState<OverviewReport | null>(null)
  const [revenue,    setRevenue]    = useState<RevenueReport | null>(null)
  const [providers,  setProviders]  = useState<ProviderReport | null>(null)
  const [pilot,      setPilot]      = useState<PilotMetric[] | null>(null)

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)

    let p: Promise<void>
    if (tab === 'overview')   p = getOverviewReport().then(setOverview).catch(e => { setError(e.message) })
    else if (tab === 'revenue') p = getRevenueReport({ groupBy }).then(setRevenue).catch(e => { setError(e.message) })
    else if (tab === 'providers') p = getProviderReport().then(setProviders).catch(e => { setError(e.message) })
    else p = getPilotReport().then(setPilot).catch(e => { setError(e.message) })

    p.finally(() => setLoading(false))
  }, [tab, groupBy])

  const tabs: { id: ReportTab; label: string; icon: React.ElementType }[] = [
    { id: 'overview',   label: 'Overview KPIs',        icon: TrendingUp },
    { id: 'revenue',    label: 'Revenue',              icon: Download },
    { id: 'providers',  label: 'Provider Performance', icon: Users },
    { id: 'pilot',      label: 'Pilot Targets',        icon: Star },
  ]

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
            <CardTitle className="text-base">{tabs.find(t => t.id === tab)?.label}</CardTitle>
            {tab === 'pilot' && (
              <CardDescription className="text-xs">
                10 PRD §1.3 pilot success targets — Ashanti Region open beta
              </CardDescription>
            )}
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
            {!loading && !error && tab === 'overview'  && overview   && <OverviewPanel  data={overview} />}
            {!loading && !error && tab === 'revenue'   && revenue    && <RevenuePanel   data={revenue} />}
            {!loading && !error && tab === 'providers' && providers  && <ProviderPanel  data={providers} />}
            {!loading && !error && tab === 'pilot'     && pilot      && <PilotPanel     metrics={pilot} />}
          </CardContent>
        </Card>
      </div>
    </PageGuard>
  )
}
