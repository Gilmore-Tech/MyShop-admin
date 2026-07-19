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

export interface VehicleInput {
  make: string
  model: string
  year: number
  plate: string
  color: string
  rideCategoryIds: string[]
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
