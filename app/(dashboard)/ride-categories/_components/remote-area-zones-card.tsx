'use client'

import { useCallback, useEffect, useState } from 'react'
import { MapPinned, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FormDialog } from '@/components/common/form-dialog'
import { RoleGate } from '@/components/common/role-gate'
import { ApiError } from '@/lib/api-client'
import {
  createRideRemoteAreaZone,
  listRideRemoteAreaZones,
  updateRideRemoteAreaZone,
  type RideRemoteAreaZone,
} from '@/lib/api'

const RADII = [3, 5, 7, 9, 10, 15]

type FormState = {
  stableKey: string
  label: string
  percentage: string
  pickupRadiusKm: string
  isActive: boolean
  boundaryJson: string
  reason: string
}

const EMPTY: FormState = {
  stableKey: '',
  label: 'Remote-area adjustment',
  percentage: '30',
  pickupRadiusKm: '15',
  isActive: true,
  boundaryJson: '',
  reason: '',
}

function geometryFromJson(text: string): { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown[] } {
  const parsed = JSON.parse(text)
  const candidate = parsed?.type === 'FeatureCollection'
    ? parsed.features?.find((feature: any) => ['Polygon', 'MultiPolygon'].includes(feature?.geometry?.type))?.geometry
    : parsed?.type === 'Feature' ? parsed.geometry : parsed
  if (!candidate || !['Polygon', 'MultiPolygon'].includes(candidate.type) || !Array.isArray(candidate.coordinates)) {
    throw new Error('Paste a GeoJSON Polygon, MultiPolygon, Feature, or FeatureCollection containing one area.')
  }
  return candidate
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return error instanceof Error ? error.message : 'The remote-area zone could not be saved.'
}

export function RemoteAreaZonesCard({ regionId }: { regionId: string }) {
  const [zones, setZones] = useState<RideRemoteAreaZone[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [editing, setEditing] = useState<RideRemoteAreaZone | null | undefined>(undefined)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setLoadError('')
    listRideRemoteAreaZones(regionId)
      .then(setZones)
      .catch(error => setLoadError(errorMessage(error)))
      .finally(() => setLoading(false))
  }, [regionId])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setForm(EMPTY)
    setSaveError('')
    setEditing(null)
  }

  function openEdit(zone: RideRemoteAreaZone) {
    setForm({
      stableKey: zone.stableKey,
      label: zone.label,
      percentage: (zone.adjustmentRateBps / 100).toString(),
      pickupRadiusKm: zone.pickupMaxRadiusKm.toString(),
      isActive: zone.isActive,
      boundaryJson: JSON.stringify(zone.boundary, null, 2),
      reason: '',
    })
    setSaveError('')
    setEditing(zone)
  }

  async function save() {
    setSaveError('')
    let boundary: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown[] }
    try {
      boundary = geometryFromJson(form.boundaryJson)
    } catch (error) {
      setSaveError(errorMessage(error))
      return
    }
    const percentage = Number(form.percentage)
    if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
      setSaveError('The adjustment must be greater than 0% and no more than 100%.')
      return
    }
    if (!form.reason.trim()) {
      setSaveError('Enter the audit reason for this change.')
      return
    }
    const input = {
      stableKey: form.stableKey.trim(),
      label: form.label.trim(),
      adjustmentRateBps: Math.round(percentage * 100),
      pickupMaxRadiusKm: Number(form.pickupRadiusKm),
      isActive: form.isActive,
      boundary,
      reason: form.reason.trim(),
    }
    setSaving(true)
    try {
      if (editing) await updateRideRemoteAreaZone(regionId, editing.id, input)
      else await createRideRemoteAreaZone(regionId, input)
      setEditing(undefined)
      load()
    } catch (error) {
      setSaveError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mb-5 rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-amber-50 p-2 text-amber-700"><MapPinned className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-gray-900">Remote-area ride pricing</h2>
          <p className="mt-1 text-xs text-gray-500">
            Add the percentage once when pickup or drop-off is inside a zone. Pickup matches may also use the configured wider search radius.
          </p>
        </div>
        <RoleGate permission="edit_ride_categories">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" /> Add zone
          </Button>
        </RoleGate>
      </div>

      {loading ? <p className="mt-4 text-sm text-gray-500">Loading zones...</p> : null}
      {loadError ? <p className="mt-4 text-sm text-red-600">{loadError}</p> : null}
      {!loading && !loadError && zones.length === 0 ? (
        <p className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-500">No remote-area zones in this region.</p>
      ) : null}
      {zones.length > 0 ? (
        <div className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-100">
          {zones.map(zone => (
            <div key={zone.id} className="flex items-center gap-3 px-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">{zone.stableKey}</p>
                <p className="text-xs text-gray-500">
                  {zone.label} - {(zone.adjustmentRateBps / 100).toFixed(2)}% - pickup radius {zone.pickupMaxRadiusKm} km
                </p>
              </div>
              <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${zone.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                {zone.isActive ? 'Active' : 'Inactive'}
              </span>
              <RoleGate permission="edit_ride_categories">
                <Button variant="ghost" size="icon" onClick={() => openEdit(zone)} title="Edit zone">
                  <Pencil className="h-4 w-4" />
                </Button>
              </RoleGate>
            </div>
          ))}
        </div>
      ) : null}

      <FormDialog
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        title={editing ? 'Edit remote-area zone' : 'Add remote-area zone'}
        description="Changes affect new estimates only; existing rides retain their saved pricing snapshot."
        submitLabel={editing ? 'Save zone' : 'Create zone'}
        onSubmit={save}
        loading={saving}
        error={saveError || null}
        size="lg"
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Stable key</Label><Input value={form.stableKey} onChange={event => setForm(current => ({ ...current, stableKey: event.target.value.toLowerCase() }))} placeholder="sunyani-nursing-college" /></div>
          <div className="space-y-1.5"><Label>Customer-facing label</Label><Input value={form.label} onChange={event => setForm(current => ({ ...current, label: event.target.value }))} /></div>
          <div className="space-y-1.5"><Label>Adjustment (%)</Label><Input type="number" min="0.01" max="100" step="0.01" value={form.percentage} onChange={event => setForm(current => ({ ...current, percentage: event.target.value }))} /></div>
          <div className="space-y-1.5"><Label>Pickup search radius</Label><Select value={form.pickupRadiusKm} onValueChange={value => setForm(current => ({ ...current, pickupRadiusKm: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RADII.map(radius => <SelectItem key={radius} value={String(radius)}>{radius} km</SelectItem>)}</SelectContent></Select></div>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700"><input type="checkbox" checked={form.isActive} onChange={event => setForm(current => ({ ...current, isActive: event.target.checked }))} /> Active for new ride estimates</label>
        <div className="space-y-1.5"><Label>GeoJSON boundary</Label><textarea className="min-h-48 w-full rounded-md border border-gray-200 px-3 py-2 font-mono text-xs outline-none focus:border-amber-500" value={form.boundaryJson} onChange={event => setForm(current => ({ ...current, boundaryJson: event.target.value }))} placeholder='{"type":"Polygon","coordinates":[...]}' /></div>
        <div className="space-y-1.5"><Label>Audit reason</Label><Input value={form.reason} onChange={event => setForm(current => ({ ...current, reason: event.target.value }))} placeholder="Why is this zone being added or changed?" /></div>
      </FormDialog>
    </section>
  )
}
