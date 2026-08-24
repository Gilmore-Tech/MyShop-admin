'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Download, Receipt, TrendingUp, Ticket, Car, Wrench } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { PageGuard } from '@/components/common/page-guard'
import { PageHeader } from '@/components/common/page-header'
import { StatCard } from '@/components/common/stat-card'
import { PeriodControls, usePeriod } from '@/components/common/period-controls'
import { ReportTable, type ReportColumn } from '@/components/common/report-table'
import { EmptyState } from '@/components/common/empty-state'
import { VerticalTabs, type Vertical } from '@/components/common/vertical-tabs'
import { Button } from '@/components/ui/button'
import { getRevenueReport, type RevenueDataPoint, type RevenueReport } from '@/lib/api'
import { ApiError, userSafeAdminError } from '@/lib/api-client'
import { formatGhs, ghsToPesewas } from '@/lib/money'
import { formatDate, formatPeriodLabel } from '@/lib/format-date'
import { dateRangeLabel } from '@/lib/date-range'
import { exportTableCsv } from '@/lib/report-export'
import { REVENUE_SERIES, CHART_GRID, CHART_AXIS_TEXT, CHART_TOOLTIP_STYLE } from '@/lib/chart-palette'

/** One table row: a period (or a vertical sub-row) with the revenue figures in pesewas. */
interface RevenueRow {
  key: string
  period: string
  bookings: number
  faresPesewas: number
  grossPesewas: number
  promoPesewas: number
  reliefPesewas: number
  netPesewas: number
  hasVerticalSplit: boolean
  rides: RevenueRow | null
  artisans: RevenueRow | null
}

function pesewas(ghs: number): number {
  return ghsToPesewas(ghs) ?? 0
}

function rowFromPoint(point: RevenueDataPoint, vertical: Vertical): RevenueRow {
  const split = point.byVertical
  const sub = (name: 'rides' | 'artisans'): RevenueRow | null => {
    const v = split?.[name]
    if (!v) return null
    return {
      key: `${point.period}:${name}`,
      period: point.period,
      bookings: v.totalPayments,
      faresPesewas: pesewas(v.collectionsGhs),
      grossPesewas: pesewas(v.commissionGhs),
      promoPesewas: pesewas(v.subsidyGhs),
      reliefPesewas: pesewas(v.commissionReliefGhs),
      netPesewas: pesewas(v.netCommissionAfterPromoGhs),
      hasVerticalSplit: false,
      rides: null,
      artisans: null,
    }
  }
  const rides = sub('rides')
  const artisans = sub('artisans')
  if (vertical !== 'all') {
    const chosen = vertical === 'rides' ? rides : artisans
    if (chosen) return { ...chosen, key: point.period, hasVerticalSplit: false }
    // Backend without a per-vertical split: keep the period visible with dashes.
    return {
      key: point.period, period: point.period, bookings: 0, faresPesewas: 0, grossPesewas: 0,
      promoPesewas: 0, reliefPesewas: 0, netPesewas: 0, hasVerticalSplit: false, rides: null, artisans: null,
    }
  }
  return {
    key: point.period,
    period: point.period,
    bookings: point.totalPayments,
    faresPesewas: pesewas(point.collectionsGhs),
    grossPesewas: pesewas(point.commissionGhs),
    promoPesewas: pesewas(point.subsidyGhs),
    reliefPesewas: pesewas(point.commissionReliefGhs),
    netPesewas: pesewas(point.netCommissionAfterPromoGhs),
    hasVerticalSplit: Boolean(rides && artisans),
    rides,
    artisans,
  }
}

function marginPct(net: number, gross: number): string {
  if (gross <= 0) return '-'
  return `${Math.round((net / gross) * 1000) / 10}%`
}

export default function RevenueByDatePage() {
  const period = usePeriod('this_month', 'day')
  const [vertical, setVertical] = useState<Vertical>('all')
  const [report, setReport] = useState<RevenueReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [unavailable, setUnavailable] = useState(false)
  const requestSequence = useRef(0)
  const { from, to, groupBy } = period

  const load = useCallback(async () => {
    const request = ++requestSequence.current
    setLoading(true)
    setError('')
    setUnavailable(false)
    try {
      const next = await getRevenueReport({ from, to, groupBy })
      if (request === requestSequence.current) setReport(next)
    } catch (err) {
      if (request !== requestSequence.current) return
      setReport(null)
      if (err instanceof ApiError && err.status === 404) setUnavailable(true)
      else setError(userSafeAdminError(err, 'Failed to load revenue by date.'))
    } finally {
      if (request === requestSequence.current) setLoading(false)
    }
  }, [from, to, groupBy])

  useEffect(() => { load() }, [load])

  const rows = useMemo(() => {
    const points = report?.periods ?? []
    return [...points]
      .sort((a, b) => b.period.localeCompare(a.period))
      .map(p => rowFromPoint(p, vertical))
  }, [report, vertical])

  const splitMissing = vertical !== 'all' && rows.length > 0 && !(report?.periods ?? []).some(p => p.byVertical)

  const totals = useMemo(() => rows.reduce(
    (acc, r) => ({
      bookings: acc.bookings + r.bookings,
      faresPesewas: acc.faresPesewas + r.faresPesewas,
      grossPesewas: acc.grossPesewas + r.grossPesewas,
      promoPesewas: acc.promoPesewas + r.promoPesewas,
      reliefPesewas: acc.reliefPesewas + r.reliefPesewas,
      netPesewas: acc.netPesewas + r.netPesewas,
    }),
    { bookings: 0, faresPesewas: 0, grossPesewas: 0, promoPesewas: 0, reliefPesewas: 0, netPesewas: 0 },
  ), [rows])

  const chartData = useMemo(() => [...rows].reverse().map(r => ({
    period: r.period,
    label: formatPeriodLabel(r.period, groupBy),
    'Net revenue': r.netPesewas / 100,
    'Promo funded': r.promoPesewas / 100,
    'Commission relief': r.reliefPesewas / 100,
  })), [rows, groupBy])

  const periodLabel = (iso: string) => (groupBy === 'day' ? formatDate(iso) : formatPeriodLabel(iso, groupBy))

  const columns: ReportColumn<RevenueRow>[] = [
    { key: 'period', header: 'Period', render: r => <span className="font-medium text-gray-800">{periodLabel(r.period)}</span>, footer: 'Total' },
    { key: 'bookings', header: 'Bookings', align: 'right', render: r => r.bookings.toLocaleString(), footer: totals.bookings.toLocaleString() },
    { key: 'fares', header: 'Fares collected', align: 'right', responsiveClassName: 'hidden md:table-cell', render: r => formatGhs(r.faresPesewas), footer: formatGhs(totals.faresPesewas) },
    { key: 'gross', header: 'Gross revenue', align: 'right', render: r => <span className="font-medium">{formatGhs(r.grossPesewas)}</span>, footer: formatGhs(totals.grossPesewas) },
    { key: 'promo', header: 'Promo funded', align: 'right', render: r => formatGhs(r.promoPesewas), footer: formatGhs(totals.promoPesewas) },
    { key: 'relief', header: 'Commission relief', align: 'right', responsiveClassName: 'hidden lg:table-cell', render: r => formatGhs(r.reliefPesewas), footer: formatGhs(totals.reliefPesewas) },
    { key: 'net', header: 'Net revenue', align: 'right', render: r => <span className={`font-semibold ${r.netPesewas < 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatGhs(r.netPesewas)}</span>, footer: formatGhs(totals.netPesewas) },
    { key: 'margin', header: 'Net margin', align: 'right', responsiveClassName: 'hidden md:table-cell', render: r => marginPct(r.netPesewas, r.grossPesewas), footer: marginPct(totals.netPesewas, totals.grossPesewas) },
  ]

  function exportCsv() {
    exportTableCsv(
      `revenue-by-date-${groupBy}-${vertical}`,
      ['Period', 'Vertical', 'Bookings', 'Fares collected (GHS)', 'Gross revenue (GHS)', 'Promo funded (GHS)', 'Commission relief (GHS)', 'Net revenue (GHS)'],
      rows.flatMap(r => {
        const line = (row: RevenueRow, label: string) => [
          row.period, label, row.bookings, row.faresPesewas / 100, row.grossPesewas / 100, row.promoPesewas / 100, row.reliefPesewas / 100, row.netPesewas / 100,
        ]
        return [
          line(r, vertical === 'all' ? 'All' : vertical === 'rides' ? 'Rides' : 'Artisan Services'),
          ...(r.rides ? [line(r.rides, 'Rides')] : []),
          ...(r.artisans ? [line(r.artisans, 'Artisan Services')] : []),
        ]
      }),
    )
  }

  const caption = report
    ? `${dateRangeLabel(period.preset)} - ${rows.length} period${rows.length === 1 ? '' : 's'} - grouped by ${groupBy}`
    : dateRangeLabel(period.preset)

  return (
    <PageGuard permission="view_revenue_report">
      <div>
        <PageHeader
          title="Revenue by Date"
          subtitle="Gross revenue is platform commission on pre-promo fares; Net is what MyShop kept after funding promos"
          actions={
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv} disabled={rows.length === 0}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          }
        />

        <PeriodControls
          period={period}
          onRefresh={load}
          loading={loading}
          caption={caption}
          extra={<VerticalTabs value={vertical} onChange={setVertical} />}
        />

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">Couldn&apos;t load revenue</p>
              <p className="text-xs mt-0.5">{error}</p>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={load}>Retry</Button>
          </div>
        )}

        {splitMissing && (
          <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-4 py-2.5">
            The server has not split revenue by vertical for these dates yet, so the {vertical === 'rides' ? 'Rides' : 'Artisan Services'} view shows zeros. Switch to All for the combined figures.
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <StatCard icon={TrendingUp} label="Gross revenue" value={formatGhs(totals.grossPesewas)} sub="Commission on pre-promo fares" loading={loading} />
          <StatCard icon={Ticket} label="Promo funded" value={formatGhs(totals.promoPesewas)} sub="Promo + loyalty paid by MyShop" loading={loading} />
          <StatCard icon={Receipt} label="Net revenue" value={formatGhs(totals.netPesewas)} sub="Gross - promo - relief" tone={totals.netPesewas < 0 ? 'negative' : 'neutral'} loading={loading} />
          <StatCard icon={Car} label="Bookings" value={totals.bookings.toLocaleString()} sub="Paid bookings in range" loading={loading} compact />
          <StatCard icon={Wrench} label="Fares collected" value={formatGhs(totals.faresPesewas)} sub="Money received from clients" loading={loading} compact />
        </div>

        <ReportTable<RevenueRow>
          columns={columns}
          rows={rows}
          rowKey={r => r.key}
          loading={loading}
          showFooter
          minWidth={760}
          empty={unavailable
            ? <EmptyState variant="unavailable" title="Revenue by date is not available yet" description="The server has not been updated with promo figures for this report. The page will populate automatically once it is deployed." />
            : <EmptyState title="No revenue in this period" description="Try a wider date range." />}
          renderExpanded={vertical === 'all'
            ? (row) => row.hasVerticalSplit && row.rides && row.artisans ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {[{ label: 'Rides', icon: Car, data: row.rides }, { label: 'Artisan Services', icon: Wrench, data: row.artisans }].map(v => (
                  <div key={v.label} className="rounded-lg bg-white border border-gray-100 px-3 py-2">
                    <p className="flex items-center gap-1.5 font-semibold text-gray-700 mb-1.5"><v.icon className="h-3.5 w-3.5 text-gray-400" /> {v.label}</p>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-600">
                      <dt>Bookings</dt><dd className="text-right tabular-nums">{v.data.bookings.toLocaleString()}</dd>
                      <dt>Gross revenue</dt><dd className="text-right tabular-nums">{formatGhs(v.data.grossPesewas)}</dd>
                      <dt>Promo funded</dt><dd className="text-right tabular-nums">{formatGhs(v.data.promoPesewas)}</dd>
                      <dt>Net revenue</dt><dd className="text-right tabular-nums font-semibold text-gray-900">{formatGhs(v.data.netPesewas)}</dd>
                    </dl>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-gray-400">Per-vertical split not provided by the server for this period.</p>
            : undefined}
          caption="Revenue is dated by when the client payment was recorded (GMT, Africa/Accra). Commission relief is commission forgiven to providers through provider promo campaigns."
        />

        <div className="bg-white rounded-xl shadow-sm p-5 mt-6">
          <h2 className="text-sm font-semibold text-gray-800">Gross revenue split</h2>
          <p className="text-xs text-gray-400 mb-2">Each bar is gross revenue: what MyShop kept (net) plus what it spent on promos and relief, per {groupBy}</p>
          {chartData.length === 0 ? (
            <div className="flex items-center justify-center h-56 text-sm text-gray-400">No data in this range</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART_AXIS_TEXT }} interval={Math.max(0, Math.floor(chartData.length / 10))} />
                <YAxis tick={{ fontSize: 11, fill: CHART_AXIS_TEXT }} tickFormatter={v => `${Number(v).toFixed(0)}`} />
                <Tooltip
                  formatter={(v, n) => [formatGhs(Math.round(Number(v) * 100)), n]}
                  labelFormatter={(_, payload) => periodLabel(String(payload?.[0]?.payload?.period ?? ''))}
                  contentStyle={CHART_TOOLTIP_STYLE}
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Net revenue" stackId="gross" fill={REVENUE_SERIES.net} stroke="#ffffff" strokeWidth={1} />
                <Bar dataKey="Promo funded" stackId="gross" fill={REVENUE_SERIES.promo} stroke="#ffffff" strokeWidth={1} />
                <Bar dataKey="Commission relief" stackId="gross" fill={REVENUE_SERIES.relief} stroke="#ffffff" strokeWidth={1} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </PageGuard>
  )
}
