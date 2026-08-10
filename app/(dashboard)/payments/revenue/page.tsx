'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { PageGuard } from '@/components/common/page-guard'
import Link from 'next/link'
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/common/page-header'
import { getRevenueReport, type RevenueReport } from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { formatPeriodLabel } from '@/lib/format-date'
import { useDateRange } from '@/components/common/date-range-filter'
import { dateRangeLabel } from '@/lib/date-range'
import {
  AreaChart, Area, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

type GroupBy = 'day' | 'week' | 'month'

function formatGhs(ghs: number) {
  return 'GHS ' + ghs.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function RevenuePage() {
  const [report, setReport] = useState<RevenueReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestSequence = useRef(0)

  const { from, to, preset, control: dateControl } = useDateRange('month', { includeAll: false })
  const [groupBy, setGroupBy] = useState<GroupBy>('day')

  const load = useCallback(async () => {
    const request = ++requestSequence.current
    setLoading(true)
    setError('')
    setReport(null)
    try {
      const r = await getRevenueReport({
        from,
        to,
        groupBy,
      })
      if (request === requestSequence.current) setReport(r)
    } catch (err) {
      if (request !== requestSequence.current) return
      const raw = err instanceof ApiError ? err.message : 'Failed to load revenue report.'
      const friendly = /database operation failed/i.test(raw)
        ? 'Backend reported a database error. Try a smaller date range, clear the date filters, or retry in a moment.'
        : raw
      setError(friendly)
    } finally {
      if (request === requestSequence.current) setLoading(false)
    }
  }, [from, to, groupBy])

  useEffect(() => { load() }, [load])

  const periods = report?.periods ?? []

  const chartData = periods.map(d => ({
    date: d.period,
    collections: d.collectionsGhs,
    commission:  d.commissionGhs,
    payouts:     d.payoutsGhs,
    tips:        d.tipsGhs,
  }))

  const totalCollections = periods.reduce((s, d) => s + d.collectionsGhs, 0)
  const totalCommission  = periods.reduce((s, d) => s + d.commissionGhs, 0)
  const totalPayouts     = periods.reduce((s, d) => s + d.payoutsGhs, 0)
  const totalTips        = periods.reduce((s, d) => s + d.tipsGhs, 0)
  const totalRefunds     = periods.reduce((s, d) => s + (d.refundsGhs ?? 0), 0)
  const totalClawbacks   = periods.reduce((s, d) => s + (d.clawbacksGhs ?? 0), 0)
  // Platform net take: commission earned, less refunds funded, plus recoveries.
  const totalNetRevenue  = periods.reduce((s, d) => s + (d.netRevenueGhs ?? 0), 0)
  const totalPayments    = periods.reduce((s, d) => s + d.totalPayments, 0)
  const totalSuccessful  = periods.reduce((s, d) => s + d.successfulPayments, 0)
  const totalMomo        = periods.reduce((s, d) => s + d.momoCount, 0)
  const totalCard        = periods.reduce((s, d) => s + d.cardCount, 0)
  const successRate      = totalPayments > 0 ? (totalSuccessful / totalPayments) * 100 : null

  const pieData = [
    { name: 'Paid to providers', value: Math.max(0, totalPayouts) },
    { name: 'MyShop earnings',  value: Math.max(0, totalCommission) },
    { name: 'Tips',        value: Math.max(0, totalTips) },
  ].filter(p => p.value > 0)

  return (
     <PageGuard permission="view_payments">
    <div>
      <PageHeader title="Payments" subtitle="See money received, money paid out, refunds, and debts" />

      <Tabs defaultValue="revenue" className="mb-6">
        <TabsList className="bg-white">
          <TabsTrigger value="transactions" asChild><Link href="/payments/transactions">Payment Activity</Link></TabsTrigger>
          <TabsTrigger value="revenue" asChild><Link href="/payments/revenue">Money Summary</Link></TabsTrigger>
          <TabsTrigger value="batch-payouts" asChild><Link href="/payments/batch-payouts">Provider Payments</Link></TabsTrigger>
          <TabsTrigger value="clawbacks" asChild><Link href="/payments/clawbacks">Money Owed</Link></TabsTrigger>
          <TabsTrigger value="webhook-failures" asChild><Link href="/payments/webhook-failures">Payment Errors</Link></TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex items-end gap-3 flex-wrap">
        <div>
          <Label className="text-xs text-gray-500 mb-1 block">Reporting period (GMT)</Label>
          {dateControl}
        </div>
        <div>
          <Label className="text-xs text-gray-500 mb-1 block">Group by</Label>
          <Select value={groupBy} onValueChange={v => setGroupBy(v as GroupBy)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="month">Month</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
        <div className="ml-auto text-xs text-gray-500">
          {report ? `${dateRangeLabel(preset)} · ${periods.length} period${periods.length === 1 ? '' : 's'} · grouped by ${report.groupBy}` : '-'}
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Couldn&apos;t load revenue data</p>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={load}>Retry</Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading revenue data…</span>
        </div>
      ) : report === null ? (
        !error && (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400 text-sm">
            Payment summary is not yet available for the selected dates.
          </div>
        )
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="p-5">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Total money received</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{formatGhs(totalCollections)}</p>
                <p className="text-xs text-gray-500 mt-1">Money received (excl. failed)</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">MyShop earnings</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{formatGhs(totalCommission)}</p>
                <p className="text-xs text-gray-500 mt-1">Before money returned to customers</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Money MyShop keeps</p>
                <p className={`text-2xl font-bold mt-1 ${totalNetRevenue < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatGhs(totalNetRevenue)}</p>
                <p className="text-xs text-emerald-600 mt-1">MyShop earnings − customer refunds + debts recovered</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Paid to providers</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{formatGhs(totalPayouts)}</p>
                <p className="text-xs text-gray-500 mt-1">Actually disbursed to providers</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Refunds</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{formatGhs(totalRefunds)}</p>
                <p className="text-xs text-gray-500 mt-1">Returned to clients{totalClawbacks > 0 ? ` · ${formatGhs(totalClawbacks)} reclaimed` : ''}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Payment Success Rate</p>
                <p className={`text-2xl font-bold mt-1 ${successRate == null ? 'text-gray-400' : successRate >= 98 ? 'text-emerald-600' : 'text-orange-500'}`}>
                  {successRate == null ? '—' : `${successRate.toFixed(1)}%`}
                </p>
                <p className="text-xs text-gray-500 mt-1">{totalSuccessful} / {totalPayments} payments | target 98%</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <Card className="xl:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Money over time</CardTitle>
                <p className="text-xs text-gray-400">Money received, MyShop earnings, provider payments, and tips per {groupBy}</p>
              </CardHeader>
              <CardContent>
                {chartData.length === 0 ? (
                  <div className="flex items-center justify-center h-64 text-gray-400 text-sm">No data in this range</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="revCollections" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#F5A623" stopOpacity={0.18} />
                          <stop offset="95%" stopColor="#F5A623" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: '#9ca3af' }}
                        tickFormatter={v => formatPeriodLabel(String(v), groupBy)}
                        interval={Math.max(0, Math.floor(chartData.length / 8))}
                      />
                      <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => `₵${Number(v).toFixed(0)}`} />
                      <Tooltip
                        formatter={(v, n) => [formatGhs(Number(v)), n]}
                        labelFormatter={label => formatPeriodLabel(String(label), groupBy)}
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Area type="monotone" dataKey="collections" stroke="#F5A623" strokeWidth={2} fill="url(#revCollections)" dot={chartData.length === 1 ? { r: 3 } : false} name="Money received" />
                      <Line type="monotone" dataKey="commission"  stroke="#10B981" strokeWidth={2} dot={chartData.length === 1 ? { r: 3 } : false} name="MyShop earnings" />
                      <Line type="monotone" dataKey="payouts"     stroke="#3B82F6" strokeWidth={2} dot={chartData.length === 1 ? { r: 3 } : false} name="Paid to providers" />
                      <Line type="monotone" dataKey="tips"        stroke="#A855F7" strokeWidth={2} dot={chartData.length === 1 ? { r: 3 } : false} name="Tips" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Where the money went</CardTitle>
                <p className="text-xs text-gray-400">How total revenue splits across payouts, commission and tips</p>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                {pieData.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={4}>
                        <Cell fill="#3B82F6" />
                        <Cell fill="#F5A623" />
                        <Cell fill="#A855F7" />
                      </Pie>
                      <Tooltip formatter={(v) => [formatGhs(Number(v)), '']} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
                <div className="mt-2 space-y-1.5 w-full">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">MyShop share</span>
                    <span className="font-semibold">{totalCollections > 0 ? Math.round(totalCommission / totalCollections * 100) : 0}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">MoMo / Card</span>
                    <span className="font-semibold">
                      {totalMomo + totalCard === 0 ? '—' : `${Math.round((totalMomo / (totalMomo + totalCard)) * 100)}% / ${Math.round((totalCard / (totalMomo + totalCard)) * 100)}%`}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Tips collected</span>
                    <span className="font-semibold">{formatGhs(totalTips)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  </PageGuard>
  )
}
