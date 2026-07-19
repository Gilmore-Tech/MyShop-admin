import type { VehicleApprovalStatus, VehicleCategoryStatus } from './vehicle-lifecycle'

export interface AdminVehicleCategory {
  id: string
  version: number
  status: VehicleCategoryStatus
  rejectionReason: string | null
  reviewedAt: string | null
  rideCategory: {
    id: string
    name: string
    slug: string
    isActive: boolean
    sortOrder: number
  }
}

export interface AdminVehicleRevision {
  id: string
  version: number
  status: Exclude<VehicleApprovalStatus, 'retired'>
  make: string
  model: string
  year: number
  plate: string
  color: string
  rideCategoryIds: string[]
  rejectionReason: string | null
  createdAt: string
}

export interface AdminVehicleOpenRevision extends Omit<AdminVehicleRevision, 'status'> {
  status: 'pending_coordinator' | 'coordinator_approved'
}

export interface AdminVehicle {
  id: string
  driverId: string
  make: string
  model: string
  year: number
  plate: string
  color: string
  isActive: boolean
  approvalStatus: VehicleApprovalStatus
  version: number
  rejectionReason: string | null
  retirementRequestedAt: string | null
  retirementRequestReason: string | null
  createdAt: string
  driver: {
    id: string
    regionId: string | null
    displayName: string | null
  }
  rideCategories: AdminVehicleCategory[]
  pendingRevision: AdminVehicleOpenRevision | null
}

export interface AdminVehicleDetail extends AdminVehicle {
  providerDocuments: Array<{
    id: string
    documentType: string
    status: string
    expiresAt: string | null
    rejectionReason: string | null
    version: number
  }>
  revisions: AdminVehicleRevision[]
  lifecycleEvents: Array<{
    id: string
    action: string
    fromStatus: string | null
    toStatus: string | null
    reason: string | null
    vehicleVersion: number
    createdAt: string
  }>
}

const VEHICLE_STATUSES = new Set<VehicleApprovalStatus>([
  'pending_coordinator',
  'coordinator_approved',
  'approved',
  'rejected',
  'retired',
])

const REVISION_STATUSES = new Set<Exclude<VehicleApprovalStatus, 'retired'>>([
  'pending_coordinator',
  'coordinator_approved',
  'approved',
  'rejected',
])

const CATEGORY_STATUSES = new Set<VehicleCategoryStatus>([
  'pending',
  'approved',
  'rejected',
])

export function parseAdminVehicleList(value: unknown): AdminVehicle[] {
  if (!Array.isArray(value)) throw new Error('Invalid vehicle list response')
  return value.map(parseAdminVehicle)
}

export function parseAdminVehicle(value: unknown): AdminVehicle {
  const row = record(value, 'vehicle')
  const revisions = array(row.revisions, 'vehicle revisions').map(parseRevision)
  return {
    id: requiredString(row.id, 'vehicle id'),
    driverId: requiredString(row.driverId, 'driver id'),
    make: requiredString(row.make, 'vehicle make'),
    model: requiredString(row.model, 'vehicle model'),
    year: requiredInteger(row.year, 'vehicle year'),
    plate: requiredString(row.plate, 'vehicle plate'),
    color: requiredString(row.color, 'vehicle color'),
    isActive: requiredBoolean(row.isActive, 'vehicle active state'),
    approvalStatus: vehicleStatus(row.approvalStatus),
    version: positiveInteger(row.version, 'vehicle version'),
    rejectionReason: optionalString(row.rejectionReason, 'rejection reason'),
    retirementRequestedAt: optionalDate(row.retirementRequestedAt, 'retirement request date'),
    retirementRequestReason: optionalString(row.retirementRequestReason, 'retirement reason'),
    createdAt: requiredDate(row.createdAt, 'vehicle creation date'),
    driver: parseDriver(row.driver),
    rideCategories: array(row.rideCategories, 'vehicle categories').map(parseCategory),
    pendingRevision: revisions.find(isOpenRevision) ?? null,
  }
}

export function parseAdminVehicleDetail(value: unknown): AdminVehicleDetail {
  const row = record(value, 'vehicle detail')
  const common = parseAdminVehicle(row)
  return {
    ...common,
    providerDocuments: array(row.providerDocuments, 'vehicle documents').map(value => {
      const document = record(value, 'vehicle document')
      return {
        id: requiredString(document.id, 'document id'),
        documentType: requiredString(document.documentType, 'document type'),
        status: requiredString(document.status, 'document status'),
        expiresAt: optionalDate(document.expiresAt, 'document expiry'),
        rejectionReason: optionalString(document.rejectionReason, 'document rejection reason'),
        version: positiveInteger(document.version, 'document version'),
      }
    }),
    revisions: array(row.revisions, 'vehicle revisions').map(parseRevision),
    lifecycleEvents: array(row.lifecycleEvents, 'vehicle lifecycle events').map(value => {
      const event = record(value, 'vehicle lifecycle event')
      return {
        id: requiredString(event.id, 'lifecycle event id'),
        action: requiredString(event.action, 'lifecycle action'),
        fromStatus: optionalString(event.fromStatus, 'previous status'),
        toStatus: optionalString(event.toStatus, 'next status'),
        reason: optionalString(event.reason, 'lifecycle reason'),
        vehicleVersion: positiveInteger(event.vehicleVersion, 'event vehicle version'),
        createdAt: requiredDate(event.createdAt, 'lifecycle event date'),
      }
    }),
  }
}

export function parseAdminVehicleCategories(value: unknown): AdminVehicleCategory[] {
  const envelope = record(value, 'vehicle category response')
  return array(envelope.rideCategories, 'vehicle categories').map(parseCategory)
}

function parseDriver(value: unknown): AdminVehicle['driver'] {
  const driver = record(value, 'vehicle driver')
  return {
    id: requiredString(driver.id, 'driver id'),
    regionId: optionalString(driver.regionId, 'driver region id'),
    displayName: optionalString(driver.displayName, 'driver name'),
  }
}

function parseCategory(value: unknown): AdminVehicleCategory {
  const assignment = record(value, 'vehicle category assignment')
  const category = record(assignment.rideCategory, 'ride category')
  const rawStatus = requiredString(assignment.status, 'category status')
  if (!CATEGORY_STATUSES.has(rawStatus as VehicleCategoryStatus)) {
    throw new Error('Invalid vehicle category status')
  }
  return {
    id: requiredString(assignment.id, 'category assignment id'),
    version: positiveInteger(assignment.version, 'category assignment version'),
    status: rawStatus as VehicleCategoryStatus,
    rejectionReason: optionalString(assignment.rejectionReason, 'category rejection reason'),
    reviewedAt: optionalDate(assignment.reviewedAt, 'category review date'),
    rideCategory: {
      id: requiredString(category.id, 'ride category id'),
      name: requiredString(category.name, 'ride category name'),
      slug: requiredString(category.slug, 'ride category slug'),
      isActive: requiredBoolean(category.isActive, 'ride category active state'),
      sortOrder: requiredInteger(category.sortOrder, 'ride category sort order'),
    },
  }
}

function parseRevision(value: unknown): AdminVehicleRevision {
  const revision = record(value, 'vehicle revision')
  const rawStatus = requiredString(revision.status, 'revision status')
  if (!REVISION_STATUSES.has(rawStatus as Exclude<VehicleApprovalStatus, 'retired'>)) {
    throw new Error('Invalid vehicle revision status')
  }
  const rideCategoryIds = array(revision.rideCategoryIds, 'revision category IDs')
    .map(value => requiredString(value, 'revision category id'))
  return {
    id: requiredString(revision.id, 'revision id'),
    version: positiveInteger(revision.version, 'revision version'),
    status: rawStatus as Exclude<VehicleApprovalStatus, 'retired'>,
    make: requiredString(revision.make, 'revision make'),
    model: requiredString(revision.model, 'revision model'),
    year: requiredInteger(revision.year, 'revision year'),
    plate: requiredString(revision.plate, 'revision plate'),
    color: requiredString(revision.color, 'revision color'),
    rideCategoryIds,
    rejectionReason: optionalString(revision.rejectionReason, 'revision rejection reason'),
    createdAt: requiredDate(revision.createdAt, 'revision creation date'),
  }
}

function isOpenRevision(revision: AdminVehicleRevision): revision is AdminVehicleOpenRevision {
  return revision.status === 'pending_coordinator' || revision.status === 'coordinator_approved'
}

function vehicleStatus(value: unknown): VehicleApprovalStatus {
  const status = requiredString(value, 'vehicle approval status')
  if (!VEHICLE_STATUSES.has(status as VehicleApprovalStatus)) {
    throw new Error('Invalid vehicle approval status')
  }
  return status as VehicleApprovalStatus
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`)
  }
  return value as Record<string, unknown>
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid ${label}`)
  return value
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid ${label}`)
  return value.trim()
}

function optionalString(value: unknown, label: string): string | null {
  if (value == null) return null
  if (typeof value !== 'string') throw new Error(`Invalid ${label}`)
  return value.trim() || null
}

function requiredInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value)) throw new Error(`Invalid ${label}`)
  return value as number
}

function positiveInteger(value: unknown, label: string): number {
  const parsed = requiredInteger(value, label)
  if (parsed < 1) throw new Error(`Invalid ${label}`)
  return parsed
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Invalid ${label}`)
  return value
}

function requiredDate(value: unknown, label: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`Invalid ${label}`)
  }
  return value
}

function optionalDate(value: unknown, label: string): string | null {
  if (value == null) return null
  return requiredDate(value, label)
}
