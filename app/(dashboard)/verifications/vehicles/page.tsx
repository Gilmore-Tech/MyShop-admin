'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Car, CheckCircle2, Loader2, Pencil, RefreshCw, Trash2, XCircle } from 'lucide-react'

import { StatusBadge } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRole } from '@/hooks/use-role'
import { getRideCategories, type RideCategory } from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import {
  coordinatorApproveAdminVehicle,
  editAdminVehicle,
  finalizeAdminVehicle,
  getAdminVehicle,
  listAdminVehicles,
  retireAdminVehicle,
  reviewAdminVehicleCategory,
  type AdminVehicle,
  type AdminVehicleDetail,
  type VehicleInput,
} from '@/lib/vehicle-api'
import {
  canCoordinatorForward,
  canEditVehicle,
  canRegionalManagerFinalize,
  canRetireVehicle,
  isVehicleVersionConflict,
  vehicleReviewTarget,
  type VehicleApprovalStatus,
} from '@/lib/vehicle-lifecycle'

const FILTERS: Array<{ value: '' | VehicleApprovalStatus; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'pending_coordinator', label: 'Awaiting Coordinator' },
  { value: 'coordinator_approved', label: 'Awaiting Regional Manager' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'retired', label: 'Retired' },
]

function dateTime(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function userError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'The action failed. Reload and try again.'
  switch (error.code) {
    case 'VEHICLE_PLATE_IN_USE': return 'That plate is already assigned to another active vehicle.'
    case 'TWO_PERSON_APPROVAL_REQUIRED': return 'The Regional Manager must be different from the Coordinator reviewer.'
    case 'VEHICLE_REMOVAL_NOT_REQUESTED': return 'The driver has not requested removal of this vehicle.'
    case 'VEHICLE_IN_ACTIVE_TRIP': return 'This vehicle is on an active trip and cannot be retired yet.'
    case 'RIDE_CATEGORY_INACTIVE': return 'This ride category is inactive and cannot be approved.'
    case 'VEHICLE_RIDE_CATEGORY_CHANGED_RETRY': return 'This category decision changed. The latest record has been reloaded.'
    default:
      return isVehicleVersionConflict(error.code)
        ? 'This vehicle changed. The latest record has been reloaded.'
        : error.message || 'The action failed. Reload and try again.'
  }
}

export default function VehicleVerificationPage() {
  const { permissions, category } = useRole()
  const granted = permissions ?? []
  const [status, setStatus] = useState<'' | VehicleApprovalStatus>('')
  const [vehicles, setVehicles] = useState<AdminVehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<AdminVehicleDetail | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionBusy, setActionBusy] = useState('')
  const [actionError, setActionError] = useState('')
  const [reasonAction, setReasonAction] = useState<'reject' | 'retire' | 'category_reject' | null>(null)
  const [reason, setReason] = useState('')
  const [reasonCategoryId, setReasonCategoryId] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editCategories, setEditCategories] = useState<RideCategory[]>([])
  const [editDraft, setEditDraft] = useState<VehicleInput | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setVehicles(await listAdminVehicles(status ? { status } : {}))
    } catch (err) {
      setError(userError(err))
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => { void load() }, [load])

  const refreshDetail = useCallback(async (vehicleId: string) => {
    setDetailLoading(true)
    try {
      setSelected(await getAdminVehicle(vehicleId))
    } catch (err) {
      setActionError(userError(err))
    } finally {
      setDetailLoading(false)
    }
  }, [])

  async function openDetail(vehicleId: string) {
    setDetailOpen(true)
    setSelected(null)
    setActionError('')
    await refreshDetail(vehicleId)
  }

  async function mutate(key: string, action: () => Promise<void>) {
    if (!selected) return
    setActionBusy(key)
    setActionError('')
    try {
      await action()
      await Promise.all([refreshDetail(selected.id), load()])
    } catch (err) {
      setActionError(userError(err))
      if (err instanceof ApiError && (
        isVehicleVersionConflict(err.code) || err.code === 'VEHICLE_RIDE_CATEGORY_CHANGED_RETRY'
      )) {
        await Promise.all([refreshDetail(selected.id), load()])
      }
    } finally {
      setActionBusy('')
    }
  }

  function openEdit() {
    if (!selected) return
    setEditDraft({
      make: selected.make,
      model: selected.model,
      year: selected.year,
      plate: selected.plate,
      color: selected.color,
      rideCategoryIds: selected.rideCategories.map(row => row.rideCategory.id),
    })
    setEditOpen(true)
    void getRideCategories()
      .then(rows => setEditCategories(rows.filter(row => row.isActive)))
      .catch(() => setEditCategories([]))
  }

  async function submitEdit() {
    if (!selected || !editDraft) return
    const maxVehicleYear = new Date().getUTCFullYear() + 1
    const normalizedPlate = editDraft.plate.trim().toUpperCase()
    const canonicalPlate = normalizedPlate.replace(/[^A-Z0-9]/g, '')
    if (!editDraft.make.trim() || !editDraft.model.trim() || !editDraft.color.trim()
      || normalizedPlate.length < 2 || normalizedPlate.length > 32 || !canonicalPlate
      || !Number.isInteger(editDraft.year) || editDraft.year < 1 || editDraft.year > maxVehicleYear
      || editDraft.rideCategoryIds.length === 0) {
      setActionError(`Complete every field, use a year from 1 to ${maxVehicleYear}, and select at least one category.`)
      return
    }
    await mutate('edit', () => editAdminVehicle(selected.id, selected.version, {
      ...editDraft,
      make: editDraft.make.trim(),
      model: editDraft.model.trim(),
      plate: normalizedPlate,
      color: editDraft.color.trim(),
    }))
    setEditOpen(false)
  }

  async function submitReasonAction() {
    if (!selected || !reasonAction) return
    if (reason.trim().length < 5) {
      setActionError('Reason must be at least 5 characters.')
      return
    }
    const target = vehicleReviewTarget(selected)
    if (reasonAction === 'reject') {
      await mutate('reject', () => finalizeAdminVehicle(selected.id, target.version, 'reject', reason))
    } else if (reasonAction === 'retire') {
      await mutate('retire', () => retireAdminVehicle(selected.id, selected.version, reason))
    } else if (reasonCategoryId) {
      const assignment = selected.rideCategories.find(row => row.rideCategory.id === reasonCategoryId)
      if (assignment) {
        await mutate(`category-${reasonCategoryId}`, () => reviewAdminVehicleCategory(
          selected.id, reasonCategoryId, assignment.version, 'reject', reason,
        ))
      }
    }
    setReasonAction(null)
    setReason('')
    setReasonCategoryId(null)
  }

  const queueSummary = useMemo(() => ({
    coordinator: vehicles.filter(v => vehicleReviewTarget(v).status === 'pending_coordinator').length,
    rm: vehicles.filter(v => vehicleReviewTarget(v).status === 'coordinator_approved').length,
    removals: vehicles.filter(v => v.retirementRequestedAt).length,
  }), [vehicles])

  if (category === 'artisan') {
    return <div className="p-8 text-sm text-gray-500">Vehicle verification is outside your Artisan scope.</div>
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Vehicle Verification</h1>
          <p className="text-sm text-gray-500 mt-1">Coordinator → Regional Manager approval, with separate category decisions.</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Reload
        </Button>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Summary label="Awaiting Coordinator" value={queueSummary.coordinator} />
        <Summary label="Awaiting RM" value={queueSummary.rm} />
        <Summary label="Removal requests" value={queueSummary.removals} alert={queueSummary.removals > 0} />
      </div>

      <div className="flex items-center gap-3">
        <Label htmlFor="vehicle-status">Status</Label>
        <select
          id="vehicle-status"
          className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm"
          value={status}
          onChange={event => setStatus(event.target.value as '' | VehicleApprovalStatus)}
        >
          {FILTERS.map(filter => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
        </select>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
        ) : error ? (
          <div className="p-10 text-center space-y-3"><p className="text-sm text-red-600">{error}</p><Button variant="outline" onClick={() => void load()}>Try again</Button></div>
        ) : vehicles.length === 0 ? (
          <div className="p-12 text-center"><Car className="h-9 w-9 mx-auto text-gray-200" /><p className="text-sm text-gray-500 mt-3">No vehicles in this queue.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-400">
                <tr><th className="px-4 py-3">Vehicle</th><th className="px-4 py-3">Driver</th><th className="px-4 py-3">Stage</th><th className="px-4 py-3">Categories</th><th className="px-4 py-3">Request</th><th /></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {vehicles.map(vehicle => {
                  const target = vehicleReviewTarget(vehicle)
                  return (
                    <tr key={vehicle.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3"><p className="font-medium text-gray-900">{vehicle.make} {vehicle.model}</p><p className="text-xs text-gray-500">{vehicle.plate} · {vehicle.year} · v{vehicle.version}</p></td>
                      <td className="px-4 py-3"><p>{vehicle.driver.displayName ?? 'Unnamed driver'}</p><p className="text-xs text-gray-400">{vehicle.driver.regionId ?? 'Region not assigned'}</p></td>
                      <td className="px-4 py-3"><StatusBadge status={target.status} />{target.kind === 'revision' && <p className="text-[10px] text-blue-600 mt-1">Pending revision v{target.version}</p>}</td>
                      <td className="px-4 py-3">{vehicle.rideCategories.filter(row => row.status === 'approved').length}/{vehicle.rideCategories.length} approved</td>
                      <td className="px-4 py-3">{vehicle.retirementRequestedAt ? <span className="text-amber-700 font-medium">Removal requested</span> : '—'}</td>
                      <td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => void openDetail(vehicle.id)}>Review</Button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Vehicle review</DialogTitle><DialogDescription>Review current authority, pending revisions, documents, categories and removal metadata.</DialogDescription></DialogHeader>
          {detailLoading && !selected ? <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : selected && (
            <div className="space-y-5">
              <div className="grid md:grid-cols-2 gap-4">
                <Panel title="Authoritative vehicle">
                  <p className="font-semibold">{selected.make} {selected.model}</p><p className="text-sm text-gray-500">{selected.plate} · {selected.color} · {selected.year}</p>
                  <div className="mt-2"><StatusBadge status={selected.approvalStatus} /> <span className="text-xs text-gray-400 ml-2">v{selected.version}</span></div>
                </Panel>
                <Panel title="Driver"><p className="font-semibold">{selected.driver.displayName ?? 'Unnamed driver'}</p><p className="text-sm text-gray-500">Driver {selected.driver.id}</p><p className="text-sm text-gray-500">Region {selected.driver.regionId ?? 'not assigned'}</p></Panel>
              </div>

              {selected.pendingRevision && <Panel title={`Pending revision v${selected.pendingRevision.version}`} warning>
                <p className="text-sm">Proposed: <b>{selected.pendingRevision.make} {selected.pendingRevision.model}</b> · {selected.pendingRevision.plate} · {selected.pendingRevision.color} · {selected.pendingRevision.year}</p>
                <p className="text-xs text-gray-500 mt-1">The approved vehicle above remains authoritative until RM approval.</p>
              </Panel>}

              {selected.retirementRequestedAt && <Panel title="Driver removal request" warning>
                <p className="text-sm">Requested {dateTime(selected.retirementRequestedAt)}</p><p className="text-sm mt-1">{selected.retirementRequestReason ?? 'No reason supplied.'}</p>
              </Panel>}

              {selected.rejectionReason && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{selected.rejectionReason}</div>}
              {actionError && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{actionError}</div>}

              <Panel title="Vehicle documents">
                {selected.providerDocuments.length === 0 ? <p className="text-sm text-gray-400">No current vehicle documents.</p> : selected.providerDocuments.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between py-2 border-b last:border-0"><div><p className="text-sm font-medium">{doc.documentType.replaceAll('_', ' ')}</p><p className="text-xs text-gray-400">Expires {dateTime(doc.expiresAt)}</p></div><StatusBadge status={doc.status} /></div>
                ))}
              </Panel>

              <Panel title="Per-vehicle ride categories">
                {selected.rideCategories.map(row => {
                  const busy = actionBusy === `category-${row.rideCategory.id}`
                  return <div key={row.id} className="py-3 border-b last:border-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-sm flex-1">{row.rideCategory.name}</span><StatusBadge status={row.status} /><span className="text-[10px] text-gray-400">v{row.version}</span>
                      {granted.includes('finalize_verification') && <>
                        <Button size="sm" variant="outline" disabled={busy || !row.rideCategory.isActive} onClick={() => void mutate(`category-${row.rideCategory.id}`, () => reviewAdminVehicleCategory(selected.id, row.rideCategory.id, row.version, 'approve'))}>{busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}Approve</Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => { setReasonAction('category_reject'); setReasonCategoryId(row.rideCategory.id); setReason(''); setActionError('') }}><XCircle className="h-3 w-3 mr-1" />Reject</Button>
                      </>}
                    </div>
                    {row.rejectionReason && <p className="text-xs text-red-600">{row.rejectionReason}</p>}
                  </div>
                })}
                <p className="text-[11px] text-gray-400 mt-3">Vehicle approval never auto-approves categories; every category decision is explicit.</p>
              </Panel>

              <div className="flex flex-wrap gap-2">
                {canCoordinatorForward(granted, selected) && <Button disabled={!!actionBusy} onClick={() => void mutate('coordinator', () => coordinatorApproveAdminVehicle(selected.id, vehicleReviewTarget(selected).version))}><CheckCircle2 className="h-4 w-4 mr-2" />Forward to RM</Button>}
                {canRegionalManagerFinalize(granted, selected) && <><Button disabled={!!actionBusy} onClick={() => void mutate('approve', () => finalizeAdminVehicle(selected.id, vehicleReviewTarget(selected).version, 'approve'))}><CheckCircle2 className="h-4 w-4 mr-2" />RM approve</Button><Button variant="outline" disabled={!!actionBusy} onClick={() => { setReasonAction('reject'); setReason(''); setActionError('') }}><XCircle className="h-4 w-4 mr-2" />RM reject</Button></>}
                {canEditVehicle(granted, selected) && <Button variant="outline" disabled={!!actionBusy} onClick={openEdit}><Pencil className="h-4 w-4 mr-2" />Edit vehicle</Button>}
                {canRetireVehicle(granted, selected) && <Button variant="destructive" disabled={!!actionBusy} onClick={() => { setReasonAction('retire'); setReason(''); setActionError('') }}><Trash2 className="h-4 w-4 mr-2" />Retire requested vehicle</Button>}
              </div>

              <Panel title="Recent lifecycle history">
                {selected.lifecycleEvents.length === 0 ? <p className="text-sm text-gray-400">No lifecycle events.</p> : selected.lifecycleEvents.slice(0, 12).map(event => <div key={event.id} className="py-2 border-b last:border-0"><p className="text-sm font-medium">{event.action}</p><p className="text-xs text-gray-400">{dateTime(event.createdAt)} · v{event.vehicleVersion}{event.reason ? ` · ${event.reason}` : ''}</p></div>)}
              </Panel>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={reasonAction !== null} onOpenChange={open => { if (!open) setReasonAction(null) }}>
        <DialogContent><DialogHeader><DialogTitle>{reasonAction === 'retire' ? 'Retire vehicle' : reasonAction === 'category_reject' ? 'Reject category' : 'Reject vehicle'}</DialogTitle><DialogDescription>This reason is recorded in the audit trail and shown to the provider.</DialogDescription></DialogHeader><div><Label htmlFor="action-reason">Reason (minimum 5 characters)</Label><textarea id="action-reason" className="mt-2 w-full min-h-24 rounded-md border border-gray-200 p-3 text-sm" value={reason} onChange={event => { setReason(event.target.value); setActionError('') }} /></div>{actionError && <p className="text-sm text-red-600">{actionError}</p>}<DialogFooter><Button variant="outline" onClick={() => setReasonAction(null)}>Cancel</Button><Button variant={reasonAction === 'retire' ? 'destructive' : 'default'} onClick={() => void submitReasonAction()} disabled={!!actionBusy}>Confirm</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Edit vehicle</DialogTitle><DialogDescription>Editing an approved vehicle creates a pending revision; current operating authority remains unchanged.</DialogDescription></DialogHeader>{editDraft && <div className="grid grid-cols-2 gap-3"><Field label="Make" value={editDraft.make} onChange={value => setEditDraft({ ...editDraft, make: value })} /><Field label="Model" value={editDraft.model} onChange={value => setEditDraft({ ...editDraft, model: value })} /><Field label="Year" value={String(editDraft.year)} type="number" onChange={value => setEditDraft({ ...editDraft, year: Number(value) })} /><Field label="Colour" value={editDraft.color} onChange={value => setEditDraft({ ...editDraft, color: value })} /><div className="col-span-2"><Field label="Plate" value={editDraft.plate} onChange={value => setEditDraft({ ...editDraft, plate: value })} /></div><div className="col-span-2"><Label>Ride categories</Label><div className="mt-2 grid sm:grid-cols-2 gap-2">{editCategories.map(cat => <label key={cat.id} className="flex items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={editDraft.rideCategoryIds.includes(cat.id)} onChange={event => setEditDraft({ ...editDraft, rideCategoryIds: event.target.checked ? [...editDraft.rideCategoryIds, cat.id] : editDraft.rideCategoryIds.filter(id => id !== cat.id) })} />{cat.name}</label>)}</div></div></div>}{actionError && <p className="text-sm text-red-600">{actionError}</p>}<DialogFooter><Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button><Button disabled={actionBusy === 'edit'} onClick={() => void submitEdit()}>{actionBusy === 'edit' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save for approval</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  )
}

function Summary({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return <div className={`rounded-xl border p-4 ${alert ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'}`}><p className="text-xs uppercase tracking-wide text-gray-400">{label}</p><p className="text-2xl font-semibold mt-1">{value}</p></div>
}

function Panel({ title, children, warning }: { title: string; children: React.ReactNode; warning?: boolean }) {
  return <section className={`rounded-xl border p-4 ${warning ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'}`}><h3 className="text-xs uppercase tracking-wide font-semibold text-gray-400 mb-3 flex items-center gap-2">{warning && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}{title}</h3>{children}</section>
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <div><Label>{label}</Label><Input className="mt-1.5" type={type} value={value} onChange={event => onChange(event.target.value)} /></div>
}
