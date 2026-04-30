'use client'

import { useState, useEffect } from 'react'
import { PageGuard } from '@/components/common/page-guard'
import { Phone, MessageSquare, CheckCircle2, Clock, Send, Users, MapPin, CheckCircle, Car, Wrench, User, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/common/page-header'
import {
  getUssdStats, listUssdSessions, listUssdZones, toggleUssdZone, getSmsHistory, sendSms,
  type UssdStats, type UssdSession, type UssdZone, type SmsHistoryItem, type SmsAudience,
} from '@/lib/api'
import { ApiError } from '@/lib/api-client'

const outcomeColors: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700',
  timeout: 'bg-orange-100 text-orange-700',
  error: 'bg-red-100 text-red-700',
}

const SMS_MAX = 160

type AudienceOption = {
  value: SmsAudience
  label: string
  sub: string
  icon: React.ElementType
  active: string
  inactive: string
}

const AUDIENCES: AudienceOption[] = [
  { value: 'all_users', label: 'All Users', sub: 'Clients · Drivers · Artisans', icon: Users, active: ' bg-orange-50 text-orange-700 ring-1 ring-orange-100', inactive: ' text-gray-600 hover: hover:bg-gray-50' },
  { value: 'clients', label: 'Clients', sub: 'App users who book', icon: User, active: ' bg-blue-50 text-blue-700 ring-1 ring-blue-100', inactive: ' text-gray-600 hover: hover:bg-gray-50' },
  { value: 'drivers', label: 'Drivers', sub: 'Registered ride drivers', icon: Car, active: ' bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100', inactive: ' text-gray-600 hover: hover:bg-gray-50' },
  { value: 'artisans', label: 'Artisans', sub: 'Service providers', icon: Wrench, active: ' bg-purple-50 text-purple-700 ring-1 ring-purple-100', inactive: ' text-gray-600 hover: hover:bg-gray-50' },
]

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function KpiCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; color: string
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
            {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
          </div>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
            <Icon className="h-4 w-4 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function UssdPage() {
  const [stats, setStats] = useState<UssdStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  const [sessions, setSessions] = useState<UssdSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)

  const [zones, setZones] = useState<UssdZone[]>([])
  const [zonesLoading, setZonesLoading] = useState(true)
  const [togglingZoneId, setTogglingZoneId] = useState<string | null>(null)

  const [smsHistory, setSmsHistory] = useState<SmsHistoryItem[]>([])
  const [smsHistoryLoading, setSmsHistoryLoading] = useState(true)

  // SMS compose state
  const [smsAudience, setSmsAudience] = useState<SmsAudience>('all_users')
  const [smsBody, setSmsBody] = useState('')
  const [smsSending, setSmsSending] = useState(false)
  const [smsError, setSmsError] = useState('')
  const [smsSuccess, setSmsSuccess] = useState('')

  useEffect(() => {
    getUssdStats()
      .then(s => setStats(s))
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false))

    listUssdSessions({ limit: 50 })
      .then(res => setSessions(res.items))
      .catch(() => setSessions([]))
      .finally(() => setSessionsLoading(false))

    listUssdZones()
      .then(z => setZones(z))
      .catch(() => setZones([]))
      .finally(() => setZonesLoading(false))

    getSmsHistory()
      .then(h => setSmsHistory(h))
      .catch(() => setSmsHistory([]))
      .finally(() => setSmsHistoryLoading(false))
  }, [])

  async function handleToggleZone(zone: UssdZone) {
    setTogglingZoneId(zone.id)
    try {
      await toggleUssdZone(zone.id, !zone.isActive)
      setZones(prev => prev.map(z => z.id === zone.id ? { ...z, isActive: !z.isActive } : z))
    } catch {
      // silently fail — keep existing state
    } finally {
      setTogglingZoneId(null)
    }
  }

  async function handleSmsSend(e: React.FormEvent) {
    e.preventDefault()
    if (!smsBody.trim() || isOverLimit) return

    setSmsSending(true)
    setSmsError('')
    setSmsSuccess('')

    try {
      const data = await sendSms(smsAudience, `MyShop: ${smsBody.trim()}`)

      const label = AUDIENCES.find(a => a.value === smsAudience)?.label ?? smsAudience
      setSmsSuccess(`Sent to ${data.sent.toLocaleString()} of ${data.total.toLocaleString()} ${label} — ${data.failed} failed.`)

      // Optimistically prepend to history
      setSmsHistory(prev => [{
        id: Date.now().toString(),
        body: `MyShop: ${smsBody.trim()}`,
        audience: label,
        sentAt: new Date().toISOString(),
        delivered: data.sent ?? 0,
        failed: data.failed ?? 0,
      }, ...prev])

      setSmsBody('')
    } catch (err) {
      setSmsError(err instanceof ApiError ? err.message : 'Network error — could not reach the SMS service.')
    } finally {
      setSmsSending(false)
    }
  }

  const charsLeft = SMS_MAX - smsBody.length
  const isOverLimit = charsLeft < 0
  const selectedAud = AUDIENCES.find(a => a.value === smsAudience)!

  const activeZoneCount = zones.filter(z => z.isActive).length

  return (
     <PageGuard permission="view_ussd">
    <div>
      <PageHeader
        title="USSD Management"
        subtitle="Monitor and manage the USSD channel for feature phone users"
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        {statsLoading ? (
          [...Array(5)].map((_, i) => (
            <Card key={i}><CardContent className="p-5"><div className="h-14 bg-gray-100 rounded animate-pulse" /></CardContent></Card>
          ))
        ) : stats === null ? (
          <div className="col-span-full text-sm text-gray-400 bg-white rounded-xl shadow-sm p-5">
            USSD statistics not yet available.
          </div>
        ) : (
          <>
            <KpiCard label="Total Registrations" value={stats.totalRegistrations} icon={Phone} color="bg-slate-600" />
            <KpiCard label="Active Sessions" value={stats.activeSessions} sub="Right now" icon={MessageSquare} color="bg-blue-500" />
            <KpiCard label="Bookings Today" value={stats.bookingsToday} icon={CheckCircle2} color="bg-emerald-600" />
            <KpiCard label="Bookings This Month" value={stats.bookingsMonth} icon={CheckCircle2} color="bg-purple-500" />
            <KpiCard label="Session Completion" value={`${stats.completionRate}%`} sub="% leading to booking" icon={Clock} color="bg-amber-500" />
          </>
        )}
      </div>

      {/* Top categories */}
      {stats && stats.topCategories.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Top Service Categories via USSD</h3>
          <div className="flex flex-wrap gap-2">
            {stats.topCategories.map((cat, i) => (
              <div key={cat} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                <span className="w-5 h-5 rounded-full bg-slate-200 text-xs font-bold text-slate-600 flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <span className="text-sm font-medium text-gray-900">{cat}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Tabs defaultValue="sms">
        <TabsList className="bg-white mb-5">
          <TabsTrigger value="sms" className="gap-1.5"><Send className="h-3.5 w-3.5" /> Send SMS</TabsTrigger>
          <TabsTrigger value="sessions">Session Log</TabsTrigger>
          <TabsTrigger value="zones">Zone Management</TabsTrigger>
        </TabsList>

        {/* ── Send SMS ─────────────────────────────────────────────────────── */}
        <TabsContent value="sms">
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

            {/* Compose */}
            <div className="xl:col-span-2 bg-white rounded-xl shadow-sm p-5 flex flex-col gap-4">
              <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Send className="h-4 w-4" style={{ color: '#F5A623' }} />
                Compose SMS
                <span className="ml-auto text-[10px] text-gray-400 font-normal">via Arkesel</span>
              </h2>

              <form onSubmit={handleSmsSend} className="flex flex-col gap-4">
                <div>
                  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Send To</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {AUDIENCES.map(a => {
                      const Icon = a.icon
                      const isActive = smsAudience === a.value
                      return (
                        <button
                          key={a.value}
                          type="button"
                          onClick={() => setSmsAudience(a.value)}
                          className={`flex items-center gap-2.5 rounded-lg p-2.5 text-left transition-all ${isActive ? a.active : a.inactive}`}
                        >
                          <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${isActive ? 'bg-white/60' : 'bg-gray-100'}`}>
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold leading-tight">{a.label}</p>
                            <p className="text-[10px] opacity-70 leading-tight mt-0.5 truncate">{a.sub}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Message</Label>
                    <span className={`text-[11px] font-medium tabular-nums ${isOverLimit ? 'text-red-500' : charsLeft <= 20 ? 'text-orange-500' : 'text-gray-400'}`}>
                      {charsLeft} chars left
                    </span>
                  </div>
                  <Textarea
                    placeholder={`Type your message… "MyShop:" prefix is added automatically.`}
                    rows={4}
                    value={smsBody}
                    onChange={e => setSmsBody(e.target.value)}
                    className={` resize-none ${isOverLimit ? ' focus-visible:ring-red-200' : ''}`}
                  />
                  <p className="text-[11px] text-gray-400">
                    Standard SMS: 160 characters. Messages over the limit are split and billed as multiple SMS.
                  </p>
                </div>

                {smsBody.trim() && (
                  <div className="bg-slate-900 rounded-lg p-3.5 text-white">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1.5">Preview</p>
                    <p className="text-[11px] text-slate-200 leading-relaxed">
                      <span className="text-slate-400">MyShop: </span>{smsBody}
                    </p>
                    <div className="flex items-center gap-1.5 mt-2">
                      <selectedAud.icon className="h-3 w-3 text-slate-400" />
                      <p className="text-[10px] text-slate-400">{selectedAud.label} · Arkesel SMS</p>
                    </div>
                  </div>
                )}

                {smsError && (
                  <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{smsError}</p>
                )}
                {smsSuccess && (
                  <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
                    <CheckCircle className="h-3.5 w-3.5 shrink-0" /> {smsSuccess}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={!smsBody.trim() || isOverLimit || smsSending}
                  className="w-full gap-2 text-white"
                  style={{ backgroundColor: '#F5A623' }}
                >
                  {smsSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {smsSending ? 'Sending…' : `Send to ${selectedAud.label}`}
                </Button>
              </form>
            </div>

            {/* SMS History */}
            <div className="xl:col-span-3 bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 bg-gray-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">SMS History</h2>
                <span className="text-xs text-gray-400">
                  {smsHistoryLoading ? <Loader2 className="h-3 w-3 animate-spin inline" /> : `${smsHistory.length} sent`}
                </span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50">
                    <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Message</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Audience</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sent</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Delivered</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Failed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {smsHistoryLoading ? (
                    [...Array(3)].map((_, i) => (
                      <TableRow key={i}>
                        {[...Array(5)].map((_, j) => (
                          <TableCell key={j}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : smsHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-10 text-gray-400 text-sm">No SMS history</TableCell>
                    </TableRow>
                  ) : (
                    smsHistory.map(s => (
                      <TableRow key={s.id} className="hover:bg-gray-50">
                        <TableCell className="max-w-xs">
                          <p className="text-sm text-gray-800 truncate">{s.body}</p>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full whitespace-nowrap">{s.audience}</span>
                        </TableCell>
                        <TableCell className="text-xs text-gray-500 whitespace-nowrap">{formatDateTime(s.sentAt)}</TableCell>
                        <TableCell className="text-right text-sm font-medium text-emerald-600">{s.delivered.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-sm font-medium text-red-500">{s.failed}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* ── Session Log ──────────────────────────────────────────────────── */}
        <TabsContent value="sessions">
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone (Masked)</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Timestamp</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Flow</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Outcome</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Zone</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessionsLoading ? (
                  [...Array(6)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(5)].map((_, j) => (
                        <TableCell key={j}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : sessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-gray-400 text-sm">No USSD sessions found</TableCell>
                  </TableRow>
                ) : (
                  sessions.map(session => (
                    <TableRow key={session.id} className="hover:bg-gray-50">
                      <TableCell className="font-mono text-sm">{session.phone}</TableCell>
                      <TableCell className="text-sm text-gray-500 whitespace-nowrap">{formatDateTime(session.timestamp)}</TableCell>
                      <TableCell>
                        <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full capitalize">
                          {session.flow.replace('_', ' ')}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${outcomeColors[session.outcome] ?? 'bg-gray-100 text-gray-600'}`}>
                          {session.outcome}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">{session.zone}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Zone Management ──────────────────────────────────────────────── */}
        <TabsContent value="zones">
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Zone ID</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Zone Name</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Bookings This Month</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zonesLoading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(5)].map((_, j) => (
                        <TableCell key={j}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : zones.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-gray-400 text-sm">No zones configured</TableCell>
                  </TableRow>
                ) : (
                  zones.map(zone => (
                    <TableRow key={zone.id} className="hover:bg-gray-50">
                      <TableCell className="font-mono text-sm text-gray-500">{zone.id}</TableCell>
                      <TableCell className="font-medium text-sm">{zone.name}</TableCell>
                      <TableCell>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${zone.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                          {zone.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">{zone.bookingsThisMonth}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7"
                            disabled={togglingZoneId === zone.id}
                            onClick={() => handleToggleZone(zone)}
                          >
                            {togglingZoneId === zone.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : zone.isActive ? 'Deactivate' : 'Activate'
                            }
                          </Button>
                          <Button size="sm" variant="ghost" className="text-xs h-7">Edit</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                {zonesLoading ? '—' : `${activeZoneCount} active zone${activeZoneCount !== 1 ? 's' : ''} of ${zones.length} total`}
              </p>
              <Button size="sm" className="gap-1.5 text-xs text-white" style={{ backgroundColor: '#F5A623' }}>
                <MapPin className="h-3.5 w-3.5" /> Add Zone
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  </PageGuard>
  )
}
