'use client'

import { useState, useEffect, useMemo } from 'react'
import { PageGuard } from '@/components/common/page-guard'
import { Download, TrendingUp, TrendingDown, Users, CreditCard, Repeat2 } from 'lucide-react'
import {
 AreaChart, Area,
 LineChart, Line,
 BarChart, Bar,
 PieChart, Pie, Cell, Label as PieCenter, LabelList,
 XAxis, YAxis, CartesianGrid, Tooltip, Legend,
 ResponsiveContainer, ReferenceLine as RechartRefLine,
 type PieLabelRenderProps,
} from 'recharts'
import {
 getRevenueReport, getProviderReport, getOverviewReport,
 getRideStatusReport, getJobCategoryReport, getPaymentReport, getDisputeRateReport,
 type RevenueDataPoint, type ProviderReport, type OverviewReport,
 type RideStatusBreakdown, type JobCategoryCount, type PaymentReport, type DisputeRatePoint,
} from '@/lib/api'

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
 gold:'#F5A623',
 blue:'#3B82F6',
 purple:'#8B5CF6',
 green:'#10B981',
 red:'#EF4444',
 amber:'#F59E0B',
 teal:'#14B8A6',
}

const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const DOW_ORDER = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const CAT_COLORS = [C.gold, C.blue, C.purple, C.teal, C.amber, C.green]
const PAY_COLORS = [C.gold, C.blue, C.purple, C.teal]

// ─── Sub-components ───────────────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
 return <h2 className="text-sm font-semibold text-gray-700 mb-3">{children}</h2>
}

function Card({ children, className='' }: { children: React.ReactNode; className?: string }) {
 return (
 <div className={`bg-white rounded-xl shadow-sm p-5 ${className}`}>
 {children}
 </div>
 )
}

function KpiCard({ label, value, sub, icon: Icon, trend, trendUp }: {
 label: string; value: string; sub?: string
 icon: React.ElementType; trend?: string; trendUp?: boolean
}) {
 return (
 <Card>
 <div className="flex items-start justify-between mb-3">
 <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
 <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
 <Icon className="h-4 w-4 text-gray-600" />
 </div>
 </div>
 <p className="text-2xl font-bold text-gray-900">{value}</p>
 {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
 {trend && (
 <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trendUp ?'text-emerald-600' :'text-red-500'}`}>
 {trendUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
 {trend}
 </div>
 )}
 </Card>
 )
}

function ChartEmpty({ message='No data available' }: { message?: string }) {
 return (
 <div className="flex items-center justify-center min-h-[140px]">
 <p className="text-xs text-gray-400">{message}</p>
 </div>
 )
}

const RADIAN = Math.PI / 180
function PieLabel(props: PieLabelRenderProps) {
 const { cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0 } = props
 if ((percent as number) < 0.07) return null
 const r = (innerRadius as number) + ((outerRadius as number) - (innerRadius as number)) * 0.5
 const x = (cx as number) + r * Math.cos(-(midAngle as number) * RADIAN)
 const y = (cy as number) + r * Math.sin(-(midAngle as number) * RADIAN)
 return (
 <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
 {`${((percent as number) * 100).toFixed(0)}%`}
 </text>
 )
}

const RANGES = ['7 days','30 days','3 months']

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
 const [range, setRange] = useState('30 days')
 const [revenueData, setRevenue] = useState<RevenueDataPoint[]>([])
 const [providers, setProviders] = useState<ProviderReport | null>(null)
 const [overview, setOverview] = useState<OverviewReport | null>(null)
 const [rideStatus, setRideStatus] = useState<RideStatusBreakdown | null>(null)
 const [jobCats, setJobCats] = useState<JobCategoryCount[] | null>(null)
 const [paymentRpt, setPaymentRpt] = useState<PaymentReport | null>(null)
 const [disputeRts, setDisputeRts] = useState<DisputeRatePoint[] | null>(null)

 useEffect(() => {
 const groupBy = range ==='3 months' ?'week' :'day'
 const from = new Date()
 from.setDate(from.getDate() - (range ==='7 days' ? 7 : range ==='30 days' ? 30 : 90))
 const fromStr = from.toISOString().split('T')[0]
 const dateParams = { from: fromStr }

 const trace = <T,>(label: string, p: Promise<T>) =>
 p.catch((err: unknown) => {
 const e = err as { status?: number; code?: string; message?: string }
 console.error(`[analytics] ${label} failed`, { status: e?.status, code: e?.code, message: e?.message, error: err })
 return null
 })

 Promise.all([
 trace('revenue',       getRevenueReport({ groupBy, from: fromStr })),
 trace('providers',     getProviderReport()),
 trace('overview',      getOverviewReport()),
 trace('rides/status',  getRideStatusReport(dateParams)),
 trace('jobs/cats',     getJobCategoryReport(dateParams)),
 trace('payments',      getPaymentReport(dateParams)),
 trace('disputes/rate', getDisputeRateReport(dateParams)),
 ]).then(([rev, prov, ov, rs, jc, pr, dr]) => {
 if (rev) setRevenue(rev.periods ?? [])
 if (prov) setProviders(prov)
 if (ov) setOverview(ov)
 setRideStatus(rs)
 setJobCats(Array.isArray(jc) ? jc : jc ? [] : null)
 setPaymentRpt(pr)
 setDisputeRts(Array.isArray(dr) ? dr : dr ? [] : null)
 })
 }, [range])

 // ── Derived: KPI strip ─────────────────────────────────────────────────────
 const totalRevGhs   = revenueData.reduce((s, d) => s + d.collectionsGhs, 0)
 const totalCommGhs  = revenueData.reduce((s, d) => s + d.commissionGhs, 0)
 const totalPayments = revenueData.reduce((s, d) => s + d.totalPayments, 0)
 const avgBookingGhs = totalPayments > 0 ? Math.round(totalRevGhs / totalPayments) : 0
 const totalUsers    = (overview?.registeredClients ?? 0) + (overview?.registeredDrivers ?? 0) + (overview?.registeredArtisans ?? 0)

 // ── Derived: Revenue area chart ────────────────────────────────────────────
 const revenueArea = revenueData.map(d => ({
 date: d.period.slice(5),
 'Collections (GHS)': Math.round(d.collectionsGhs),
 'Commission (GHS)':  Math.round(d.commissionGhs),
 }))

 // ── Derived: Daily payment volume ──────────────────────────────────────────
 const bookingVolume = revenueData.map(d => ({
 date: d.period.slice(5),
 'Payments':    d.totalPayments,
 'Successful':  d.successfulPayments,
 }))

 // ── Derived: Payments by day of week ──────────────────────────────────────
 const bookingBar = useMemo(() => {
 const totals: Record<string, { Payments: number; Successful: number }> = {}
 DOW_ORDER.forEach(d => { totals[d] = { Payments: 0, Successful: 0 } })
 revenueData.forEach(d => {
 const day = DOW[new Date(d.period).getDay()]
 if (totals[day]) {
 totals[day].Payments   += d.totalPayments
 totals[day].Successful += d.successfulPayments
 }
 })
 return DOW_ORDER.map(d => ({ day: d, ...totals[d] }))
 }, [revenueData])

 const bookingTotal = bookingBar.reduce((s, d) => s + d.Payments, 0)
 const peakDay = bookingBar.length
 ? bookingBar.reduce((a, b) => (b.Payments > a.Payments ? b : a))
 : null

 // ── Derived: Ride status donut ─────────────────────────────────────────────
 const rideStatusData = useMemo(() => {
 if (rideStatus) {
 return [
 { name:'Completed', value: rideStatus.completed, fill: C.green },
 { name:'Cancelled', value: rideStatus.cancelled, fill: C.red },
 { name:'Disputed', value: rideStatus.disputed, fill: C.amber },
 { name:'In Progress', value: rideStatus.inProgress, fill: C.blue },
 ].filter(d => d.value > 0)
 }
 if (overview) {
 return [
 { name:'Active Rides', value: overview.activeRides, fill: C.blue },
 { name:'Open Disputes', value: overview.openDisputes, fill: C.amber },
 ].filter(d => d.value > 0)
 }
 return []
 }, [rideStatus, overview])

 const rideStatusTotal = rideStatusData.reduce((s, d) => s + d.value, 0)
 const rideStatusLabel = rideStatus ?'Distribution of ride outcomes' :'Current snapshot from overview'

 // ── Derived: Job categories ────────────────────────────────────────────────
 const categoryData = useMemo(() => {
 if (!jobCats || jobCats.length === 0) return []
 return [...jobCats]
 .sort((a, b) => b.jobs - a.jobs)
 .slice(0, 6)
 .map((d, i) => ({ category: d.category, jobs: d.jobs, fill: CAT_COLORS[i % CAT_COLORS.length] }))
 }, [jobCats])

 const categoryTotal = categoryData.reduce((s, d) => s + d.jobs, 0)

 // ── Derived: Payment methods donut ────────────────────────────────────────
 const paymentMethods = useMemo(() => {
 if (!paymentRpt || paymentRpt.methods.length === 0) return []
 return paymentRpt.methods.map((d, i) => ({
 name: d.name,
 value: Math.round(d.percent),
 fill: PAY_COLORS[i % PAY_COLORS.length],
 }))
 }, [paymentRpt])

 const topPayment = paymentMethods.length
 ? paymentMethods.reduce((a, b) => b.value > a.value ? b : a)
 : null

 // ── Derived: Payment success rate ─────────────────────────────────────────
 const paymentSuccess = useMemo(() => {
 if (!paymentRpt || paymentRpt.dailyRates.length === 0) return []
 return paymentRpt.dailyRates.map(d => ({
 day: d.date.slice(5),
 success: Math.round(d.successRate * 10) / 10,
 failed: Math.round(d.failureRate * 10) / 10,
 }))
 }, [paymentRpt])

 const avgSuccessRate = paymentSuccess.length
 ? (paymentSuccess.reduce((s, d) => s + d.success, 0) / paymentSuccess.length).toFixed(1)
 : null

 // ── Derived: Dispute rate ─────────────────────────────────────────────────
 const disputeRateData = useMemo(() => {
 if (!disputeRts || disputeRts.length === 0) return []
 return disputeRts.map(d => ({ day: d.date.slice(5), rate: Math.round(d.rate * 100) / 100 }))
 }, [disputeRts])

 const avgDisputeRate = disputeRateData.length
 ? (disputeRateData.reduce((s, d) => s + d.rate, 0) / disputeRateData.length).toFixed(2)
 : null

 // ── Derived: Leaderboards ─────────────────────────────────────────────────
 const topDrivers = (providers?.drivers ?? []).map(d => ({
 name: d.name,
 rides: d.ratingCount,
 rating: d.avgRating ?? 0,
 earnings: `GHS ${d.totalEarningsGhs.toLocaleString('en-GH', { minimumFractionDigits: 0 })}`,
 }))

 const topArtisans = (providers?.artisans ?? []).map(a => ({
 name: a.name,
 jobs: a.completedJobsCount,
 rating: a.avgRating ?? 0,
 earnings: a.supplementRatePct != null ? `${a.supplementRatePct.toFixed(0)}% suppl.` : '-',
 }))

 return (
 <PageGuard permission="view_analytics">
 <div className="flex flex-col gap-6">

 {/* Header */}
 <div className="flex items-center justify-between">
 <div>
 <h1 className="text-xl font-bold text-gray-900">Analytics &amp; Insights</h1>
 <p className="text-sm text-gray-400 mt-0.5">Platform performance - Ashanti Region pilot</p>
 </div>
 <div className="flex items-center gap-3">
 <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
 {RANGES.map(r => (
 <button
 key={r}
 onClick={() => setRange(r)}
 className="text-xs px-3 py-1.5 rounded-md font-medium transition-colors"
 style={range === r ? { backgroundColor:'#fff', color: C.gold, boxShadow:'0 1px 3px rgba(0,0,0,0.08)' } : { color:'#6b7280' }}
 >
 {r}
 </button>
 ))}
 </div>
 <button className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
 <Download className="h-3.5 w-3.5" /> Export
 </button>
 </div>
 </div>

 {/* ── KPI strip ─────────────────────────────────────────────────────── */}
 <div className="grid grid-cols-5 gap-3">
 <KpiCard label="Total Collections" value={`GHS ${totalRevGhs.toLocaleString()}`} sub="Gross collected" icon={TrendingUp} />
 <KpiCard label="Commission Earned" value={`GHS ${totalCommGhs.toLocaleString()}`} sub="20% platform cut" icon={CreditCard} />
 <KpiCard label="Total Payments" value={totalPayments.toLocaleString()} sub="Payment transactions" icon={Repeat2} />
 <KpiCard label="Avg Transaction" value={`GHS ${avgBookingGhs}`} sub="Per payment" icon={TrendingUp} />
 <KpiCard label="Registered Users" value={totalUsers.toLocaleString()} sub="Clients + providers" icon={Users} />
 </div>

 {/* ── Revenue Trend ─────────────────────────────────────────────────── */}
 <Card>
 <div className="mb-4">
 <SectionTitle>Revenue Trend</SectionTitle>
 <p className="text-xs text-gray-400 -mt-2">Daily GHS collected vs commission earned</p>
 </div>
 {revenueArea.length > 0 ? (
 <ResponsiveContainer width="100%" height={220}>
 <AreaChart data={revenueArea} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
 <defs>
 <linearGradient id="gradRides" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor={C.gold} stopOpacity={0.18} />
 <stop offset="95%" stopColor={C.gold} stopOpacity={0} />
 </linearGradient>
 <linearGradient id="gradArtisan" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor={C.green} stopOpacity={0.18} />
 <stop offset="95%" stopColor={C.green} stopOpacity={0} />
 </linearGradient>
 </defs>
 <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
 <XAxis dataKey="date" tick={{ fontSize: 11, fill:'#9ca3af' }} interval={Math.floor(revenueArea.length / 7)} />
 <YAxis tick={{ fontSize: 11, fill:'#9ca3af' }} tickFormatter={v => `₵${v}`} />
 <Tooltip formatter={(v) => [`₵${Number(v).toLocaleString()}`,'']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
 <Legend wrapperStyle={{ fontSize: 12 }} />
 <Area type="monotone" dataKey="Collections (GHS)" stroke={C.gold} strokeWidth={2} fill="url(#gradRides)" dot={false} />
 <Area type="monotone" dataKey="Commission (GHS)" stroke={C.green} strokeWidth={2} fill="url(#gradArtisan)" dot={false} />
 </AreaChart>
 </ResponsiveContainer>
 ) : (
 <ChartEmpty message="No revenue data for this period" />
 )}
 </Card>

 {/* ── Daily Payment Volume + User Distribution ───────────────────────── */}
 <div className="grid grid-cols-3 gap-4">
 <Card className="col-span-2">
 <SectionTitle>Daily Payment Volume</SectionTitle>
 <p className="text-xs text-gray-400 -mt-2 mb-4">Total vs successful payments per day</p>
 {bookingVolume.length > 0 ? (
 <ResponsiveContainer width="100%" height={200}>
 <LineChart data={bookingVolume} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
 <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
 <XAxis dataKey="date" tick={{ fontSize: 11, fill:'#9ca3af' }} interval={Math.floor(bookingVolume.length / 7)} />
 <YAxis tick={{ fontSize: 11, fill:'#9ca3af' }} />
 <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
 <Legend wrapperStyle={{ fontSize: 12 }} />
 <Line type="monotone" dataKey="Payments" stroke={C.blue} strokeWidth={2} dot={false} />
 <Line type="monotone" dataKey="Successful" stroke={C.green} strokeWidth={2} dot={false} />
 </LineChart>
 </ResponsiveContainer>
 ) : (
 <ChartEmpty message="No payment data for this period" />
 )}
 </Card>

 <Card>
 <SectionTitle>Platform Users</SectionTitle>
 <p className="text-xs text-gray-400 -mt-2 mb-3">Registered users by type</p>
 <div className="flex flex-col items-center justify-center gap-2 py-4">
 <div className="text-4xl font-bold text-gray-900">{totalUsers.toLocaleString()}</div>
 <p className="text-xs text-gray-400">total registered</p>
 </div>
 <div className="grid grid-cols-2 gap-2 mt-1">
 <div className="bg-gray-50 rounded-lg p-3 text-center">
 <p className="text-xl font-bold text-gray-800">{(overview?.registeredDrivers ?? 0).toLocaleString()}</p>
 <p className="text-[11px] text-gray-400 mt-0.5">Drivers</p>
 </div>
 <div className="bg-gray-50 rounded-lg p-3 text-center">
 <p className="text-xl font-bold text-gray-800">{(overview?.registeredArtisans ?? 0).toLocaleString()}</p>
 <p className="text-[11px] text-gray-400 mt-0.5">Artisans</p>
 </div>
 <div className="bg-gray-50 rounded-lg p-3 text-center">
 <p className="text-xl font-bold text-amber-600">{(overview?.pendingVerifications ?? 0).toLocaleString()}</p>
 <p className="text-[11px] text-gray-400 mt-0.5">Pending Verif.</p>
 </div>
 <div className="bg-gray-50 rounded-lg p-3 text-center">
 <p className="text-xl font-bold text-red-500">{(overview?.openDisputes ?? 0).toLocaleString()}</p>
 <p className="text-[11px] text-gray-400 mt-0.5">Open Disputes</p>
 </div>
 </div>
 </Card>
 </div>

 {/* ── Payments by Day + Ride Status + Job Categories ────────────────── */}
 <div className="grid grid-cols-3 gap-4">

 <Card>
 <div className="flex items-start justify-between mb-1">
 <div>
 <SectionTitle>Payments by Day of Week</SectionTitle>
 <p className="text-xs text-gray-400 -mt-2">Aggregated from revenue period</p>
 </div>
 {bookingTotal > 0 && peakDay && (
 <div className="flex items-center gap-2 shrink-0">
 <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">Peak: {peakDay.day}</span>
 <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">{bookingTotal} total</span>
 </div>
 )}
 </div>
 {bookingTotal > 0 ? (
 <ResponsiveContainer width="100%" height={200}>
 <BarChart data={bookingBar} margin={{ top: 10, right: 5, left: -20, bottom: 0 }} barSize={10} barGap={2}>
 <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
 <XAxis dataKey="day" tick={{ fontSize: 11, fill:'#9ca3af' }} />
 <YAxis tick={{ fontSize: 11, fill:'#9ca3af' }} />
 <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
 <Legend wrapperStyle={{ fontSize: 11 }} />
 <Bar dataKey="Payments" fill={C.gold} radius={[3, 3, 0, 0]} />
 <Bar dataKey="Successful" fill={C.green} radius={[3, 3, 0, 0]} />
 </BarChart>
 </ResponsiveContainer>
 ) : (
 <ChartEmpty message="No payment data for this period" />
 )}
 </Card>

 <Card>
 <div className="flex items-start justify-between mb-1">
 <div>
 <SectionTitle>Ride Status Breakdown</SectionTitle>
 <p className="text-xs text-gray-400 -mt-2">{rideStatusLabel}</p>
 </div>
 {rideStatusTotal > 0 && (
 <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium shrink-0">
 {rideStatusTotal} rides
 </span>
 )}
 </div>
 {rideStatusData.length > 0 ? (
 <>
 <ResponsiveContainer width="100%" height={160}>
 <PieChart>
 <Pie data={rideStatusData} cx="50%" cy="50%" innerRadius={44} outerRadius={68} dataKey="value" labelLine={false} label={PieLabel}>
 <PieCenter position="center" content={({ viewBox }) => {
 const { cx = 0, cy = 0 } = (viewBox ?? {}) as { cx?: number; cy?: number }
 return (
 <text textAnchor="middle">
 <tspan x={cx} y={cy - 4} fontSize={15} fontWeight={700} fill="#111827">{rideStatusTotal}</tspan>
 <tspan x={cx} y={cy + 13} fontSize={9} fill="#9ca3af">total rides</tspan>
 </text>
 )
 }} />
 {rideStatusData.map((d, i) => <Cell key={i} fill={d.fill} />)}
 </Pie>
 <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
 </PieChart>
 </ResponsiveContainer>
 <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-1">
 {rideStatusData.map(d => (
 <div key={d.name} className="flex items-center gap-1.5 text-xs">
 <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.fill }} />
 <span className="text-gray-500 truncate">{d.name}</span>
 <span className="font-semibold text-gray-700 ml-auto">{d.value}</span>
 </div>
 ))}
 </div>
 </>
 ) : (
 <ChartEmpty message="No ride data available" />
 )}
 </Card>

 <Card>
 <div className="flex items-start justify-between mb-1">
 <div>
 <SectionTitle>Artisan Job Categories</SectionTitle>
 <p className="text-xs text-gray-400 -mt-2">Jobs completed per category</p>
 </div>
 {categoryTotal > 0 && (
 <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium shrink-0">
 {categoryTotal} jobs
 </span>
 )}
 </div>
 {categoryData.length > 0 ? (
 <ResponsiveContainer width="100%" height={200}>
 <BarChart data={categoryData} layout="vertical" margin={{ top: 8, right: 36, left: 10, bottom: 0 }} barSize={10}>
 <XAxis type="number" tick={{ fontSize: 10, fill:'#9ca3af' }} />
 <YAxis type="category" dataKey="category" tick={{ fontSize: 10, fill:'#6b7280' }} width={68} />
 <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
 <Bar dataKey="jobs" radius={[0, 3, 3, 0]}>
 {categoryData.map((d, i) => <Cell key={i} fill={d.fill} />)}
 <LabelList dataKey="jobs" position="right" style={{ fontSize: 10, fill:'#6b7280', fontWeight: 600 }} />
 </Bar>
 </BarChart>
 </ResponsiveContainer>
 ) : (
 <ChartEmpty message={jobCats === null ?'Endpoint not yet available' :'No job category data'} />
 )}
 </Card>
 </div>

 {/* ── Payment Methods + Success Rate + Dispute Rate ─────────────────── */}
 <div className="grid grid-cols-3 gap-4">

 <Card>
 <div className="flex items-start justify-between mb-1">
 <div>
 <SectionTitle>Payment Methods</SectionTitle>
 <p className="text-xs text-gray-400 -mt-2">Share of transactions by channel</p>
 </div>
 {topPayment && (
 <span className="text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0 whitespace-nowrap"
 style={{ backgroundColor: `${topPayment.fill}18`, color: topPayment.fill }}>
 Top: {topPayment.name}
 </span>
 )}
 </div>
 {paymentMethods.length > 0 ? (
 <>
 <ResponsiveContainer width="100%" height={160}>
 <PieChart>
 <Pie data={paymentMethods} cx="50%" cy="50%" innerRadius={44} outerRadius={68} dataKey="value" labelLine={false} label={PieLabel}>
 {topPayment && (
 <PieCenter position="center" content={({ viewBox }) => {
 const { cx = 0, cy = 0 } = (viewBox ?? {}) as { cx?: number; cy?: number }
 return (
 <text textAnchor="middle">
 <tspan x={cx} y={cy - 4} fontSize={13} fontWeight={700} fill="#111827">{topPayment.value}%</tspan>
 <tspan x={cx} y={cy + 12} fontSize={9} fill="#9ca3af">{topPayment.name}</tspan>
 </text>
 )
 }} />
 )}
 {paymentMethods.map((d, i) => <Cell key={i} fill={d.fill} />)}
 </Pie>
 <Tooltip formatter={(v, n) => [`${v}%`, n]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
 </PieChart>
 </ResponsiveContainer>
 <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-1">
 {paymentMethods.map(d => (
 <div key={d.name} className="flex items-center gap-1.5 text-xs">
 <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.fill }} />
 <span className="text-gray-500 truncate">{d.name}</span>
 <span className="font-semibold text-gray-700 ml-auto">{d.value}%</span>
 </div>
 ))}
 </div>
 </>
 ) : (
 <ChartEmpty message={paymentRpt === null ?'Endpoint not yet available' :'No payment data'} />
 )}
 </Card>

 <Card>
 <div className="flex items-start justify-between mb-1">
 <div>
 <SectionTitle>Payment Success Rate</SectionTitle>
 <p className="text-xs text-gray-400 -mt-2">Daily success vs failure</p>
 </div>
 {avgSuccessRate && (
 <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium shrink-0">
 Avg {avgSuccessRate}%
 </span>
 )}
 </div>
 {paymentSuccess.length > 0 ? (
 <ResponsiveContainer width="100%" height={200}>
 <BarChart data={paymentSuccess} margin={{ top: 5, right: 5, left: -25, bottom: 0 }} barSize={14}>
 <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
 <XAxis dataKey="day" tick={{ fontSize: 11, fill:'#9ca3af' }} />
 <YAxis tick={{ fontSize: 11, fill:'#9ca3af' }} domain={[90, 100]} unit="%" />
 <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v, n) => [`${v}%`, n]} />
 <Legend wrapperStyle={{ fontSize: 11 }} />
 <Bar dataKey="success" name="Success %" fill={C.green} radius={[3, 3, 0, 0]} />
 <Bar dataKey="failed" name="Failed %" fill={C.red} radius={[3, 3, 0, 0]} />
 </BarChart>
 </ResponsiveContainer>
 ) : (
 <ChartEmpty message={paymentRpt === null ?'Endpoint not yet available' :'No success rate data'} />
 )}
 </Card>

 <Card>
 <div className="flex items-start justify-between mb-1">
 <div>
 <SectionTitle>Dispute Rate</SectionTitle>
 <p className="text-xs text-gray-400 -mt-2">% of bookings raising a dispute</p>
 </div>
 <div className="flex items-center gap-2 shrink-0">
 {avgDisputeRate && (
 <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">Avg {avgDisputeRate}%</span>
 )}
 <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">Target &lt;3%</span>
 </div>
 </div>
 {disputeRateData.length > 0 ? (
 <ResponsiveContainer width="100%" height={200}>
 <AreaChart data={disputeRateData} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
 <defs>
 <linearGradient id="gradDispute" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor={C.amber} stopOpacity={0.25} />
 <stop offset="95%" stopColor={C.amber} stopOpacity={0} />
 </linearGradient>
 </defs>
 <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
 <XAxis dataKey="day" tick={{ fontSize: 11, fill:'#9ca3af' }} />
 <YAxis tick={{ fontSize: 11, fill:'#9ca3af' }} unit="%" domain={[0, 6]} />
 <Tooltip formatter={(v) => [`${v}%`,'Dispute rate']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
 <RechartRefLine y={3} stroke={C.red} strokeDasharray="4 2" strokeWidth={1.5}
 label={{ value:'3% threshold', fill: C.red, fontSize: 9, position:'insideTopRight' }} />
 <Area type="monotone" dataKey="rate" name="Dispute %" stroke={C.amber} strokeWidth={2} fill="url(#gradDispute)" dot={{ r: 3, fill: C.amber }} />
 </AreaChart>
 </ResponsiveContainer>
 ) : (
 <ChartEmpty message={disputeRts === null ?'Endpoint not yet available' :'No dispute rate data'} />
 )}
 </Card>
 </div>

 {/* ── Provider Leaderboards ─────────────────────────────────────────── */}
 <div className="grid grid-cols-2 gap-4">

 <Card>
 <SectionTitle>Top Drivers</SectionTitle>
 <p className="text-xs text-gray-400 -mt-2 mb-4">Ranked by total earnings</p>
 {topDrivers.length > 0 ? (
 <table className="w-full text-sm">
 <thead>
 <tr className="text-xs text-gray-400">
 <th className="text-left pb-2 font-medium">#</th>
 <th className="text-left pb-2 font-medium">Driver</th>
 <th className="text-right pb-2 font-medium">Ratings</th>
 <th className="text-right pb-2 font-medium">Rating</th>
 <th className="text-right pb-2 font-medium">Earnings</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-50">
 {topDrivers.map((d, i) => (
 <tr key={d.name} className="hover:bg-gray-50/60">
 <td className="py-2.5 text-xs font-bold text-gray-300 pr-3">{String(i + 1).padStart(2,'0')}</td>
 <td className="py-2.5">
 <div className="flex items-center gap-2">
 <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: C.blue }}>
 {d.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
 </div>
 <span className="font-medium text-gray-800">{d.name}</span>
 </div>
 </td>
 <td className="py-2.5 text-right font-semibold text-gray-700">{d.rides}</td>
 <td className="py-2.5 text-right">
 <span className={`text-xs font-semibold ${d.rating >= 4.5 ?'text-emerald-600' : d.rating >= 4.0 ?'text-amber-500' :'text-red-500'}`}>
 ★ {d.rating.toFixed(1)}
 </span>
 </td>
 <td className="py-2.5 text-right text-xs font-semibold" style={{ color: C.gold }}>{d.earnings}</td>
 </tr>
 ))}
 </tbody>
 </table>
 ) : (
 <ChartEmpty message="No driver data available" />
 )}
 </Card>

 <Card>
 <SectionTitle>Top Artisans</SectionTitle>
 <p className="text-xs text-gray-400 -mt-2 mb-4">Ranked by completed jobs</p>
 {topArtisans.length > 0 ? (
 <table className="w-full text-sm">
 <thead>
 <tr className="text-xs text-gray-400">
 <th className="text-left pb-2 font-medium">#</th>
 <th className="text-left pb-2 font-medium">Artisan</th>
 <th className="text-right pb-2 font-medium">Jobs</th>
 <th className="text-right pb-2 font-medium">Rating</th>
 <th className="text-right pb-2 font-medium">Suppl. Rate</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-50">
 {topArtisans.map((a, i) => (
 <tr key={a.name} className="hover:bg-gray-50/60">
 <td className="py-2.5 text-xs font-bold text-gray-300 pr-3">{String(i + 1).padStart(2,'0')}</td>
 <td className="py-2.5">
 <div className="flex items-center gap-2">
 <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: C.purple }}>
 {a.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
 </div>
 <span className="font-medium text-gray-800">{a.name}</span>
 </div>
 </td>
 <td className="py-2.5 text-right font-semibold text-gray-700">{a.jobs}</td>
 <td className="py-2.5 text-right">
 <span className={`text-xs font-semibold ${a.rating >= 4.5 ?'text-emerald-600' : a.rating >= 4.0 ?'text-amber-500' :'text-red-500'}`}>
 ★ {a.rating.toFixed(1)}
 </span>
 </td>
 <td className="py-2.5 text-right text-xs font-semibold" style={{ color: C.gold }}>{a.earnings}</td>
 </tr>
 ))}
 </tbody>
 </table>
 ) : (
 <ChartEmpty message="No artisan data available" />
 )}
 </Card>
 </div>

 </div>
 </PageGuard>
 )
}
