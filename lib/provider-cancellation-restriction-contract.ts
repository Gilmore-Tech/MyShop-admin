export type ProviderCancellationRestrictionStatus = 'active' | 'expired' | 'lifted'
export type ProviderCancellationRestrictionType = 'driver' | 'artisan'

export interface ProviderCancellationRestrictionListItem {
  restrictionId: string
  providerId: string
  providerType: ProviderCancellationRestrictionType
  fullName: string | null
  phone: string | null
  status: ProviderCancellationRestrictionStatus
  triggerCount: number
  threshold: number
  blockedUntil: string
  createdAt: string
  shadowOnly: boolean
  liftedAt: string | null
  liftedBy: string | null
  liftReason: string | null
}

export interface ProviderCancellationRestrictionListResponse {
  items: ProviderCancellationRestrictionListItem[]
  total: number
  page: number
  limit: number
  totalPages: number
}

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {}
}

function first(...values: unknown[]): unknown {
  return values.find(value => value !== undefined && value !== null)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function nonNegativeInteger(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0
}

function providerType(value: unknown): ProviderCancellationRestrictionType | null {
  const normalized = text(value).trim().toLowerCase()
  return normalized === 'driver' || normalized === 'artisan'
    ? normalized
    : null
}

export function normaliseProviderCancellationRestriction(
  value: unknown,
  nowMs: number = Date.now(),
): ProviderCancellationRestrictionListItem | null {
  const raw = record(value)
  const provider = record(raw.provider)
  const user = record(first(raw.user, provider.user))
  const type = providerType(first(raw.providerType, raw.provider_type, provider.providerType, provider.type))
  const restrictionId = text(first(raw.restrictionId, raw.restriction_id, raw.id)).trim()
  const providerId = text(first(
    raw.providerId,
    raw.provider_id,
    raw.driverId,
    raw.driver_id,
    raw.artisanId,
    raw.artisan_id,
    provider.id,
  )).trim()
  if (!type || !restrictionId || !providerId) return null

  const blockedUntil = text(first(
    raw.blockedUntil,
    raw.blocked_until,
    raw.endsAt,
    raw.ends_at,
    raw.expiresAt,
    raw.expires_at,
  ))
  const liftedAt = nullableText(first(raw.liftedAt, raw.lifted_at))
  const rawStatus = text(raw.status).toLowerCase()
  const explicitlyActive = first(raw.active, raw.isActive, raw.is_active)
  const active = typeof explicitlyActive === 'boolean'
    ? explicitlyActive
    : rawStatus === 'active' || (
      !liftedAt &&
      Boolean(blockedUntil) &&
      new Date(blockedUntil).getTime() > nowMs
    )
  const status: ProviderCancellationRestrictionStatus =
    liftedAt || rawStatus === 'lifted'
      ? 'lifted'
      : active
        ? 'active'
        : 'expired'
  const liftedByRecord = record(first(raw.liftedBy, raw.lifted_by))

  return {
    restrictionId,
    providerId,
    providerType: type,
    fullName: nullableText(first(
      raw.fullName,
      raw.full_name,
      raw.name,
      provider.fullName,
      provider.full_name,
      user.fullName,
      user.full_name,
    )),
    phone: nullableText(first(raw.phone, provider.phone, user.phone)),
    status,
    triggerCount: nonNegativeInteger(first(
      raw.triggerCount,
      raw.trigger_count,
      raw.cancellationCount,
      raw.cancellation_count,
      raw.count,
    )),
    threshold: nonNegativeInteger(first(
      raw.threshold,
      raw.cancellationThreshold,
      raw.cancellation_threshold,
    )),
    blockedUntil,
    createdAt: text(first(
      raw.createdAt,
      raw.created_at,
      raw.blockedAt,
      raw.blocked_at,
      raw.startsAt,
      raw.starts_at,
    )),
    shadowOnly: first(raw.shadowOnly, raw.shadow_only) === true,
    liftedAt,
    liftedBy: nullableText(first(
      raw.liftedByName,
      raw.lifted_by_name,
      liftedByRecord.fullName,
      liftedByRecord.full_name,
      liftedByRecord.email,
    )),
    liftReason: nullableText(first(
      raw.liftReason,
      raw.lift_reason,
      raw.liftedReason,
      raw.lifted_reason,
    )),
  }
}
