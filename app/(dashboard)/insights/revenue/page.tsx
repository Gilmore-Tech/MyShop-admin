'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, Receipt, TrendingUp, Ticket, Wallet, HandCoins, Car, Wrench } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { PageGuard } from '@/components/common/page-guard'
import { PageHeader } from '@/components/common/page-header'
import { StatCard } from '@/components/common/stat-card'
import { PeriodControls, usePeriod } from '@/components/common/period-controls'
import { ReportTable, type ReportColumn } from '@/components/common/report-table'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { VerticalTabs, type Vertical } from '@/components/common/vertical-tabs'
import { Button } from '@/components/ui/button'
import { getRevenueReport, type RevenueDataPoint, type RevenueReport } from '@/lib/api'
import { ApiError, userSafeAdminError } from '@/lib/api-client'
import { formatGhs, ghsToPesewas } from '@/lib/money'
import { formatDate, formatPeriodLabel } from '@/lib/format-date'
import { dateBasisCaption, dateRangeLabel } from '@/lib/date-range'
import { exportTableCsv } from '@/lib/report-export'
import { REVENUE_SERIES, CHART_GRID, CHART_AXIS_TEXT, CHART_TOOLTIP_STYLE } from '@/lib/chart-palette'

/**
 * The one Revenue page. Vocabulary (approved glossary - "Net" alone is banned):
 *   Money received      = collections (what clients paid)
 *   Commission earned   = the platform's 20% of pre-promo fares
 *   Kept after promos   = commission earned - promo funded - commission relief
 *   Kept after refunds  = commission earned - refunds + debts recovered
 */
interface RevenueRow {
  key: string
  period: string
  bookings: number
  receivedPesewas: number
  commissionPesewas: number
  promoPesewas: number
  reliefPesewas: number
  keptAfterPromosPesewas: number
  refundsPesewas: number
  recoveredPesewas: number
  keptAfterRefundsPesewas: number | null
  paidToProvidersPesewas: number
  tipsPesewas: number
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
      receivedPesewas: pesewas(v.collectionsGhs),
      commissionPesewas: pesewas(v.commissionGhs),
      promoPesewas: pesewas(v.subsidyGhs),
      reliefPesewas: pesewas(v.commissionReliefGhs),
      keptAfterPromosPesewas: pesewas(v.netCommissionAfterPromoGhs),
      refundsPesewas: pesewas(v.refundsGhs),
      recoveredPesewas: 0,
      keptAfterRefundsPesewas: null, // combined-only figure
      paidToProvidersPesewas: pesewas(v.payoutsGhs),
      tipsPesewas: 0,
      hasVerticalSplit: false,
      rides: null,
      artisans: null,
    }
  }
  const rides = sub('rides')
  const artisans = sub('artisans')
  if (vertical !== 'all') {
    const chosen = vertical === 'rides' ? rides : artisans
    if (chosen) return { ...chosen, key: point.period }
    // Backend without a per-vertical split: keep the period visible with zeros.
    return {
      key: point.period, period: point.period, bookings: 0, receivedPesewas: 0, commissionPesewas: 0,
      promoPesewas: 0, reliefPesewas: 0, keptAfterPromosPesewas: 0, refundsPesewas: 0, recoveredPesewas: 0,
      keptAfterRefundsPesewas: null, paidToProvidersPesewas: 0, tipsPesewas: 0,
      hasVerticalSplit: false, rides: null, artisans: null,
    }
  }
  return {
    key: point.period,
    period: point.period,
    bookings: point.totalPayments,
    receivedPesewas: pesewas(point.collectionsGhs),
    commissionPesewas: pesewas(point.commissionGhs),
    promoPesewas: pesewas(point.subsidyGhs),
    reliefPesewas: pesewas(point.commissionReliefGhs),
    keptAfterPromosPesewas: pesewas(point.netCommissionAfterPromoGhs),
    refundsPesewas: pesewas(point.refundsGhs),
    recoveredPesewas: pesewas(point.clawbacksGhs),
    keptAfterRefundsPesewas: pesewas(point.netRevenueGhs),
    paidToProvidersPesewas: pesewas(point.payoutsGhs),
    tipsPesewas: pesewas(point.tipsGhs),
    hasVerticalSplit: Boolean(rides && artisans),
    rides,
    artisans,
  }
}

function marginPct(kept: number, commission: number): string {
  if (commission <= 0) return '-'
  return `${Math.round((kept / commission) * 1000) / 10}%`
}

export default function RevenuePage() {
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
      else setError(userSafeAdminError(err, 'Failed to load revenue.'))
    } finally {
      if (request === requestSequence.current) setLoading(false)
    }
  }, [from, to, groupBy])

  useEffect(() => { load() }, [load])

  const combined = vertical === 'all'

  const rows = useMemo(() => {
    const points = report?.periods ?? []
    return [...points]
      .sort((a, b) => b.period.localeCompare(a.period))
      .map(p => rowFromPoint(p, vertical))
  }, [report, vertical])

  const splitMissing = !combined && rows.length > 0 && !(report?.periods ?? []).some(p => p.byVertical)

  const totals = useMemo(() => rows.reduce(
    (acc, r) => ({
      bookings: acc.bookings + r.bookings,
      receivedPesewas: acc.receivedPesewas + r.receivedPesewas,
      commissionPesewas: acc.commissionPesewas + r.commissionPesewas,
      promoPesewas: acc.promoPesewas + r.promoPesewas,
      reliefPesewas: acc.reliefPesewas + r.reliefPesewas,
      keptAfterPromosPesewas: acc.keptAfterPromosPesewas + r.keptAfterPromosPesewas,
      refundsPesewas: acc.refundsPesewas + r.refundsPesewas,
      recoveredPesewas: acc.recoveredPesewas + r.recoveredPesewas,
      keptAfterRefundsPesewas: acc.keptAfterRefundsPesewas + (r.keptAfterRefundsPesewas ?? 0),
      paidToProvidersPesewas: acc.paidToProvidersPesewas + r.paidToProvidersPesewas,
      tipsPesewas: acc.tipsPesewas + r.tipsPesewas,
    }),
    {
      bookings: 0, receivedPesewas: 0, commissionPesewas: 0, promoPesewas: 0, reliefPesewas: 0,
      keptAfterPromosPesewas: 0, refundsPesewas: 0, recoveredPesewas: 0, keptAfterRefundsPesewas: 0,
      paidToProvidersPesewas: 0, tipsPesewas: 0,
    },
  ), [rows])

  // Payment mix (combined figures from the raw report).
  const mix = useMemo(() => {
    const points = report?.periods ?? []
    const momo = points.reduce((s, p) => s + p.momoCount, 0)
    const card = points.reduce((s, p) => s + p.cardCount, 0)
    const cash = points.reduce((s, p) => s + p.cashCount, 0)
    const payments = points.reduce((s, p) => s + p.totalPayments, 0)
    return { momo, card, cash, payments }
  }, [report])

  const chartData = useMemo(() => [...rows].reverse().map(r => ({
    period: r.period,
    label: formatPeriodLabel(r.period, groupBy),
    'Kept after promos': r.keptAfterPromosPesewas / 100,
    'Promo funded': r.promoPesewas / 100,
    'Commission relief': r.reliefPesewas / 100,
  })), [rows, groupBy])

  const periodLabel = (iso: string) => (groupBy === 'day' ? formatDate(iso) : formatPeriodLabel(iso, groupBy))

  const columns: ReportColumn<RevenueRow>[] = [
    { key: 'period', header: 'Period', render: r => <span className="font-medium text-gray-800">{periodLabel(r.period)}</span>, footer: 'Total' },
    { key: 'bookings', header: 'Bookings', align: 'right', render: r => r.bookings.toLocaleString(), footer: totals.bookings.toLocaleString() },
    { key: 'received', header: 'Money received', align: 'right', responsiveClassName: 'hidden md:table-cell', render: r => formatGhs(r.receivedPesewas), footer: formatGhs(totals.receivedPesewas) },
    { key: 'commission', header: 'Commission earned', align: 'right', render: r => <span className="font-medium">{formatGhs(r.commissionPesewas)}</span>, footer: formatGhs(totals.commissionPesewas) },
    { key: 'promo', header: 'Promo funded', align: 'right', render: r => formatGhs(r.promoPesewas), footer: formatGhs(totals.promoPesewas) },
    { key: 'relief', header: 'Commission relief', align: 'right', responsiveClassName: 'hidden lg:table-cell', render: r => formatGhs(r.reliefPesewas), footer: formatGhs(totals.reliefPesewas) },
    { key: 'keptPromos', header: 'Kept after promos', align: 'right', render: r => <span className={`font-semibold ${r.keptAfterPromosPesewas < 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatGhs(r.keptAfterPromosPesewas)}</span>, footer: formatGhs(totals.keptAfterPromosPesewas) },
    { key: 'refunds', header: 'Refunds', align: 'right', responsiveClassName: 'hidden lg:table-cell', render: r => formatGhs(r.refundsPesewas), footer: formatGhs(totals.refundsPesewas) },
    ...(combined ? [
      { key: 'recovered', header: 'Debts recovered', align: 'right', responsiveClassName: 'hidden xl:table-cell', render: (r: RevenueRow) => formatGhs(r.recoveredPesewas), footer: formatGhs(totals.recoveredPesewas) },
      { key: 'keptRefunds', header: 'Kept after refunds', align: 'right', render: (r: RevenueRow) => <span className={`font-semibold ${(r.keptAfterRefundsPesewas ?? 0) < 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatGhs(r.keptAfterRefundsPesewas)}</span>, footer: formatGhs(totals.keptAfterRefundsPesewas) },
    ] as ReportColumn<RevenueRow>[] : []),
    { key: 'margin', header: 'Margin', align: 'right', responsiveClassName: 'hidden md:table-cell', render: r => marginPct(r.keptAfterPromosPesewas, r.commissionPesewas), footer: marginPct(totals.keptAfterPromosPesewas, totals.commissionPesewas) },
  ]

  function exportCsv() {
    exportTableCsv(
      `revenue-${groupBy}-${vertical}`,
      ['Period', 'Service line', 'Bookings', 'Money received (GHS)', 'Commission earned (GHS)', 'Promo funded (GHS)', 'Commission relief (GHS)', 'Kept after promos (GHS)', 'Refunds (GHS)', 'Debts recovered (GHS)', 'Kept after refunds (GHS)', 'Paid to providers (GHS)', 'Tips (GHS)'],
      rows.flatMap(r => {
        const line = (row: RevenueRow, label: string) => [
          row.period, label, row.bookings, row.receivedPesewas / 100, row.commissionPesewas / 100,
          row.promoPesewas / 100, row.reliefPesewas / 100, row.keptAfterPromosPesewas / 100,
          row.refundsPesewas / 100, row.recoveredPesewas / 100,
          row.keptAfterRefundsPesewas != null ? row.keptAfterRefundsPesewas / 100 : '',
          row.paidToProvidersPesewas / 100, row.tipsPesewas / 100,
        ]
        return [
          line(r, combined ? 'All' : vertical === 'rides' ? 'Rides' : 'Artisan Services'),
          ...(r.rides ? [line(r.rides, 'Rides')] : []),
          ...(r.artisans ? [line(r.artisans, 'Artisan Services')] : []),
        ]
      }),
    )
  }

  const caption = report
    ? `${dateRangeLabel(period.preset)} - ${rows.length} period${rows.length === 1 ? '' : 's'} - by ${groupBy}`
    : dateRangeLabel(period.preset)

  return (
    <PageGuard permission={['view_revenue_report', 'view_payments']}>
      <div>
        <PageHeader
          title="Revenue"
          subtitle="How much MyShop earned, what promos cost, and what was kept - one place for every revenue question"
          actions={
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv} disabled={rows.length === 0}>
              <Download className="h-3.5 w-3.5" /> Download CSV
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

        {error ? (
          <ErrorState title="Could not load revenue" detail={error} onRetry={load} />
        ) : (
        <>
        {splitMissing && (
          <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-4 py-2.5">
            The server has not split revenue for {vertical === 'rides' ? 'Rides' : 'Artisan Services'} on these dates yet, so this view shows zeros. Switch to All for the combined figures.
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <StatCard icon={Wallet} label="Money received" value={formatGhs(totals.receivedPesewas)} sub="Fares clients paid" loading={loading} />
          <StatCard icon={TrendingUp} label="Commission earned" value={formatGhs(totals.commissionPesewas)} sub="20% of pre-promo fares" loading={loading} />
          <StatCard icon={Ticket} label="Kept after promos" value={formatGhs(totals.keptAfterPromosPesewas)} sub="Minus promo money MyShop funded" tone={totals.keptAfterPromosPesewas < 0 ? 'negative' : 'neutral'} loading={loading} />
          <StatCard icon={Receipt} label="Kept after refunds" value={combined ? formatGhs(totals.keptAfterRefundsPesewas) : '-'} sub={combined ? 'Minus refunds, plus debts recovered' : 'Combined view only'} tone={combined && totals.keptAfterRefundsPesewas < 0 ? 'negative' : 'neutral'} loading={loading} />
          <StatCard icon={HandCoins} label="Paid to providers" value={formatGhs(totals.paidToProvidersPesewas)} sub="Sent to provider MoMo accounts" loading={loading} />
        </div>

        <ReportTable<RevenueRow>
          columns={columns}
          rows={rows}
          rowKey={r => r.key}
          rowAriaLabel={r => `Show the Rides and Artisan Services split for ${periodLabel(r.period)}`}
          loading={loading}
          showFooter
          minWidth={combined ? 980 : 820}
          empty={unavailable
            ? <EmptyState variant="unavailable" title="Revenue is not available yet" description="The server has not been updated with promo figures for this report. The page will populate automatically once it is deployed." />
            : <EmptyState title="No revenue in this period" description="Try a wider date range." />}
          renderExpanded={combined
            ? (row) => row.hasVerticalSplit && row.rides && row.artisans ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {[{ label: 'Rides', icon: Car, data: row.rides }, { label: 'Artisan Services', icon: Wrench, data: row.artisans }].map(v => (
                  <div key={v.label} className="rounded-lg bg-white border border-gray-100 px-3 py-2">
                    <p className="flex items-center gap-1.5 font-semibold text-gray-700 mb-1.5"><v.icon className="h-3.5 w-3.5 text-gray-400" /> {v.label}</p>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-600">
                      <dt>Bookings</dt><dd className="text-right tabular-nums">{v.data.bookings.toLocaleString()}</dd>
                      <dt>Money received</dt><dd className="text-right tabular-nums">{formatGhs(v.data.receivedPesewas)}</dd>
                      <dt>Commission earned</dt><dd className="text-right tabular-nums">{formatGhs(v.data.commissionPesewas)}</dd>
                      <dt>Promo funded</dt><dd className="text-right tabular-nums">{formatGhs(v.data.promoPesewas)}</dd>
                      <dt>Kept after promos</dt><dd className="text-right tabular-nums font-semibold text-gray-900">{formatGhs(v.data.keptAfterPromosPesewas)}</dd>
                    </dl>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-gray-400">The server did not provide a Rides / Artisan Services split for this period.</p>
            : undefined}
          caption={`${dateBasisCaption('payments', 'recorded')} Commission relief is commission forgiven to providers through promo campaigns.`}
        />

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-6">
          <div className="xl:col-span-2 bg-white rounded-xl shadow-sm p-5 flex flex-col gap-2">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Commission earned, split</h2>
              <p className="text-xs text-gray-400">Each bar is the commission earned that {groupBy}: what MyShop kept, plus what it spent on promos and relief</p>
            </div>
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
                  <Bar dataKey="Kept after promos" stackId="commission" fill={REVENUE_SERIES.net} stroke="#ffffff" strokeWidth={1} />
                  <Bar dataKey="Promo funded" stackId="commission" fill={REVENUE_SERIES.promo} stroke="#ffffff" strokeWidth={1} />
                  <Bar dataKey="Commission relief" stackId="commission" fill={REVENUE_SERIES.relief} stroke="#ffffff" strokeWidth={1} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm p-5 flex flex-col gap-2.5">
            <h2 className="text-sm font-semibold text-gray-800">Payment mix</h2>
            {[
              ['MyShop share of money received', totals.receivedPesewas > 0 ? `${Math.round((totals.commissionPesewas / totals.receivedPesewas) * 100)}%` : '-'],
              ['MoMo vs card payments', mix.momo + mix.card > 0 ? `${Math.round((mix.momo / (mix.momo + mix.card)) * 100)}% / ${Math.round((mix.card / (mix.momo + mix.card)) * 100)}%` : '-'],
              ['Cash bookings', mix.payments > 0 ? `${Math.round((mix.cash / mix.payments) * 100)}%` : '-'],
              ['Tips collected', formatGhs(totals.tipsPesewas)],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex items-center justify-between border-b border-gray-50 pb-2.5">
                <span className="text-sm text-gray-500">{label}</span>
                <span className="text-sm font-semibold text-gray-800 tabular-nums">{value}</span>
              </div>
            ))}
            <Link href="/payments/transactions" className="text-xs font-medium mt-auto" style={{ color: '#F5A623' }}>
              Payment success rate - see Transactions
            </Link>
          </div>
        </div>
        </>
        )}
      </div>
    </PageGuard>
  )
}
