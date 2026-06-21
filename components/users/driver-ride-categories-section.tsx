'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, CheckCircle, XCircle, Car } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusBadge } from '@/components/common/status-badge'
import {
  getDriverRideCategories, reviewDriverRideCategory, getRideCategories,
  type DriverRideCategory, type RideCategory,
} from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { formatDate } from '@/lib/format-date'

// ── Driver Ride-Tier Verification ─────────────────────────────────────────────
// Per-tier approve/reject for a driver. A driver picks the tiers they want at
// signup and each lands as a `pending` request; an admin verifies the driver's
// vehicle is good enough for that tier before approving. Matching is mutually
// exclusive — a driver only receives a tier's requests once approved for it.
// See docs/ride-categories-admin-integration.md Surface B.
//
// Shared by the driver profile sheet (Users → Drivers) and the document
// verification drawer (Verifications) so both review surfaces stay in sync.

function tierStatusBadge(status: string) {
  // Reuse the monochrome StatusBadge labels (pending/approved/rejected).
  return <StatusBadge status={status} />
}

export function DriverRideCategoriesSection({ driverId, canReview }: { driverId: string; canReview: boolean }) {
  const [rows, setRows] = useState<DriverRideCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // The rideCategoryId currently being approved (inline spinner).
  const [approvingId, setApprovingId] = useState<string | null>(null)

  // Reject dialog state.
  const [rejecting, setRejecting] = useState<DriverRideCategory | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectLoading, setRejectLoading] = useState(false)
  const [rejectError, setRejectError] = useState('')

  // Grant-tier dialog state.
  const [grantOpen, setGrantOpen] = useState(false)
  const [allTiers, setAllTiers] = useState<RideCategory[]>([])
  const [grantTierId, setGrantTierId] = useState('')
  const [grantLoading, setGrantLoading] = useState(false)
  const [grantError, setGrantError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    getDriverRideCategories(driverId)
      .then(setRows)
      .catch(err => setError(err instanceof ApiError ? err.message : 'Failed to load ride tiers.'))
      .finally(() => setLoading(false))
  }, [driverId])

  useEffect(() => { load() }, [load])

  async function handleApprove(row: DriverRideCategory) {
    const tierId = row.rideCategory.id
    setApprovingId(tierId)
    // Optimistic flip.
    setRows(prev => prev.map(r => r.rideCategory.id === tierId ? { ...r, status: 'approved', rejectionReason: null } : r))
    try {
      await reviewDriverRideCategory(driverId, tierId, 'approve')
      load()
    } catch {
      load() // revert to server truth on failure
    } finally {
      setApprovingId(null)
    }
  }

  async function handleRejectConfirm() {
    if (!rejecting) return
    if (rejectReason.trim().length < 5) {
      setRejectError('Reason must be at least 5 characters.')
      return
    }
    setRejectLoading(true)
    setRejectError('')
    const tierId = rejecting.rideCategory.id
    try {
      await reviewDriverRideCategory(driverId, tierId, 'reject', rejectReason.trim())
      setRejecting(null)
      load()
    } catch (err) {
      setRejectError(err instanceof ApiError ? err.message : 'Failed to reject tier.')
    } finally {
      setRejectLoading(false)
    }
  }

  function openGrant() {
    setGrantTierId('')
    setGrantError('')
    setGrantOpen(true)
    // Active tiers only — exclude any the driver already has a row for.
    getRideCategories()
      .then(tiers => setAllTiers(tiers.filter(t => t.isActive)))
      .catch(() => setAllTiers([]))
  }

  async function handleGrantConfirm() {
    if (!grantTierId) { setGrantError('Pick a tier to grant.'); return }
    setGrantLoading(true)
    setGrantError('')
    try {
      // PATCH upserts — approving a tier the driver never requested creates the row.
      await reviewDriverRideCategory(driverId, grantTierId, 'approve')
      setGrantOpen(false)
      load()
    } catch (err) {
      setGrantError(err instanceof ApiError ? err.message : 'Failed to grant tier.')
    } finally {
      setGrantLoading(false)
    }
  }

  const existingTierIds = new Set(rows.map(r => r.rideCategory.id))
  const grantableTiers = allTiers.filter(t => !existingTierIds.has(t.id))

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Ride Tier Verification</p>
        {canReview && (
          <button onClick={openGrant} className="text-[11px] font-medium text-orange-500 hover:text-orange-700">
            Grant tier
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : error ? (
        <p className="text-xs text-red-500">{error}</p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-5 text-center bg-gray-50 rounded-xl">
          <Car className="h-6 w-6 text-gray-200" />
          <p className="text-xs text-gray-400">No tier requests yet</p>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-xl divide-y divide-gray-100">
          {rows.map(row => {
            const tierId = row.rideCategory.id
            const busy = approvingId === tierId
            return (
              <div key={tierId} className="px-4 py-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {row.rideCategory.name}
                      {!row.rideCategory.isActive && <span className="ml-1.5 text-[10px] text-gray-400">(inactive)</span>}
                    </p>
                    {row.reviewedAt && (
                      <p className="text-[10px] text-gray-400">Reviewed {formatDate(row.reviewedAt)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {tierStatusBadge(row.status)}
                    {canReview && row.status !== 'approved' && (
                      <button
                        onClick={() => handleApprove(row)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                        Approve
                      </button>
                    )}
                    {canReview && row.status !== 'rejected' && (
                      <button
                        onClick={() => { setRejecting(row); setRejectReason(''); setRejectError('') }}
                        disabled={busy}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500 hover:text-red-700 disabled:opacity-50"
                      >
                        <XCircle className="h-3 w-3" /> Reject
                      </button>
                    )}
                  </div>
                </div>
                {row.status === 'rejected' && row.rejectionReason && (
                  <p className="text-[11px] text-red-600 bg-red-50 rounded px-2 py-1">{row.rejectionReason}</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Reject reason dialog */}
      <Dialog open={!!rejecting} onOpenChange={open => { if (!open) setRejecting(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <XCircle className="h-4 w-4" /> Reject {rejecting?.rideCategory.name} tier
            </DialogTitle>
            <DialogDescription>
              The driver won&apos;t receive {rejecting?.rideCategory.name} ride requests. The reason is shown to the driver.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs text-gray-500">Reason <span className="text-gray-400">(min 5 chars)</span></Label>
              <textarea
                className="mt-1.5 w-full rounded-lg border border-gray-200 text-sm px-3 py-2 h-20 resize-none focus:outline-none focus:ring-2 focus:ring-orange-200"
                placeholder="e.g. Vehicle photos show a Regular-tier car."
                value={rejectReason}
                onChange={e => { setRejectReason(e.target.value); setRejectError('') }}
              />
            </div>
            {rejectError && <p className="text-xs text-red-600">{rejectError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button
              disabled={rejectLoading || rejectReason.trim().length < 5}
              onClick={handleRejectConfirm}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {rejectLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grant tier dialog */}
      <Dialog open={grantOpen} onOpenChange={open => { if (!open) setGrantOpen(false) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-emerald-700 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" /> Grant a ride tier
            </DialogTitle>
            <DialogDescription>
              Approve this driver for a tier they didn&apos;t request. They become matchable for it immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs text-gray-500">Tier</Label>
              <Select value={grantTierId} onValueChange={v => { setGrantTierId(v); setGrantError('') }}>
                <SelectTrigger className="mt-1.5 bg-white"><SelectValue placeholder="Select a tier…" /></SelectTrigger>
                <SelectContent>
                  {grantableTiers.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-gray-400">No further tiers to grant</div>
                  ) : (
                    grantableTiers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)
                  )}
                </SelectContent>
              </Select>
            </div>
            {grantError && <p className="text-xs text-red-600">{grantError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantOpen(false)}>Cancel</Button>
            <Button
              disabled={grantLoading || !grantTierId}
              onClick={handleGrantConfirm}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {grantLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Grant & Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
