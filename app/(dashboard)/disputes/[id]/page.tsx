'use client'

import { useState, useEffect, useMemo, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { APIProvider, Map, Polyline, useMap } from '@vis.gl/react-google-maps'
import {
  ArrowLeft, AlertTriangle, Loader2, Scale, MapPin, User as UserIcon,
  Wrench, Car, Clock, Receipt, CheckCircle2, XCircle, Info,
} from 'lucide-react'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { PageGuard } from '@/components/common/page-guard'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getDisputeDetail, resolveDispute, type DisputeDetail } from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { formatGhs } from '@/lib/money'
import { paymentMethodLabel } from '@/lib/payment-labels'

// Spec: docs/admin-frontend-spec-payment-panel.md §4.3
//
// The spec proposes a `{ resolution, refundAmountPesewas?, notes? }` DTO with
// modes REFUND_FULL / REFUND_PARTIAL / REJECT. Until the backend ships that
// contract, this page maps the modes onto the existing
// `resolveDispute(decision, reason, refundAmountPesewas?)` API. See the JSDoc
// in lib/api.ts for the mapping.

type ResolutionMode = 'REFUND_FULL' | 'REFUND_PARTIAL' | 'REJECT'

const ROUTE_EXCESS_THRESHOLD = 30 // PRD 4.8.1
const NOTES_MIN_CHARS = 20

function toPath(points: { lat: number; lng: number }[]): google.maps.LatLngLiteral[] {
  return points.map(p => ({ lat: p.lat, lng: p.lng }))
}

// Dashed-line style for the optimal route: a repeated dot symbol with the
// underlying stroke made invisible (strokeOpacity 0 on the Polyline).
const DASHED_LINE_ICONS: google.maps.IconSequence[] = [{
  icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeWeight: 2, scale: 3 },
  offset: '0',
  repeat: '14px',
}]

// Fits the map viewport to all route points once the map instance is ready.
function FitBounds({ points }: { points: { lat: number; lng: number }[] }) {
  const map = useMap()
  useEffect(() => {
    if (!map || points.length === 0) return
    const bounds = new google.maps.LatLngBounds()
    points.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }))
    map.fitBounds(bounds, 48)
  }, [map, points])
  return null
}

export default function DisputeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [detail, setDetail] = useState<DisputeDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [mode, setMode] = useState<ResolutionMode>('REFUND_FULL')
  const [partialAmountGhs, setPartialAmountGhs] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError('')
    getDisputeDetail(id)
      .then(d => { if (!cancelled) setDetail(d) })
      .catch(err => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 404) {
          setLoadError('Dispute not found.')
        } else {
          setLoadError(err instanceof ApiError ? err.message : 'Failed to load dispute.')
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])

  const isResolved = detail?.status?.startsWith('resolved') || detail?.status === 'rejected'
  const canResolve = detail?.status === 'open' || detail?.status === 'under_review'
  const refundPending = detail?.status === 'refund_pending'
  const refundFailed = detail?.status === 'refund_failed'

  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  const mapsMapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? 'DEMO_MAP_ID'
  const hasRouteData = !!(detail?.gpsTrail?.length && detail.optimalRoute?.length)
  const allPoints = useMemo(() => {
    const pts: { lat: number; lng: number }[] = []
    detail?.gpsTrail?.forEach(p => pts.push({ lat: p.lat, lng: p.lng }))
    detail?.optimalRoute?.forEach(p => pts.push({ lat: p.lat, lng: p.lng }))
    return pts
  }, [detail])

  const maxRefundPesewas = detail?.amountPesewas ?? detail?.payment?.grossPesewas ?? null

  function validate(): string | null {
    if (
      mode !== 'REJECT' &&
      detail?.refundDestination?.required &&
      !detail.refundDestination.verified
    ) {
      return 'The client must OTP-verify a refund MoMo destination before a refund can be approved.'
    }
    if (mode === 'REFUND_PARTIAL') {
      const value = Number(partialAmountGhs)
      if (!Number.isFinite(value) || value <= 0) return 'Enter a refund amount greater than zero.'
      if (maxRefundPesewas != null && value * 100 > maxRefundPesewas) {
        return `Refund cannot exceed ${formatGhs(maxRefundPesewas)}.`
      }
    }
    if (mode === 'REFUND_PARTIAL' || mode === 'REJECT') {
      if (notes.trim().length < NOTES_MIN_CHARS) {
        return `Notes are required (min ${NOTES_MIN_CHARS} characters).`
      }
    }
    // REFUND_FULL: notes are optional, but the existing backend requires at
    // least 20 chars on `reason`. Enforce here so the API call doesn't 400.
    if (mode === 'REFUND_FULL' && notes.trim().length < NOTES_MIN_CHARS) {
      return `Notes are required (min ${NOTES_MIN_CHARS} characters).`
    }
    return null
  }

  // The resolve button validates and opens the confirm dialog; the money only
  // moves from the dialog's confirm (an irreversible action never fires from
  // an inline form button - approved redesign, high-risk flow standard).
  function requestResolve() {
    if (!detail) return
    const validationError = validate()
    if (validationError) { setSubmitError(validationError); return }
    setSubmitError('')
    setConfirmOpen(true)
  }

  async function handleSubmit() {
    if (!detail) return
    const validationError = validate()
    if (validationError) { setSubmitError(validationError); return }
    setSubmitError('')
    setSubmitting(true)

    try {
      let result
      if (mode === 'REFUND_FULL') {
        result = await resolveDispute(detail.id, 'approved', notes.trim())
      } else if (mode === 'REFUND_PARTIAL') {
        const amountPesewas = Math.round(Number(partialAmountGhs) * 100)
        result = await resolveDispute(detail.id, 'approved', notes.trim(), amountPesewas)
      } else {
        result = await resolveDispute(detail.id, 'denied', notes.trim())
      }

      // Flash banner on the list page.
      const refundedPesewas =
        mode === 'REFUND_FULL' ? maxRefundPesewas
        : mode === 'REFUND_PARTIAL' ? Math.round(Number(partialAmountGhs) * 100)
        : 0
      try {
        sessionStorage.setItem(
          'disputes:resolved',
          JSON.stringify({ id: detail.id, refundedPesewas, mode, status: result.status }),
        )
      } catch { /* sessionStorage can be unavailable in incognito; ignore */ }

      router.push('/disputes')
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'CASH_REFUND_DESTINATION_REQUIRED') {
          setSubmitError('The client must OTP-verify a refund MoMo destination before approval.')
        } else if (err.code === 'PAYOUT_OUTCOME_PENDING') {
          setSubmitError('The provider payout is still under financial review. Try again shortly.')
        } else if (err.code === 'DISPUTE_ALREADY_RESOLVED' || err.status === 409) {
          setSubmitError('This dispute has already been resolved.')
        } else if (err.code === 'REFUND_AMOUNT_REQUIRED') {
          setSubmitError('Refund amount is required for partial refunds.')
        } else {
          setSubmitError(err.message)
        }
      } else {
        setSubmitError('Failed to resolve dispute.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageGuard permission="resolve_dispute">
      <div className="space-y-4">
        <PageHeader
          title={detail ? `Dispute #${detail.id.slice(0, 8)}...` : 'Dispute'}
          subtitle={detail?.description ?? 'Review evidence and resolve'}
          actions={
            <Link href="/disputes">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ArrowLeft className="h-3.5 w-3.5" /> Back to disputes
              </Button>
            </Link>
          }
        />

        {loading && (
          <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading dispute...</span>
          </div>
        )}

        {!loading && loadError && (
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-700 font-medium">{loadError}</p>
            </div>
          </div>
        )}

        {!loading && detail && (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-5">
            {/* ── Left column: map + evidence ── */}
            <div className="space-y-4">
              {/* Map */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Route comparison</p>
                  {detail.routeExcessPercent != null && (
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        detail.routeExcessPercent >= ROUTE_EXCESS_THRESHOLD
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                      title={`PRD 4.8.1 threshold: ${ROUTE_EXCESS_THRESHOLD}%`}
                    >
                      {detail.routeExcessPercent.toFixed(1)}% over optimal
                      {detail.routeExcessPercent >= ROUTE_EXCESS_THRESHOLD && (
                        <AlertTriangle className="h-3 w-3 inline-block ml-1 text-red-500" />
                      )}
                    </span>
                  )}
                </div>
                {hasRouteData && mapsApiKey ? (
                  <div className="h-80">
                    <APIProvider apiKey={mapsApiKey}>
                      <Map
                        mapId={mapsMapId}
                        defaultCenter={{ lat: allPoints[0].lat, lng: allPoints[0].lng }}
                        defaultZoom={12}
                        gestureHandling="greedy"
                        zoomControl
                        scaleControl
                        style={{ width: '100%', height: '100%' }}
                      >
                        <FitBounds points={allPoints} />
                        {/* Optimal route - dashed blue */}
                        <Polyline
                          path={toPath(detail.optimalRoute as { lat: number; lng: number }[])}
                          strokeColor="#3B82F6"
                          strokeOpacity={0}
                          icons={DASHED_LINE_ICONS}
                        />
                        {/* Actual GPS trail - solid red */}
                        <Polyline
                          path={toPath(detail.gpsTrail as { lat: number; lng: number }[])}
                          strokeColor="#EF4444"
                          strokeWeight={3}
                        />
                      </Map>
                    </APIProvider>
                  </div>
                ) : (
                  <div className="h-40 flex items-center justify-center text-center px-6">
                    <div className="space-y-1">
                      <MapPin className="h-6 w-6 text-gray-300 mx-auto" />
                      <p className="text-sm text-gray-400">
                        {!mapsApiKey
                          ? 'Map disabled - NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not set.'
                          : 'No GPS trail captured for this dispute.'}
                      </p>
                    </div>
                  </div>
                )}
                {hasRouteData && (
                  <div className="px-5 py-2 bg-gray-50 text-[11px] text-gray-500 flex items-center gap-4">
                    <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-0.5 bg-red-500" />Actual GPS trail</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-0.5 bg-blue-500" style={{ borderTop: '2px dashed' }} />Optimal route</span>
                  </div>
                )}
              </div>

              {/* Snapshot panels */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SnapshotPanel
                  icon={<UserIcon className="h-4 w-4" />}
                  title="Client"
                  rows={[
                    ['Name', detail.client?.fullName ?? '-'],
                    ['Phone', detail.client?.phone ?? '-'],
                  ]}
                />
                <SnapshotPanel
                  icon={detail.provider?.type === 'driver' ? <Car className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
                  title={detail.provider?.type === 'driver' ? 'Driver' : detail.provider?.type === 'artisan' ? 'Artisan' : 'Provider'}
                  rows={[
                    ['Name', detail.provider?.fullName ?? '-'],
                    ['Phone', detail.provider?.phone ?? '-'],
                  ]}
                />
                <SnapshotPanel
                  icon={detail.booking?.type === 'ride' ? <Car className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
                  title={detail.booking?.type === 'ride' ? 'Ride' : detail.booking?.type === 'job' ? 'Job' : 'Booking'}
                  rows={
                    detail.booking?.type === 'ride'
                      ? [
                          ['Pickup', detail.booking?.pickupAddress ?? '-'],
                          ['Dropoff', detail.booking?.dropoffAddress ?? '-'],
                          ['Fare', detail.booking?.farePesewas != null ? formatGhs(detail.booking.farePesewas) : '-'],
                        ]
                      : [
                          ['Reference', detail.booking?.shortRef ?? detail.booking?.id?.slice(0, 8) ?? '-'],
                          ['Fare', detail.booking?.farePesewas != null ? formatGhs(detail.booking.farePesewas) : '-'],
                        ]
                  }
                />
                <SnapshotPanel
                  icon={<Receipt className="h-4 w-4" />}
                  title="Payment"
                  rows={[
                    ['Gross', detail.payment?.grossPesewas != null ? formatGhs(detail.payment.grossPesewas) : '-'],
                    ['Commission', detail.payment?.commissionPesewas != null ? formatGhs(detail.payment.commissionPesewas) : '-'],
                    ['Method', paymentMethodLabel(detail.payment?.method)],
                    ['Status', detail.payment?.status ? <StatusBadge key="s" status={detail.payment.status} /> : '-'],
                  ]}
                />
              </div>

              {/* Evidence */}
              {detail.evidence && detail.evidence.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Evidence</p>
                  <div className="space-y-2">
                    {detail.evidence.map((e, idx) => (
                      <div key={idx} className="text-sm text-gray-700">
                        {e.kind === 'photo' && e.url ? (
                          <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            Photo {idx + 1}
                          </a>
                        ) : (
                          <p>{e.text ?? '-'}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Right column: meta + resolution form ── */}
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Dispute</p>
                <Row label="Status"><StatusBadge status={detail.status} /></Row>
                <Row label="Type">
                  <span className="text-sm capitalize">{detail.type}</span>
                </Row>
                <Row label="Raised">
                  <span className="text-sm text-gray-600 flex items-center gap-1.5">
                    <Clock className="h-3 w-3 text-gray-400" />
                    {new Date(detail.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </Row>
                <Row label="Disputed amount">
                  <span className="text-sm font-semibold">{maxRefundPesewas != null ? formatGhs(maxRefundPesewas) : '-'}</span>
                </Row>
                {detail.description && (
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">Reason</p>
                    <p className="text-sm text-gray-700 mt-1 leading-snug">{detail.description}</p>
                  </div>
                )}
              </div>

              {detail.refundDestination?.required && (
                <div className={`rounded-2xl border p-5 space-y-2 ${
                  detail.refundDestination.verified
                    ? 'bg-emerald-50 border-emerald-100'
                    : 'bg-amber-50 border-amber-100'
                }`}>
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                    Cash refund destination
                  </p>
                  {detail.refundDestination.verified ? (
                    <div className="flex items-start gap-2 text-sm text-emerald-700">
                      <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>
                        OTP verified: {paymentMethodLabel(detail.refundDestination.method)} **** {detail.refundDestination.accountLast4 ?? '----'}
                        {detail.refundDestination.locked ? ' (locked for processing)' : ''}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 text-sm text-amber-800">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>The client has not yet OTP-verified a MoMo destination. Refund approval must remain blocked; rejection is still available.</span>
                    </div>
                  )}
                </div>
              )}

              {refundPending ? (
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 flex items-start gap-3">
                  <Loader2 className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800">
                    The refund is approved and being reconciled. No provider clawback is created until the client repayment is authoritatively successful.
                  </p>
                </div>
              ) : refundFailed ? (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-5 flex items-start gap-3">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">
                    Refund processing failed closed. The payment remains blocked and no provider clawback exists. Reconcile the gateway outcome before any further action.
                  </p>
                </div>
              ) : isResolved ? (
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-emerald-700">
                    This dispute has already been resolved.
                  </p>
                </div>
              ) : canResolve ? (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Resolution</p>

                  <ResolutionRadio
                    label="Full refund"
                    description={maxRefundPesewas != null ? `Refund ${formatGhs(maxRefundPesewas)} to the client.` : 'Refund the full disputed amount.'}
                    value="REFUND_FULL"
                    selected={mode}
                    onSelect={setMode}
                    icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                  />
                  <ResolutionRadio
                    label="Partial refund"
                    description="Refund a portion to the client; the rest is released to the provider."
                    value="REFUND_PARTIAL"
                    selected={mode}
                    onSelect={setMode}
                    icon={<Scale className="h-3.5 w-3.5" />}
                  />
                  {mode === 'REFUND_PARTIAL' && (
                    <div className="ml-7 space-y-1.5">
                      <Label className="text-xs">Partial refund amount (GHS)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        max={maxRefundPesewas != null ? (maxRefundPesewas / 100).toFixed(2) : undefined}
                        placeholder={maxRefundPesewas != null
                          ? `Max: ${formatGhs(maxRefundPesewas)}`
                          : 'Enter amount'}
                        value={partialAmountGhs}
                        onChange={e => setPartialAmountGhs(e.target.value)}
                        className="text-sm"
                      />
                    </div>
                  )}
                  <ResolutionRadio
                    label="Reject"
                    description="No refund. Provider keeps the full earning."
                    value="REJECT"
                    selected={mode}
                    onSelect={setMode}
                    icon={<XCircle className="h-3.5 w-3.5" />}
                  />

                  <div className="space-y-1.5 pt-1">
                    <Label className="text-xs">
                      Notes <span className="text-gray-400">(min {NOTES_MIN_CHARS} chars)</span>
                    </Label>
                    <Textarea
                      placeholder="Reasoning for this resolution. Visible in the audit log."
                      rows={4}
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      className="text-sm"
                    />
                    <p className={`text-[11px] ${notes.length >= NOTES_MIN_CHARS ? 'text-emerald-600' : 'text-gray-400'}`}>
                      {notes.length}/{NOTES_MIN_CHARS} characters
                    </p>
                  </div>

                  {submitError && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-700">{submitError}</p>
                    </div>
                  )}

                  {mode !== 'REJECT' && detail.refundDestination?.required && !detail.refundDestination.verified && (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-800">Refund actions are disabled until the client verifies the destination.</p>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2">
                    <Link href="/disputes" className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">Cancel</Button>
                    </Link>
                    <Button
                      size="sm"
                      variant={mode === 'REJECT' ? 'destructive' : 'brand'}
                      disabled={submitting || (mode !== 'REJECT' && detail.refundDestination?.required && !detail.refundDestination.verified)}
                      onClick={requestResolve}
                      className="flex-1"
                    >
                      {mode === 'REJECT'
                        ? 'Reject dispute'
                        : mode === 'REFUND_PARTIAL'
                          ? `Refund ${partialAmountGhs ? `GHS ${Number(partialAmountGhs).toFixed(2)}` : 'partially'}`
                          : `Refund ${maxRefundPesewas != null ? formatGhs(maxRefundPesewas) : 'in full'}`}
                    </Button>
                  </div>

                  <div className="flex items-start gap-2 pt-1">
                    <Info className="h-3 w-3 text-gray-300 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-gray-400 leading-snug">
                      Approval starts an idempotent client refund. Any provider clawback is created only after repayment succeeds.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 text-sm text-gray-600">
                  This dispute is not in an actionable state. Refresh after reconciliation.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {detail && (
        <ConfirmDialog
          open={confirmOpen}
          onClose={() => { if (!submitting) setConfirmOpen(false) }}
          title={mode === 'REJECT'
            ? 'Reject this dispute?'
            : mode === 'REFUND_PARTIAL'
              ? `Refund GHS ${Number(partialAmountGhs || 0).toFixed(2)} to the client?`
              : `Refund ${maxRefundPesewas != null ? formatGhs(maxRefundPesewas) : 'the full amount'} to the client?`}
          description={mode === 'REJECT'
            ? 'No refund - the provider keeps the full earning. This cannot be undone and is recorded in the audit log.'
            : 'The client gets this money back and the provider\u2019s earning is reduced. This cannot be undone and is recorded in the audit log.'}
          confirmLabel={mode === 'REJECT'
            ? 'Reject dispute'
            : mode === 'REFUND_PARTIAL'
              ? `Refund GHS ${Number(partialAmountGhs || 0).toFixed(2)}`
              : `Refund ${maxRefundPesewas != null ? formatGhs(maxRefundPesewas) : 'in full'}`}
          destructive={mode === 'REJECT'}
          loading={submitting}
          error={submitError || null}
          onConfirm={() => { void handleSubmit() }}
        >
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            <span className="font-semibold text-gray-800">Your note:</span> {notes.trim() || '-'}
          </div>
        </ConfirmDialog>
      )}
    </PageGuard>
  )
}

// ── Small components ──────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[11px] uppercase tracking-wide text-gray-400">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  )
}

function SnapshotPanel({
  icon, title, rows,
}: {
  icon: React.ReactNode
  title: string
  rows: Array<[string, React.ReactNode]>
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
      <div className="flex items-center gap-2 text-gray-400">
        {icon}
        <p className="text-xs font-semibold uppercase tracking-widest">{title}</p>
      </div>
      <div className="space-y-1.5 pt-1">
        {rows.map(([label, value], idx) => (
          <div key={idx} className="flex items-start justify-between gap-3 text-sm">
            <span className="text-[11px] uppercase tracking-wide text-gray-400 mt-0.5">{label}</span>
            <span className="text-right text-gray-700">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ResolutionRadio({
  label, description, value, selected, onSelect, icon,
}: {
  label: string
  description: string
  value: ResolutionMode
  selected: ResolutionMode
  onSelect: (v: ResolutionMode) => void
  icon: React.ReactNode
}) {
  const active = selected === value
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`w-full text-left rounded-lg border p-3 transition-colors ${
        active
          ? 'border-orange-300 bg-orange-50/60'
          : 'border-gray-100 hover:border-gray-200'
      }`}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 w-3.5 h-3.5 rounded-full border ${
          active ? 'border-orange-400 bg-orange-400' : 'border-gray-300'
        }`} />
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
            {icon}
            {label}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">{description}</p>
        </div>
      </div>
    </button>
  )
}
