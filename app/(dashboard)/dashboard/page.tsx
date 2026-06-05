'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import {
  Users, Car, Wrench, AlertTriangle,
  CheckCircle2, Phone, Navigation, TriangleAlert, ChevronRight,
  UserCheck, TrendingUp, Scale,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  getOverviewReport, getRevenueReport, getRecentActivity, getEmergencyAlerts, acknowledgeEmergency,
  type OverviewReport, type RevenueDataPoint, type ActivityItem, type EmergencyAlert,
} from '@/lib/api'

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

function actorColor(_role: ActivityItem['actorRole']): string {
  // Avatars are monochrome — single neutral gray regardless of role.
  return '#9CA3AF'
}

function formatAmount(pesewas: number): string {
  return 'GHS ' + (pesewas / 100).toFixed(2)
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ─── Footer status bar ────────────────────────────────────────────────────────
const serviceStatus = [
  { label: 'Payments', value: 'Operational' },
  { label: 'KYC Service', value: 'Online' },
  { label: 'OTP Engine', value: 'Operational' },
]

// ─── Avatar circle ────────────────────────────────────────────────────────────
function Avatar({ initials, color = '#F5A623' }: { initials: string; color?: string }) {
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
      style={{ backgroundColor: color }}
    >
      {initials}
    </div>
  )
}

// ─── Primary "pulse" stat card ────────────────────────────────────────────────
function StatCard({
  icon: Icon, label, value, sub, bg, color, loading, compact = false,
}: {
  icon: React.ElementType; label: string; value: string; sub?: string | null
  bg: string; color: string; loading: boolean; compact?: boolean
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4 flex items-start gap-3">
      <div className={`${compact ? 'w-8 h-8' : 'w-9 h-9'} rounded-lg ${bg} flex items-center justify-center shrink-0`}>
        <Icon className={`${compact ? 'h-4 w-4' : 'h-[18px] w-[18px]'} ${color}`} />
      </div>
      <div className="min-w-0">
        <p className={`${compact ? 'text-lg' : 'text-2xl'} font-bold leading-tight ${loading ? 'text-gray-300' : 'text-gray-900'}`}>{value}</p>
        <p className="text-xs text-gray-400 font-medium mt-0.5 truncate">{label}</p>
        {sub && <p className="text-[11px] text-emerald-600 font-medium mt-1">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Actionable "needs attention" card ────────────────────────────────────────
function AttentionCard({
  icon: Icon, label, value, href, cta, accent, loading,
}: {
  icon: React.ElementType; label: string; value: number; href: string
  cta: string; accent: 'red' | 'amber'; loading: boolean
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
      </div>
      <span className={`flex items-center gap-0.5 text-xs font-semibold shrink-0 ${s.cta}`}>
        <span className="hidden sm:inline">{active ? cta : 'All clear'}</span>
        <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
      </span>
    </Link>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [overview, setOverview] = useState<OverviewReport | null>(null)
  const [revenueData, setRevenueData] = useState<RevenueDataPoint[]>([])
  const [activity, setActivity] = useState<ActivityItem[] | null>(null)
  const [emergencies, setEmergencies] = useState<EmergencyAlert[] | null>(null)
  const [loadingKpis, setLoadingKpis] = useState(true)
  const [loadingActivity, setLoadingActivity] = useState(true)
  const [loadingEmergencies, setLoadingEmergencies] = useState(true)

  useEffect(() => {
    Promise.allSettled([getOverviewReport(), getRevenueReport({ groupBy: 'day' })])
      .then(([ovResult, revResult]) => {
        if (ovResult.status === 'fulfilled') setOverview(ovResult.value)
        if (revResult.status === 'fulfilled') setRevenueData(revResult.value.periods ?? [])
      })
      .finally(() => setLoadingKpis(false))
  }, [])

  useEffect(() => {
    getRecentActivity(10)
      .then(setActivity)
      .catch(() => setActivity(null))
      .finally(() => setLoadingActivity(false))
  }, [])

  useEffect(() => {
    getEmergencyAlerts()
      .then(setEmergencies)
      .catch(() => setEmergencies(null))
      .finally(() => setLoadingEmergencies(false))
  }, [])

  function handleAcknowledge(id: string) {
    acknowledgeEmergency(id).then(() => {
      setEmergencies(prev => prev
        ? prev.map(e => e.id === id ? { ...e, acknowledgedAt: new Date().toISOString() } : e)
        : prev
      )
    }).catch(() => {})
  }

  function fmtGhs(ghs: number) {
    if (ghs >= 1_000_000) return 'GHS ' + (ghs / 1_000_000).toFixed(1) + 'M'
    if (ghs >= 1_000)     return 'GHS ' + (ghs / 1_000).toFixed(1) + 'k'
    return 'GHS ' + ghs.toFixed(0)
  }

  // Actionable items — surfaced first so admins see what needs doing.
  const attention = [
    { label: 'Pending KYC reviews', value: overview?.pendingVerifications ?? 0, href: '/verifications', icon: AlertTriangle, accent: 'amber' as const, cta: 'Review queue' },
    { label: 'Open disputes',       value: overview?.openDisputes ?? 0,         href: '/disputes',      icon: Scale,         accent: 'red'   as const, cta: 'Resolve' },
  ]

  // The live pulse of the platform — 4 metrics that matter most right now.
  const primaryKpis = [
    { label: 'Active trips',   value: overview ? overview.activeRides.toString()             : '-', sub: null, icon: Navigation,   color: 'text-gray-600', bg: 'bg-gray-100' },
    { label: 'Active jobs',    value: overview ? overview.activeJobs.toString()              : '-', sub: null, icon: UserCheck,    color: 'text-gray-600', bg: 'bg-gray-100' },
    { label: 'Commission (month)', value: overview ? fmtGhs(overview.commissionRevenue.monthGhs) : '-', sub: overview ? `${fmtGhs(overview.commissionRevenue.weekGhs)} this week` : null, icon: TrendingUp, color: 'text-gray-600', bg: 'bg-gray-100' },
    { label: 'Payment success', value: overview ? overview.paymentSuccessRatePct + '%'        : '-', sub: null, icon: CheckCircle2, color: 'text-gray-600', bg: 'bg-gray-100' },
  ]

  // Secondary context — registration scale, lower visual weight.
  const registrations = [
    { label: 'Clients',  value: overview ? overview.registeredClients.toLocaleString()  : '-', icon: Users,  color: 'text-gray-600', bg: 'bg-gray-100' },
    { label: 'Drivers',  value: overview ? overview.registeredDrivers.toLocaleString()  : '-', icon: Car,    color: 'text-gray-600', bg: 'bg-gray-100' },
    { label: 'Artisans', value: overview ? overview.registeredArtisans.toLocaleString() : '-', icon: Wrench, color: 'text-gray-600', bg: 'bg-gray-100' },
  ]

  const growthData = revenueData.slice(-14).map(d => ({
    date: d.period.slice(5),
    'Collections (GHS)': Math.round(d.collectionsGhs),
    'Commission (GHS)':  Math.round(d.commissionGhs),
    'Payouts (GHS)':     Math.round(d.payoutsGhs),
  }))

  const totalProviders = (overview?.registeredDrivers ?? 0) + (overview?.registeredArtisans ?? 0)
  const compliance = {
    verified: overview ? totalProviders - overview.pendingVerifications : 0,
    total: totalProviders,
    kyc: overview?.pendingVerifications ?? 0,
    clearance: overview
      ? Math.round(((totalProviders - overview.pendingVerifications) / Math.max(totalProviders, 1)) * 100)
      : 0,
  }

  return (
    <div className="flex flex-col gap-6 pb-0 -mb-6">

      {/* ── Page title ───────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Operations Overview</h1>
        <p className="text-sm text-gray-400 mt-0.5">Real-time snapshot - Ashanti Region pilot</p>
      </div>

      {/* ── Needs attention — actionable items first ─────────────────────── */}
      <section className="space-y-2.5">
        <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Needs attention</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {attention.map(a => (
            <AttentionCard
              key={a.label}
              icon={a.icon} label={a.label} value={a.value}
              href={a.href} cta={a.cta} accent={a.accent} loading={loadingKpis}
            />
          ))}
        </div>
      </section>

      {/* ── Today at a glance — live pulse ───────────────────────────────── */}
      <section className="space-y-2.5">
        <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Today at a glance</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {primaryKpis.map(kpi => (
            <StatCard
              key={kpi.label}
              icon={kpi.icon} label={kpi.label} value={kpi.value} sub={kpi.sub}
              bg={kpi.bg} color={kpi.color} loading={loadingKpis}
            />
          ))}
        </div>
      </section>

      {/* ── Registered users — secondary context ─────────────────────────── */}
      {/* <section className="space-y-2.5">
        <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Registered users</h2>
        <div className="grid grid-cols-3 gap-3">
          {registrations.map(r => (
            <StatCard
              key={r.label}
              icon={r.icon} label={r.label} value={r.value}
              bg={r.bg} color={r.color} loading={loadingKpis} compact
            />
          ))}
        </div>
      </section> */}

      {/* ── Row 2: Growth Trends + Compliance ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Growth Trends */}
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Growth Trends</h2>
              <p className="text-xs text-gray-400">Riding volume in Ashanti (all requests)</p>
            </div>
            <div className="flex items-center gap-1.5">
              {['7 days', '30 days'].map((t, i) => (
                <button
                  key={t}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${i === 0 ? 'text-white' : 'text-gray-400 hover:bg-gray-50'}`}
                  style={i === 0 ? { backgroundColor: '#F5A623' } : {}}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={growthData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} interval={2} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="Collections (GHS)" stroke="#F5A623" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Commission (GHS)"  stroke="#10B981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Payouts (GHS)"     stroke="#3B82F6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Compliance Status */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-5 flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Compliance Status</h2>
            <p className="text-xs text-gray-400">KYC &amp; Police Clearance</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-500">Artisans Verified</span>
              <span className="text-sm font-bold text-gray-800">{compliance.verified.toLocaleString()}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-2 rounded-full"
                style={{ width: `${(compliance.verified / Math.max(compliance.total, 1)) * 100}%`, backgroundColor: '#F5A623' }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">{compliance.verified} of {compliance.total} total providers</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-500">KYC Clearance</span>
              <span className="text-sm font-bold text-gray-800">{compliance.clearance}%</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${compliance.clearance}%` }} />
            </div>
          </div>

          <div className="rounded-lg bg-amber-50 px-3 py-2.5 flex items-start gap-2.5">
            <TriangleAlert className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-700">{compliance.kyc} Pending KYC Reviews</p>
              <p className="text-xs text-amber-600 mt-0.5">Manual review required before activation.</p>
            </div>
          </div>

          <Link href="/verifications" className="flex items-center gap-1 text-xs font-medium mt-auto" style={{ color: '#F5A623' }}>
            View Verification Queue <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* ── Row 3: Activity + Safety Console ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Recent Platform Activity */}
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Recent Platform Activity</h2>
              <p className="text-xs text-gray-400">Real-time events across Ashanti region</p>
            </div>
            <Link href="/rides" className="text-xs font-medium" style={{ color: '#F5A623' }}>View Full Logs</Link>
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
                          <Avatar
                            initials={actorInitials(item.actorName)}
                            color={actorColor(item.actorRole)}
                          />
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
                            {formatAmount(item.amountPesewas)}
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

        {/* Safety Console */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm overflow-hidden flex flex-col">
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
            ) : emergencies.filter(e => !e.acknowledgedAt).length === 0 ? (
              <div className="px-4 py-8 text-center">
                <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                </div>
                <p className="text-sm font-medium text-gray-700">All clear</p>
                <p className="text-xs text-gray-400 mt-0.5">No active emergencies</p>
              </div>
            ) : (
              emergencies
                .filter(e => !e.acknowledgedAt)
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
                      <button
                        onClick={() => handleAcknowledge(alert.id)}
                        className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors ${
                          sos
                            ? 'bg-red-500 text-white hover:bg-red-600'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {sos ? 'Respond' : 'Ack'}
                      </button>
                    </div>
                  )
                })
            )}
          </div>

          <div className="px-5 py-3">
            <Link href="/disputes" className="flex items-center gap-1 text-xs font-medium" style={{ color: '#F5A623' }}>
              View all Safety Logs <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* ── Footer status bar ────────────────────────────────────────────── */}
      <div className="-mx-6 px-6 py-2.5 flex items-center justify-between bg-white sticky bottom-0">
        <div className="flex items-center gap-6">
          {serviceStatus.map(s => (
            <div key={s.label} className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs text-gray-500">{s.label}:</span>
              <span className="text-xs font-semibold text-gray-700">{s.value}</span>
            </div>
          ))}
        </div>
        <span className="text-xs text-gray-400 font-mono">Update: v2.4.1</span>
      </div>
    </div>
  )
}
