'use client'

import { useEffect, useState } from 'react'
import { FormDialog } from '@/components/common/form-dialog'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api-client'
import { updateAdminVehicleCategories, getAdminVehicleCategoryOptions, type VehicleCategoryOption, type AdminVehicleDetail } from '@/lib/vehicle-api'

export function ManageVehicleCategoriesDialog({ vehicle, onClose, onSaved }: {
  vehicle: AdminVehicleDetail
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [categories, setCategories] = useState<VehicleCategoryOption[]>([])
  const [selected, setSelected] = useState(() => vehicle.rideCategories.map(row => row.rideCategory.id))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    getAdminVehicleCategoryOptions(vehicle.id)
      .then(rows => {
        if (!active) return
        const available = rows
        setCategories(available)
        const regular = available.find(row => row.slug === 'regular')
        if (!regular) {
          setError('Regular is unavailable in this region. Contact support before changing categories.')
          return
        }
        setSelected(ids => [...new Set([regular.id, ...ids])])
      })
      .catch(() => { if (active) setError('Could not load ride categories. Try again.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [vehicle.id, attempt])

  async function save() {
    if (loading || saving || !categories.some(row => row.slug === 'regular')) return
    setSaving(true)
    setError('')
    try {
      await updateAdminVehicleCategories(vehicle.id, vehicle.version, selected)
      await onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save categories. Try again.')
      if (err instanceof ApiError && err.code === 'VEHICLE_CHANGED_RETRY') await onSaved()
    } finally {
      setSaving(false)
    }
  }

  return <FormDialog
    open onClose={onClose} title="Manage ride categories"
    description={vehicle.approvalStatus === 'approved'
      ? 'Changes go through Coordinator and Regional Manager review. Existing approvals remain active until then. Added categories need a separate RM decision.'
      : 'Changes resubmit this vehicle for review. Each category needs a separate RM decision.'}
    submitLabel="Save for approval" onSubmit={() => void save()}
    loading={saving || loading}
    disabled={!categories.some(row => row.slug === 'regular') || (selected.length === vehicle.rideCategories.length && vehicle.rideCategories.every(row => selected.includes(row.rideCategory.id)))}
    error={error || null} size="md"
  >
    <p className="mb-3 text-sm text-gray-500">Regular is included for every vehicle and cannot be removed.</p>
    {loading ? <div className="h-24 animate-pulse rounded-lg bg-gray-100" /> : <>
      {categories.map(cat => <label key={cat.id} className="mb-2 flex items-center gap-2 rounded-lg border p-3 text-sm">
        <input type="checkbox" disabled={saving || cat.slug === 'regular'} checked={selected.includes(cat.id)}
          onChange={event => setSelected(ids => event.target.checked ? [...ids, cat.id] : ids.filter(id => id !== cat.id))} />
        {cat.name}{cat.slug === 'regular' ? ' (required)' : ''}
      </label>)}
      {vehicle.rideCategories.filter(row => !categories.some(cat => cat.id === row.rideCategory.id)).map(row =>
        <label key={row.id} className="mb-2 flex items-center gap-2 rounded-lg border p-3 text-sm text-gray-500">
          <input type="checkbox" disabled={saving || row.rideCategory.slug === 'regular'} checked={selected.includes(row.rideCategory.id)}
            onChange={event => setSelected(ids => event.target.checked ? [...ids, row.rideCategory.id] : ids.filter(id => id !== row.rideCategory.id))} />
          {row.rideCategory.name} (unavailable; remove to continue)
        </label>)}
      {error && <Button variant="outline" onClick={() => setAttempt(value => value + 1)}>Reload categories</Button>}
    </>}
  </FormDialog>
}
