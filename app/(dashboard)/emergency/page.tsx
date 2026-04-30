'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageGuard } from '@/components/common/page-guard'
import { PageHeader } from '@/components/common/page-header'
import {
  ShieldAlert, HeartPulse, CheckCircle2, Clock, MapPin,
  Car, Wrench, User, RefreshCw, AlertCircle, ExternalLink, Mic,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { getEmergencyAlerts, acknowledgeEmergency, type EmergencyAlert } from '@/lib/api'
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

// ─── Alert card ───────────────────────────────────────────────────────────────

function AlertCard({
  alert,
  onAcknowledge,
  acknowledging,
}: {
  alert: EmergencyAlert
  onAcknowledge: (a: EmergencyAlert) => void
  acknowledging: boolean
}) {
  const isAck = !!alert.acknowledgedAt
  const isSos = alert.type === 'sos'
  const RoleIcon = ROLE_ICON[alert.actorRole] ?? User

  return (
    <div className={`rounded-xl border p-4 transition-all ${
      isAck
        ? 'border-gray-100 bg-white'
        : isSos
        ? 'border-red-200 bg-red-50/60 shadow-sm'
        : 'border-amber-200 bg-amber-50/60 shadow-sm'
    }`}>
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
          isAck ? 'bg-gray-100' : isSos ? 'bg-red-100' : 'bg-amber-100'
        }`}>
          {isSos
            ? <ShieldAlert className={`h-5 w-5 ${isAck ? 'text-gray-400' : 'text-red-600'}`} />
            : <HeartPulse  className={`h-5 w-5 ${isAck ? 'text-gray-400' : 'text-amber-600'}`} />
          }
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-sm font-bold ${isAck ? 'text-gray-500' : isSos ? 'text-red-700' : 'text-amber-700'}`}>
                  {isSos ? 'SOS Emergency' : 'Welfare Check'}
                </span>
                {!isAck && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${
                    isSos ? 'bg-red-500 text-white' : 'bg-amber-400 text-white'
                  }`}>
                    Action required
                  </span>
                )}
                {isAck && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                    Acknowledged
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
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline"
              >
                <Mic className="h-3.5 w-3.5" /> Play recording
              </a>
            </div>
          )}

          {/* Acknowledged info */}
          {isAck && (
            <p className="mt-2 text-[11px] text-gray-400 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              Acknowledged {fmtDate(alert.acknowledgedAt!)}
            </p>
          )}

          {/* Action */}
          {!isAck && (
            <div className="mt-3">
              <Button
                size="sm"
                className="h-7 text-xs gap-1.5 text-white"
                style={{ backgroundColor: isSos ? '#EF4444' : '#F5A623' }}
                disabled={acknowledging}
                onClick={() => onAcknowledge(alert)}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Acknowledge
              </Button>
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
  const [acking, setAcking]         = useState(false)

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
                acknowledging={acking && ackTarget?.id === a.id}
              />
            ))}
          </div>
        )}

        {/* Auto-refresh badge */}
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mt-4 justify-end">
          <Clock className="h-3 w-3" /> Auto-refreshes every 30 s
        </div>
      </div>

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
