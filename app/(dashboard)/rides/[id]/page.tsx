'use client'

import { useState, useEffect } from 'react'
import { PageGuard } from '@/components/common/page-guard'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, User, Car, MapPin, Clock,
  AlertTriangle, CheckCircle, ShieldAlert, XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { getRideDetail, cancelRide, forceCompleteRide, type RideDetail } from '@/lib/api'
import { getAdminUser } from '@/lib/api-client'
import { can } from '@/lib/roles'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtGhs(pesewas: number | null | undefined) {
  if (pesewas == null) return '—'
  return 'GHS ' + (pesewas / 100).toLocaleString('en-GH', { minimumFractionDigits: 2 })
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtShort(iso: string | null | undefined) {
  if (!iso) return null
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function TimelineRow({ label, value, highlight }: { label: string; value: string | null; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className={`w-2 h-2 rounded-full shrink-0 ${value ? (highlight ? 'bg-red-400' : 'bg-emerald-500') : 'bg-gray-200'}`} />
      <span className="text-xs text-gray-500 w-40 shrink-0">{label}</span>
      <span className={`text-xs font-medium ${value ? (highlight ? 'text-red-600' : 'text-gray-700') : 'text-gray-300'}`}>
        {value ?? '—'}
      </span>
    </div>
  )
}

// ── Action Dialog ─────────────────────────────────────────────────────────────

function ActionDialog({ open, title, description, confirmLabel, confirmClass, onClose, onConfirm, loading }: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  confirmClass: string
  onClose: () => void
  onConfirm: (reason: string) => void
  loading: boolean
}) {
  const [reason, setReason] = useState('')
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-1">
          <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Reason (audit log)</Label>
          <Textarea
            placeholder="Provide a clear reason — minimum 10 characters"
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
          />
          <p className="text-[11px] text-gray-400">{reason.length} / min 10 characters</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onConfirm(reason)} disabled={loading || reason.trim().length < 10} className={`${confirmClass} gap-2`}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Processing…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RideDetailPage({ params }: { params: { id: string } }) {
  const { id: rideId } = params
  const admin = getAdminUser()
  const canIntervene = can(admin?.permissions ?? null, 'intervene_ride')

  const [ride, setRide] = useState<RideDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [forceOpen, setForceOpen] = useState(false)
  const [forcing, setForcing] = useState(false)

  useEffect(() => {
    setLoading(true)
    getRideDetail(rideId)
      .then(setRide)
      .catch(e => setError((e as Error).message ?? 'Failed to load ride'))
      .finally(() => setLoading(false))
  }, [rideId])

  async function handleCancel(reason: string) {
    setCancelling(true); setActionError(null)
    try {
      await cancelRide(rideId, reason)
      const updated = await getRideDetail(rideId)
      setRide(updated)
      setCancelOpen(false)
    } catch (e) { setActionError((e as Error).message ?? 'Cancel failed') }
    finally { setCancelling(false) }
  }

  async function handleForceComplete(reason: string) {
    setForcing(true); setActionError(null)
    try {
      await forceCompleteRide(rideId, reason)
      const updated = await getRideDetail(rideId)
      setRide(updated)
      setForceOpen(false)
    } catch (e) { setActionError((e as Error).message ?? 'Force complete failed') }
    finally { setForcing(false) }
  }

  const CANCELLABLE = ['requested', 'accepted', 'driver_en_route', 'arrived_at_pickup', 'in_progress']
  const canCancel = ride ? CANCELLABLE.includes(ride.status) && canIntervene : false
  const canForce  = ride ? ride.status === 'in_progress' && canIntervene : false

  const fare = ride?.finalFarePesewas ?? ride?.estimatedFarePesewas

  return (
    <PageGuard permission="view_rides">
      <div>
        <PageHeader
          title="Ride Details"
          subtitle={ride ? `#${ride.id.slice(-8).toUpperCase()}` : 'Loading…'}
          actions={
            <Link href="/rides">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ArrowLeft className="h-4 w-4" /> Back to Rides
              </Button>
            </Link>
          }
        />

        {loading && (
          <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading ride…</span>
          </div>
        )}

        {!loading && error && (
          <div className="bg-white rounded-xl shadow-sm p-10 text-center text-red-500 text-sm">{error}</div>
        )}

        {!loading && ride && (
          <div className="space-y-4">

            {/* Status bar */}
            <div className="flex items-center gap-3 flex-wrap bg-white rounded-xl shadow-sm px-4 py-3">
              <StatusBadge status={ride.status} />
              {ride.status === 'disputed' && (
                <span className="flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                  <AlertTriangle className="h-3 w-3" /> Disputed
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                {canForce && (
                  <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white gap-1.5" onClick={() => setForceOpen(true)}>
                    <CheckCircle className="h-3.5 w-3.5" /> Force Complete
                  </Button>
                )}
                {canCancel && (
                  <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 gap-1.5" onClick={() => setCancelOpen(true)}>
                    <XCircle className="h-3.5 w-3.5" /> Cancel Ride
                  </Button>
                )}
                {ride.status === 'disputed' && (
                  <Link href={`/disputes?search=${ride.id}`}>
                    <Button size="sm" variant="outline" className="border-amber-300 text-amber-600 hover:bg-amber-50 gap-1.5">
                      <ShieldAlert className="h-3.5 w-3.5" /> Handle Dispute
                    </Button>
                  </Link>
                )}
              </div>
            </div>

            {actionError && (
              <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {actionError}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

              {/* Left — route + timeline */}
              <div className="lg:col-span-2 space-y-4">

                {/* Ride overview */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Car className="h-4 w-4 text-blue-400" /> Ride Overview
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Route */}
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <MapPin className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-[11px] text-gray-400 uppercase tracking-wide">Pickup</p>
                          <p className="text-sm text-gray-800">{ride.pickupAddress || '—'}</p>
                        </div>
                      </div>
                      {ride.stops.map(s => (
                        <div key={s.stopOrder} className="flex items-start gap-2 pl-1">
                          <MapPin className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[11px] text-gray-400 uppercase tracking-wide">Stop {s.stopOrder}</p>
                            <p className="text-sm text-gray-700">{s.addressText || '—'}</p>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-start gap-2">
                        <MapPin className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-[11px] text-gray-400 uppercase tracking-wide">Dropoff</p>
                          <p className="text-sm text-gray-800">{ride.dropoffAddress || '—'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Metrics */}
                    <div className="grid grid-cols-3 gap-3 pt-1">
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">Fare</p>
                        <p className="text-base font-bold text-gray-900">{fmtGhs(fare)}</p>
                        {ride.surgeMultiplier && Number(ride.surgeMultiplier) > 1 && (
                          <p className="text-[10px] text-amber-500">×{Number(ride.surgeMultiplier).toFixed(2)} surge</p>
                        )}
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">Distance</p>
                        <p className="text-base font-bold text-gray-900">
                          {ride.distanceKm ? `${Number(ride.distanceKm).toFixed(1)} km` : '—'}
                        </p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">Duration</p>
                        <p className="text-base font-bold text-gray-900">
                          {ride.durationMins ? `${Math.round(Number(ride.durationMins))} min` : '—'}
                        </p>
                      </div>
                    </div>

                    {ride.cancellationReason && (
                      <div className="mt-1 text-xs text-red-600 bg-red-50 rounded px-3 py-2">
                        Cancellation reason: {ride.cancellationReason}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Timeline */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Clock className="h-4 w-4 text-gray-400" /> Timeline
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TimelineRow label="Requested"            value={fmtShort(ride.createdAt)} />
                    <TimelineRow label="Driver Accepted"      value={fmtShort(ride.acceptedAt)} />
                    <TimelineRow label="Driver En Route"      value={fmtShort(ride.driverEnRouteAt)} />
                    <TimelineRow label="Arrived at Pickup"    value={fmtShort(ride.arrivedAtPickupAt)} />
                    <TimelineRow label="Trip Started"         value={fmtShort(ride.startedAt)} />
                    <TimelineRow label="Completed"            value={fmtShort(ride.completedAt)} />
                    {ride.cancelledAt && (
                      <TimelineRow label="Cancelled" value={fmtDate(ride.cancelledAt)} highlight />
                    )}
                  </CardContent>
                </Card>

              </div>

              {/* Right — parties */}
              <div className="space-y-4">

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <User className="h-4 w-4 text-blue-400" /> Client
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {ride.client ? (
                      <>
                        <p className="text-sm font-semibold text-gray-900">{ride.client.user.fullName}</p>
                        <p className="text-xs text-gray-500">{ride.client.user.phone}</p>
                      </>
                    ) : (
                      <p className="text-sm text-gray-400">No client info</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Car className="h-4 w-4 text-slate-500" /> Driver
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {ride.driver ? (
                      <div className="space-y-1.5">
                        <p className="text-sm font-semibold text-gray-900">{ride.driver.user.fullName}</p>
                        <p className="text-xs text-gray-500">{ride.driver.user.phone}</p>
                        {(ride.driver.vehicleMake || ride.driver.vehiclePlate) && (
                          <div className="mt-2 bg-gray-50 rounded-lg px-3 py-2 space-y-1">
                            <p className="text-xs font-medium text-gray-700">
                              {[ride.driver.vehicleColor, ride.driver.vehicleMake, ride.driver.vehicleModel].filter(Boolean).join(' ')}
                            </p>
                            {ride.driver.vehiclePlate && (
                              <p className="text-xs font-mono text-gray-500 bg-white border border-gray-200 inline-block px-2 py-0.5 rounded">
                                {ride.driver.vehiclePlate}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-amber-600 font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" /> Unassigned
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Key dates */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-600">Key Dates</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Created</span>
                      <span className="text-gray-700 font-medium">{fmtDate(ride.createdAt)}</span>
                    </div>
                    {ride.completedAt && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Completed</span>
                        <span className="text-gray-700 font-medium">{fmtDate(ride.completedAt)}</span>
                      </div>
                    )}
                    {ride.cancelledAt && (
                      <div className="flex justify-between">
                        <span className="text-red-400">Cancelled</span>
                        <span className="text-red-600 font-medium">{fmtDate(ride.cancelledAt)}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

              </div>
            </div>
          </div>
        )}

        <ActionDialog
          open={cancelOpen}
          title="Cancel Ride"
          description="This will cancel the ride and notify both the client and driver. The action is audit logged."
          confirmLabel="Cancel Ride"
          confirmClass="bg-red-600 hover:bg-red-700 text-white"
          onClose={() => setCancelOpen(false)}
          onConfirm={handleCancel}
          loading={cancelling}
        />

        <ActionDialog
          open={forceOpen}
          title="Force Complete Ride"
          description="This marks the ride as completed. Use only for rides stuck in progress where the trip has clearly ended. The action is audit logged."
          confirmLabel="Force Complete"
          confirmClass="bg-orange-500 hover:bg-orange-600 text-white"
          onClose={() => setForceOpen(false)}
          onConfirm={handleForceComplete}
          loading={forcing}
        />
      </div>
    </PageGuard>
  )
}
