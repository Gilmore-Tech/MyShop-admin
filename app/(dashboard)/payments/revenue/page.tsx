'use client'

import { useState, useEffect } from 'react'
import { PageGuard } from '@/components/common/page-guard'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/common/page-header'
import { getRevenueReport, type RevenueReport } from '@/lib/api'
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

function formatGhs(ghs: number) {
  return 'GHS ' + ghs.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function RevenuePage() {
  const [report, setReport] = useState<RevenueReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getRevenueReport({ groupBy: 'day' })
      .then(r => setReport(r))
      .catch(() => setReport(null))
      .finally(() => setLoading(false))
  }, [])

  const periods = report?.periods ?? []

  const chartData = periods.map(d => ({
    date: d.period,
    collections: d.collectionsGhs,
    commission:  d.commissionGhs,
    payouts:     d.payoutsGhs,
  }))

  const totalCollections = periods.reduce((s, d) => s + d.collectionsGhs, 0)
  const totalCommission  = periods.reduce((s, d) => s + d.commissionGhs, 0)
  const totalPayouts     = periods.reduce((s, d) => s + d.payoutsGhs, 0)
  const totalRevenue     = totalCollections

  const pieData = [
    { name: 'Collections', value: totalCollections },
    { name: 'Commission',  value: totalCommission },
  ]

  return (
     <PageGuard permission="view_payments">
    <div>
      <PageHeader title="Payments" subtitle="Financial transactions and payout management" />

      <Tabs defaultValue="revenue" className="mb-6">
        <TabsList className="bg-white">
          <TabsTrigger value="transactions" asChild><Link href="/payments/transactions">Transactions</Link></TabsTrigger>
          <TabsTrigger value="revenue" asChild><Link href="/payments/revenue">Revenue</Link></TabsTrigger>
          <TabsTrigger value="batch-payouts" asChild><Link href="/payments/batch-payouts">Batch Payouts</Link></TabsTrigger>
          <TabsTrigger value="clawbacks" asChild><Link href="/payments/clawbacks">Clawbacks</Link></TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading revenue data…</span>
        </div>
      ) : report === null ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400 text-sm">
          Revenue data is not yet available.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total Collections', value: formatGhs(totalCollections) },
              { label: 'Total Payouts',     value: formatGhs(totalPayouts) },
              { label: 'Commission Earned', value: formatGhs(totalCommission) },
              { label: 'Total Revenue',     value: formatGhs(totalRevenue) },
            ].map(item => (
              <Card key={item.label}>
                <CardContent className="p-5">
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{item.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{item.value}</p>
                  <p className="text-xs text-emerald-600 mt-1">Platform commission earned</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <Card className="xl:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-base">Revenue Trend — Last 30 Days</CardTitle></CardHeader>
              <CardContent>
                {chartData.length === 0 ? (
                  <div className="flex items-center justify-center h-64 text-gray-400 text-sm">No trend data available</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} interval={4} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `₵${Number(v).toFixed(0)}`} />
                      <Tooltip formatter={(v, n) => [formatGhs(Number(v)), n]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="collections" stroke="#F5A623" strokeWidth={2} dot={false} name="Collections" />
                      <Line type="monotone" dataKey="commission"  stroke="#10B981" strokeWidth={2} dot={false} name="Commission" />
                      <Line type="monotone" dataKey="payouts"     stroke="#3B82F6" strokeWidth={2} dot={false} name="Payouts" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Revenue Mix</CardTitle></CardHeader>
              <CardContent className="flex flex-col items-center">
                {totalRevenue === 0 ? (
                  <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={4}>
                        <Cell fill="#F5A623" />
                        <Cell fill="#46535D" />
                      </Pie>
                      <Tooltip formatter={(v) => [formatGhs(Number(v)), '']} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
                <div className="mt-2 space-y-1.5 w-full">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Commission rate</span>
                    <span className="font-semibold">{totalCollections > 0 ? Math.round(totalCommission / totalCollections * 100) : 0}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Payout rate</span>
                    <span className="font-semibold">{totalCollections > 0 ? Math.round(totalPayouts / totalCollections * 100) : 0}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Periods</span>
                    <span className="font-semibold">{periods.length}</span>
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
