'use client'

import { useCallback, useState, useEffect } from 'react'
import { PageGuard } from '@/components/common/page-guard'
import { Phone, MessageSquare, CheckCircle2, Clock, Send, Users, MapPin, CheckCircle, Car, Wrench, User, Loader2 } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/common/page-header'
import { FilterBar } from '@/components/common/filter-bar'
import { DataTable, type DataTableColumn } from '@/components/common/data-table'
import { EmptyState } from '@/components/common/empty-state'
import { StatCard } from '@/components/common/stat-card'
import { StatusBadge } from '@/components/common/status-badge'
import {
  getUssdStats, listUssdSessions, listUssdZones, toggleUssdZone, getSmsHistory, sendSms,
  type UssdStats, type UssdSession, type UssdZone, type SmsHistoryItem, type SmsAudience,
} from '@/lib/api'
import { ApiError, userSafeAdminError } from '@/lib/api-client'

const outcomeColors: Record<string, string> = {
  completed: 'bg-gray-100 text-gray-600',
  timeout: 'bg-gray-100 text-gray-600',
  error: 'bg-gray-100 text-gray-600',
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
  { value: 'all_users', label: 'All users', sub: 'Clients - Drivers - Artisans', icon: Users, active: ' bg-gray-100 text-gray-600 ring-1 ring-gray-200', inactive: ' text-gray-600 hover: hover:bg-gray-50' },
  { value: 'clients', label: 'Clients', sub: 'App users who book', icon: User, active: ' bg-gray-100 text-gray-600 ring-1 ring-gray-200', inactive: ' text-gray-600 hover: hover:bg-gray-50' },
  { value: 'drivers', label: 'Drivers', sub: 'Registered ride drivers', icon: Car, active: ' bg-gray-100 text-gray-600 ring-1 ring-gray-200', inactive: ' text-gray-600 hover: hover:bg-gray-50' },
  { value: 'artisans', label: 'Artisans', sub: 'Service providers', icon: Wrench, active: ' bg-gray-100 text-gray-600 ring-1 ring-gray-200', inactive: ' text-gray-600 hover: hover:bg-gray-50' },
]

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function UssdPage() {
  const [stats, setStats] = useState<UssdStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  const [sessions, setSessions] = useState<UssdSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [sessionsError, setSessionsError] = useState<string | null>(null)

  const [zones, setZones] = useState<UssdZone[]>([])
  const [zonesLoading, setZonesLoading] = useState(true)
  const [zonesError, setZonesError] = useState<string | null>(null)
  const [togglingZoneId, setTogglingZoneId] = useState<string | null>(null)

  const [smsHistory, setSmsHistory] = useState<SmsHistoryItem[]>([])
  const [smsHistoryLoading, setSmsHistoryLoading] = useState(true)
  const [smsHistoryError, setSmsHistoryError] = useState<string | null>(null)

  // SMS compose state
  const [smsAudience, setSmsAudience] = useState<SmsAudience>('all_users')
  const [smsBody, setSmsBody] = useState('')
  const [smsSending, setSmsSending] = useState(false)
  const [smsError, setSmsError] = useState('')
  const [smsSuccess, setSmsSuccess] = useState('')

  const loadStats = useCallback(() => {
    setStatsLoading(true)
    getUssdStats()
      .then(s => setStats(s))
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false))
  }, [])

  const loadSessions = useCallback(() => {
    setSessionsLoading(true)
    setSessionsError(null)
    listUssdSessions({ limit: 50 })
      .then(res => setSessions(res.items))
      .catch(err => setSessionsError(userSafeAdminError(err, 'Failed to load USSD sessions.')))
      .finally(() => setSessionsLoading(false))
  }, [])

  const loadZones = useCallback(() => {
    setZonesLoading(true)
    setZonesError(null)
    listUssdZones()
      .then(z => setZones(z))
      .catch(err => setZonesError(userSafeAdminError(err, 'Failed to load USSD zones.')))
      .finally(() => setZonesLoading(false))
  }, [])

  const loadSmsHistory = useCallback(() => {
    setSmsHistoryLoading(true)
    setSmsHistoryError(null)
    getSmsHistory()
      .then(h => setSmsHistory(h))
      .catch(err => setSmsHistoryError(userSafeAdminError(err, 'Failed to load SMS history.')))
      .finally(() => setSmsHistoryLoading(false))
  }, [])

  useEffect(() => {
    loadStats()
    loadSessions()
    loadZones()
    loadSmsHistory()
  }, [loadStats, loadSessions, loadZones, loadSmsHistory])

  async function handleToggleZone(zone: UssdZone) {
    setTogglingZoneId(zone.id)
    try {
      await toggleUssdZone(zone.id, !zone.isActive)
      setZones(prev => prev.map(z => z.id === zone.id ? { ...z, isActive: !z.isActive } : z))
    } catch {
      // silently fail - keep existing state
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
      setSmsSuccess(`Sent to ${data.sent.toLocaleString()} of ${data.total.toLocaleString()} ${label} - ${data.failed} failed.`)

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
      setSmsError(err instanceof ApiError ? err.message : 'Network error - could not reach the SMS service.')
    } finally {
      setSmsSending(false)
    }
  }

  const charsLeft = SMS_MAX - smsBody.length
  const isOverLimit = charsLeft < 0
  const selectedAud = AUDIENCES.find(a => a.value === smsAudience)!

  const activeZoneCount = zones.filter(z => z.isActive).length

  const smsHistoryColumns: DataTableColumn<SmsHistoryItem>[] = [
    { key: 'message', header: 'Message', className: 'max-w-xs', render: s => <p className="text-sm text-gray-800 truncate">{s.body}</p> },
    { key: 'audience', header: 'Audience', render: s => <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full whitespace-nowrap">{s.audience}</span> },
    { key: 'sent', header: 'Sent', render: s => <span className="text-xs text-gray-500">{formatDateTime(s.sentAt)}</span> },
    { key: 'delivered', header: 'Delivered', align: 'right', render: s => <span className="text-sm font-medium text-emerald-600">{s.delivered.toLocaleString()}</span> },
    { key: 'failed', header: 'Failed', align: 'right', render: s => <span className="text-sm font-medium text-red-500">{s.failed}</span> },
  ]

  const sessionColumns: DataTableColumn<UssdSession>[] = [
    { key: 'phone', header: 'Phone (masked)', render: session => <span className="font-mono text-sm">{session.phone}</span> },
    { key: 'timestamp', header: 'Timestamp', render: session => <span className="text-sm text-gray-500">{formatDateTime(session.timestamp)}</span> },
    {
      key: 'flow', header: 'Flow',
      render: session => <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">{session.flow.replace('_', ' ')}</span>,
    },
    {
      key: 'outcome', header: 'Outcome',
      render: session => (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${outcomeColors[session.outcome] ?? 'bg-gray-100 text-gray-600'}`}>
          {session.outcome}
        </span>
      ),
    },
    { key: 'zone', header: 'Zone', render: session => <span className="text-sm text-gray-500">{session.zone}</span> },
  ]

  const zoneColumns: DataTableColumn<UssdZone>[] = [
    { key: 'id', header: 'Zone ID', render: zone => <span className="font-mono text-sm text-gray-500">{zone.id}</span> },
    { key: 'name', header: 'Zone name', render: zone => <span className="font-medium text-sm">{zone.name}</span> },
    { key: 'status', header: 'Status', render: zone => <StatusBadge status={zone.isActive ? 'active' : 'inactive'} /> },
    { key: 'bookings', header: 'Bookings this month', align: 'right', render: zone => <span className="text-sm font-medium">{zone.bookingsThisMonth}</span> },
    {
      key: 'actions', header: 'Actions', align: 'right',
      render: zone => (
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
      ),
    },
  ]

  return (
     <PageGuard permission="view_ussd">
    <div>
      <PageHeader
        title="USSD & SMS logs"
        subtitle="Monitor and manage the USSD channel for feature phone users"
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        {!statsLoading && stats === null ? (
          <div className="col-span-full text-sm text-gray-400 bg-white rounded-xl shadow-sm p-5">
            USSD statistics not yet available.
          </div>
        ) : (
          <>
            <StatCard icon={Phone} label="Total registrations" value={stats?.totalRegistrations ?? 0} loading={statsLoading} />
            <StatCard icon={MessageSquare} label="Active sessions" value={stats?.activeSessions ?? 0} sub="Right now" loading={statsLoading} />
            <StatCard icon={CheckCircle2} label="Bookings today" value={stats?.bookingsToday ?? 0} loading={statsLoading} />
            <StatCard icon={CheckCircle2} label="Bookings this month" value={stats?.bookingsMonth ?? 0} loading={statsLoading} />
            <StatCard icon={Clock} label="Session completion" value={stats ? `${stats.completionRate}%` : '0%'} sub="% leading to booking" loading={statsLoading} />
          </>
        )}
      </div>

      {/* Top categories */}
      {stats && stats.topCategories.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Top service categories via USSD</h3>
          <div className="flex flex-wrap gap-2">
            {stats.topCategories.map((cat, i) => (
              <div key={cat} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                <span className="w-5 h-5 rounded-full bg-gray-100 text-xs font-bold text-gray-600 flex items-center justify-center shrink-0">
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
          <TabsTrigger value="sessions">Session log</TabsTrigger>
          <TabsTrigger value="zones">Zone management</TabsTrigger>
        </TabsList>

        {/* ── Send SMS ─────────────────────────────────────────────────────── */}
        <TabsContent value="sms">
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

            {/* Compose */}
            <div className="xl:col-span-2 bg-white rounded-xl shadow-sm p-5 flex flex-col gap-4">
              <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Send className="h-4 w-4 text-primary" />
                Compose SMS
                <span className="ml-auto text-[10px] text-gray-400 font-normal">via Arkesel</span>
              </h2>

              <form onSubmit={handleSmsSend} className="flex flex-col gap-4">
                <div>
                  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Send to</Label>
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
                    placeholder={`Type your message... "MyShop:" prefix is added automatically.`}
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
                      <p className="text-[10px] text-slate-400">{selectedAud.label} - Arkesel SMS</p>
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
                  variant="brand"
                  className="w-full gap-2"
                >
                  {smsSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {smsSending ? 'Sending...' : `Send to ${selectedAud.label}`}
                </Button>
              </form>
            </div>

            {/* SMS History */}
            <div className="xl:col-span-3 flex flex-col">
              <h2 className="text-sm font-semibold text-gray-700 mb-2">SMS history</h2>
              <FilterBar
                onRefresh={loadSmsHistory}
                refreshing={smsHistoryLoading}
                meta={!smsHistoryLoading ? <span className="text-xs text-gray-500">{smsHistory.length} sent</span> : undefined}
              />
              <DataTable
                columns={smsHistoryColumns}
                rows={smsHistory}
                rowKey={s => s.id}
                loading={smsHistoryLoading}
                error={smsHistoryError}
                onRetry={loadSmsHistory}
                empty={<EmptyState title="No SMS history" />}
                minWidth={640}
              />
            </div>
          </div>
        </TabsContent>

        {/* ── Session Log ──────────────────────────────────────────────────── */}
        <TabsContent value="sessions">
          <FilterBar
            onRefresh={loadSessions}
            refreshing={sessionsLoading}
            meta={!sessionsLoading ? <span className="text-xs text-gray-500">{sessions.length} session{sessions.length !== 1 ? 's' : ''} loaded</span> : undefined}
          />
          <DataTable
            columns={sessionColumns}
            rows={sessions}
            rowKey={session => session.id}
            loading={sessionsLoading}
            error={sessionsError}
            onRetry={loadSessions}
            empty={<EmptyState title="No USSD sessions found" />}
            minWidth={720}
          />
        </TabsContent>

        {/* ── Zone Management ──────────────────────────────────────────────── */}
        <TabsContent value="zones">
          <FilterBar onRefresh={loadZones} refreshing={zonesLoading} />
          <DataTable
            columns={zoneColumns}
            rows={zones}
            rowKey={zone => zone.id}
            loading={zonesLoading}
            error={zonesError}
            onRetry={loadZones}
            empty={<EmptyState title="No zones configured" />}
            minWidth={640}
          />
          <div className="px-4 py-3 bg-white rounded-xl shadow-sm mt-3 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {zonesLoading ? '-' : `${activeZoneCount} active zone${activeZoneCount !== 1 ? 's' : ''} of ${zones.length} total`}
            </p>
            <Button size="sm" variant="brand" className="gap-1.5 text-xs">
              <MapPin className="h-3.5 w-3.5" /> Add zone
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  </PageGuard>
  )
}
