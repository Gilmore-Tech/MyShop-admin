import { api } from './api-client'
import {
  parseAdminVehicleCategories,
  parseAdminVehicleDetail,
  parseAdminVehicleList,
  type AdminVehicle,
  type AdminVehicleCategory,
  type AdminVehicleDetail,
} from './vehicle-contract'
import type { VehicleApprovalStatus } from './vehicle-lifecycle'

const LEGACY_VEHICLE_APPROVAL_STATUSES = new Set<VehicleApprovalStatus>([
  'pending_coordinator',
  'coordinator_approved',
  'approved',
  'rejected',
  'retired',
])

export interface VehicleInput {
  make: string
  model: string
  year: number
  plate: string
  color: string
  rideCategoryIds: string[]
}

export interface LegacyVehicleDocument {
  id: string
  documentType: 'roadworthiness_certificate' | 'vehicle_insurance'
  status: string
  expiresAt: string | null
  version: number
  fileUrl: string
}

export interface LegacyExplicitVehicle {
  id: string
  make: string | null
  model: string | null
  year: number | null
  plate: string | null
  color: string | null
  approvalStatus: VehicleApprovalStatus
  version: number
  rideCategories: Array<{ rideCategoryId: string; status: string }>
}

export interface LegacyVehicleBackfillCandidate {
  driverId: string
  displayName: string | null
  regionId: string | null
  legacyVehicle: {
    make: string | null
    model: string | null
    year: number | null
    plate: string | null
    color: string | null
  }
  hasCompleteLegacyVehicle: boolean
  explicitVehicles: LegacyExplicitVehicle[]
  unboundDocuments: LegacyVehicleDocument[]
}

export type LegacyVehicleMigrationInput =
  | (VehicleInput & {
      targetVehicleId?: never
      documentIds: string[]
      ownershipConfirmed: true
      reason?: string
    })
  | {
      targetVehicleId: string
      documentIds: string[]
      ownershipConfirmed: true
      reason?: string
    }

export async function listAdminVehicles(filters: {
  status?: VehicleApprovalStatus
  driverId?: string
} = {}): Promise<AdminVehicle[]> {
  const query = new URLSearchParams()
  if (filters.status) query.set('status', filters.status)
  if (filters.driverId) query.set('driverId', filters.driverId)
  const raw = await api.get<unknown>(`/admin/vehicles${query.size ? `?${query}` : ''}`)
  return parseAdminVehicleList(raw)
}

export async function getAdminVehicle(vehicleId: string): Promise<AdminVehicleDetail> {
  const raw = await api.get<unknown>(`/admin/vehicles/${vehicleId}`)
  return parseAdminVehicleDetail(raw)
}

export async function listLegacyVehicleBackfill(): Promise<LegacyVehicleBackfillCandidate[]> {
  const raw = await api.get<unknown>('/admin/vehicle-backfill')
  if (!Array.isArray(raw)) throw new Error('Invalid legacy vehicle migration queue')
  return raw.map((value) => {
    if (!value || typeof value !== 'object') throw new Error('Invalid legacy vehicle candidate')
    const row = value as Record<string, unknown>
    const legacy = row.legacyVehicle
    if (
      typeof row.driverId !== 'string'
      || (row.displayName !== null && typeof row.displayName !== 'string')
      || (row.regionId !== null && typeof row.regionId !== 'string')
      || typeof row.hasCompleteLegacyVehicle !== 'boolean'
      || !legacy || typeof legacy !== 'object'
      || !Array.isArray(row.explicitVehicles)
      || !Array.isArray(row.unboundDocuments)
    ) throw new Error('Invalid legacy vehicle candidate')
    const vehicle = legacy as Record<string, unknown>
    for (const key of ['make', 'model', 'plate', 'color'] as const) {
      if (vehicle[key] !== null && typeof vehicle[key] !== 'string') {
        throw new Error('Invalid legacy vehicle details')
      }
    }
    if (vehicle.year !== null && !Number.isInteger(vehicle.year)) {
      throw new Error('Invalid legacy vehicle year')
    }
    const documents = row.unboundDocuments.map((document) => {
      if (!document || typeof document !== 'object') throw new Error('Invalid legacy vehicle document')
      const item = document as Record<string, unknown>
      if (
        typeof item.id !== 'string'
        || !['roadworthiness_certificate', 'vehicle_insurance'].includes(String(item.documentType))
        || typeof item.status !== 'string'
        || (item.expiresAt !== null && typeof item.expiresAt !== 'string')
        || !Number.isInteger(item.version)
        || typeof item.fileUrl !== 'string'
      ) throw new Error('Invalid legacy vehicle document')
      return item as unknown as LegacyVehicleDocument
    })
    const explicitVehicles = row.explicitVehicles.map((value) => {
      if (!value || typeof value !== 'object') throw new Error('Invalid explicit vehicle')
      const item = value as Record<string, unknown>
      if (
        typeof item.id !== 'string'
        || (item.make !== null && typeof item.make !== 'string')
        || (item.model !== null && typeof item.model !== 'string')
        || (item.year !== null && !Number.isInteger(item.year))
        || (item.plate !== null && typeof item.plate !== 'string')
        || (item.color !== null && typeof item.color !== 'string')
        || typeof item.approvalStatus !== 'string'
        || !LEGACY_VEHICLE_APPROVAL_STATUSES.has(item.approvalStatus as VehicleApprovalStatus)
        || !Number.isInteger(item.version)
        || !Array.isArray(item.rideCategories)
      ) throw new Error('Invalid explicit vehicle')
      const rideCategories = item.rideCategories.map(value => {
        if (!value || typeof value !== 'object') throw new Error('Invalid explicit vehicle category')
        const category = value as Record<string, unknown>
        if (typeof category.rideCategoryId !== 'string' || typeof category.status !== 'string') {
          throw new Error('Invalid explicit vehicle category')
        }
        return { rideCategoryId: category.rideCategoryId, status: category.status }
      })
      return { ...item, rideCategories } as unknown as LegacyExplicitVehicle
    })
    return {
      driverId: row.driverId,
      displayName: row.displayName as string | null,
      regionId: row.regionId as string | null,
      legacyVehicle: vehicle as LegacyVehicleBackfillCandidate['legacyVehicle'],
      hasCompleteLegacyVehicle: row.hasCompleteLegacyVehicle,
      explicitVehicles,
      unboundDocuments: documents,
    }
  })
}

export async function migrateLegacyVehicle(
  driverId: string,
  input: LegacyVehicleMigrationInput,
): Promise<void> {
  await api.post(`/admin/vehicle-backfill/${driverId}`, input)
}

export async function coordinatorApproveAdminVehicle(
  vehicleId: string,
  expectedVersion: number,
  reason?: string,
): Promise<void> {
  await api.post(`/admin/vehicles/${vehicleId}/coordinator-approve`, {
    expectedVersion,
    ...(reason?.trim() ? { reason: reason.trim() } : {}),
  })
}

export async function finalizeAdminVehicle(
  vehicleId: string,
  expectedVersion: number,
  action: 'approve' | 'reject',
  reason?: string,
): Promise<void> {
  await api.post(`/admin/vehicles/${vehicleId}/finalize`, {
    expectedVersion,
    action,
    ...(reason?.trim() ? { reason: reason.trim() } : {}),
  })
}

export async function editAdminVehicle(
  vehicleId: string,
  expectedVersion: number,
  input: VehicleInput,
): Promise<void> {
  await api.patch(`/admin/vehicles/${vehicleId}`, { expectedVersion, ...input })
}

export async function retireAdminVehicle(
  vehicleId: string,
  expectedVersion: number,
  reason: string,
): Promise<void> {
  await api.post(`/admin/vehicles/${vehicleId}/retire`, {
    expectedVersion,
    reason: reason.trim(),
  })
}

export async function listAdminVehicleCategories(
  vehicleId: string,
): Promise<AdminVehicleCategory[]> {
  const raw = await api.get<unknown>(`/admin/vehicles/${vehicleId}/ride-categories`)
  return parseAdminVehicleCategories(raw)
}

export async function reviewAdminVehicleCategory(
  vehicleId: string,
  rideCategoryId: string,
  expectedVersion: number,
  action: 'approve' | 'reject',
  reason?: string,
): Promise<void> {
  await api.patch(
    `/admin/vehicles/${vehicleId}/ride-categories/${rideCategoryId}`,
    {
      expectedVersion,
      action,
      ...(reason?.trim() ? { reason: reason.trim() } : {}),
    },
  )
}

export type { AdminVehicle, AdminVehicleCategory, AdminVehicleDetail }
