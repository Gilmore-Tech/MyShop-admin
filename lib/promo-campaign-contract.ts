// Auto-apply promo campaign contract. Campaigns are deliberately separate from
// the typed promo codes in lib/api.ts (§Promotions): campaigns apply
// automatically at checkout, carry a budget + banner, and go through a
// maker-checker approval flow (creator may never approve their own campaign).
//
// Backend: /admin/promo-campaigns* (permissions view_promotions /
// manage_promotions / approve_promotions; sanity-limit writes are super_admin
// role only). This module holds the pure types, defensive normalisers and
// client-side validation mirrors so they stay unit-testable without a browser.

// commission_relief is the provider-audience type: discountValue is the percent
// of the platform commission forgiven (1-100), maxDiscountPesewas an optional
// absolute cap on the forgone commission per booking.
export type PromoCampaignType = 'percentage_discount' | 'fixed_discount' | 'commission_relief'
export type PromoCampaignScope = 'ride' | 'artisan_job' | 'both'
// Who the campaign pays out to. Client campaigns discount the fare; provider
// campaigns (driver/artisan) forgive platform commission instead. Provider
// audiences imply their scope server-side (driver→ride, artisan→artisan_job).
export type PromoCampaignAudience = 'client' | 'driver' | 'artisan'

export function isProviderAudience(audience: PromoCampaignAudience): boolean {
  return audience === 'driver' || audience === 'artisan'
}
export type PromoCampaignStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'paused'
  | 'ended'
  | 'budget_exhausted'

export const PROMO_CAMPAIGN_STATUSES: PromoCampaignStatus[] = [
  'draft', 'pending_approval', 'approved', 'paused', 'ended', 'budget_exhausted',
]

export interface PromoCampaign {
  id: string
  name: string
  description: string | null
  termsText: string | null
  campaignType: PromoCampaignType
  audience: PromoCampaignAudience
  discountValue: number
  maxDiscountPesewas: number | null
  minBookingPesewas: number | null
  promoScope: PromoCampaignScope
  rideCategoryIds: string[]
  serviceCategoryIds: string[]
  newClientsOnly: boolean
  maxUsesPerUser: number | null
  maxUsesPerUserPerDay: number | null
  budgetCapPesewas: number | null
  budgetSpentPesewas: number
  startsAt: string
  endsAt: string
  bannerUrl: string | null
  bannerPriority: number
  status: PromoCampaignStatus
  rejectionReason: string | null
  createdBy: string | null
  approvedBy: string | null
  approvedAt: string | null
  createdAt: string
}

export interface PromoCampaignStats {
  reservedRedemptions: number
  settledRedemptions: number
  uniqueClients: number
  budgetSpentPesewas: number
}

export interface PromoCampaignDetail extends PromoCampaign {
  stats: PromoCampaignStats
}

export interface PromoCampaignListResponse {
  campaigns: PromoCampaign[]
  total: number
  page: number
  limit: number
}

export interface PromoCampaignSanityLimits {
  promoMaxDiscountPercent: number
  promoMaxFixedDiscountPesewas: number
  promoMaxDurationDays: number
  promoMaxCommissionReliefPercent: number
}

// ── Normalisers ───────────────────────────────────────────────────────────────
// Defensive: tolerate camelCase or snake_case transport, fail closed on the
// fields the UI's state machine depends on (id + status).

type JsonObject = Record<string, unknown>

function objectAt(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Unsafe promo campaign response: ${label} must be an object.`)
  }
  return value as JsonObject
}

function valueAt(object: JsonObject, camel: string, snake: string = camel): unknown {
  return object[camel] ?? object[snake]
}

function toSnake(camel: string): string {
  return camel.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}

function pick(object: JsonObject, camel: string): unknown {
  return valueAt(object, camel, toSnake(camel))
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function nullableInt(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value !== '' ? Number(value) : NaN
  return Number.isFinite(n) ? Math.trunc(n) : null
}

function stringIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}

function statusAt(value: unknown): PromoCampaignStatus {
  if (typeof value === 'string' && (PROMO_CAMPAIGN_STATUSES as string[]).includes(value)) {
    return value as PromoCampaignStatus
  }
  throw new Error('Unsafe promo campaign response: unknown campaign status.')
}

function campaignTypeAt(value: unknown): PromoCampaignType {
  if (value === 'percentage_discount' || value === 'fixed_discount' || value === 'commission_relief') {
    return value
  }
  throw new Error('Unsafe promo campaign response: unknown campaign type.')
}

function scopeAt(value: unknown): PromoCampaignScope {
  if (value === 'ride' || value === 'artisan_job' || value === 'both') return value
  throw new Error('Unsafe promo campaign response: unknown promo scope.')
}

// Absent audience means a pre-audience backend row: those are all client
// campaigns (the backend default). Unknown values still fail closed.
function audienceAt(value: unknown): PromoCampaignAudience {
  if (value == null) return 'client'
  if (value === 'client' || value === 'driver' || value === 'artisan') return value
  throw new Error('Unsafe promo campaign response: unknown campaign audience.')
}

// Provider audiences imply their scope server-side; tolerate the field being
// omitted on transport by deriving the same mapping the backend applies.
const IMPLIED_PROVIDER_SCOPE: Partial<Record<PromoCampaignAudience, PromoCampaignScope>> = {
  driver: 'ride',
  artisan: 'artisan_job',
}

export function normalisePromoCampaign(raw: unknown): PromoCampaign {
  const o = objectAt(raw, 'campaign')
  const id = pick(o, 'id')
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('Unsafe promo campaign response: id must be a non-empty string.')
  }
  const audience = audienceAt(pick(o, 'audience'))
  return {
    id,
    name: typeof pick(o, 'name') === 'string' ? (pick(o, 'name') as string) : '',
    description: nullableString(pick(o, 'description')),
    termsText: nullableString(pick(o, 'termsText')),
    campaignType: campaignTypeAt(pick(o, 'campaignType')),
    audience,
    discountValue: nullableInt(pick(o, 'discountValue')) ?? 0,
    maxDiscountPesewas: nullableInt(pick(o, 'maxDiscountPesewas')),
    minBookingPesewas: nullableInt(pick(o, 'minBookingPesewas')),
    promoScope: scopeAt(pick(o, 'promoScope') ?? IMPLIED_PROVIDER_SCOPE[audience]),
    rideCategoryIds: stringIds(pick(o, 'rideCategoryIds')),
    serviceCategoryIds: stringIds(pick(o, 'serviceCategoryIds')),
    newClientsOnly: Boolean(pick(o, 'newClientsOnly') ?? false),
    maxUsesPerUser: nullableInt(pick(o, 'maxUsesPerUser')),
    maxUsesPerUserPerDay: nullableInt(pick(o, 'maxUsesPerUserPerDay')),
    budgetCapPesewas: nullableInt(pick(o, 'budgetCapPesewas')),
    budgetSpentPesewas: nullableInt(pick(o, 'budgetSpentPesewas')) ?? 0,
    startsAt: typeof pick(o, 'startsAt') === 'string' ? (pick(o, 'startsAt') as string) : '',
    endsAt: typeof pick(o, 'endsAt') === 'string' ? (pick(o, 'endsAt') as string) : '',
    bannerUrl: nullableString(pick(o, 'bannerUrl')),
    bannerPriority: nullableInt(pick(o, 'bannerPriority')) ?? 0,
    status: statusAt(pick(o, 'status')),
    rejectionReason: nullableString(pick(o, 'rejectionReason')),
    createdBy: nullableString(pick(o, 'createdBy')),
    approvedBy: nullableString(pick(o, 'approvedBy')),
    approvedAt: nullableString(pick(o, 'approvedAt')),
    createdAt: typeof pick(o, 'createdAt') === 'string' ? (pick(o, 'createdAt') as string) : '',
  }
}

export function normalisePromoCampaignDetail(raw: unknown): PromoCampaignDetail {
  const o = objectAt(raw, 'campaign detail')
  const campaign = normalisePromoCampaign(o)
  const statsRaw = pick(o, 'stats')
  const s = statsRaw == null ? {} : objectAt(statsRaw, 'stats')
  return {
    ...campaign,
    stats: {
      reservedRedemptions: nullableInt(pick(s, 'reservedRedemptions')) ?? 0,
      settledRedemptions: nullableInt(pick(s, 'settledRedemptions')) ?? 0,
      uniqueClients: nullableInt(pick(s, 'uniqueClients')) ?? 0,
      budgetSpentPesewas: nullableInt(pick(s, 'budgetSpentPesewas')) ?? campaign.budgetSpentPesewas,
    },
  }
}

export function normalisePromoCampaignListResponse(
  raw: unknown,
  fallback?: { page?: number; limit?: number },
): PromoCampaignListResponse {
  const o = objectAt(raw, 'campaign list')
  const list = Array.isArray(pick(o, 'campaigns'))
    ? (pick(o, 'campaigns') as unknown[])
    : Array.isArray(pick(o, 'items'))
      ? (pick(o, 'items') as unknown[])
      : []
  const campaigns = list.map(normalisePromoCampaign)
  return {
    campaigns,
    total: nullableInt(pick(o, 'total')) ?? campaigns.length,
    page: nullableInt(pick(o, 'page')) ?? fallback?.page ?? 1,
    limit: nullableInt(pick(o, 'limit')) ?? fallback?.limit ?? 20,
  }
}

export function normalisePromoCampaignSanityLimits(raw: unknown): PromoCampaignSanityLimits {
  const o = objectAt(raw, 'sanity limits')
  const percent = nullableInt(pick(o, 'promoMaxDiscountPercent'))
  const fixed = nullableInt(pick(o, 'promoMaxFixedDiscountPesewas'))
  const days = nullableInt(pick(o, 'promoMaxDurationDays'))
  if (percent === null || fixed === null || days === null) {
    throw new Error('Unsafe promo campaign response: incomplete sanity limits.')
  }
  return {
    promoMaxDiscountPercent: percent,
    promoMaxFixedDiscountPesewas: fixed,
    promoMaxDurationDays: days,
    // Absent on pre-audience backends: fall back to the loosest legal bound
    // (relief is inherently 1-100%); the backend stays authoritative on writes.
    promoMaxCommissionReliefPercent: nullableInt(pick(o, 'promoMaxCommissionReliefPercent')) ?? 100,
  }
}

// ── Client-side validation mirrors ────────────────────────────────────────────
// Cheap pre-checks for the friendliest failure mode; the backend remains
// authoritative (PROMO_CAP_REQUIRED / PROMO_EXCEEDS_SANITY_LIMIT /
// PROMO_INVALID_WINDOW / PROMO_AUDIENCE_TYPE_MISMATCH map to the same rules).

export interface PromoCampaignDraftInput {
  name: string
  audience: PromoCampaignAudience
  campaignType: PromoCampaignType
  discountValue: number
  maxDiscountPesewas: number | null
  promoScope: PromoCampaignScope
  rideCategoryIds: string[]
  serviceCategoryIds: string[]
  startsAt: string // ISO
  endsAt: string // ISO
  budgetCapPesewas: number | null
}

export function validatePromoCampaignDraft(
  input: PromoCampaignDraftInput,
  limits: PromoCampaignSanityLimits | null,
): string | null {
  if (input.name.trim().length === 0) return 'Enter a campaign name.'
  // Mirrors the backend's PROMO_AUDIENCE_TYPE_MISMATCH pairing rule.
  if (isProviderAudience(input.audience) !== (input.campaignType === 'commission_relief')) {
    return 'Provider campaigns must use the commission-relief type (and client campaigns cannot).'
  }
  // Provider audiences restrict by their own vertical's categories only.
  if (input.audience === 'driver' && input.serviceCategoryIds.length > 0) {
    return 'Driver campaigns can only be restricted by ride tier — remove the service categories.'
  }
  if (input.audience === 'artisan' && input.rideCategoryIds.length > 0) {
    return 'Artisan campaigns can only be restricted by service category — remove the ride tiers.'
  }
  if (!Number.isFinite(input.discountValue) || input.discountValue <= 0) {
    return 'Discount value must be greater than zero.'
  }
  if (input.campaignType === 'commission_relief') {
    if (input.discountValue > 100) return 'Commission relief cannot exceed 100% of the platform commission.'
    if (limits && input.discountValue > limits.promoMaxCommissionReliefPercent) {
      return `Commission relief cannot exceed the platform sanity limit of ${limits.promoMaxCommissionReliefPercent}%.`
    }
    // The relief cap is optional (uncapped = full forgone commission).
    if (input.maxDiscountPesewas !== null && input.maxDiscountPesewas <= 0) {
      return 'The relief cap must be greater than zero when set.'
    }
  }
  if (input.campaignType === 'percentage_discount') {
    if (input.discountValue > 100) return 'Percentage discount cannot exceed 100.'
    if (limits && input.discountValue > limits.promoMaxDiscountPercent) {
      return `Percentage discount cannot exceed the platform sanity limit of ${limits.promoMaxDiscountPercent}%.`
    }
    if (input.maxDiscountPesewas === null || input.maxDiscountPesewas <= 0) {
      return 'A max-discount cap is required for percentage campaigns.'
    }
  }
  if (
    input.campaignType === 'fixed_discount' &&
    limits &&
    input.discountValue > limits.promoMaxFixedDiscountPesewas
  ) {
    return `Fixed discount cannot exceed the platform sanity limit of GHS ${(limits.promoMaxFixedDiscountPesewas / 100).toFixed(2)}.`
  }
  const starts = Date.parse(input.startsAt)
  const ends = Date.parse(input.endsAt)
  if (!Number.isFinite(starts) || !Number.isFinite(ends)) return 'Enter both a start and an end date.'
  if (ends <= starts) return 'The end date must be after the start date.'
  if (limits) {
    const days = (ends - starts) / 86_400_000
    if (days > limits.promoMaxDurationDays) {
      return `Campaigns cannot run longer than ${limits.promoMaxDurationDays} days.`
    }
  }
  if (input.budgetCapPesewas !== null && input.budgetCapPesewas <= 0) {
    return 'Budget cap must be greater than zero when set.'
  }
  return null
}

// Audience-dependent payload fields. Provider audiences must NOT send
// promoScope (the backend implies driver→ride, artisan→artisan_job) and may
// only restrict their own vertical's categories; client audiences keep the
// scope-driven behaviour. Empty category arrays are omitted (= no restriction).
export function audienceScopedPayloadFields(input: {
  audience: PromoCampaignAudience
  promoScope: PromoCampaignScope
  rideCategoryIds: string[]
  serviceCategoryIds: string[]
}): {
  audience: PromoCampaignAudience
  promoScope?: PromoCampaignScope
  rideCategoryIds?: string[]
  serviceCategoryIds?: string[]
} {
  const { audience, promoScope, rideCategoryIds, serviceCategoryIds } = input
  const sendRide = audience === 'driver'
    || (audience === 'client' && (promoScope === 'ride' || promoScope === 'both'))
  const sendService = audience === 'artisan'
    || (audience === 'client' && (promoScope === 'artisan_job' || promoScope === 'both'))
  return {
    audience,
    promoScope: audience === 'client' ? promoScope : undefined,
    rideCategoryIds: sendRide && rideCategoryIds.length > 0 ? rideCategoryIds : undefined,
    serviceCategoryIds: sendService && serviceCategoryIds.length > 0 ? serviceCategoryIds : undefined,
  }
}

// ── Banner upload guard ───────────────────────────────────────────────────────

export const PROMO_BANNER_MAX_BYTES = 5 * 1024 * 1024
export const PROMO_BANNER_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function validatePromoBannerFile(file: { type: string; size: number }): string | null {
  if (!PROMO_BANNER_ACCEPTED_TYPES.includes(file.type)) {
    return 'Banner must be a JPEG, PNG or WebP image.'
  }
  if (file.size > PROMO_BANNER_MAX_BYTES) {
    return 'Banner must be 5MB or smaller.'
  }
  return null
}

// GHS input string → integer pesewas (NaN when unparseable). Money crosses the
// API boundary in pesewas only; the UI collects GHS.
export function ghsInputToPesewas(ghs: string): number {
  const n = Number.parseFloat(ghs)
  return Number.isFinite(n) ? Math.round(n * 100) : NaN
}

export function pesewasToGhsInput(pesewas: number | null | undefined): string {
  if (pesewas == null || !Number.isFinite(pesewas)) return ''
  return (pesewas / 100).toFixed(2)
}
