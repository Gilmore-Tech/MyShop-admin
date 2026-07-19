import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canCoordinatorForward,
  canEditVehicle,
  canRegionalManagerFinalize,
  canRetireVehicle,
  isVehicleVersionConflict,
  vehicleReviewTarget,
  type VehicleLifecycleState,
} from '../lib/vehicle-lifecycle.ts'
import { parseAdminVehicleList } from '../lib/vehicle-contract.ts'

const approvedWithRevision: VehicleLifecycleState = {
  approvalStatus: 'approved',
  version: 4,
  retirementRequestedAt: null,
  pendingRevision: {
    status: 'pending_coordinator',
    version: 5,
  },
}

test('pending revision is reviewed without replacing approved authority', () => {
  assert.deepEqual(vehicleReviewTarget(approvedWithRevision), {
    kind: 'revision',
    status: 'pending_coordinator',
    version: 5,
  })
  assert.equal(approvedWithRevision.approvalStatus, 'approved')
  assert.equal(approvedWithRevision.version, 4)
})

test('two approval stages expose only their exact permission action', () => {
  assert.equal(
    canCoordinatorForward(['validate_verification'], approvedWithRevision),
    true,
  )
  assert.equal(
    canRegionalManagerFinalize(['finalize_verification'], approvedWithRevision),
    false,
  )

  const forwarded: VehicleLifecycleState = {
    ...approvedWithRevision,
    pendingRevision: { status: 'coordinator_approved', version: 5 },
  }
  assert.equal(
    canCoordinatorForward(['validate_verification'], forwarded),
    false,
  )
  assert.equal(
    canRegionalManagerFinalize(['finalize_verification'], forwarded),
    true,
  )
})

test('open revision blocks another edit and retirement requires driver request', () => {
  assert.equal(canEditVehicle(['edit_provider_profile'], approvedWithRevision), false)
  assert.equal(canRetireVehicle(['edit_provider_profile'], approvedWithRevision), false)
  assert.equal(
    canRetireVehicle(
      ['edit_provider_profile'],
      { ...approvedWithRevision, retirementRequestedAt: '2026-07-18T12:00:00Z' },
    ),
    true,
  )
})

test('stale mutation codes are treated as reload-required conflicts', () => {
  assert.equal(isVehicleVersionConflict('VEHICLE_CHANGED_RETRY'), true)
  assert.equal(isVehicleVersionConflict('VEHICLE_APPROVAL_STAGE_CHANGED'), true)
  assert.equal(isVehicleVersionConflict('VEHICLE_REVISION_ALREADY_PENDING'), true)
  assert.equal(isVehicleVersionConflict('VEHICLE_PLATE_IN_USE'), false)
})

const vehicleFixture = {
  id: 'vehicle-1',
  driverId: 'driver-1',
  make: 'Toyota',
  model: 'Corolla',
  year: 2024,
  plate: 'GR-1234-24',
  color: 'Silver',
  isActive: true,
  approvalStatus: 'approved',
  version: 4,
  rejectionReason: null,
  retirementRequestedAt: null,
  retirementRequestReason: null,
  createdAt: '2026-07-18T12:00:00Z',
  driver: {
    id: 'driver-1',
    regionId: 'region-1',
    displayName: 'Test Driver',
  },
  rideCategories: [{
    id: 'assignment-1',
    version: 2,
    status: 'approved',
    rejectionReason: null,
    reviewedAt: '2026-07-18T12:30:00Z',
    rideCategory: {
      id: 'category-1',
      name: 'Regular',
      slug: 'regular',
      isActive: true,
      sortOrder: 1,
    },
  }],
  revisions: [{
    id: 'revision-1',
    version: 5,
    status: 'pending_coordinator',
    make: 'Toyota',
    model: 'Corolla Cross',
    year: 2025,
    plate: 'GR-1234-24',
    color: 'Black',
    rideCategoryIds: ['category-1'],
    rejectionReason: null,
    createdAt: '2026-07-18T13:00:00Z',
  }],
}

test('strict admin parser preserves approved authority beside pending revision', () => {
  const parsed = parseAdminVehicleList([vehicleFixture])[0]
  assert.equal(parsed.model, 'Corolla')
  assert.equal(parsed.version, 4)
  assert.equal(parsed.pendingRevision?.model, 'Corolla Cross')
  assert.equal(parsed.pendingRevision?.version, 5)
})

test('strict admin parser rejects unknown lifecycle state', () => {
  assert.throws(
    () => parseAdminVehicleList([{ ...vehicleFixture, approvalStatus: 'active' }]),
    /Invalid vehicle approval status/,
  )
})
