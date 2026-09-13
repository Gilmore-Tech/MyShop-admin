export const DRIVER_PRIORITY_TIERS = [
  'bronze',
  'silver',
  'gold',
  'platinum',
  'diamond',
] as const

export type DriverPriorityTier = (typeof DRIVER_PRIORITY_TIERS)[number]
export type EffectiveDriverPriorityTier = DriverPriorityTier | 'none'

export interface DriverPriorityTierThreshold {
  weeklyMinutes: number
  minSevenHourDays: number
  minAcceptanceRateBps: number
  minCompletionRateBps: number
  minEligibleOffers: number
  minAcceptedOffers: number
}

export interface DriverPriorityPolicyValues {
  algorithmVersion: 1 | 2
  qualityWindowDays: number
  qualityMeasurementStartedAt: string | null
  thresholds: Record<DriverPriorityTier, DriverPriorityTierThreshold>
  bonusesMeters: Record<DriverPriorityTier, number>
  dailyCapMinutes: number
  maxAdvantageMeters: number
  maxEtaAdvantageSeconds: number
  assumedPickupSpeedKmh: number
  candidateLimit: number
}

export interface DriverPriorityRuntime {
  shadowEnabled: boolean
  enabled: boolean
  rolloutPercent: number
}

export interface DriverPriorityPolicyResponse {
  revision: {
    id: string
    revisionNumber: number
    effectiveAt: string | null
    reason: string
    createdAt: string | null
    createdBy: string | null
    policy: DriverPriorityPolicyValues
  }
  runtime: DriverPriorityRuntime
}

export interface DriverPriorityPolicyUpdate
  extends DriverPriorityPolicyValues,
    DriverPriorityRuntime {
  expectedRevision: number
  reason: string
}

export interface DriverPriorityPolicyUpdatePayload
  extends Omit<DriverPriorityPolicyValues, 'qualityMeasurementStartedAt'> {
  expectedRevision: number
  runtime: DriverPriorityRuntime
  reason: string
}

export interface DriverPriorityDriverRow {
  driverId: string
  name: string
  phone: string
  automaticTier: EffectiveDriverPriorityTier
  onlineOnlyTier: EffectiveDriverPriorityTier
  qualityTier: EffectiveDriverPriorityTier
  manualFloorTier: DriverPriorityTier | null
  effectiveTier: EffectiveDriverPriorityTier
  weeklyMinutes: number
  qualifyingDays: number
  eligibleOfferCount: number
  acceptedOfferCount: number
  acceptanceRatePercent: number
  completionEligibleCount: number
  completedRideCount: number
  completionRatePercent: number
  algorithmVersion: 1 | 2
  reviewAt: string | null
  expiresAt: string | null
  evaluatedAt: string | null
  manualReason: string | null
}

export interface DriverPriorityDriverList {
  items: DriverPriorityDriverRow[]
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface DriverPriorityDriverListParams {
  page?: number
  limit?: number
  search?: string
  tier?: DriverPriorityTier | 'none'
  manualOnly?: boolean
}

export interface DriverPriorityHistoryItem {
  id: string
  kind: string
  automaticTier: EffectiveDriverPriorityTier | null
  manualFloorTier: DriverPriorityTier | null
  effectiveTier: EffectiveDriverPriorityTier | null
  reason: string | null
  occurredAt: string | null
  actorName: string | null
  metadata: Record<string, unknown>
}

export interface DriverPriorityHistory {
  items: DriverPriorityHistoryItem[]
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface DriverPriorityMetrics {
  window: { from: string | null; to: string | null }
  dispatch: {
    total: number
    shadowChanged: number
    shadowChangedPercent: number
    enforced: number
    avgDistanceDeltaMeters: number
    maxDistanceDeltaMeters: number
    invariantViolations: number
  }
  tiers: Record<EffectiveDriverPriorityTier, number>
  quality: {
    tiers: Record<EffectiveDriverPriorityTier, number>
    evaluatedDrivers: number
    differsFromActive: number
    manuallyFloored: number
  }
  measurement: {
    lastBucketAt: string | null
    eligibleDriversLastBucket: number
  }
}

export const DEFAULT_DRIVER_PRIORITY_POLICY: DriverPriorityPolicyValues = {
  algorithmVersion: 2,
  qualityWindowDays: 28,
  qualityMeasurementStartedAt: null,
  thresholds: {
    bronze: { weeklyMinutes: 2_100, minSevenHourDays: 5, minAcceptanceRateBps: 6_000, minCompletionRateBps: 8_000, minEligibleOffers: 10, minAcceptedOffers: 5 },
    silver: { weeklyMinutes: 2_520, minSevenHourDays: 6, minAcceptanceRateBps: 7_000, minCompletionRateBps: 8_500, minEligibleOffers: 15, minAcceptedOffers: 8 },
    gold: { weeklyMinutes: 2_940, minSevenHourDays: 7, minAcceptanceRateBps: 8_000, minCompletionRateBps: 9_000, minEligibleOffers: 20, minAcceptedOffers: 10 },
    platinum: { weeklyMinutes: 3_360, minSevenHourDays: 7, minAcceptanceRateBps: 8_500, minCompletionRateBps: 9_300, minEligibleOffers: 30, minAcceptedOffers: 15 },
    diamond: { weeklyMinutes: 3_780, minSevenHourDays: 7, minAcceptanceRateBps: 9_000, minCompletionRateBps: 9_500, minEligibleOffers: 40, minAcceptedOffers: 20 },
  },
  bonusesMeters: {
    bronze: 150,
    silver: 300,
    gold: 450,
    platinum: 600,
    diamond: 750,
  },
  dailyCapMinutes: 720,
  maxAdvantageMeters: 750,
  maxEtaAdvantageSeconds: 120,
  assumedPickupSpeedKmh: 25,
  candidateLimit: 50,
}

export function buildDriverPriorityDriverListQuery(
  params: DriverPriorityDriverListParams = {},
): string {
  const query = new URLSearchParams({
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 25),
  })
  if (params.search?.trim()) query.set('search', params.search.trim())
  if (params.tier) query.set('tier', params.tier)
  // Omit false. Older API releases implicitly converted the string "false"
  // to Boolean true before their property transform ran, which accidentally
  // enabled the manual-enrollments-only filter and hid every unseeded driver.
  if (params.manualOnly === true) query.set('manualOnly', 'true')
  return query.toString()
}

export function buildDriverPriorityPolicyUpdatePayload(
  input: DriverPriorityPolicyUpdate,
): DriverPriorityPolicyUpdatePayload {
  const {
    shadowEnabled,
    enabled,
    rolloutPercent,
    reason: rawReason,
    qualityMeasurementStartedAt: _qualityMeasurementStartedAt,
    ...policy
  } = input
  void _qualityMeasurementStartedAt
  const reason = rawReason.trim()
  if (reason.length < 5 || reason.length > 500) {
    throw new Error('A policy-change reason between 5 and 500 characters is required.')
  }
  return {
    ...policy,
    runtime: { shadowEnabled, enabled, rolloutPercent },
    reason,
  }
}

export function validateDriverPriorityPolicy(
  policy: DriverPriorityPolicyValues & DriverPriorityRuntime,
): string | null {
  let previousMinutes = 0
  let previousDays = 0
  let previousBonus = 0
  let previousAcceptance = 0
  let previousCompletion = 0
  let previousEligibleOffers = 0
  let previousAcceptedOffers = 0
  for (const tier of DRIVER_PRIORITY_TIERS) {
    const threshold = policy.thresholds[tier]
    const bonus = policy.bonusesMeters[tier]
    if (!Number.isInteger(threshold.weeklyMinutes) || threshold.weeklyMinutes < 1 || threshold.weeklyMinutes > 5_040) {
      return 'Weekly thresholds must be whole minutes between 1 and 5,040.'
    }
    if (threshold.weeklyMinutes <= previousMinutes) {
      return 'Weekly thresholds must strictly increase from Bronze through Diamond.'
    }
    if (!Number.isInteger(threshold.minSevenHourDays) || threshold.minSevenHourDays < 1 || threshold.minSevenHourDays > 7) {
      return 'Qualifying days must be whole numbers between 1 and 7.'
    }
    if (threshold.minSevenHourDays < previousDays) {
      return 'Qualifying days cannot decrease from Bronze through Diamond.'
    }
    if (!Number.isInteger(bonus) || bonus < previousBonus) {
      return 'Distance advantages must be whole metres that do not decrease from Bronze through Diamond.'
    }
    if (bonus > policy.maxAdvantageMeters) {
      return `${driverPriorityTierLabel(tier)} exceeds the global distance cap.`
    }
    if (!Number.isInteger(threshold.minAcceptanceRateBps) || threshold.minAcceptanceRateBps < previousAcceptance || threshold.minAcceptanceRateBps > 10_000) {
      return 'Acceptance requirements must increase from Bronze through Diamond and stay between 0% and 100%.'
    }
    if (!Number.isInteger(threshold.minCompletionRateBps) || threshold.minCompletionRateBps < previousCompletion || threshold.minCompletionRateBps > 10_000) {
      return 'Completion requirements must increase from Bronze through Diamond and stay between 0% and 100%.'
    }
    if (!Number.isInteger(threshold.minEligibleOffers) || threshold.minEligibleOffers < Math.max(1, previousEligibleOffers)) {
      return 'Minimum eligible offers cannot decrease from Bronze through Diamond.'
    }
    if (!Number.isInteger(threshold.minAcceptedOffers) || threshold.minAcceptedOffers < Math.max(1, previousAcceptedOffers) || threshold.minAcceptedOffers > threshold.minEligibleOffers) {
      return 'Minimum accepted offers cannot decrease or exceed eligible offers.'
    }
    previousMinutes = threshold.weeklyMinutes
    previousDays = threshold.minSevenHourDays
    previousBonus = bonus
    previousAcceptance = threshold.minAcceptanceRateBps
    previousCompletion = threshold.minCompletionRateBps
    previousEligibleOffers = threshold.minEligibleOffers
    previousAcceptedOffers = threshold.minAcceptedOffers
  }
  if (policy.algorithmVersion !== 1 && policy.algorithmVersion !== 2) {
    return 'Choose Priority Driver algorithm V1 or V2.'
  }
  if (!Number.isInteger(policy.qualityWindowDays) || policy.qualityWindowDays < 7 || policy.qualityWindowDays > 90) {
    return 'The quality window must be between 7 and 90 completed days.'
  }
  if (!Number.isInteger(policy.dailyCapMinutes) || policy.dailyCapMinutes < 60 || policy.dailyCapMinutes > 720) {
    return 'Daily credited time must stay between 1 and 12 hours.'
  }
  if (!Number.isInteger(policy.maxAdvantageMeters) || policy.maxAdvantageMeters < 0 || policy.maxAdvantageMeters > 750) {
    return 'The approved distance cap must be between 0 and 750 metres.'
  }
  if (!Number.isInteger(policy.maxEtaAdvantageSeconds) || policy.maxEtaAdvantageSeconds < 0 || policy.maxEtaAdvantageSeconds > 120) {
    return 'The approved ETA cap must be between 0 and 120 seconds.'
  }
  if (!Number.isInteger(policy.assumedPickupSpeedKmh) || policy.assumedPickupSpeedKmh < 5 || policy.assumedPickupSpeedKmh > 80) {
    return 'Assumed pickup speed must be a whole number between 5 and 80 km/h.'
  }
  if (!Number.isInteger(policy.candidateLimit) || policy.candidateLimit < 10 || policy.candidateLimit > 100) {
    return 'Candidate limit must be a whole number between 10 and 100.'
  }
  if (!Number.isFinite(policy.rolloutPercent) || policy.rolloutPercent < 0 || policy.rolloutPercent > 100) {
    return 'Rollout must be between 0 and 100 percent.'
  }
  if (policy.enabled && !policy.shadowEnabled) {
    return 'Keep shadow measurement enabled while enforcement is active.'
  }
  return null
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function first(...values: unknown[]): unknown {
  return values.find(value => value !== undefined && value !== null)
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function nullableText(value: unknown): string | null {
  const result = text(value).trim()
  return result ? result : null
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function nonNegativeInteger(value: unknown, fallback = 0): number {
  return Math.max(0, Math.trunc(finiteNumber(value, fallback)))
}

function bool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true
    if (value.toLowerCase() === 'false') return false
  }
  return fallback
}

function tier(value: unknown): EffectiveDriverPriorityTier {
  const candidate = text(value).toLowerCase()
  return candidate === 'none' || DRIVER_PRIORITY_TIERS.includes(candidate as DriverPriorityTier)
    ? (candidate as EffectiveDriverPriorityTier)
    : 'none'
}

function nullableTier(value: unknown): DriverPriorityTier | null {
  const candidate = tier(value)
  return candidate === 'none' ? null : candidate
}

function threshold(raw: unknown, fallback: DriverPriorityTierThreshold): DriverPriorityTierThreshold {
  const value = record(raw)
  return {
    weeklyMinutes: nonNegativeInteger(
      first(value.weeklyMinutes, value.weekly_minutes),
      fallback.weeklyMinutes,
    ),
    minSevenHourDays: nonNegativeInteger(
      first(value.minSevenHourDays, value.min_seven_hour_days),
      fallback.minSevenHourDays,
    ),
    minAcceptanceRateBps: nonNegativeInteger(first(value.minAcceptanceRateBps, value.min_acceptance_rate_bps), fallback.minAcceptanceRateBps),
    minCompletionRateBps: nonNegativeInteger(first(value.minCompletionRateBps, value.min_completion_rate_bps), fallback.minCompletionRateBps),
    minEligibleOffers: nonNegativeInteger(first(value.minEligibleOffers, value.min_eligible_offers), fallback.minEligibleOffers),
    minAcceptedOffers: nonNegativeInteger(first(value.minAcceptedOffers, value.min_accepted_offers), fallback.minAcceptedOffers),
  }
}

export function normaliseDriverPriorityPolicy(rawValue: unknown): DriverPriorityPolicyResponse {
  const outer = record(rawValue)
  const revision = record(first(outer.revision, outer.policyRevision, outer.policy_revision))
  // The backend returns the policy fields directly on `revision`; retain the
  // nested aliases for compatibility with older/alternate envelopes.
  const policy = record(
    first(revision.policy, outer.policy, revision.values, outer.values, revision),
  )
  const thresholds = record(policy.thresholds)
  const bonuses = record(first(policy.bonusesMeters, policy.bonuses_meters))
  const runtime = record(first(outer.runtime, policy.runtime))

  const values: DriverPriorityPolicyValues = {
    algorithmVersion: finiteNumber(first(policy.algorithmVersion, policy.algorithm_version), 1) === 2 ? 2 : 1,
    qualityWindowDays: nonNegativeInteger(first(policy.qualityWindowDays, policy.quality_window_days), 28),
    qualityMeasurementStartedAt: nullableText(first(policy.qualityMeasurementStartedAt, policy.quality_measurement_started_at)),
    thresholds: {
      bronze: threshold(thresholds.bronze, DEFAULT_DRIVER_PRIORITY_POLICY.thresholds.bronze),
      silver: threshold(thresholds.silver, DEFAULT_DRIVER_PRIORITY_POLICY.thresholds.silver),
      gold: threshold(thresholds.gold, DEFAULT_DRIVER_PRIORITY_POLICY.thresholds.gold),
      platinum: threshold(thresholds.platinum, DEFAULT_DRIVER_PRIORITY_POLICY.thresholds.platinum),
      diamond: threshold(thresholds.diamond, DEFAULT_DRIVER_PRIORITY_POLICY.thresholds.diamond),
    },
    bonusesMeters: {
      bronze: nonNegativeInteger(bonuses.bronze, 150),
      silver: nonNegativeInteger(bonuses.silver, 300),
      gold: nonNegativeInteger(bonuses.gold, 450),
      platinum: nonNegativeInteger(bonuses.platinum, 600),
      diamond: nonNegativeInteger(bonuses.diamond, 750),
    },
    dailyCapMinutes: nonNegativeInteger(
      first(policy.dailyCapMinutes, policy.daily_cap_minutes),
      720,
    ),
    maxAdvantageMeters: nonNegativeInteger(
      first(policy.maxAdvantageMeters, policy.max_advantage_meters),
      750,
    ),
    maxEtaAdvantageSeconds: nonNegativeInteger(
      first(policy.maxEtaAdvantageSeconds, policy.max_eta_advantage_seconds),
      120,
    ),
    assumedPickupSpeedKmh: finiteNumber(
      first(policy.assumedPickupSpeedKmh, policy.assumed_pickup_speed_kmh),
      25,
    ),
    candidateLimit: nonNegativeInteger(
      first(policy.candidateLimit, policy.candidate_limit),
      50,
    ),
  }

  return {
    revision: {
      id: text(revision.id),
      revisionNumber: nonNegativeInteger(
        first(revision.revisionNumber, revision.revision_number, revision.revision),
      ),
      effectiveAt: nullableText(first(revision.effectiveAt, revision.effective_at)),
      reason: text(revision.reason),
      createdAt: nullableText(first(revision.createdAt, revision.created_at)),
      createdBy: nullableText(first(revision.createdByName, revision.created_by_name, revision.createdBy)),
      policy: values,
    },
    runtime: {
      shadowEnabled: bool(first(runtime.shadowEnabled, runtime.shadow_enabled), true),
      enabled: bool(runtime.enabled, false),
      rolloutPercent: Math.min(
        100,
        nonNegativeInteger(first(runtime.rolloutPercent, runtime.rollout_percent), 0),
      ),
    },
  }
}

export function normaliseDriverPriorityDriverList(
  rawValue: unknown,
  fallback: { page: number; limit: number },
): DriverPriorityDriverList {
  const outer = record(rawValue)
  const rawItems = Array.isArray(rawValue)
    ? rawValue
    : Array.isArray(outer.items)
      ? outer.items
      : Array.isArray(outer.drivers)
        ? outer.drivers
        : []
  const items = rawItems
    .map(value => {
      const raw = record(value)
      const driverId = text(first(raw.driverId, raw.driver_id, raw.id))
      if (!driverId) return null
      return {
        driverId,
        name: text(first(raw.name, raw.fullName, raw.full_name), 'Unknown driver'),
        phone: text(first(raw.phone, raw.phoneNumber, raw.phone_number)),
        automaticTier: tier(first(raw.automaticTier, raw.automatic_tier)),
        onlineOnlyTier: tier(first(raw.onlineOnlyTier, raw.online_only_tier)),
        qualityTier: tier(first(raw.qualityTier, raw.quality_tier)),
        manualFloorTier: nullableTier(first(raw.manualFloorTier, raw.manual_floor_tier)),
        effectiveTier: tier(first(raw.effectiveTier, raw.effective_tier)),
        weeklyMinutes: nonNegativeInteger(first(raw.weeklyMinutes, raw.weekly_minutes)),
        qualifyingDays: nonNegativeInteger(first(raw.qualifyingDays, raw.qualifying_days)),
        eligibleOfferCount: nonNegativeInteger(first(raw.eligibleOfferCount, raw.eligible_offer_count)),
        acceptedOfferCount: nonNegativeInteger(first(raw.acceptedOfferCount, raw.accepted_offer_count)),
        acceptanceRatePercent: finiteNumber(first(raw.acceptanceRatePercent, raw.acceptance_rate_percent)),
        completionEligibleCount: nonNegativeInteger(first(raw.completionEligibleCount, raw.completion_eligible_count)),
        completedRideCount: nonNegativeInteger(first(raw.completedRideCount, raw.completed_ride_count)),
        completionRatePercent: finiteNumber(first(raw.completionRatePercent, raw.completion_rate_percent)),
        algorithmVersion: finiteNumber(first(raw.algorithmVersion, raw.algorithm_version), 1) === 2 ? 2 : 1,
        reviewAt: nullableText(first(raw.reviewAt, raw.review_at)),
        expiresAt: nullableText(first(raw.expiresAt, raw.expires_at)),
        evaluatedAt: nullableText(
          first(raw.evaluatedAt, raw.evaluated_at, raw.lastEvaluatedAt, raw.last_evaluated_at),
        ),
        manualReason: nullableText(first(raw.manualReason, raw.manual_reason, raw.reason)),
      } satisfies DriverPriorityDriverRow
    })
    .filter((item): item is DriverPriorityDriverRow => item !== null)
  const page = Math.max(1, nonNegativeInteger(outer.page, fallback.page))
  const limit = Math.max(1, nonNegativeInteger(outer.limit, fallback.limit))
  const total = nonNegativeInteger(outer.total, items.length)
  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, nonNegativeInteger(first(outer.totalPages, outer.total_pages), Math.ceil(total / limit))),
  }
}

export function normaliseDriverPriorityHistory(
  rawValue: unknown,
  fallback: { page: number; limit: number },
): DriverPriorityHistory {
  const outer = record(rawValue)
  const rawItems = Array.isArray(rawValue)
    ? rawValue
    : Array.isArray(outer.items)
      ? outer.items
      : Array.isArray(outer.events)
        ? outer.events
        : []
  const items = rawItems.map((value, index) => {
    const raw = record(value)
    return {
      id: text(first(raw.id, raw.eventId, raw.event_id), `event-${index}`),
      kind: text(first(raw.kind, raw.eventType, raw.event_type, raw.action), 'priority_changed'),
      automaticTier: first(raw.automaticTier, raw.automatic_tier) == null
        ? null
        : tier(first(raw.automaticTier, raw.automatic_tier)),
      manualFloorTier: nullableTier(first(raw.manualFloorTier, raw.manual_floor_tier, raw.floorTier)),
      effectiveTier: first(raw.effectiveTier, raw.effective_tier) == null
        ? null
        : tier(first(raw.effectiveTier, raw.effective_tier)),
      reason: nullableText(raw.reason),
      occurredAt: nullableText(first(raw.occurredAt, raw.occurred_at, raw.createdAt, raw.created_at)),
      actorName: nullableText(first(raw.actorName, raw.actor_name, raw.createdByName, raw.created_by_name)),
      metadata: record(raw.metadata),
    }
  })
  const page = Math.max(1, nonNegativeInteger(outer.page, fallback.page))
  const limit = Math.max(1, nonNegativeInteger(outer.limit, fallback.limit))
  const total = nonNegativeInteger(outer.total, items.length)
  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, nonNegativeInteger(first(outer.totalPages, outer.total_pages), Math.ceil(total / limit))),
  }
}

export function normaliseDriverPriorityMetrics(rawValue: unknown): DriverPriorityMetrics {
  const outer = record(rawValue)
  const window = record(outer.window)
  const dispatch = record(outer.dispatch)
  const tiers = record(outer.tiers)
  const quality = record(outer.quality)
  const qualityTiers = record(quality.tiers)
  const measurement = record(outer.measurement)
  return {
    window: {
      from: nullableText(window.from),
      to: nullableText(window.to),
    },
    dispatch: {
      total: nonNegativeInteger(dispatch.total),
      shadowChanged: nonNegativeInteger(first(dispatch.shadowChanged, dispatch.shadow_changed)),
      shadowChangedPercent: finiteNumber(first(dispatch.shadowChangedPercent, dispatch.shadow_changed_percent)),
      enforced: nonNegativeInteger(dispatch.enforced),
      avgDistanceDeltaMeters: finiteNumber(first(dispatch.avgDistanceDeltaMeters, dispatch.avg_distance_delta_meters)),
      maxDistanceDeltaMeters: finiteNumber(first(dispatch.maxDistanceDeltaMeters, dispatch.max_distance_delta_meters)),
      invariantViolations: nonNegativeInteger(first(dispatch.invariantViolations, dispatch.invariant_violations)),
    },
    tiers: {
      none: nonNegativeInteger(tiers.none),
      bronze: nonNegativeInteger(tiers.bronze),
      silver: nonNegativeInteger(tiers.silver),
      gold: nonNegativeInteger(tiers.gold),
      platinum: nonNegativeInteger(tiers.platinum),
      diamond: nonNegativeInteger(tiers.diamond),
    },
    quality: {
      tiers: {
        none: nonNegativeInteger(qualityTiers.none),
        bronze: nonNegativeInteger(qualityTiers.bronze),
        silver: nonNegativeInteger(qualityTiers.silver),
        gold: nonNegativeInteger(qualityTiers.gold),
        platinum: nonNegativeInteger(qualityTiers.platinum),
        diamond: nonNegativeInteger(qualityTiers.diamond),
      },
      evaluatedDrivers: nonNegativeInteger(first(quality.evaluatedDrivers, quality.evaluated_drivers)),
      differsFromActive: nonNegativeInteger(first(quality.differsFromActive, quality.differs_from_active)),
      manuallyFloored: nonNegativeInteger(first(quality.manuallyFloored, quality.manually_floored)),
    },
    measurement: {
      lastBucketAt: nullableText(first(measurement.lastBucketAt, measurement.last_bucket_at)),
      eligibleDriversLastBucket: nonNegativeInteger(
        first(measurement.eligibleDriversLastBucket, measurement.eligible_drivers_last_bucket),
      ),
    },
  }
}

export function driverPriorityTierLabel(value: EffectiveDriverPriorityTier): string {
  return value === 'none' ? 'Standard' : value[0].toUpperCase() + value.slice(1)
}
