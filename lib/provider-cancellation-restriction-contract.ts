export type ProviderRequestRestrictionStatus = 'active' | 'expired' | 'lifted'
export type ProviderRequestRestrictionType = 'driver' | 'artisan'
export type ProviderRequestRestrictionPolicyKind = 'accepted_cancellation' | 'offer_response'

export interface ProviderRequestRestrictionListItem {
  restrictionId: string
  providerId: string
  providerType: ProviderRequestRestrictionType
  fullName: string | null
  phone: string | null
  status: ProviderRequestRestrictionStatus
  policyKind: ProviderRequestRestrictionPolicyKind
  triggerOutcome: string | null
  triggerCount: number
  points: number
  threshold: number
  blockedUntil: string
  createdAt: string
  shadowOnly: boolean
  liftedAt: string | null
  liftedBy: string | null
  liftReason: string | null
}

export interface ProviderRequestRestrictionListResponse {
  items: ProviderRequestRestrictionListItem[]
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

function providerType(value: unknown): ProviderRequestRestrictionType | null {
  const normalized = text(value).trim().toLowerCase()
  return normalized === 'driver' || normalized === 'artisan'
    ? normalized
    : null
}

function policyKind(value: unknown): ProviderRequestRestrictionPolicyKind {
  const normalized = text(value).trim().toLowerCase()
  return normalized === 'offer_response' || normalized === 'offer-response'
    ? 'offer_response'
    : 'accepted_cancellation'
}

export function normaliseProviderRequestRestriction(
  value: unknown,
  nowMs: number = Date.now(),
): ProviderRequestRestrictionListItem | null {
  const raw = record(value)
  const provider = record(raw.provider)
  const user = record(first(raw.user, provider.user))
  const triggerOfferResponseEvent = record(first(
    raw.triggerOfferResponseEvent,
    raw.trigger_offer_response_event,
  ))
  const type = providerType(first(raw.providerType, raw.provider_type, provider.providerType, provider.type))
  const restrictionId = text(first(
    raw.requestRestrictionId,
    raw.request_restriction_id,
    raw.restrictionId,
    raw.restriction_id,
    raw.id,
  )).trim()
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
  const status: ProviderRequestRestrictionStatus =
    liftedAt || rawStatus === 'lifted'
      ? 'lifted'
      : active
        ? 'active'
        : 'expired'
  const liftedByRecord = record(first(raw.liftedBy, raw.lifted_by))
  const triggerCount = nonNegativeInteger(first(
    raw.triggerCount,
    raw.trigger_count,
    raw.cancellationCount,
    raw.cancellation_count,
    raw.eventCount,
    raw.event_count,
    raw.count,
  ))
  const kind = policyKind(first(
    raw.policyKind,
    raw.policy_kind,
    raw.restrictionKind,
    raw.restriction_kind,
    raw.kind,
  ))

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
    policyKind: kind,
    triggerOutcome: nullableText(first(
      raw.triggerOutcome,
      raw.trigger_outcome,
      raw.latestOutcome,
      raw.latest_outcome,
      raw.outcome,
      triggerOfferResponseEvent.outcome,
    )),
    triggerCount,
    points: nonNegativeInteger(first(
      raw.points,
      raw.pointTotal,
      raw.point_total,
      raw.triggerPoints,
      raw.trigger_points,
      raw.score,
      // Legacy cancellation blocks did not distinguish event count from score.
      triggerCount,
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

// Transitional aliases keep older Admin imports and deployed cancellation-only
// API payloads working while the backend rolls out the broader request policy.
export type ProviderCancellationRestrictionStatus = ProviderRequestRestrictionStatus
export type ProviderCancellationRestrictionType = ProviderRequestRestrictionType
export type ProviderCancellationRestrictionListItem = ProviderRequestRestrictionListItem
export type ProviderCancellationRestrictionListResponse = ProviderRequestRestrictionListResponse
export const normaliseProviderCancellationRestriction = normaliseProviderRequestRestriction
