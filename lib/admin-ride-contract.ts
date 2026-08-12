import {
  normaliseRidePricing,
  type RidePricingSummary,
} from './ride-pricing-contract.ts'

export interface AdminRide {
  id: string
  clientName: string | null
  driverName: string | null
  pickupAddress: string | null
  dropoffAddress: string | null
  status: string
  estimatedFarePesewas: number | null
  finalFarePesewas: number | null
  pricing: RidePricingSummary | null
  /** Authoritative client amount. Null means unknown; zero is a valid amount. */
  farePesewas: number | null
  paymentMethod: string | null
  paymentStatus: string | null
  amountPaidPesewas: number | null
  paidAt: string | null
  createdAt: string
}

export interface AdminRideListResponse {
  items: AdminRide[]
  total: number
  page: number
  limit: number
  totalPages: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function ownValue(
  record: Record<string, unknown>,
  ...keys: string[]
): { present: boolean; value: unknown } {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return { present: true, value: record[key] }
    }
  }
  return { present: false, value: undefined }
}

function nullablePesewas(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const amount = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  const amount = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : fallback
}

/**
 * Parse one ride row across a rolling backend deployment.
 *
 * New backends explicitly own `farePesewas`, including an explicit null when
 * final pricing is unknown. Only old payloads where that property is absent may
 * fall back to final/estimated legacy fields. Null must never become zero.
 */
export function normaliseAdminRide(raw: unknown): AdminRide | null {
  if (!isRecord(raw)) return null

  const id = nullableString(raw.id)
  if (!id) return null

  const estimatedFarePesewas = nullablePesewas(
    raw.estimatedFarePesewas ?? raw.estimated_fare_pesewas,
  )
  const finalFarePesewas = nullablePesewas(raw.finalFarePesewas ?? raw.final_fare_pesewas)
  const pricing = normaliseRidePricing(raw.pricing)
  const explicitFare = ownValue(raw, 'farePesewas', 'fare_pesewas')

  // A valid additive pricing contract is strongest. Otherwise an explicitly
  // present compatibility alias (including null) outranks legacy fields.
  const farePesewas = pricing
    ? pricing.clientAmountPesewas
    : explicitFare.present
      ? nullablePesewas(explicitFare.value)
      : finalFarePesewas ?? estimatedFarePesewas

  return {
    id,
    clientName: nullableString(raw.clientName ?? raw.client_name),
    driverName: nullableString(raw.driverName ?? raw.driver_name),
    pickupAddress: nullableString(raw.pickupAddress ?? raw.pickup_address),
    dropoffAddress: nullableString(raw.dropoffAddress ?? raw.dropoff_address),
    status: nullableString(raw.status) ?? 'unknown',
    estimatedFarePesewas,
    finalFarePesewas,
    pricing,
    farePesewas,
    paymentMethod: nullableString(raw.paymentMethod ?? raw.payment_method),
    paymentStatus: nullableString(raw.paymentStatus ?? raw.payment_status),
    amountPaidPesewas: nullablePesewas(
      raw.amountPaidPesewas ?? raw.amount_paid_pesewas,
    ),
    paidAt: nullableString(raw.paidAt ?? raw.paid_at),
    createdAt: nullableString(raw.createdAt ?? raw.created_at) ?? '',
  }
}

export function normaliseAdminRideListResponse(raw: unknown): AdminRideListResponse {
  if (!isRecord(raw)) {
    return { items: [], total: 0, page: 1, limit: 0, totalPages: 0 }
  }

  const items = Array.isArray(raw.items)
    ? raw.items
        .map(normaliseAdminRide)
        .filter((ride): ride is AdminRide => ride !== null)
    : []

  return {
    items,
    total: nonNegativeInteger(raw.total, items.length),
    page: Math.max(1, nonNegativeInteger(raw.page, 1)),
    limit: nonNegativeInteger(raw.limit, items.length),
    totalPages: nonNegativeInteger(raw.totalPages ?? raw.total_pages, 0),
  }
}
