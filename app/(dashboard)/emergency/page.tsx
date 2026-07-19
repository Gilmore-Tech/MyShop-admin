'use client'

import { useState, useEffect, useCallback } from 'react'
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps'
import { PageGuard } from '@/components/common/page-guard'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import {
  ShieldAlert,
  HeartPulse,
  CheckCircle2,
  Clock,
  MapPin,
  Car,
  Wrench,
  User,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Mic,
  Loader2,
  Phone,
  PhoneCall,
  UserCheck,
  Cpu,
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  History,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  getEmergencyAlerts,
  acknowledgeEmergency,
  resolveWelfareCheck,
  getRideDetail,
  getJobDetail,
  type EmergencyAlert,
  type RideDetail,
  type JobDetail,
  type WelfareContactMethod,
  type WelfareCheckStatus,
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
  return new Date(iso).toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

type DateRange = 'all' | 'week' | 'month' | 'custom'

const DAY_MS = 86_400_000

// Whether an alert timestamp falls inside the selected date range.
function inDateRange(iso: string, range: DateRange, from: string, to: string): boolean {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return true
  const now = Date.now()
  if (range === 'week') return t >= now - 7 * DAY_MS
  if (range === 'month') return t >= now - 30 * DAY_MS
  if (range === 'custom') {
    if (from && t < new Date(`${from}T00:00:00`).getTime()) return false
    if (to && t > new Date(`${to}T23:59:59.999`).getTime()) return false
    return true
  }
  return true
}

const OTHER_PAGE_SIZE = 10 // rows per page in the acknowledged/monitored history
const ACTION_CAP = 20 // needs-action rows shown before "Show all" expander

const ROLE_ICON: Record<string, React.ElementType> = {
  driver: Car,
  artisan: Wrench,
  client: User,
}

const ROLE_COLOR: Record<string, string> = {
  driver: 'bg-gray-100 text-gray-600',
  artisan: 'bg-gray-100 text-gray-600',
  client: 'bg-gray-100 text-gray-600',
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
function welfareStatusLabel(s: WelfareCheckStatus): {
  label: string
  cls: string
} {
  switch (s) {
    case 'pending':
      return { label: 'Awaiting response', cls: 'bg-gray-100 text-gray-600' }
    case 'escalated':
      return { label: 'Escalated to admin', cls: 'bg-red-500 text-white' }
    case 'responded':
      return {
        label: 'Artisan responded',
        cls: 'bg-emerald-100 text-emerald-700',
      }
    case 'resolved':
      return {
        label: 'Resolved by admin',
        cls: 'bg-emerald-100 text-emerald-700',
      }
  }
}

const METHOD_OPTIONS: {
  key: WelfareContactMethod
  icon: React.ElementType
  label: string
  desc: string
}[] = [
  {
    key: 'phone',
    icon: PhoneCall,
    label: 'Called artisan',
    desc: 'Reached them by phone',
  },
  {
    key: 'in_person',
    icon: UserCheck,
    label: 'Met in person',
    desc: 'Verified them on site',
  },
  {
    key: 'auto',
    icon: Cpu,
    label: 'Auto-resolved',
    desc: 'They responded in-app',
  },
]

// ─── Alert card (compact triage row) ──────────────────────────────────────────

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
  const action = needsAction(alert)
  const wcStatus = alert.welfareCheck?.status
  const wcLabel = wcStatus ? welfareStatusLabel(wcStatus) : null

  // Compact secondary line: location - booking - time
  const meta = [
    alert.locationDescription,
    alert.bookingId
      ? `${alert.bookingType ?? 'booking'} #${alert.bookingId.slice(0, 6).toUpperCase()}`
      : null,
    timeAgo(alert.occurredAt),
  ]
    .filter(Boolean)
    .join('  -  ')

  return (
    <div
      onClick={() => onOpen(alert)}
      className="rounded-xl border border-gray-100 bg-white p-3.5 flex items-center gap-3 cursor-pointer transition-all hover:shadow-sm"
    >
      {/* Type icon */}
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
          action ? (isSos ? 'bg-red-100' : 'bg-amber-100') : 'bg-gray-100'
        }`}
      >
        {isSos ? (
          <ShieldAlert className={`h-5 w-5 ${action ? 'text-red-600' : 'text-gray-400'}`} />
        ) : (
          <HeartPulse className={`h-5 w-5 ${action ? 'text-amber-600' : 'text-gray-400'}`} />
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`text-sm font-semibold shrink-0 ${
              action ? (isSos ? 'text-red-700' : 'text-amber-700') : 'text-gray-700'
            }`}
          >
            {isSos ? 'SOS' : 'Welfare'}
          </span>
          <span className="text-sm font-medium text-gray-800 truncate">
            {alert.actorName ?? 'Unknown'}
          </span>
          <span className="text-xs text-gray-400 capitalize shrink-0">{alert.actorRole}</span>
        </div>
        <p className="text-xs text-gray-400 truncate mt-0.5 flex items-center gap-1">
          {alert.locationDescription && <MapPin className="h-3 w-3 shrink-0 text-gray-300" />}
          {meta || '-'}
        </p>
      </div>

      {/* Right: action button, or handled status */}
      <div className="shrink-0">
        {action ? (
          isSos ? (
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 text-white"
              style={{ backgroundColor: '#EF4444' }}
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation()
                onAcknowledge(alert)
              }}
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Acknowledge
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 text-white"
              style={{ backgroundColor: '#F5A623' }}
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation()
                onResolveWelfare(alert)
              }}
            >
              <UserCheck className="h-3.5 w-3.5" /> Resolve
            </Button>
          )
        ) : isSos ? (
          <span className="inline-flex items-center gap-1 text-xs text-gray-400 whitespace-nowrap">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Acknowledged
          </span>
        ) : (
          <span className="text-xs text-gray-400 whitespace-nowrap">
            {wcLabel?.label ?? 'Monitoring'}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EmergencyPage() {
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<'all' | 'sos' | 'welfare_check'>('all')
  const [dateRange, setDateRange] = useState<DateRange>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [page, setPage] = useState(1)
  const [showResolved, setShowResolved] = useState(false)
  const [showAllAction, setShowAllAction] = useState(false)
  const [ackTarget, setAckTarget] = useState<EmergencyAlert | null>(null)
  const [welfareTarget, setWelfareTarget] = useState<EmergencyAlert | null>(null)
  const [acking, setAcking] = useState(false)
  const [selectedAlert, setSelectedAlert] = useState<EmergencyAlert | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    getEmergencyAlerts()
      .then((data) => setAlerts(Array.isArray(data) ? data : ((data as any).items ?? [])))
      .catch(() => setError('Failed to load emergency alerts.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // No-op while auto-refresh is globally disabled (see AUTO_REFRESH_DISABLED).
  useAutoRefresh(load, 30_000)

  const filtered = alerts.filter(
    (a) =>
      (typeFilter === 'all' || a.type === typeFilter) &&
      inDateRange(a.occurredAt, dateRange, customFrom, customTo)
  )

  // Triage split: what needs action now vs. everything already handled / monitored.
  const needsActionList = filtered.filter(needsAction).sort((a, b) => {
    // SOS before welfare, then most recent first.
    const aw = a.type === 'sos' ? 0 : 1
    const bw = b.type === 'sos' ? 0 : 1
    if (aw !== bw) return aw - bw
    return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  })
  const otherList = filtered
    .filter((a) => !needsAction(a))
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())

  // Reset history pagination whenever filters change.
  useEffect(() => {
    setPage(1)
  }, [typeFilter, dateRange, customFrom, customTo])

  // Pagination over the acknowledged/monitored history only.
  const otherTotalPages = Math.max(1, Math.ceil(otherList.length / OTHER_PAGE_SIZE))
  const otherPage = Math.min(page, otherTotalPages)
  const otherStart = (otherPage - 1) * OTHER_PAGE_SIZE
  const otherPageItems = otherList.slice(otherStart, otherStart + OTHER_PAGE_SIZE)

  const unacknowledgedCount = alerts.filter((a) => !a.acknowledgedAt).length
  const sosCount = alerts.filter((a) => a.type === 'sos' && !a.acknowledgedAt).length
  const welfareCount = alerts.filter((a) => a.type === 'welfare_check' && !a.acknowledgedAt).length

  const renderCard = (a: EmergencyAlert) => (
    <AlertCard
      key={a.id}
      alert={a}
      onAcknowledge={setAckTarget}
      onResolveWelfare={setWelfareTarget}
      onOpen={setSelectedAlert}
      busy={
        (acking && ackTarget?.id === a.id) || (a.welfareCheck != null && welfareTarget?.id === a.id)
      }
    />
  )

  async function handleAcknowledge() {
    if (!ackTarget) return
    setAcking(true)
    try {
      await acknowledgeEmergency(ackTarget.id)
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === ackTarget.id ? { ...a, acknowledgedAt: new Date().toISOString() } : a
        )
      )
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
          <div className="rounded-xl border border-gray-100 bg-white px-4 py-3">
            <p className="text-xs text-gray-400 font-medium">Unacknowledged</p>
            <p
              className={`text-2xl font-bold mt-0.5 ${unacknowledgedCount > 0 ? 'text-red-600' : 'text-gray-800'}`}
            >
              {unacknowledgedCount}
            </p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white px-4 py-3">
            <p className="text-xs text-gray-400 font-medium">Active SOS</p>
            <p
              className={`text-2xl font-bold mt-0.5 ${sosCount > 0 ? 'text-red-600' : 'text-gray-800'}`}
            >
              {sosCount}
            </p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white px-4 py-3">
            <p className="text-xs text-gray-400 font-medium">Welfare Checks</p>
            <p
              className={`text-2xl font-bold mt-0.5 ${welfareCount > 0 ? 'text-amber-600' : 'text-gray-800'}`}
            >
              {welfareCount}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
            <SelectTrigger className="w-44 h-8 text-sm bg-gray-50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="sos">SOS Only</SelectItem>
              <SelectItem value="welfare_check">Welfare Checks Only</SelectItem>
            </SelectContent>
          </Select>

          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
            <SelectTrigger className="w-40 h-8 text-sm bg-gray-50">
              <SelectValue placeholder="Date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="week">Last 7 days</SelectItem>
              <SelectItem value="month">Last 30 days</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>

          {dateRange === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-8 text-sm bg-gray-50 border border-gray-200 rounded-md px-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
              <span className="text-xs text-gray-400">to</span>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-8 text-sm bg-gray-50 border border-gray-200 rounded-md px-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
            </div>
          )}

          <span className="text-xs text-gray-400 ml-auto">
            {filtered.length} of {alerts.length} alerts
          </span>
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
            <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={load}>
              Retry
            </Button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Needs action now */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
                  Needs action now
                </h2>
                {needsActionList.length > 0 && (
                  <span className="text-[11px] font-bold text-red-600">
                    {needsActionList.length}
                  </span>
                )}
              </div>

              {needsActionList.length === 0 ? (
                <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-4">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">All clear</p>
                    <p className="text-xs text-gray-400">
                      {alerts.length === 0
                        ? 'No emergency alerts.'
                        : 'No alerts need action right now.'}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {(showAllAction ? needsActionList : needsActionList.slice(0, ACTION_CAP)).map(
                    renderCard
                  )}

                  {needsActionList.length > ACTION_CAP && (
                    <button
                      onClick={() => setShowAllAction((v) => !v)}
                      className="w-full text-xs font-medium text-gray-500 hover:text-gray-700 py-2 transition-colors"
                    >
                      {showAllAction
                        ? 'Show fewer'
                        : `Show all ${needsActionList.length} that need action`}
                    </button>
                  )}
                </>
              )}
            </section>

            {/* Acknowledged & monitored (collapsible accordion) */}
            {otherList.length > 0 && (
              <section className="mt-6">
                <button
                  onClick={() => setShowResolved((v) => !v)}
                  className="w-full flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <History className="h-[18px] w-[18px] text-gray-500" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-gray-700">
                        Acknowledged &amp; monitored
                      </p>
                      <p className="text-xs text-gray-400">
                        {otherList.length} handled alert
                        {otherList.length !== 1 ? 's' : ''} - tap to{' '}
                        {showResolved ? 'hide' : 'view'}
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-gray-400 transition-transform ${showResolved ? 'rotate-180' : ''}`}
                  />
                </button>
                {showResolved && (
                  <>
                    <div className="space-y-2.5 mt-3">{otherPageItems.map(renderCard)}</div>

                    {otherList.length > OTHER_PAGE_SIZE && (
                      <div className="flex items-center justify-between mt-3">
                        <p className="text-xs text-gray-400">
                          Showing {otherStart + 1}-
                          {Math.min(otherStart + OTHER_PAGE_SIZE, otherList.length)} of{' '}
                          {otherList.length}
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 text-xs"
                            disabled={otherPage <= 1}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                          >
                            <ChevronLeft className="h-3.5 w-3.5" /> Prev
                          </Button>
                          <span className="text-xs text-gray-500 tabular-nums px-1">
                            Page {otherPage} of {otherTotalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 text-xs"
                            disabled={otherPage >= otherTotalPages}
                            onClick={() => setPage((p) => Math.min(otherTotalPages, p + 1))}
                          >
                            Next <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </section>
            )}
          </>
        )}
      </div>

      <EmergencyDetailDrawer
        alert={selectedAlert}
        onClose={() => setSelectedAlert(null)}
        onAcknowledge={(a) => {
          setSelectedAlert(null)
          setAckTarget(a)
        }}
        onResolveWelfare={(a) => {
          setSelectedAlert(null)
          setWelfareTarget(a)
        }}
      />

      <WelfareResolveDialog
        alert={welfareTarget}
        onClose={() => setWelfareTarget(null)}
        onResolved={() => {
          setWelfareTarget(null)
          load()
        }}
      />

      {/* Confirm acknowledge dialog */}
      <Dialog
        open={!!ackTarget}
        onOpenChange={(open) => {
          if (!open) setAckTarget(null)
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Acknowledge Alert
            </DialogTitle>
            <DialogDescription>
              Confirm you have reviewed and responded to this{' '}
              <strong>{ackTarget?.type === 'sos' ? 'SOS emergency' : 'welfare check'}</strong> for{' '}
              <strong>{ackTarget?.actorName ?? 'unknown user'}</strong>. This action is recorded in
              the audit log.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAckTarget(null)}>
              Cancel
            </Button>
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
      setRide(null)
      setJob(null)
      setBookingError(null)
      return
    }
    let cancelled = false
    setLoadingBooking(true)
    setBookingError(null)
    setRide(null)
    setJob(null)
    const fetcher =
      alert.bookingType === 'ride'
        ? getRideDetail(alert.bookingId).then((r) => {
            if (!cancelled) setRide(r)
          })
        : getJobDetail(alert.bookingId).then((j) => {
            if (!cancelled) setJob(j)
          })
    fetcher
      .catch((err) => {
        if (cancelled) return
        setBookingError(
          err instanceof ApiError && err.status === 404
            ? 'Booking not found (it may have been deleted).'
            : 'Could not load booking details.'
        )
      })
      .finally(() => {
        if (!cancelled) setLoadingBooking(false)
      })
    return () => {
      cancelled = true
    }
  }, [alert?.bookingId, alert?.bookingType])

  if (!alert) return null

  const isSos = alert.type === 'sos'
  const isAck = isSos ? !!alert.acknowledgedAt : alert.welfareCheck?.isResolved === true
  const wc = alert.welfareCheck
  const wcLabel = wc ? welfareStatusLabel(wc.status) : null
  const hasCoords = alert.lat != null && alert.lng != null
  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  const mapsMapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? 'DEMO_MAP_ID'
  const RoleIcon = ROLE_ICON[alert.actorRole] ?? User

  return (
    <Sheet
      open={!!alert}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent className="sm:max-w-xl overflow-y-auto p-0">
        <SheetHeader className="px-6 py-4 border-b border-gray-100">
          <SheetTitle className="text-base flex items-center gap-2">
            {isSos ? (
              <ShieldAlert className="h-4 w-4 text-red-600" />
            ) : (
              <HeartPulse className="h-4 w-4 text-amber-600" />
            )}
            {isSos ? 'SOS Emergency' : 'Welfare Check'}
            {isSos && isAck && (
              <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                Acknowledged
              </span>
            )}
            {!isSos && wcLabel && (
              <span
                className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${wcLabel.cls}`}
              >
                {wcLabel.label}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="px-6 py-5 space-y-5">
          {/* Actor */}
          <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center ${ROLE_COLOR[alert.actorRole]}`}
            >
              <RoleIcon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                {alert.actorName ?? 'Unknown user'}
              </p>
              <p className="text-xs text-gray-500 capitalize">
                {alert.actorRole} - raised {timeAgo(alert.occurredAt)}
              </p>
            </div>
            <p className="text-[11px] text-gray-400 text-right shrink-0">
              {fmtDate(alert.occurredAt)}
            </p>
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
                {mapsApiKey ? (
                  <div className="h-56 rounded-lg overflow-hidden border border-gray-100">
                    <APIProvider apiKey={mapsApiKey}>
                      <Map
                        mapId={mapsMapId}
                        defaultCenter={{
                          lat: alert.lat as number,
                          lng: alert.lng as number,
                        }}
                        defaultZoom={14}
                        gestureHandling="greedy"
                        zoomControl
                        style={{ width: '100%', height: '100%' }}
                      >
                        <AdvancedMarker
                          position={{
                            lat: alert.lat as number,
                            lng: alert.lng as number,
                          }}
                        >
                          <div
                            className={`w-6 h-6 rounded-full border-2 border-white shadow-md flex items-center justify-center ${
                              isSos ? 'bg-red-500' : 'bg-amber-500'
                            }`}
                          >
                            {isSos ? (
                              <ShieldAlert className="h-3 w-3 text-white" />
                            ) : (
                              <HeartPulse className="h-3 w-3 text-white" />
                            )}
                          </div>
                        </AdvancedMarker>
                      </Map>
                    </APIProvider>
                  </div>
                ) : (
                  <div className="text-[11px] text-gray-400 italic bg-gray-50 rounded-lg p-3">
                    Map preview disabled - NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not set.
                  </div>
                )}
                <div className="text-[11px] text-gray-500 space-y-0.5">
                  <p className="font-mono">
                    {alert.lat?.toFixed(6)}, {alert.lng?.toFixed(6)}
                  </p>
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
              {alert.bookingType === 'ride' ? (
                <Car className="h-3 w-3" />
              ) : alert.bookingType === 'job' ? (
                <Wrench className="h-3 w-3" />
              ) : (
                <AlertCircle className="h-3 w-3" />
              )}
              {alert.bookingType === 'ride'
                ? 'Ride'
                : alert.bookingType === 'job'
                  ? 'Job'
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
                  icon={<CheckCircle2 className="h-3 w-3 text-gray-600" />}
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
                Confirm you&apos;ve reached the artisan and they&apos;re safe. Logged with a note +
                contact method.
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
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-xs text-orange-600 hover:underline"
        >
          #{bookingId.slice(0, 8)}…
        </a>
        <StatusBadge status={ride.status} />
      </div>
      <DetailRow label="Pickup" value={ride.pickupAddress ?? '-'} />
      <DetailRow label="Dropoff" value={ride.dropoffAddress ?? '-'} />
      {ride.distanceKm != null && (
        <DetailRow label="Distance" value={`${Number(ride.distanceKm).toFixed(1)} km`} />
      )}
      {ride.client && (
        <div className="pt-2 border-t border-gray-50">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">Client</p>
          <p className="text-xs text-gray-700">{ride.client.fullName}</p>
          <p className="text-[11px] text-gray-400 font-mono flex items-center gap-1">
            <Phone className="h-3 w-3" /> {ride.client.phone}
          </p>
        </div>
      )}
      {ride.driver && (
        <div className="pt-2 border-t border-gray-50">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">Driver</p>
          <p className="text-xs text-gray-700">{ride.driver.fullName}</p>
          <p className="text-[11px] text-gray-400 font-mono flex items-center gap-1">
            <Phone className="h-3 w-3" /> {ride.driver.phone}
          </p>
          {ride.driver.vehiclePlate && (
            <p className="text-[11px] text-gray-500 mt-1">
              {[
                ride.driver.vehicleColor,
                ride.driver.vehicleMake,
                ride.driver.vehicleModel,
                ride.driver.vehiclePlate,
              ]
                .filter(Boolean)
                .join(' ')}
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
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-xs text-orange-600 hover:underline"
        >
          #{bookingId.slice(0, 8)}…
        </a>
        <StatusBadge status={job.status} />
      </div>
      <DetailRow label="Category" value={job.category?.name ?? '-'} />
      <DetailRow label="Description" value={job.description || '-'} />
      {job.addressText && <DetailRow label="Address" value={job.addressText} />}
      {job.client && (
        <div className="pt-2 border-t border-gray-50">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">Client</p>
          <p className="text-xs text-gray-700">{job.client.name ?? '-'}</p>
          {job.client.phone && (
            <p className="text-[11px] text-gray-400 font-mono flex items-center gap-1">
              <Phone className="h-3 w-3" /> {job.client.phone}
            </p>
          )}
        </div>
      )}
      {job.artisan && (
        <div className="pt-2 border-t border-gray-50">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">Artisan</p>
          <p className="text-xs text-gray-700">{job.artisan.name ?? '-'}</p>
          {job.artisan.phone && (
            <p className="text-[11px] text-gray-400 font-mono flex items-center gap-1">
              <Phone className="h-3 w-3" /> {job.artisan.phone}
            </p>
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

function TimelineRow({
  icon,
  label,
  at,
}: {
  icon: React.ReactNode
  label: string
  at: string | null
}) {
  const done = !!at
  return (
    <div className={`flex items-center gap-2 ${done ? 'text-gray-700' : 'text-gray-400'}`}>
      <span className="shrink-0">{done ? icon : <Clock className="h-3 w-3" />}</span>
      <span className="flex-1">{label}</span>
      <span className="text-[10px] text-gray-400 shrink-0">{at ? fmtDate(at) : '-'}</span>
    </div>
  )
}

// ─── Welfare-check resolve dialog ─────────────────────────────────────────────

function WelfareResolveDialog({
  alert,
  onClose,
  onResolved,
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
      if (err instanceof ApiError && err.code === 'WELFARE_CHECK_ALREADY_RESOLVED') {
        setErrorMsg('This welfare check has already been resolved.')
      } else {
        setErrorMsg(err instanceof ApiError ? err.message : 'Failed to resolve welfare check.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={!!alert}
      onOpenChange={(open) => {
        if (!open && !submitting) onClose()
      }}
    >
      <DialogContent className="max-w-md p-0 overflow-hidden gap-0">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-gray-100 space-y-0">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <HeartPulse className="h-5 w-5 text-amber-600" />
            </div>
            <div className="min-w-0 text-left">
              <DialogTitle className="text-base text-gray-900">Resolve welfare check</DialogTitle>
              <DialogDescription className="text-xs text-gray-500 mt-0.5">
                Confirm the artisan is safe. Logged with your admin id, note, and contact method.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="px-5 py-4 space-y-4">
          {/* Who / when / where */}
          <div className="rounded-lg bg-gray-50 px-3 py-2.5">
            <p className="text-sm font-semibold text-gray-800 truncate">
              {alert.actorName ?? 'Unknown artisan'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5 flex items-center flex-wrap gap-x-3 gap-y-0.5">
              <span className="capitalize">{alert.actorRole}</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> raised {timeAgo(alert.occurredAt)}
              </span>
              {alert.locationDescription && (
                <span className="inline-flex items-center gap-1 min-w-0">
                  <MapPin className="h-3 w-3 shrink-0" />{' '}
                  <span className="truncate">{alert.locationDescription}</span>
                </span>
              )}
            </p>
          </div>

          {/* Contact method */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              How did you verify?
            </Label>
            <div className="space-y-2">
              {METHOD_OPTIONS.map(({ key, icon: Icon, label, desc }) => {
                const selected = contactMethod === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setContactMethod(key)}
                    className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      selected ? 'border-gray-300 bg-gray-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        selected ? 'bg-gray-200 text-gray-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{label}</p>
                      <p className="text-xs text-gray-400">{desc}</p>
                    </div>
                    <span
                      className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        selected ? 'border-gray-800 bg-gray-800' : 'border-gray-300'
                      }`}
                    >
                      {selected && <Check className="h-2.5 w-2.5 text-white" />}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Note <span className="font-normal normal-case text-gray-400">(audit-logged)</span>
            </Label>
            <Textarea
              rows={3}
              placeholder="e.g. Reached artisan by phone - they finished the job and forgot to mark it done. Reminded them to update status."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="text-sm resize-none"
            />
            <p className={`text-[11px] ${valid ? 'text-emerald-600' : 'text-gray-400'}`}>
              {valid
                ? 'Looks good'
                : `Minimum 10 characters - ${Math.max(0, 10 - note.trim().length)} more needed`}
            </p>
          </div>

          {errorMsg && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{errorMsg}</p>
            </div>
          )}
        </div>

        <DialogFooter className="px-5 py-4 border-t border-gray-100">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
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
