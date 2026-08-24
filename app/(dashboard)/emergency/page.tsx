'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps'
import { PageGuard } from '@/components/common/page-guard'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { StatCard } from '@/components/common/stat-card'
import { FilterBar } from '@/components/common/filter-bar'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { ErrorState } from '@/components/common/error-state'
import { EmptyState } from '@/components/common/empty-state'
import { PageSkeleton } from '@/components/common/load-state'
import { Pager } from '@/components/common/pager'
import {
  ShieldAlert,
  HeartPulse,
  CheckCircle2,
  Clock,
  MapPin,
  Car,
  Wrench,
  User,
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  Mic,
  Phone,
  PhoneCall,
  UserCheck,
  Cpu,
  ChevronDown,
  History,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { useDateRange } from '@/components/common/date-range-filter'
import { isInstantInInclusiveDateRange, dateBasisCaption } from '@/lib/date-range'
import { formatDateTime as fmtDate, timeAgo } from '@/lib/format-date'

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
// the response window). `pending` is harmless - the cron is still waiting.
function needsAction(alert: EmergencyAlert): boolean {
  if (alert.type === 'sos') return !alert.acknowledgedAt
  return alert.welfareCheck?.status === 'escalated'
}

// Welfare-check status -> human label + styling
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
              variant="destructive"
              className="h-8 text-xs gap-1.5"
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
              variant="brand"
              className="h-8 text-xs gap-1.5"
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
  const { from, to, preset: dateRange, control: dateControl } = useDateRange('all')
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<'all' | 'sos' | 'welfare_check'>('all')
  const [page, setPage] = useState(1)
  const [showResolved, setShowResolved] = useState(false)
  const [showAllAction, setShowAllAction] = useState(false)
  const [ackTarget, setAckTarget] = useState<EmergencyAlert | null>(null)
  const [welfareTarget, setWelfareTarget] = useState<EmergencyAlert | null>(null)
  const [acking, setAcking] = useState(false)
  const [selectedAlert, setSelectedAlert] = useState<EmergencyAlert | null>(null)
  const requestSequence = useRef(0)

  const load = useCallback(() => {
    const request = ++requestSequence.current
    setLoading(true)
    setError(null)
    getEmergencyAlerts({ from, to })
      .then((data) => {
        if (request === requestSequence.current) {
          setAlerts(data)
        }
      })
      .catch(() => { if (request === requestSequence.current) setError('Failed to load emergency alerts.') })
      .finally(() => { if (request === requestSequence.current) setLoading(false) })
  }, [from, to])

  useEffect(() => {
    load()
  }, [load])

  // No-op while auto-refresh is globally disabled (see AUTO_REFRESH_DISABLED).
  useAutoRefresh(load, 30_000)

  const typeFiltered = alerts.filter(a => typeFilter === 'all' || a.type === typeFilter)

  // Live triage is never date-filtered: an older unresolved alert must remain
  // visible. The selected date range applies only to handled/monitored history.
  const needsActionList = typeFiltered.filter(needsAction).sort((a, b) => {
    // SOS before welfare, then most recent first.
    const aw = a.type === 'sos' ? 0 : 1
    const bw = b.type === 'sos' ? 0 : 1
    if (aw !== bw) return aw - bw
    return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  })
  const otherList = typeFiltered
    .filter((a) => !needsAction(a))
    .filter(a => isInstantInInclusiveDateRange(a.occurredAt, { from, to }))
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())

  // Reset history pagination whenever filters change.
  useEffect(() => {
    setPage(1)
  }, [typeFilter, dateRange, from, to])

  // Pagination over the acknowledged/monitored history only.
  const otherTotalPages = Math.max(1, Math.ceil(otherList.length / OTHER_PAGE_SIZE))
  const otherPage = Math.min(page, otherTotalPages)
  const otherStart = (otherPage - 1) * OTHER_PAGE_SIZE
  const otherPageItems = otherList.slice(otherStart, otherStart + OTHER_PAGE_SIZE)

  const needsActionCount = needsActionList.length
  const sosCount = needsActionList.filter(a => a.type === 'sos').length
  const welfareCount = needsActionList.filter(a => a.type === 'welfare_check').length

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
          title="Emergency alerts"
          subtitle="SOS triggers and welfare checks requiring admin acknowledgement."
        />

        {/* KPI strip */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <StatCard
            icon={AlertTriangle}
            label="Needs action"
            value={needsActionCount}
            tone={needsActionCount > 0 ? 'negative' : 'neutral'}
            sub={needsActionCount > 0 ? 'Waiting on an admin' : 'All caught up'}
            loading={loading && alerts.length === 0}
          />
          <StatCard
            icon={ShieldAlert}
            label="Active SOS"
            value={sosCount}
            tone={sosCount > 0 ? 'negative' : 'neutral'}
            sub={sosCount > 0 ? 'Unacknowledged' : 'None active'}
            loading={loading && alerts.length === 0}
          />
          <StatCard
            icon={HeartPulse}
            label="Welfare checks"
            value={welfareCount}
            tone={welfareCount > 0 ? 'negative' : 'neutral'}
            sub={welfareCount > 0 ? 'Escalated to admin' : 'None escalated'}
            loading={loading && alerts.length === 0}
          />
        </div>

        {/* Filters */}
        <FilterBar
          onRefresh={load}
          refreshing={loading}
          meta={
            <span className="text-xs text-gray-400">
              {needsActionList.length} live, {otherList.length} history in range (latest 200 max). {dateBasisCaption('History alerts', 'recorded')} Live alerts always show.
            </span>
          }
        >
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
            <SelectTrigger className="h-9 w-44 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="sos">SOS only</SelectItem>
              <SelectItem value="welfare_check">Welfare checks only</SelectItem>
            </SelectContent>
          </Select>

          {dateControl}
        </FilterBar>

        {/* Content */}
        {error ? (
          <ErrorState title="Could not load emergency alerts" detail={error} onRetry={load} />
        ) : loading ? (
          <PageSkeleton variant="cards" />
        ) : (
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
                <EmptyState
                  icon={CheckCircle2}
                  title="All clear"
                  description={alerts.length === 0 ? 'No emergency alerts.' : 'No alerts need action right now.'}
                  className="bg-white rounded-xl border border-gray-100 py-8"
                />
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
                      <Pager page={otherPage} pageSize={OTHER_PAGE_SIZE} total={otherList.length} onPage={setPage} />
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
      <ConfirmDialog
        open={!!ackTarget}
        onClose={() => setAckTarget(null)}
        title={ackTarget?.type === 'sos' ? 'Acknowledge this SOS emergency?' : 'Acknowledge this welfare check?'}
        description={
          <>
            Confirm you have reviewed and responded to this{' '}
            <strong>{ackTarget?.type === 'sos' ? 'SOS emergency' : 'welfare check'}</strong> for{' '}
            <strong>{ackTarget?.actorName ?? 'unknown user'}</strong>. This action is recorded in the audit log.
          </>
        }
        confirmLabel="Acknowledge alert"
        onConfirm={() => handleAcknowledge()}
        loading={acking}
      />
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
              <div className="space-y-1.5 bg-gray-50 rounded-lg p-3">
                <div className="h-3 w-32 bg-gray-200 rounded animate-pulse" />
                <div className="h-3 w-48 bg-gray-200 rounded animate-pulse" />
              </div>
            ) : bookingError ? (
              <ErrorState compact title="Could not load this booking" detail={bookingError} />
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
              <Button onClick={() => onAcknowledge(alert)} variant="destructive" className="w-full gap-2">
                <CheckCircle2 className="h-4 w-4" /> Acknowledge this alert
              </Button>
              <p className="text-[10px] text-gray-400 text-center mt-2">
                Logged in the audit trail with your admin id.
              </p>
            </div>
          )}
          {!isSos && !isAck && (
            <div className="pt-2 border-t border-gray-100">
              <Button onClick={() => onResolveWelfare(alert)} variant="brand" className="w-full gap-2">
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
          #{bookingId.slice(0, 8)}...
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
          #{bookingId.slice(0, 8)}...
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
  const [contactMethod, setContactMethod] = useState<WelfareContactMethod>('phone')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    setContactMethod('phone')
    setErrorMsg(null)
  }, [alert?.id])

  if (!alert) return null

  async function handleSubmit(reason: string) {
    if (!alert?.welfareCheck) return
    setErrorMsg(null)
    setSubmitting(true)
    try {
      // The welfare-check id is in alert.id - backend unions welfare_checks
      // into /admin/emergency, and our resolve endpoint takes that id directly.
      await resolveWelfareCheck(alert.id, { note: reason.trim(), contactMethod })
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
    <ConfirmDialog
      open={!!alert}
      onClose={onClose}
      title="Resolve this welfare check?"
      description="Confirm the artisan is safe. This is logged with your admin id, a note, and the contact method."
      confirmLabel="Resolve welfare check"
      onConfirm={handleSubmit}
      loading={submitting}
      error={errorMsg}
      requireReason
      minReason={10}
      reasonLabel="Note (kept in the audit log)"
      reasonPlaceholder="e.g. Reached artisan by phone - they finished the job and forgot to mark it done. Reminded them to update status."
    >
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
    </ConfirmDialog>
  )
}
