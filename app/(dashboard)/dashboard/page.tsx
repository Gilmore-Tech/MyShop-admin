'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import {
  Users, Car, Wrench, AlertTriangle,
  CheckCircle2, Phone, Navigation, TriangleAlert, ChevronRight,
  UserCheck, TrendingUp, CheckCheck, Scale,
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
      return { statusText: 'completed', statusColor: 'text-emerald-600 bg-emerald-50' }
    case 'ride_cancelled':
      return { statusText: 'cancelled', statusColor: 'text-gray-500 bg-gray-100' }
    case 'ride_disputed':
    case 'job_disputed':
      return { statusText: 'disputed', statusColor: 'text-red-600 bg-red-50' }
    case 'escrow_released':
      return { statusText: 'released', statusColor: 'text-blue-600 bg-blue-50' }
    case 'sos_triggered':
      return { statusText: 'emergency', statusColor: 'text-red-600 bg-red-50' }
    case 'kyc_submitted':
      return { statusText: 'pending', statusColor: 'text-amber-600 bg-amber-50' }
    case 'dispute_resolved':
      return { statusText: 'resolved', statusColor: 'text-blue-600 bg-blue-50' }
    default:
      return { statusText: 'event', statusColor: 'text-gray-500 bg-gray-100' }
  }
}

function actorInitials(name: string | null): string {
  if (!name) return '??'
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function actorColor(role: ActivityItem['actorRole']): string {
  if (role === 'driver') return '#46535D'
  if (role === 'artisan') return '#8B5CF6'
  if (role === 'system') return '#9CA3AF'
  return '#F5A623'
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
  { label: 'Payment API Provider', value: 'Active', ok: true },
  { label: 'KYC Documents', value: 'Online', ok: true },
  { label: 'OTP Engine', value: 'Operational', ok: true },
  { label: 'KYC Agent Grade', value: 'Tier 2 Grade 3', ok: true },
  { label: 'Hours of Running', value: 'Officer Log', ok: true },
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

  const kpis = [
    // Row 1 — registrations & live ops
    { label: 'Registered Clients',  value: overview ? overview.registeredClients.toLocaleString()  : '—', icon: Users,         color: 'text-blue-600',    bg: 'bg-blue-50',    alert: false },
    { label: 'Registered Drivers',  value: overview ? overview.registeredDrivers.toLocaleString()  : '—', icon: Car,           color: 'text-slate-600',   bg: 'bg-slate-100',  alert: false },
    { label: 'Registered Artisans', value: overview ? overview.registeredArtisans.toLocaleString() : '—', icon: Wrench,        color: 'text-violet-600',  bg: 'bg-violet-50',  alert: false },
    { label: 'Active Trips',        value: overview ? overview.activeRides.toString()               : '—', icon: Navigation,    color: 'text-sky-600',     bg: 'bg-sky-50',     alert: false },
    { label: 'Active Jobs',         value: overview ? overview.activeJobs.toString()                : '—', icon: UserCheck,     color: 'text-orange-500',  bg: 'bg-orange-50',  alert: false },
    // Row 2 — revenue & health
    { label: 'Commission (month)',  value: overview ? fmtGhs(overview.commissionRevenue.monthGhs)   : '—', icon: TrendingUp,    color: 'text-emerald-600', bg: 'bg-emerald-50', alert: false },
    { label: 'Commission (week)',   value: overview ? fmtGhs(overview.commissionRevenue.weekGhs)    : '—', icon: CheckCheck,    color: 'text-emerald-500', bg: 'bg-emerald-50', alert: false },
    { label: 'Payment Success',     value: overview ? overview.paymentSuccessRatePct + '%'          : '—', icon: CheckCircle2,  color: 'text-teal-600',    bg: 'bg-teal-50',    alert: false },
    { label: 'Pending KYC',         value: overview ? overview.pendingVerifications.toString()      : '—', icon: AlertTriangle, color: 'text-amber-500',   bg: 'bg-amber-50',   alert: (overview?.pendingVerifications ?? 0) > 0 },
    { label: 'Open Disputes',       value: overview ? overview.openDisputes.toString()              : '—', icon: Scale,         color: 'text-red-500',     bg: 'bg-red-50',     alert: (overview?.openDisputes ?? 0) > 0 },
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
    <div className="flex flex-col gap-5 pb-0 -mb-6">

      {/* ── Page title ───────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Operations Overview</h1>
        <p className="text-sm text-gray-400 mt-0.5">Real-time snapshot — Ashanti Region pilot</p>
      </div>

      {/* ── KPI strip ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-3 auto-rows-fr">
        {kpis.map(kpi => {
          const Icon = kpi.icon
          return (
            <div key={kpi.label} className="bg-white rounded-xl shadow-sm p-4 flex items-start justify-between relative">
              <div>
                <p className="text-xs text-gray-400 font-medium mb-1">{kpi.label}</p>
                <p className={`text-2xl font-bold ${loadingKpis ? 'text-gray-300' : 'text-gray-900'}`}>{kpi.value}</p>
              </div>
              <div className={`w-9 h-9 rounded-lg ${kpi.bg} flex items-center justify-center shrink-0`}>
                <Icon className={`h-4.5 w-4.5 ${kpi.color}`} />
              </div>
              {kpi.alert && (
                <span className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 rounded-full bg-red-500" />
              )}
            </div>
          )
        })}
      </div>

      {/* ── Row 2: Growth Trends + Compliance ───────────────────────────── */}
      <div className="grid grid-cols-5 gap-4">

        {/* Growth Trends */}
        <div className="col-span-3 bg-white rounded-xl shadow-sm p-5">
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
        <div className="col-span-2 bg-white rounded-xl shadow-sm p-5 flex flex-col gap-4">
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
      <div className="grid grid-cols-5 gap-4">

        {/* Recent Platform Activity */}
        <div className="col-span-3 bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Recent Platform Activity</h2>
              <p className="text-xs text-gray-400">Real-time events across Ashanti region</p>
            </div>
            <Link href="/rides" className="text-xs font-medium" style={{ color: '#F5A623' }}>View Full Logs</Link>
          </div>

          {loadingActivity ? (
            <div className="divide-y divide-gray-50">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="px-5 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-gray-100 rounded animate-pulse w-32" />
                    <div className="h-2.5 bg-gray-100 rounded animate-pulse w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : activity === null ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-gray-400">Activity feed not yet available</p>
            </div>
          ) : activity.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-gray-400">No recent activity</p>
            </div>
          ) : (
            <table className="w-full">
              <tbody className="divide-y divide-gray-50">
                {activity.map(item => {
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
                            <p className="text-sm font-medium text-gray-800">{item.actorName ?? 'System'}</p>
                            <p className="text-xs text-gray-400">{roleLabel}</p>
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
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Safety Console */}
        <div className="col-span-2 bg-white rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Safety Console</h2>
              <p className="text-xs text-gray-400">Critical alerts requiring immediate action</p>
            </div>
            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE
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
                .map(alert => (
                  <div
                    key={alert.id}
                    className={`px-4 py-3.5 ${alert.type === 'sos' ? 'bg-red-50/60' : ''}`}
                  >
                    {alert.type === 'sos' && (
                      <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded uppercase tracking-wide mb-2 inline-block">
                        ⚠ EMERGENCY SOS
                      </span>
                    )}
                    {alert.type === 'welfare_check' && (
                      <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded uppercase tracking-wide mb-2 inline-block">
                        WELFARE CHECK
                      </span>
                    )}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5
                          ${alert.type === 'sos' ? 'bg-red-100' : 'bg-amber-100'}`}>
                          {alert.type === 'sos'
                            ? <Phone className="h-3.5 w-3.5 text-red-500" />
                            : <Navigation className="h-3.5 w-3.5 text-amber-500" />
                          }
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-semibold truncate ${alert.type === 'sos' ? 'text-red-700' : 'text-gray-800'}`}>
                            {alert.actorName ?? 'Unknown'}{alert.actorRole ? ` (${alert.actorRole.charAt(0).toUpperCase() + alert.actorRole.slice(1)})` : ''}
                          </p>
                          {alert.locationDescription && (
                            <p className="text-xs text-gray-500 mt-0.5">Located: {alert.locationDescription}</p>
                          )}
                          {alert.bookingId && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {alert.bookingType === 'ride' ? 'Ride' : 'Job'} #{alert.bookingId.slice(-6).toUpperCase()}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-0.5">{timeAgo(alert.occurredAt)}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleAcknowledge(alert.id)}
                        className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors
                          ${alert.type === 'sos'
                            ? 'bg-red-500 text-white hover:bg-red-600'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                      >
                        {alert.type === 'sos' ? 'Respond' : 'Acknowledge'}
                      </button>
                    </div>
                  </div>
                ))
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
