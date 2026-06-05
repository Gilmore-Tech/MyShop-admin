'use client'

import { useState, useEffect, useCallback } from 'react'
import Map, { Marker, NavigationControl } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { PageGuard } from '@/components/common/page-guard'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import {
  ShieldAlert, HeartPulse, CheckCircle2, Clock, MapPin,
  Car, Wrench, User, RefreshCw, AlertCircle, ExternalLink, Mic, Loader2, Phone,
  PhoneCall, UserCheck, Cpu, AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  getEmergencyAlerts, acknowledgeEmergency, resolveWelfareCheck,
  getRideDetail, getJobDetail,
  type EmergencyAlert, type RideDetail, type JobDetail,
  type WelfareContactMethod, type WelfareCheckStatus,
} from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

const ROLE_ICON: Record<string, React.ElementType> = {
  driver: Car,
  artisan: Wrench,
  client: User,
}

const ROLE_COLOR: Record<string, string> = {
  driver:  'bg-slate-100 text-slate-700',
  artisan: 'bg-purple-100 text-purple-700',
  client:  'bg-orange-100 text-orange-700',
}

// Determines whether a row still needs admin attention.
// For SOS: needs ack if not yet acknowledged.
// For welfare check: needs action if status is `escalated` (no response within
// the response window). `pending` is harmless — the cron is still waiting.
function needsAction(alert: EmergencyAlert): boolean {
  if (alert.type === 'sos') return !alert.acknowledgedAt
  return alert.welfareCheck?.status === 'escalated'
}

// Welfare-check status → human label + styling
function welfareStatusLabel(s: WelfareCheckStatus): { label: string; cls: string } {
  switch (s) {
    case 'pending':   return { label: 'Awaiting response',  cls: 'bg-amber-100 text-amber-700' }
    case 'escalated': return { label: 'Escalated to admin', cls: 'bg-red-500 text-white' }
    case 'responded': return { label: 'Artisan responded',  cls: 'bg-emerald-100 text-emerald-700' }
    case 'resolved':  return { label: 'Resolved by admin',  cls: 'bg-emerald-100 text-emerald-700' }
  }
}

const CONTACT_METHOD_LABEL: Record<WelfareContactMethod, string> = {
  phone:     'Called artisan',
  in_person: 'Met in person',
  auto:      'Auto-resolved (responded in-app)',
}

// ─── Alert card ───────────────────────────────────────────────────────────────

function AlertCard({
  alert,
  onAcknowledge,
  onResolveWelfare,
  onOpen,
  busy,
}: {
  alert: EmergencyAlert
  onAcknowledge: (a: EmergencyAlert) => void
  onResolveWelfare: (a: EmergencyAlert) => void
  onOpen: (a: EmergencyAlert) => void
  busy: boolean
}) {
  const isSos = alert.type === 'sos'
  const isAck = isSos ? !!alert.acknowledgedAt : alert.welfareCheck?.isResolved === true
  const action = needsAction(alert)
  const wcStatus = alert.welfareCheck?.status
  const wcLabel = wcStatus ? welfareStatusLabel(wcStatus) : null
  const RoleIcon = ROLE_ICON[alert.actorRole] ?? User

  return (
    <div
      onClick={() => onOpen(alert)}
      className={`rounded-xl border p-4 transition-all cursor-pointer hover:shadow-md ${
        !action
          ? 'border-gray-100 bg-white'
          : isSos
          ? 'border-red-200 bg-red-50/60 shadow-sm'
          : 'border-red-200 bg-red-50/60 shadow-sm'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
          !action ? 'bg-gray-100' : isSos ? 'bg-red-100' : 'bg-amber-100'
        }`}>
          {isSos
            ? <ShieldAlert className={`h-5 w-5 ${!action ? 'text-gray-400' : 'text-red-600'}`} />
            : <HeartPulse  className={`h-5 w-5 ${!action ? 'text-gray-400' : 'text-amber-600'}`} />
          }
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-sm font-bold ${!action ? 'text-gray-500' : isSos ? 'text-red-700' : 'text-amber-700'}`}>
                  {isSos ? 'SOS Emergency' : 'Welfare Check'}
                </span>
                {isSos && action && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide bg-red-500 text-white">
                    Action required
                  </span>
                )}
                {isSos && isAck && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                    Acknowledged
                  </span>
                )}
                {!isSos && wcLabel && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${wcLabel.cls}`}>
                    {wcLabel.label}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {/* Actor */}
                <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full capitalize ${ROLE_COLOR[alert.actorRole]}`}>
                  <RoleIcon className="h-3 w-3" />
                  {alert.actorName ?? 'Unknown'} · {alert.actorRole}
                </span>

                {/* Booking link */}
                {alert.bookingId && (
                  <span className="text-xs text-gray-400 font-mono">
                    {alert.bookingType} #{alert.bookingId.slice(0, 8)}…
                  </span>
                )}
              </div>
            </div>

            {/* Time */}
            <div className="text-right shrink-0">
              <p className="text-xs text-gray-400">{timeAgo(alert.occurredAt)}</p>
              <p className="text-[11px] text-gray-300 mt-0.5">{fmtDate(alert.occurredAt)}</p>
            </div>
          </div>

          {/* Location */}
          {alert.locationDescription && (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-gray-500">
              <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-gray-400" />
              <span>{alert.locationDescription}</span>
              {alert.lat != null && alert.lng != null && (
                <a
                  href={`https://www.google.com/maps?q=${alert.lat},${alert.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="inline-flex items-center gap-0.5 text-orange-500 hover:underline shrink-0"
                >
                  Map <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
            </div>
          )}

          {/* Recording */}
          {alert.recordingUrl && (
            <div className="mt-2">
              <a
                href={alert.recordingUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline"
              >
                <Mic className="h-3.5 w-3.5" /> Play recording
              </a>
            </div>
          )}

          {/* Acknowledged / resolved info */}
          {isSos && isAck && alert.acknowledgedAt && (
            <p className="mt-2 text-[11px] text-gray-400 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              Acknowledged {fmtDate(alert.acknowledgedAt)}
            </p>
          )}

          {/* Action */}
          {action && (
            <div className="mt-3">
              {isSos ? (
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1.5 text-white"
                  style={{ backgroundColor: '#EF4444' }}
                  disabled={busy}
                  onClick={e => { e.stopPropagation(); onAcknowledge(alert) }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Acknowledge
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1.5 text-white"
                  style={{ backgroundColor: '#F5A623' }}
                  disabled={busy}
                  onClick={e => { e.stopPropagation(); onResolveWelfare(alert) }}
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  Resolve check
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EmergencyPage() {
  const [alerts, setAlerts]         = useState<EmergencyAlert[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<'all' | 'sos' | 'welfare_check'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'unacknowledged' | 'acknowledged'>('unacknowledged')
  const [ackTarget, setAckTarget]   = useState<EmergencyAlert | null>(null)
  const [welfareTarget, setWelfareTarget] = useState<EmergencyAlert | null>(null)
  const [acking, setAcking]         = useState(false)
  const [selectedAlert, setSelectedAlert] = useState<EmergencyAlert | null>(null)

  const load = useCallback(() => {
    setLoading(true); setError(null)
    getEmergencyAlerts()
      .then(data => setAlerts(Array.isArray(data) ? data : (data as any).items ?? []))
      .catch(() => setError('Failed to load emergency alerts.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  // Poll every 30 s — emergencies need near-real-time visibility. Pauses on hidden tabs.
  useAutoRefresh(load, 30_000)

  const filtered = alerts.filter(a => {
    const matchType   = typeFilter === 'all' || a.type === typeFilter
    const matchStatus = statusFilter === 'all'
      || (statusFilter === 'unacknowledged' && !a.acknowledgedAt)
      || (statusFilter === 'acknowledged'   && !!a.acknowledgedAt)
    return matchType && matchStatus
  })

  const unacknowledgedCount = alerts.filter(a => !a.acknowledgedAt).length
  const sosCount    = alerts.filter(a => a.type === 'sos' && !a.acknowledgedAt).length
  const welfareCount = alerts.filter(a => a.type === 'welfare_check' && !a.acknowledgedAt).length

  async function handleAcknowledge() {
    if (!ackTarget) return
    setAcking(true)
    try {
      await acknowledgeEmergency(ackTarget.id)
      setAlerts(prev => prev.map(a =>
        a.id === ackTarget.id ? { ...a, acknowledgedAt: new Date().toISOString() } : a
      ))
    } catch {
      // keep dialog open so user can retry
    } finally {
      setAcking(false)
      setAckTarget(null)
    }
  }

  return (
    <PageGuard permission="view_emergency">
      <div>
        <PageHeader
          title="Emergency Alerts"
          subtitle="SOS triggers and welfare checks requiring admin acknowledgement."
          actions={
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={load}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          }
        />

        {/* KPI strip */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className={`rounded-xl border px-4 py-3 ${unacknowledgedCount > 0 ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-white'}`}>
            <p className="text-xs text-gray-400 font-medium">Unacknowledged</p>
            <p className={`text-2xl font-bold mt-0.5 ${unacknowledgedCount > 0 ? 'text-red-600' : 'text-gray-800'}`}>
              {unacknowledgedCount}
            </p>
          </div>
          <div className={`rounded-xl border px-4 py-3 ${sosCount > 0 ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-white'}`}>
            <p className="text-xs text-gray-400 font-medium">Active SOS</p>
            <p className={`text-2xl font-bold mt-0.5 ${sosCount > 0 ? 'text-red-600' : 'text-gray-800'}`}>{sosCount}</p>
          </div>
          <div className={`rounded-xl border px-4 py-3 ${welfareCount > 0 ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-white'}`}>
            <p className="text-xs text-gray-400 font-medium">Welfare Checks</p>
            <p className={`text-2xl font-bold mt-0.5 ${welfareCount > 0 ? 'text-amber-600' : 'text-gray-800'}`}>{welfareCount}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <Select value={typeFilter} onValueChange={v => setTypeFilter(v as typeof typeFilter)}>
            <SelectTrigger className="w-44 h-8 text-sm bg-gray-50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="sos">SOS Only</SelectItem>
              <SelectItem value="welfare_check">Welfare Checks Only</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={v => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-48 h-8 text-sm bg-gray-50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unacknowledged">Unacknowledged</SelectItem>
              <SelectItem value="acknowledged">Acknowledged</SelectItem>
            </SelectContent>
          </Select>

          <span className="text-xs text-gray-400 ml-auto">{filtered.length} of {alerts.length} alerts</span>
        </div>

        {/* Content */}
        {loading && (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-28 rounded-xl bg-gray-50 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 border border-red-100">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={load}>Retry</Button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <CheckCircle2 className="h-10 w-10 text-emerald-300" />
            <p className="text-sm font-medium text-gray-500">
              {statusFilter === 'unacknowledged' ? 'All clear — no unacknowledged alerts' : 'No alerts match the current filters'}
            </p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map(a => (
              <AlertCard
                key={a.id}
                alert={a}
                onAcknowledge={setAckTarget}
                onResolveWelfare={setWelfareTarget}
                onOpen={setSelectedAlert}
                busy={
                  (acking && ackTarget?.id === a.id) ||
                  (a.welfareCheck != null && welfareTarget?.id === a.id)
                }
              />
            ))}
          </div>
        )}

        {/* Auto-refresh badge */}
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mt-4 justify-end">
          <Clock className="h-3 w-3" /> Auto-refreshes every 30 s
        </div>
      </div>

      <EmergencyDetailDrawer
        alert={selectedAlert}
        onClose={() => setSelectedAlert(null)}
        onAcknowledge={a => { setSelectedAlert(null); setAckTarget(a) }}
        onResolveWelfare={a => { setSelectedAlert(null); setWelfareTarget(a) }}
      />

      <WelfareResolveDialog
        alert={welfareTarget}
        onClose={() => setWelfareTarget(null)}
        onResolved={() => { setWelfareTarget(null); load() }}
      />

      {/* Confirm acknowledge dialog */}
      <Dialog open={!!ackTarget} onOpenChange={open => { if (!open) setAckTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Acknowledge Alert
            </DialogTitle>
            <DialogDescription>
              Confirm you have reviewed and responded to this{' '}
              <strong>{ackTarget?.type === 'sos' ? 'SOS emergency' : 'welfare check'}</strong> for{' '}
              <strong>{ackTarget?.actorName ?? 'unknown user'}</strong>.
              This action is recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAckTarget(null)}>Cancel</Button>
            <Button
              onClick={handleAcknowledge}
              disabled={acking}
              className="text-white gap-2"
              style={{ backgroundColor: '#10B981' }}
            >
              {acking ? 'Acknowledging…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageGuard>
  )
}

// ─── Detail drawer ────────────────────────────────────────────────────────────

function EmergencyDetailDrawer({
  alert,
  onClose,
  onAcknowledge,
  onResolveWelfare,
}: {
  alert: EmergencyAlert | null
  onClose: () => void
  onAcknowledge: (a: EmergencyAlert) => void
  onResolveWelfare: (a: EmergencyAlert) => void
}) {
  const [ride, setRide] = useState<RideDetail | null>(null)
  const [job, setJob] = useState<JobDetail | null>(null)
  const [loadingBooking, setLoadingBooking] = useState(false)
  const [bookingError, setBookingError] = useState<string | null>(null)

  useEffect(() => {
    if (!alert?.bookingId || !alert.bookingType) {
      setRide(null); setJob(null); setBookingError(null)
      return
    }
    let cancelled = false
    setLoadingBooking(true)
    setBookingError(null)
    setRide(null); setJob(null)
    const fetcher = alert.bookingType === 'ride'
      ? getRideDetail(alert.bookingId).then(r => { if (!cancelled) setRide(r) })
      : getJobDetail(alert.bookingId).then(j => { if (!cancelled) setJob(j) })
    fetcher
      .catch(err => {
        if (cancelled) return
        setBookingError(err instanceof ApiError && err.status === 404
          ? 'Booking not found (it may have been deleted).'
          : 'Could not load booking details.')
      })
      .finally(() => { if (!cancelled) setLoadingBooking(false) })
    return () => { cancelled = true }
  }, [alert?.bookingId, alert?.bookingType])

  if (!alert) return null

  const isSos = alert.type === 'sos'
  const isAck = isSos ? !!alert.acknowledgedAt : alert.welfareCheck?.isResolved === true
  const wc = alert.welfareCheck
  const wcLabel = wc ? welfareStatusLabel(wc.status) : null
  const hasCoords = alert.lat != null && alert.lng != null
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const RoleIcon = ROLE_ICON[alert.actorRole] ?? User

  return (
    <Sheet open={!!alert} onOpenChange={open => { if (!open) onClose() }}>
      <SheetContent className="sm:max-w-xl overflow-y-auto p-0">
        <SheetHeader className="px-6 py-4 border-b border-gray-100">
          <SheetTitle className="text-base flex items-center gap-2">
            {isSos
              ? <ShieldAlert className="h-4 w-4 text-red-600" />
              : <HeartPulse className="h-4 w-4 text-amber-600" />}
            {isSos ? 'SOS Emergency' : 'Welfare Check'}
            {isSos && isAck && (
              <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                Acknowledged
              </span>
            )}
            {!isSos && wcLabel && (
              <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${wcLabel.cls}`}>
                {wcLabel.label}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="px-6 py-5 space-y-5">
          {/* Actor */}
          <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${ROLE_COLOR[alert.actorRole]}`}>
              <RoleIcon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{alert.actorName ?? 'Unknown user'}</p>
              <p className="text-xs text-gray-500 capitalize">{alert.actorRole} · raised {timeAgo(alert.occurredAt)}</p>
            </div>
            <p className="text-[11px] text-gray-400 text-right shrink-0">{fmtDate(alert.occurredAt)}</p>
          </div>

          {/* Last location panel */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                <MapPin className="h-3 w-3" /> Last known location
              </p>
              {hasCoords && (
                <a
                  href={`https://www.google.com/maps?q=${alert.lat},${alert.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-orange-500 hover:underline inline-flex items-center gap-0.5"
                >
                  Open in Maps <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
            </div>

            {hasCoords ? (
              <>
                {mapboxToken ? (
                  <div className="h-56 rounded-lg overflow-hidden border border-gray-100">
                    <Map
                      mapboxAccessToken={mapboxToken}
                      initialViewState={{
                        latitude: alert.lat as number,
                        longitude: alert.lng as number,
                        zoom: 14,
                      }}
                      mapStyle="mapbox://styles/mapbox/streets-v12"
                      style={{ width: '100%', height: '100%' }}
                    >
                      <NavigationControl position="top-right" />
                      <Marker
                        latitude={alert.lat as number}
                        longitude={alert.lng as number}
                        anchor="bottom"
                      >
                        <div className={`w-6 h-6 rounded-full border-2 border-white shadow-md flex items-center justify-center ${
                          isSos ? 'bg-red-500' : 'bg-amber-500'
                        }`}>
                          {isSos
                            ? <ShieldAlert className="h-3 w-3 text-white" />
                            : <HeartPulse  className="h-3 w-3 text-white" />}
                        </div>
                      </Marker>
                    </Map>
                  </div>
                ) : (
                  <div className="text-[11px] text-gray-400 italic bg-gray-50 rounded-lg p-3">
                    Map preview disabled — NEXT_PUBLIC_MAPBOX_TOKEN not set.
                  </div>
                )}
                <div className="text-[11px] text-gray-500 space-y-0.5">
                  <p className="font-mono">{alert.lat?.toFixed(6)}, {alert.lng?.toFixed(6)}</p>
                  {alert.locationDescription && <p>{alert.locationDescription}</p>}
                  <p className="text-gray-400">Captured at the moment the alert was raised.</p>
                </div>
              </>
            ) : (
              <div className="text-xs text-gray-400 italic bg-gray-50 rounded-lg p-3">
                No GPS coordinates were captured for this alert.
                {alert.locationDescription && (
                  <p className="text-gray-600 not-italic mt-1">{alert.locationDescription}</p>
                )}
              </div>
            )}
          </section>

          {/* Booking detail panel */}
          <section className="space-y-2">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
              {alert.bookingType === 'ride'
                ? <Car className="h-3 w-3" />
                : alert.bookingType === 'job'
                  ? <Wrench className="h-3 w-3" />
                  : <AlertCircle className="h-3 w-3" />}
              {alert.bookingType === 'ride' ? 'Ride'
                : alert.bookingType === 'job' ? 'Job'
                : 'Linked booking'}
            </p>

            {!alert.bookingId || !alert.bookingType ? (
              <div className="text-xs text-gray-400 italic bg-gray-50 rounded-lg p-3">
                This alert is not linked to a ride or job.
              </div>
            ) : loadingBooking ? (
              <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading booking…
              </div>
            ) : bookingError ? (
              <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg p-3">
                {bookingError}
              </div>
            ) : ride ? (
              <RideDetailCard ride={ride} bookingId={alert.bookingId} />
            ) : job ? (
              <JobDetailCard job={job} bookingId={alert.bookingId} />
            ) : null}
          </section>

          {/* Recording */}
          {alert.recordingUrl && (
            <section>
              <a
                href={alert.recordingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
              >
                <Mic className="h-3.5 w-3.5" /> Play recording
              </a>
            </section>
          )}

          {/* Welfare-check timeline */}
          {!isSos && wc && (
            <section className="space-y-2">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                <HeartPulse className="h-3 w-3" /> Welfare timeline
              </p>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-xs">
                <TimelineRow
                  icon={<CheckCircle2 className="h-3 w-3 text-amber-500" />}
                  label="Push sent to artisan"
                  at={wc.notificationSentAt}
                />
                <TimelineRow
                  icon={<UserCheck className="h-3 w-3 text-emerald-500" />}
                  label="Artisan responded in-app"
                  at={wc.responseReceivedAt}
                />
                <TimelineRow
                  icon={<AlertTriangle className="h-3 w-3 text-red-500" />}
                  label="Escalated to admin"
                  at={wc.adminAlertedAt}
                />
                <TimelineRow
                  icon={<CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                  label="Resolved by admin"
                  at={wc.isResolved ? alert.acknowledgedAt : null}
                />
              </div>
            </section>
          )}

          {/* Action */}
          {isSos && !isAck && (
            <div className="pt-2 border-t border-gray-100">
              <Button
                onClick={() => onAcknowledge(alert)}
                className="w-full gap-2 text-white"
                style={{ backgroundColor: '#EF4444' }}
              >
                <CheckCircle2 className="h-4 w-4" /> Acknowledge this alert
              </Button>
              <p className="text-[10px] text-gray-400 text-center mt-2">
                Logged in the audit trail with your admin id.
              </p>
            </div>
          )}
          {!isSos && !isAck && (
            <div className="pt-2 border-t border-gray-100">
              <Button
                onClick={() => onResolveWelfare(alert)}
                className="w-full gap-2 text-white"
                style={{ backgroundColor: '#F5A623' }}
              >
                <UserCheck className="h-4 w-4" /> Resolve welfare check
              </Button>
              <p className="text-[10px] text-gray-400 text-center mt-2">
                Confirm you&apos;ve reached the artisan and they&apos;re safe. Logged with a note + contact method.
              </p>
            </div>
          )}
          {isSos && isAck && alert.acknowledgedAt && (
            <p className="pt-2 border-t border-gray-100 text-xs text-gray-500 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              Acknowledged {fmtDate(alert.acknowledgedAt)}
            </p>
          )}
          {!isSos && wc?.isResolved && (
            <p className="pt-2 border-t border-gray-100 text-xs text-gray-500 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              Resolved by admin.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function RideDetailCard({ ride, bookingId }: { ride: RideDetail; bookingId: string }) {
  return (
    <div className="rounded-lg border border-gray-100 p-3 space-y-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <a
          href={`/rides/${bookingId}`}
          onClick={e => e.stopPropagation()}
          className="font-mono text-xs text-orange-600 hover:underline"
        >
          #{bookingId.slice(0, 8)}…
        </a>
        <StatusBadge status={ride.status} />
      </div>
      <DetailRow label="Pickup" value={ride.pickupAddress ?? '—'} />
      <DetailRow label="Dropoff" value={ride.dropoffAddress ?? '—'} />
      {ride.distanceKm != null && (
        <DetailRow label="Distance" value={`${Number(ride.distanceKm).toFixed(1)} km`} />
      )}
      {ride.client?.user && (
        <div className="pt-2 border-t border-gray-50">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">Client</p>
          <p className="text-xs text-gray-700">{ride.client.user.fullName}</p>
          <p className="text-[11px] text-gray-400 font-mono flex items-center gap-1"><Phone className="h-3 w-3" /> {ride.client.user.phone}</p>
        </div>
      )}
      {ride.driver?.user && (
        <div className="pt-2 border-t border-gray-50">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">Driver</p>
          <p className="text-xs text-gray-700">{ride.driver.user.fullName}</p>
          <p className="text-[11px] text-gray-400 font-mono flex items-center gap-1"><Phone className="h-3 w-3" /> {ride.driver.user.phone}</p>
          {ride.driver.vehiclePlate && (
            <p className="text-[11px] text-gray-500 mt-1">
              {[ride.driver.vehicleColor, ride.driver.vehicleMake, ride.driver.vehicleModel, ride.driver.vehiclePlate]
                .filter(Boolean).join(' ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function JobDetailCard({ job, bookingId }: { job: JobDetail; bookingId: string }) {
  return (
    <div className="rounded-lg border border-gray-100 p-3 space-y-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <a
          href={`/artisan-jobs/${bookingId}`}
          onClick={e => e.stopPropagation()}
          className="font-mono text-xs text-orange-600 hover:underline"
        >
          #{bookingId.slice(0, 8)}…
        </a>
        <StatusBadge status={job.status} />
      </div>
      <DetailRow label="Category" value={job.category?.name ?? '—'} />
      <DetailRow label="Description" value={job.description || '—'} />
      {job.addressText && <DetailRow label="Address" value={job.addressText} />}
      {job.client && (
        <div className="pt-2 border-t border-gray-50">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">Client</p>
          <p className="text-xs text-gray-700">{job.client.name ?? '—'}</p>
          {job.client.phone && (
            <p className="text-[11px] text-gray-400 font-mono flex items-center gap-1"><Phone className="h-3 w-3" /> {job.client.phone}</p>
          )}
        </div>
      )}
      {job.artisan && (
        <div className="pt-2 border-t border-gray-50">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">Artisan</p>
          <p className="text-xs text-gray-700">{job.artisan.name ?? '—'}</p>
          {job.artisan.phone && (
            <p className="text-[11px] text-gray-400 font-mono flex items-center gap-1"><Phone className="h-3 w-3" /> {job.artisan.phone}</p>
          )}
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-800 text-right break-all">{value}</span>
    </div>
  )
}

function TimelineRow({ icon, label, at }: { icon: React.ReactNode; label: string; at: string | null }) {
  const done = !!at
  return (
    <div className={`flex items-center gap-2 ${done ? 'text-gray-700' : 'text-gray-400'}`}>
      <span className="shrink-0">{done ? icon : <Clock className="h-3 w-3" />}</span>
      <span className="flex-1">{label}</span>
      <span className="text-[10px] text-gray-400 shrink-0">{at ? fmtDate(at) : '—'}</span>
    </div>
  )
}

// ─── Welfare-check resolve dialog ─────────────────────────────────────────────

function WelfareResolveDialog({
  alert, onClose, onResolved,
}: {
  alert: EmergencyAlert | null
  onClose: () => void
  onResolved: () => void
}) {
  const [note, setNote] = useState('')
  const [contactMethod, setContactMethod] = useState<WelfareContactMethod>('phone')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    setNote('')
    setContactMethod('phone')
    setErrorMsg(null)
  }, [alert?.id])

  if (!alert) return null

  const valid = note.trim().length >= 10

  async function handleSubmit() {
    if (!alert?.welfareCheck) return
    setErrorMsg(null)
    setSubmitting(true)
    try {
      // The welfare-check id is in alert.id — backend unions welfare_checks
      // into /admin/emergency, and our resolve endpoint takes that id directly.
      await resolveWelfareCheck(alert.id, { note: note.trim(), contactMethod })
      onResolved()
    } catch (err) {
      if (err instanceof ApiError && err.message.includes('WELFARE_CHECK_ALREADY_RESOLVED')) {
        setErrorMsg('This welfare check has already been resolved.')
      } else {
        setErrorMsg(err instanceof ApiError ? err.message : 'Failed to resolve welfare check.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={!!alert} onOpenChange={open => { if (!open && !submitting) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700">
            <UserCheck className="h-4 w-4" /> Resolve welfare check
          </DialogTitle>
          <DialogDescription>
            Confirm you&apos;ve reached <strong>{alert.actorName ?? 'this artisan'}</strong> and they&apos;re safe.
            Logged with your admin id, note, and contact method.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact method</Label>
            <div className="grid grid-cols-3 gap-2">
              {(['phone', 'in_person', 'auto'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setContactMethod(m)}
                  className={`text-xs rounded-lg border px-2 py-2 flex flex-col items-center gap-1 transition-colors ${
                    contactMethod === m
                      ? 'border-amber-300 bg-amber-50 text-amber-700'
                      : 'border-gray-100 hover:border-gray-200 text-gray-600'
                  }`}
                >
                  {m === 'phone' && <PhoneCall className="h-3.5 w-3.5" />}
                  {m === 'in_person' && <UserCheck className="h-3.5 w-3.5" />}
                  {m === 'auto' && <Cpu className="h-3.5 w-3.5" />}
                  {CONTACT_METHOD_LABEL[m].split(' ').slice(0, 2).join(' ')}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400">{CONTACT_METHOD_LABEL[contactMethod]}</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Note <span className="text-gray-400">(min 10 chars, audit-logged)</span>
            </Label>
            <Textarea
              rows={3}
              placeholder="e.g. Reached artisan by phone — they finished the job and forgot to mark done. Reminded them to update status."
              value={note}
              onChange={e => setNote(e.target.value)}
              className="text-sm"
            />
            <p className={`text-[11px] ${valid ? 'text-emerald-600' : 'text-gray-400'}`}>
              {note.trim().length} / 10 characters
            </p>
          </div>

          {errorMsg && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{errorMsg}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button
            disabled={!valid || submitting}
            onClick={handleSubmit}
            className="text-white gap-2"
            style={{ backgroundColor: '#10B981' }}
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Confirm resolved
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
