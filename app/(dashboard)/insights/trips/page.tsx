'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, CheckCircle2, XCircle, UserX, Activity, ListChecks, Car, Wrench } from 'lucide-react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { PageGuard } from '@/components/common/page-guard'
import { PageHeader } from '@/components/common/page-header'
import { StatCard } from '@/components/common/stat-card'
import { PeriodControls, usePeriod } from '@/components/common/period-controls'
import { ReportTable, type ReportColumn } from '@/components/common/report-table'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { VerticalTabs, type Vertical } from '@/components/common/vertical-tabs'
import { Button } from '@/components/ui/button'
import { getBookingOutcomesReport, getDisputeRateReport, type BookingOutcomesReport, type BookingOutcomePeriod, type BookingOutcomeCounters, type DisputeRatePoint } from '@/lib/api'
import { ApiError, userSafeAdminError } from '@/lib/api-client'
import { formatDate, formatPeriodLabel } from '@/lib/format-date'
import { dateRangeLabel, shiftDateKey } from '@/lib/date-range'
import { exportTableCsv } from '@/lib/report-export'
import { CHART_SERIES, OUTCOME_SERIES, CHART_GRID, CHART_AXIS_TEXT, CHART_TOOLTIP_STYLE } from '@/lib/chart-palette'

function pctLabel(value: number | null): string {
  return value == null ? '-' : `${value.toFixed(1)}%`
}

function Count({ value, muted }: { value: number; muted?: boolean }) {
  return <span className={muted || value === 0 ? 'text-gray-400' : 'text-gray-700'}>{value.toLocaleString()}</span>
}

/** Inclusive end date of the bucket a period starts on, for deep links. */
function periodEnd(periodStart: string, groupBy: string): string {
  const start = periodStart.slice(0, 10)
  if (groupBy === 'week') return shiftDateKey(start, 6)
  if (groupBy === 'month') {
    const [y, m] = start.split('-').map(Number)
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  }
  if (groupBy === 'year') return `${start.slice(0, 4)}-12-31`
  return start
}

export default function BookingOutcomesPage() {
  const router = useRouter()
  const period = usePeriod('this_month', 'day')
  const [vertical, setVertical] = useState<Vertical>('all')
  const [report, setReport] = useState<BookingOutcomesReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [unavailable, setUnavailable] = useState(false)
  const [disputeRates, setDisputeRates] = useState<DisputeRatePoint[] | null>(null)
  const requestSequence = useRef(0)
  const { from, to, groupBy } = period

  // Dispute rate belongs with outcomes: it is the quality of those outcomes.
  useEffect(() => {
    let cancelled = false
    getDisputeRateReport({ from, to })
      .then(points => { if (!cancelled) setDisputeRates(points) })
      .catch(() => { if (!cancelled) setDisputeRates(null) })
    return () => { cancelled = true }
  }, [from, to])

  const load = useCallback(async () => {
    const request = ++requestSequence.current
    setLoading(true)
    setError('')
    setUnavailable(false)
    try {
      const next = await getBookingOutcomesReport({ from, to, groupBy, vertical })
      if (request === requestSequence.current) setReport(next)
    } catch (err) {
      if (request !== requestSequence.current) return
      setReport(null)
      if (err instanceof ApiError && err.status === 404) setUnavailable(true)
      else setError(userSafeAdminError(err, 'Failed to load booking outcomes.'))
    } finally {
      if (request === requestSequence.current) setLoading(false)
    }
  }, [from, to, groupBy, vertical])

  useEffect(() => { load() }, [load])

  const rows = useMemo(
    () => [...(report?.periods ?? [])].sort((a, b) => b.period.localeCompare(a.period)),
    [report],
  )
  const totals: BookingOutcomeCounters | null = report?.totals ?? null

  const periodLabel = (iso: string) => (groupBy === 'day' ? formatDate(iso) : formatPeriodLabel(iso, groupBy))

  const chartData = useMemo(() => [...rows].reverse().map(r => ({
    period: r.period,
    label: formatPeriodLabel(r.period, groupBy),
    Completed: r.completed,
    Cancelled: r.cancelled,
    Unassigned: r.unassigned,
    'Still active': r.active,
  })), [rows, groupBy])

  const columns: ReportColumn<BookingOutcomePeriod>[] = [
    { key: 'period', header: 'Period', footer: 'Total', render: r => <span className="font-medium text-gray-800">{periodLabel(r.period)}</span> },
    { key: 'requested', header: 'Total requested', align: 'right', render: r => <span className="font-semibold text-gray-900">{r.requested.toLocaleString()}</span>, footer: totals?.requested.toLocaleString() },
    { key: 'completed', header: 'Completed', align: 'right', render: r => <Count value={r.completed} />, footer: totals?.completed.toLocaleString() },
    { key: 'cancelled', header: 'Cancelled', align: 'right', render: r => <Count value={r.cancelled} />, footer: totals?.cancelled.toLocaleString() },
    { key: 'unassigned', header: 'Unassigned', align: 'right', render: r => <Count value={r.unassigned} />, footer: totals?.unassigned.toLocaleString() },
    { key: 'active', header: 'Still active', align: 'right', responsiveClassName: 'hidden md:table-cell', render: r => <Count value={r.active} muted />, footer: totals?.active.toLocaleString() },
    { key: 'completion', header: 'Completion', align: 'right', responsiveClassName: 'hidden lg:table-cell', render: r => pctLabel(r.completionRatePct), footer: totals ? pctLabel(totals.completionRatePct) : undefined },
    { key: 'unassignedPct', header: 'Unassigned %', align: 'right', responsiveClassName: 'hidden lg:table-cell', render: r => pctLabel(r.unassignedRatePct), footer: totals ? pctLabel(totals.unassignedRatePct) : undefined },
  ]

  function exportCsv() {
    exportTableCsv(
      `booking-outcomes-${groupBy}-${vertical}`,
      ['Period', 'Vertical', 'Total requested', 'Completed', 'Cancelled', 'Unassigned', 'Still active', 'Completion %', 'Unassigned %'],
      rows.flatMap(r => [
        [r.period, vertical === 'all' ? 'All' : vertical === 'rides' ? 'Rides' : 'Artisan Services', r.requested, r.completed, r.cancelled, r.unassigned, r.active, r.completionRatePct ?? '', r.unassignedRatePct ?? ''],
        ...(vertical === 'all' ? [
          [r.period, 'Rides', r.byVertical.rides.requested, r.byVertical.rides.completed, r.byVertical.rides.cancelled, r.byVertical.rides.unassigned, r.byVertical.rides.active, r.byVertical.rides.completionRatePct ?? '', r.byVertical.rides.unassignedRatePct ?? ''],
          [r.period, 'Artisan Services', r.byVertical.artisans.requested, r.byVertical.artisans.completed, r.byVertical.artisans.cancelled, r.byVertical.artisans.unassigned, r.byVertical.artisans.active, r.byVertical.artisans.completionRatePct ?? '', r.byVertical.artisans.unassignedRatePct ?? ''],
        ] : []),
      ]),
    )
  }

  function openBookings(row: BookingOutcomePeriod, status?: string) {
    const start = row.period.slice(0, 10)
    const end = periodEnd(row.period, groupBy)
    const target = vertical === 'artisans' ? '/artisan-jobs' : '/rides'
    const query = new URLSearchParams({ from: start, to: end })
    if (status) query.set('status', status)
    router.push(`${target}?${query}`)
  }

  const caption = report
    ? `${dateRangeLabel(period.preset)} - ${rows.length} period${rows.length === 1 ? '' : 's'} - grouped by ${groupBy}`
    : dateRangeLabel(period.preset)

  return (
    <PageGuard permission="view_reports">
      <div>
        <PageHeader
          title="Booking outcomes"
          subtitle="Every booking requested in a period, by what happened to it - rides and artisan jobs"
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

        {error ? (
          <ErrorState title="Could not load booking outcomes" detail={error} onRetry={load} />
        ) : (
        <>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <StatCard icon={ListChecks} label="Total requested" value={totals ? totals.requested.toLocaleString() : '-'} sub="Bookings created in the period" loading={loading} />
          <StatCard icon={CheckCircle2} label="Completed" value={totals ? totals.completed.toLocaleString() : '-'} sub={totals ? `${pctLabel(totals.completionRatePct)} of requested` : undefined} loading={loading} />
          <StatCard icon={XCircle} label="Cancelled" value={totals ? totals.cancelled.toLocaleString() : '-'} sub="By client, provider or admin" loading={loading} />
          <StatCard icon={UserX} label="Unassigned" value={totals ? totals.unassigned.toLocaleString() : '-'} sub={totals ? `${pctLabel(totals.unassignedRatePct)} never got a provider` : undefined} tone={totals && (totals.unassignedRatePct ?? 0) >= 20 ? 'negative' : 'neutral'} loading={loading} />
          <StatCard icon={Activity} label="Still active" value={totals ? totals.active.toLocaleString() : '-'} sub="In progress at the time of reporting" loading={loading} compact />
        </div>

        <ReportTable<BookingOutcomePeriod>
          columns={columns}
          rows={rows}
          rowKey={r => r.period}
          loading={loading}
          showFooter
          minWidth={720}
          empty={unavailable
            ? <EmptyState variant="unavailable" title="Booking outcomes are not available yet" description="The server has not been updated with this report. The page will populate automatically once it is deployed." />
            : <EmptyState title="No bookings requested in this period" description="Try a wider date range." />}
          renderExpanded={row => (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {[{ label: 'Rides', icon: Car, data: row.byVertical.rides, target: '/rides' }, { label: 'Artisan Services', icon: Wrench, data: row.byVertical.artisans, target: '/artisan-jobs' }].map(v => (
                <div key={v.label} className="rounded-lg bg-white border border-gray-100 px-3 py-2">
                  <p className="flex items-center gap-1.5 font-semibold text-gray-700 mb-1.5"><v.icon className="h-3.5 w-3.5 text-gray-400" /> {v.label}</p>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-600">
                    <dt>Total requested</dt><dd className="text-right tabular-nums font-semibold text-gray-900">{v.data.requested.toLocaleString()}</dd>
                    <dt>Completed</dt><dd className="text-right tabular-nums">{v.data.completed.toLocaleString()}</dd>
                    <dt>Cancelled</dt><dd className="text-right tabular-nums">{v.data.cancelled.toLocaleString()}</dd>
                    <dt>Unassigned</dt><dd className="text-right tabular-nums">{v.data.unassigned.toLocaleString()}</dd>
                    <dt>Still active</dt><dd className="text-right tabular-nums">{v.data.active.toLocaleString()}</dd>
                  </dl>
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="text-[11px] font-medium text-blue-600 hover:underline" onClick={e => { e.stopPropagation(); router.push(`${v.target}?from=${row.period.slice(0, 10)}&to=${periodEnd(row.period, groupBy)}`) }}>
                      Open list
                    </button>
                    <button type="button" className="text-[11px] font-medium text-blue-600 hover:underline" onClick={e => { e.stopPropagation(); router.push(`${v.target}?from=${row.period.slice(0, 10)}&to=${periodEnd(row.period, groupBy)}&status=cancelled`) }}>
                      Cancelled only
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          caption="Bookings are grouped by the date they were requested (GMT), so each row adds up: completed + cancelled + unassigned + still active = total requested. Unassigned = no driver found or still searching (rides); no bids or awaiting admin (jobs)."
        />
        {rows.length > 0 && vertical !== 'all' && (
          <p className="mt-2 text-[11px] text-gray-400">
            Tip: click a row to expand, or{' '}
            <button type="button" className="text-blue-600 hover:underline" onClick={() => openBookings(rows[0])}>open the latest period in the {vertical === 'rides' ? 'rides' : 'jobs'} list</button>.
          </p>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-6">
        <div className="xl:col-span-2 bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-800">Outcome mix over time</h2>
          <p className="text-xs text-gray-400 mb-2">Each bar is the bookings requested in that {groupBy}, split by what happened to them</p>
          {chartData.length === 0 ? (
            <div className="flex items-center justify-center h-56 text-sm text-gray-400">No data in this range</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART_AXIS_TEXT }} interval={Math.max(0, Math.floor(chartData.length / 10))} />
                <YAxis tick={{ fontSize: 11, fill: CHART_AXIS_TEXT }} allowDecimals={false} />
                <Tooltip
                  formatter={(v, n) => [Number(v).toLocaleString(), n]}
                  labelFormatter={(_, payload) => periodLabel(String(payload?.[0]?.payload?.period ?? ''))}
                  contentStyle={CHART_TOOLTIP_STYLE}
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Completed" stackId="requested" fill={OUTCOME_SERIES.completed} stroke="#ffffff" strokeWidth={1} />
                <Bar dataKey="Cancelled" stackId="requested" fill={OUTCOME_SERIES.cancelled} stroke="#ffffff" strokeWidth={1} />
                <Bar dataKey="Unassigned" stackId="requested" fill={OUTCOME_SERIES.unassigned} stroke="#ffffff" strokeWidth={1} />
                <Bar dataKey="Still active" stackId="requested" fill={OUTCOME_SERIES.active} stroke="#ffffff" strokeWidth={1} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-800">Dispute rate</h2>
          <p className="text-xs text-gray-400 mb-2">Share of bookings that raised a dispute, per day</p>
          {disputeRates === null ? (
            <div className="flex items-center justify-center h-56 text-sm text-gray-400">Dispute rate is not available for this period</div>
          ) : disputeRates.length === 0 ? (
            <div className="flex items-center justify-center h-56 text-sm text-gray-400">No disputes in this range</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={disputeRates.map(d => ({ date: d.date, label: formatPeriodLabel(d.date, 'day'), rate: Math.round(d.rate * 100) / 100 }))} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART_AXIS_TEXT }} interval={Math.max(0, Math.floor(disputeRates.length / 6))} />
                <YAxis tick={{ fontSize: 11, fill: CHART_AXIS_TEXT }} tickFormatter={v => `${v}%`} />
                <Tooltip
                  formatter={(v) => [`${Number(v).toFixed(2)}%`, 'Dispute rate']}
                  labelFormatter={(_, payload) => formatDate(String(payload?.[0]?.payload?.date ?? ''))}
                  contentStyle={CHART_TOOLTIP_STYLE}
                />
                <Line type="monotone" dataKey="rate" stroke={CHART_SERIES[1]} strokeWidth={2} dot={disputeRates.length === 1 ? { r: 3 } : false} name="Dispute rate" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        </div>
      </>
        )}
      </div>
    </PageGuard>
  )
}
