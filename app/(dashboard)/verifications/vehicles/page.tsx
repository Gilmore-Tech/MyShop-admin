'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Car, CheckCircle2, ExternalLink, Loader2, Pencil, Trash2, XCircle } from 'lucide-react'

import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { DataTable, AvatarCell } from '@/components/common/data-table'
import { DetailSheet } from '@/components/common/detail-sheet'
import { DocumentExpiryControl } from '@/components/common/document-expiry-control'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { FilterBar } from '@/components/common/filter-bar'
import { FormDialog } from '@/components/common/form-dialog'
import { PageSkeleton } from '@/components/common/load-state'
import { PageHeader } from '@/components/common/page-header'
import { StatCard } from '@/components/common/stat-card'
import { StatusBadge } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRole } from '@/hooks/use-role'
import { getRideCategories, type RideCategory } from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { formatDateTime } from '@/lib/format-date'
import { legacyVehicleCreateValidationError } from '@/lib/legacy-vehicle-migration'
import {
  coordinatorApproveAdminVehicle,
  editAdminVehicle,
  finalizeAdminVehicle,
  getAdminVehicle,
  getLegacyVehicleDocumentAccess,
  listLegacyVehicleBackfill,
  listAdminVehicles,
  migrateLegacyVehicle,
  retireAdminVehicle,
  reviewAdminVehicleCategory,
  type AdminVehicle,
  type AdminVehicleDetail,
  type LegacyVehicleBackfillCandidate,
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

const FILTERS: Array<{ value: 'all' | VehicleApprovalStatus; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending_coordinator', label: 'Awaiting coordinator' },
  { value: 'coordinator_approved', label: 'Awaiting Regional Manager' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'retired', label: 'Retired' },
]

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

function legacyMigrationDraft(candidate: LegacyVehicleBackfillCandidate, targetVehicleId: string | null): VehicleInput {
  const target = candidate.explicitVehicles.find(vehicle => vehicle.id === targetVehicleId)
  return {
    make: target?.make ?? candidate.legacyVehicle.make ?? '',
    model: target?.model ?? candidate.legacyVehicle.model ?? '',
    year: target?.year ?? candidate.legacyVehicle.year ?? new Date().getUTCFullYear(),
    plate: target?.plate ?? candidate.legacyVehicle.plate ?? '',
    color: target?.color ?? candidate.legacyVehicle.color ?? '',
    rideCategoryIds: target?.rideCategories.map(row => row.rideCategoryId) ?? [],
  }
}

export default function VehicleVerificationPage() {
  const { permissions, category } = useRole()
  const granted = permissions ?? []
  const [status, setStatus] = useState<'all' | VehicleApprovalStatus>('all')
  const [vehicles, setVehicles] = useState<AdminVehicle[]>([])
  const [legacyCandidates, setLegacyCandidates] = useState<LegacyVehicleBackfillCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<AdminVehicleDetail | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionBusy, setActionBusy] = useState('')
  const [actionError, setActionError] = useState('')
  const [reasonAction, setReasonAction] = useState<'reject' | 'retire' | 'category_reject' | null>(null)
  const [reasonCategoryId, setReasonCategoryId] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editCategories, setEditCategories] = useState<RideCategory[]>([])
  const [editDraft, setEditDraft] = useState<VehicleInput | null>(null)
  const [migrationOpen, setMigrationOpen] = useState(false)
  const [migrationCandidate, setMigrationCandidate] = useState<LegacyVehicleBackfillCandidate | null>(null)
  const [migrationTargetVehicleId, setMigrationTargetVehicleId] = useState<string | null>(null)
  const [migrationDraft, setMigrationDraft] = useState<VehicleInput | null>(null)
  const [migrationCategories, setMigrationCategories] = useState<RideCategory[]>([])
  const [migrationDocumentIds, setMigrationDocumentIds] = useState<string[]>([])
  const [migrationConfirmed, setMigrationConfirmed] = useState(false)
  const [migrationDocumentOpening, setMigrationDocumentOpening] = useState('')
  const [migrationError, setMigrationError] = useState('')
  const [migrationBusy, setMigrationBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [vehicleRows, legacyRows] = await Promise.all([
        listAdminVehicles(status !== 'all' ? { status } : {}),
        listLegacyVehicleBackfill(),
      ])
      setVehicles(vehicleRows)
      setLegacyCandidates(legacyRows)
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

  function openMigration(candidate: LegacyVehicleBackfillCandidate) {
    const targetVehicleId = candidate.explicitVehicles.length === 1
      ? candidate.explicitVehicles[0].id
      : null
    setMigrationCandidate(candidate)
    setMigrationTargetVehicleId(targetVehicleId)
    setMigrationDraft(legacyMigrationDraft(candidate, targetVehicleId))
    // Documents start unchecked: the operator must open and explicitly bind
    // every current legacy evidence row rather than inheriting a hidden default.
    setMigrationDocumentIds([])
    setMigrationConfirmed(false)
    setMigrationError('')
    setMigrationOpen(true)
    void getRideCategories()
      .then(setMigrationCategories)
      .catch(() => setMigrationCategories([]))
  }

  async function submitMigration() {
    if (!migrationCandidate || !migrationDraft) return
    const maxVehicleYear = new Date().getUTCFullYear() + 1
    const plate = migrationDraft.plate.trim().toUpperCase()
    const allDocumentIds = migrationCandidate.unboundDocuments.map(document => document.id).sort()
    const selectedDocumentIds = [...migrationDocumentIds].sort()
    if (migrationCandidate.explicitVehicles.length > 0 && !migrationTargetVehicleId) {
      setMigrationError('Select the exact existing vehicle that owns these retained documents.')
      return
    }
    const createValidationError = legacyVehicleCreateValidationError(
      migrationDraft,
      migrationTargetVehicleId,
      maxVehicleYear,
    )
    if (createValidationError) {
      setMigrationError(createValidationError)
      return
    }
    if (
      allDocumentIds.length !== selectedDocumentIds.length
      || allDocumentIds.some((id, index) => id !== selectedDocumentIds[index])
    ) {
      setMigrationError('Open and confirm every listed current vehicle document before migration.')
      return
    }
    if (!migrationConfirmed) {
      setMigrationError('Confirm that the vehicle details and selected documents belong to this driver.')
      return
    }
    setMigrationBusy(true)
    setMigrationError('')
    try {
      if (migrationTargetVehicleId) {
        await migrateLegacyVehicle(migrationCandidate.driverId, {
          targetVehicleId: migrationTargetVehicleId,
          documentIds: selectedDocumentIds,
          ownershipConfirmed: true,
          reason: 'Admin-confirmed binding of retained documents to an existing vehicle',
        })
      } else {
        await migrateLegacyVehicle(migrationCandidate.driverId, {
          ...migrationDraft,
          make: migrationDraft.make.trim(),
          model: migrationDraft.model.trim(),
          plate,
          color: migrationDraft.color.trim(),
          documentIds: selectedDocumentIds,
          ownershipConfirmed: true,
          reason: 'Admin-confirmed migration of existing driver vehicle data',
        })
      }
      setMigrationOpen(false)
      setMigrationCandidate(null)
      await load()
    } catch (err) {
      setMigrationError(userError(err))
    } finally {
      setMigrationBusy(false)
    }
  }

  async function openLegacyVehicleDocument(documentId: string) {
    const popup = window.open('', '_blank')
    if (popup) popup.opener = null
    setMigrationDocumentOpening(documentId)
    setMigrationError('')
    try {
      const fileUrl = await getLegacyVehicleDocumentAccess(documentId)
      if (popup) popup.location.href = fileUrl
      else window.open(fileUrl, '_blank', 'noopener,noreferrer')
    } catch (err) {
      popup?.close()
      setMigrationError(userError(err))
    } finally {
      setMigrationDocumentOpening('')
    }
  }

  async function submitReasonAction(reason: string) {
    if (!selected || !reasonAction) return
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
    setReasonCategoryId(null)
  }

  const queueSummary = useMemo(() => ({
    coordinator: vehicles.filter(v => vehicleReviewTarget(v).status === 'pending_coordinator').length,
    rm: vehicles.filter(v => vehicleReviewTarget(v).status === 'coordinator_approved').length,
    removals: vehicles.filter(v => v.retirementRequestedAt).length,
  }), [vehicles])
  const migrationTargetVehicle = migrationCandidate?.explicitVehicles.find(
    vehicle => vehicle.id === migrationTargetVehicleId,
  ) ?? null

  if (category === 'artisan') {
    return (
      <div>
        <PageHeader title="Vehicle approvals" subtitle="Vehicle documents and revisions" />
        <EmptyState variant="unavailable" title="Outside your scope" description="Vehicle verification is outside your Artisan scope." />
      </div>
    )
  }

  const reasonDialogBusy =
    reasonAction === 'retire' ? actionBusy === 'retire'
      : reasonAction === 'category_reject' ? actionBusy === `category-${reasonCategoryId}`
      : actionBusy === 'reject'

  return (
    <div className="space-y-5">
      <PageHeader title="Vehicle approvals" subtitle="Vehicle documents and revisions" />

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard icon={Car} label="Awaiting coordinator" value={queueSummary.coordinator} loading={loading} />
        <StatCard icon={CheckCircle2} label="Awaiting Regional Manager" value={queueSummary.rm} loading={loading} />
        <StatCard icon={AlertTriangle} label="Removal requests" value={queueSummary.removals} sub={queueSummary.removals > 0 ? 'Needs review' : undefined} loading={loading} />
        <StatCard icon={AlertTriangle} label="Legacy migrations" value={legacyCandidates.length} sub={legacyCandidates.length > 0 ? 'Needs review' : undefined} loading={loading} />
      </div>

      {legacyCandidates.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
          <div className="p-4 border-b border-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <h2 className="font-semibold text-amber-900">Existing driver vehicles need migration</h2>
                <p className="text-sm text-amber-800 mt-1">Compare the previous vehicle record and every document before binding them. Migration preserves each document decision; a newly created vehicle/category starts pending, while an explicitly selected existing vehicle is not changed.</p>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto bg-white">
            <table className="w-full text-sm">
              <thead className="bg-amber-50/60 text-left text-xs uppercase tracking-wide text-amber-700">
                <tr><th className="px-4 py-3">Driver</th><th className="px-4 py-3">Previous vehicle</th><th className="px-4 py-3">Unbound documents</th><th /></tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {legacyCandidates.map(candidate => (
                  <tr key={candidate.driverId}>
                    <td className="px-4 py-3"><p className="font-medium">{candidate.displayName ?? 'Unnamed driver'}</p><p className="text-xs text-gray-400">{candidate.regionId ?? 'Region not assigned'}</p></td>
                    <td className="px-4 py-3"><p>{[candidate.legacyVehicle.make, candidate.legacyVehicle.model].filter(Boolean).join(' ') || 'Incomplete record'}</p><p className="text-xs text-gray-500">{candidate.legacyVehicle.plate ?? 'No plate'} - {candidate.legacyVehicle.year ?? 'No year'} - {candidate.legacyVehicle.color ?? 'No colour'}</p>{candidate.explicitVehicles.length > 0 && <p className="text-xs font-medium text-blue-600 mt-1">{candidate.explicitVehicles.length} existing vehicle{candidate.explicitVehicles.length === 1 ? '' : 's'} available for binding</p>}</td>
                    <td className="px-4 py-3">{candidate.unboundDocuments.length}</td>
                    <td className="px-4 py-3 text-right">{granted.includes('edit_provider_profile') ? <Button size="sm" onClick={() => openMigration(candidate)}>Review migration</Button> : <span className="text-xs text-gray-400">Edit permission required</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <FilterBar onRefresh={() => void load()} refreshing={loading}>
        <Select value={status} onValueChange={value => setStatus(value as 'all' | VehicleApprovalStatus)}>
          <SelectTrigger className="h-9 w-56 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FILTERS.map(filter => <SelectItem key={filter.value} value={filter.value}>{filter.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </FilterBar>

      <DataTable
        columns={[
          {
            key: 'vehicle',
            header: 'Vehicle',
            render: vehicle => (
              <div>
                <p className="font-medium text-gray-900">{vehicle.make} {vehicle.model}</p>
                <p className="text-xs text-gray-500">{vehicle.plate} - {vehicle.year} - v{vehicle.version}</p>
              </div>
            ),
          },
          {
            key: 'driver',
            header: 'Driver',
            render: vehicle => <AvatarCell name={vehicle.driver.displayName} sub={vehicle.driver.regionId ?? 'Region not assigned'} />,
          },
          {
            key: 'stage',
            header: 'Stage',
            render: vehicle => {
              const target = vehicleReviewTarget(vehicle)
              return (
                <div>
                  <StatusBadge status={target.status} />
                  {target.kind === 'revision' && <p className="text-[10px] text-blue-600 mt-1">Pending revision v{target.version}</p>}
                </div>
              )
            },
          },
          {
            key: 'categories',
            header: 'Categories',
            render: vehicle => (
              <span className="text-sm text-gray-600">
                {vehicle.rideCategories.filter(row => row.status === 'approved').length}/{vehicle.rideCategories.length} approved
              </span>
            ),
          },
          {
            key: 'request',
            header: 'Request',
            render: vehicle => vehicle.retirementRequestedAt
              ? <span className="text-amber-700 font-medium text-sm">Removal requested</span>
              : <span className="text-gray-300">-</span>,
          },
          {
            key: 'review',
            header: '',
            align: 'right',
            render: vehicle => (
              <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); void openDetail(vehicle.id) }}>
                Review
              </Button>
            ),
          },
        ]}
        rows={vehicles}
        rowKey={vehicle => vehicle.id}
        loading={loading}
        error={error || null}
        onRetry={() => void load()}
        onRowClick={vehicle => void openDetail(vehicle.id)}
        rowAriaLabel={vehicle => `Review ${vehicle.make} ${vehicle.model}`}
        empty={<EmptyState icon={Car} title="No vehicles in this queue" />}
      />

      <FormDialog
        open={migrationOpen}
        onClose={() => setMigrationOpen(false)}
        title="Migrate existing vehicle"
        description={`Review and explicitly bind the previous record for ${migrationCandidate?.displayName ?? 'this driver'}. This action is audited and cannot approve a vehicle or category.`}
        submitLabel={migrationTargetVehicle ? 'Bind retained documents' : 'Create pending vehicle'}
        onSubmit={() => void submitMigration()}
        size="lg"
        loading={migrationBusy}
        error={migrationError || null}
      >
        {migrationCandidate && migrationDraft && <div className="space-y-5">
          {migrationCandidate.explicitVehicles.length > 0 && <Panel title="Target existing vehicle">
            <Label htmlFor="legacy-target-vehicle">Vehicle that owns these documents</Label>
            <select
              id="legacy-target-vehicle"
              className="mt-1.5 h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
              value={migrationTargetVehicleId ?? ''}
              onChange={event => {
                const targetVehicleId = event.target.value || null
                setMigrationTargetVehicleId(targetVehicleId)
                setMigrationDraft(legacyMigrationDraft(migrationCandidate, targetVehicleId))
                setMigrationConfirmed(false)
                setMigrationError('')
              }}
            >
              <option value="">Select the exact vehicle</option>
              {migrationCandidate.explicitVehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.make ?? 'Unknown make'} {vehicle.model ?? 'Unknown model'} - {vehicle.plate ?? 'No plate'} - {vehicle.approvalStatus}</option>)}
            </select>
            <p className="text-[11px] text-gray-500 mt-2">The vehicle and category states stay exactly as they are; this step binds only the explicitly confirmed retained documents.</p>
          </Panel>}
          <Panel title="Vehicle details">
            {!migrationTargetVehicle && !migrationCandidate.hasCompleteLegacyVehicle && <p className="mb-3 text-xs text-amber-700">The previous record is incomplete. Confirm missing values against the original documents before continuing.</p>}
            <div className="grid sm:grid-cols-2 gap-3">
              <Field disabled={Boolean(migrationTargetVehicle)} label="Make" value={migrationDraft.make} onChange={value => setMigrationDraft({ ...migrationDraft, make: value })} />
              <Field disabled={Boolean(migrationTargetVehicle)} label="Model" value={migrationDraft.model} onChange={value => setMigrationDraft({ ...migrationDraft, model: value })} />
              <Field disabled={Boolean(migrationTargetVehicle)} label="Year" type="number" value={String(migrationDraft.year)} onChange={value => setMigrationDraft({ ...migrationDraft, year: Number(value) })} />
              <Field disabled={Boolean(migrationTargetVehicle)} label="Colour" value={migrationDraft.color} onChange={value => setMigrationDraft({ ...migrationDraft, color: value })} />
              <div className="sm:col-span-2"><Field disabled={Boolean(migrationTargetVehicle)} label="Plate" value={migrationDraft.plate} onChange={value => setMigrationDraft({ ...migrationDraft, plate: value })} /></div>
            </div>
          </Panel>

          <Panel title="Existing vehicle documents">
            {migrationCandidate.unboundDocuments.length === 0 ? <p className="text-sm text-amber-700">No existing roadworthiness or insurance document can be preserved. The driver must upload them against the new vehicle after migration.</p> : migrationCandidate.unboundDocuments.map(document => (
              <label key={document.id} className="flex items-start gap-3 py-3 border-b last:border-0">
                <input type="checkbox" className="mt-1" checked={migrationDocumentIds.includes(document.id)} onChange={event => setMigrationDocumentIds(event.target.checked ? [...migrationDocumentIds, document.id] : migrationDocumentIds.filter(id => id !== document.id))} />
                <span className="flex-1"><span className="block font-medium capitalize">{document.documentType.replaceAll('_', ' ')}</span><span className="block text-xs text-gray-500">{document.status} - expires {formatDateTime(document.expiresAt)}</span></span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-orange-600 disabled:opacity-50"
                  disabled={migrationDocumentOpening === document.id}
                  onClick={event => {
                    event.preventDefault()
                    event.stopPropagation()
                    void openLegacyVehicleDocument(document.id)
                  }}
                >
                  {migrationDocumentOpening === document.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
                  Open
                </button>
              </label>
            ))}
            <p className="text-[11px] text-gray-500 mt-3">Checking a document confirms that it belongs to this exact physical vehicle. Its existing status and expiry date will not be changed.</p>
          </Panel>

          <Panel title="Requested ride categories">
            {migrationCategories.length === 0 ? <p className="text-sm text-amber-700">No ride categories loaded. Reload before continuing.</p> : <div className="grid sm:grid-cols-2 gap-2">
              {migrationCategories.filter(rideCategory => migrationTargetVehicle ? migrationDraft.rideCategoryIds.includes(rideCategory.id) : rideCategory.isActive).map(rideCategory => <label key={rideCategory.id} className="flex items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" disabled={Boolean(migrationTargetVehicle)} checked={migrationDraft.rideCategoryIds.includes(rideCategory.id)} onChange={event => setMigrationDraft({ ...migrationDraft, rideCategoryIds: event.target.checked ? [...migrationDraft.rideCategoryIds, rideCategory.id] : migrationDraft.rideCategoryIds.filter(id => id !== rideCategory.id) })} />{rideCategory.name}</label>)}
            </div>}
            <p className="text-[11px] text-gray-500 mt-3">{migrationTargetVehicle ? 'Existing category decisions are not changed by document binding.' : 'Every selected category starts pending and must be approved separately.'}</p>
          </Panel>

          <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><input type="checkbox" className="mt-1" checked={migrationConfirmed} onChange={event => setMigrationConfirmed(event.target.checked)} /><span>I compared the previous vehicle details and every selected document and confirm they belong to this driver and this physical vehicle.</span></label>
        </div>}
      </FormDialog>

      <DetailSheet
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        size="xl"
        title={selected ? `${selected.make} ${selected.model}` : 'Vehicle review'}
        subtitle={selected ? `${selected.plate} - ${selected.driver.displayName ?? 'Unnamed driver'}` : undefined}
        status={selected && (
          <>
            <StatusBadge status={selected.approvalStatus} />
            <span className="text-xs text-gray-400">v{selected.version}</span>
          </>
        )}
        footer={selected && (
          <div className="flex flex-wrap gap-2 w-full">
            {canCoordinatorForward(granted, selected) && <Button variant="brand" disabled={!!actionBusy} onClick={() => void mutate('coordinator', () => coordinatorApproveAdminVehicle(selected.id, vehicleReviewTarget(selected).version))}><CheckCircle2 className="h-4 w-4 mr-2" />Forward to Regional Manager</Button>}
            {canRegionalManagerFinalize(granted, selected) && <><Button variant="brand" disabled={!!actionBusy} onClick={() => void mutate('approve', () => finalizeAdminVehicle(selected.id, vehicleReviewTarget(selected).version, 'approve'))}><CheckCircle2 className="h-4 w-4 mr-2" />Approve vehicle</Button><Button variant="outline" disabled={!!actionBusy} onClick={() => { setReasonAction('reject'); setActionError('') }}><XCircle className="h-4 w-4 mr-2" />Reject vehicle</Button></>}
            {canEditVehicle(granted, selected) && <Button variant="outline" disabled={!!actionBusy} onClick={openEdit}><Pencil className="h-4 w-4 mr-2" />Edit vehicle</Button>}
            {canRetireVehicle(granted, selected) && <Button variant="destructive" disabled={!!actionBusy} onClick={() => { setReasonAction('retire'); setActionError('') }}><Trash2 className="h-4 w-4 mr-2" />Retire requested vehicle</Button>}
          </div>
        )}
      >
        {detailLoading && !selected ? <PageSkeleton variant="form" /> : selected && (
          <div className="space-y-5">
            <div className="grid md:grid-cols-2 gap-4">
              <Panel title="Authoritative vehicle">
                <p className="font-semibold">{selected.make} {selected.model}</p><p className="text-sm text-gray-500">{selected.plate} - {selected.color} - {selected.year}</p>
                <div className="mt-2"><StatusBadge status={selected.approvalStatus} /> <span className="text-xs text-gray-400 ml-2">v{selected.version}</span></div>
              </Panel>
              <Panel title="Driver"><p className="font-semibold">{selected.driver.displayName ?? 'Unnamed driver'}</p><p className="text-sm text-gray-500">Driver {selected.driver.id}</p><p className="text-sm text-gray-500">Region {selected.driver.regionId ?? 'not assigned'}</p></Panel>
            </div>

            {selected.pendingRevision && <Panel title={`Pending revision v${selected.pendingRevision.version}`} warning>
              <p className="text-sm">Proposed: <b>{selected.pendingRevision.make} {selected.pendingRevision.model}</b> - {selected.pendingRevision.plate} - {selected.pendingRevision.color} - {selected.pendingRevision.year}</p>
              <p className="text-xs text-gray-500 mt-1">The approved vehicle above remains authoritative until Regional Manager approval.</p>
            </Panel>}

            {selected.retirementRequestedAt && <Panel title="Driver removal request" warning>
              <p className="text-sm">Requested {formatDateTime(selected.retirementRequestedAt)}</p><p className="text-sm mt-1">{selected.retirementRequestReason ?? 'No reason supplied.'}</p>
            </Panel>}

            {selected.rejectionReason && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{selected.rejectionReason}</div>}
            {actionError && <ErrorState compact title="That did not work" detail={actionError} />}

            <Panel title="Vehicle documents">
              {selected.providerDocuments.length === 0 ? <p className="text-sm text-gray-400">No current vehicle documents.</p> : selected.providerDocuments.map(doc => (
                <div key={doc.id} className="flex items-start justify-between gap-3 py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{doc.documentType.replaceAll('_', ' ')}</p>
                    <DocumentExpiryControl
                      documentId={doc.id}
                      documentType={doc.documentType}
                      expiresAt={doc.expiresAt}
                      onStale={() => void refreshDetail(selected.id)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-orange-600">Open <ExternalLink className="h-3 w-3" /></a>
                    <StatusBadge status={doc.status} />
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-gray-500 mt-3">An approved licence, roadworthiness certificate or insurance record without the printed expiry date remains ineligible until an authorized reviewer adds that date.</p>
            </Panel>

            <Panel title="Per-vehicle ride categories">
              {selected.rideCategories.map(row => {
                const busy = actionBusy === `category-${row.rideCategory.id}`
                return <div key={row.id} className="py-3 border-b last:border-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-sm flex-1">{row.rideCategory.name}</span><StatusBadge status={row.status} /><span className="text-[10px] text-gray-400">v{row.version}</span>
                    {granted.includes('finalize_verification') && <>
                      <Button size="sm" variant="outline" disabled={busy || !row.rideCategory.isActive} onClick={() => void mutate(`category-${row.rideCategory.id}`, () => reviewAdminVehicleCategory(selected.id, row.rideCategory.id, row.version, 'approve'))}>{busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}Approve</Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => { setReasonAction('category_reject'); setReasonCategoryId(row.rideCategory.id); setActionError('') }}><XCircle className="h-3 w-3 mr-1" />Reject</Button>
                    </>}
                  </div>
                  {row.rejectionReason && <p className="text-xs text-red-600">{row.rejectionReason}</p>}
                </div>
              })}
              <p className="text-[11px] text-gray-400 mt-3">Vehicle approval never auto-approves categories; every category decision is explicit.</p>
            </Panel>

            <Panel title="Recent lifecycle history">
              {selected.lifecycleEvents.length === 0 ? <p className="text-sm text-gray-400">No lifecycle events.</p> : selected.lifecycleEvents.slice(0, 12).map(event => <div key={event.id} className="py-2 border-b last:border-0"><p className="text-sm font-medium">{event.action}</p><p className="text-xs text-gray-400">{formatDateTime(event.createdAt)} - v{event.vehicleVersion}{event.reason ? ` - ${event.reason}` : ''}</p></div>)}
            </Panel>
          </div>
        )}
      </DetailSheet>

      <ConfirmDialog
        open={reasonAction !== null}
        onClose={() => { setReasonAction(null); setReasonCategoryId(null) }}
        title={
          reasonAction === 'retire' ? 'Retire this vehicle?'
            : reasonAction === 'category_reject' ? 'Reject this category?'
            : 'Reject this vehicle?'
        }
        description="This reason is recorded in the audit trail and shown to the provider."
        confirmLabel={
          reasonAction === 'retire' ? 'Retire vehicle'
            : reasonAction === 'category_reject' ? 'Reject category'
            : 'Reject vehicle'
        }
        destructive={reasonAction === 'retire'}
        loading={reasonDialogBusy}
        error={actionError || null}
        requireReason
        onConfirm={reason => void submitReasonAction(reason)}
      />

      <FormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit vehicle"
        description="Editing an approved vehicle creates a pending revision; current operating authority remains unchanged."
        submitLabel="Save for approval"
        onSubmit={() => void submitEdit()}
        loading={actionBusy === 'edit'}
        error={actionError || null}
        size="md"
      >
        {editDraft && <div className="grid grid-cols-2 gap-3">
          <Field label="Make" value={editDraft.make} onChange={value => setEditDraft({ ...editDraft, make: value })} />
          <Field label="Model" value={editDraft.model} onChange={value => setEditDraft({ ...editDraft, model: value })} />
          <Field label="Year" value={String(editDraft.year)} type="number" onChange={value => setEditDraft({ ...editDraft, year: Number(value) })} />
          <Field label="Colour" value={editDraft.color} onChange={value => setEditDraft({ ...editDraft, color: value })} />
          <div className="col-span-2"><Field label="Plate" value={editDraft.plate} onChange={value => setEditDraft({ ...editDraft, plate: value })} /></div>
          <div className="col-span-2">
            <Label>Ride categories</Label>
            <div className="mt-2 grid sm:grid-cols-2 gap-2">
              {editCategories.map(cat => <label key={cat.id} className="flex items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={editDraft.rideCategoryIds.includes(cat.id)} onChange={event => setEditDraft({ ...editDraft, rideCategoryIds: event.target.checked ? [...editDraft.rideCategoryIds, cat.id] : editDraft.rideCategoryIds.filter(id => id !== cat.id) })} />{cat.name}</label>)}
            </div>
          </div>
        </div>}
      </FormDialog>
    </div>
  )
}

function Panel({ title, children, warning }: { title: string; children: React.ReactNode; warning?: boolean }) {
  return <section className={`rounded-xl border p-4 ${warning ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'}`}><h3 className="text-xs uppercase tracking-wide font-semibold text-gray-400 mb-3 flex items-center gap-2">{warning && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}{title}</h3>{children}</section>
}

function Field({ label, value, onChange, type = 'text', disabled = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean }) {
  return <div><Label>{label}</Label><Input className="mt-1.5" type={type} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} /></div>
}
