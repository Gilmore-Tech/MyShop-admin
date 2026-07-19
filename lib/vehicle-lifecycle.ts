import type { Permission } from './roles'

export type VehicleApprovalStatus =
  | 'pending_coordinator'
  | 'coordinator_approved'
  | 'approved'
  | 'rejected'
  | 'retired'

export type VehicleCategoryStatus = 'pending' | 'approved' | 'rejected'

export interface VehicleReviewTarget {
  kind: 'vehicle' | 'revision'
  status: VehicleApprovalStatus
  version: number
}

export interface VehicleLifecycleState {
  approvalStatus: VehicleApprovalStatus
  version: number
  retirementRequestedAt: string | null
  pendingRevision: {
    status: 'pending_coordinator' | 'coordinator_approved'
    version: number
  } | null
}

/**
 * Approval actions target an open revision when one exists. The approved
 * vehicle itself remains the authoritative operating record until the RM
 * approves that revision.
 */
export function vehicleReviewTarget(vehicle: VehicleLifecycleState): VehicleReviewTarget {
  if (vehicle.pendingRevision) {
    return {
      kind: 'revision',
      status: vehicle.pendingRevision.status,
      version: vehicle.pendingRevision.version,
    }
  }
  return {
    kind: 'vehicle',
    status: vehicle.approvalStatus,
    version: vehicle.version,
  }
}

export function canCoordinatorForward(
  permissions: readonly Permission[],
  vehicle: VehicleLifecycleState,
): boolean {
  return permissions.includes('validate_verification')
    && vehicleReviewTarget(vehicle).status === 'pending_coordinator'
}

export function canRegionalManagerFinalize(
  permissions: readonly Permission[],
  vehicle: VehicleLifecycleState,
): boolean {
  return permissions.includes('finalize_verification')
    && vehicleReviewTarget(vehicle).status === 'coordinator_approved'
}

export function canEditVehicle(
  permissions: readonly Permission[],
  vehicle: VehicleLifecycleState,
): boolean {
  return permissions.includes('edit_provider_profile')
    && vehicle.approvalStatus !== 'retired'
    && vehicle.pendingRevision === null
}

export function canRetireVehicle(
  permissions: readonly Permission[],
  vehicle: VehicleLifecycleState,
): boolean {
  return permissions.includes('edit_provider_profile')
    && vehicle.approvalStatus !== 'retired'
    && vehicle.retirementRequestedAt !== null
}

export function isVehicleVersionConflict(code: string): boolean {
  return code === 'VEHICLE_CHANGED_RETRY'
    || code === 'VEHICLE_APPROVAL_STAGE_CHANGED'
    || code === 'VEHICLE_REVISION_ALREADY_PENDING'
}
