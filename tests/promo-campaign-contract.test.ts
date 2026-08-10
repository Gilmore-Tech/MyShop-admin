import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canResumePromoCampaign,
  effectiveCampaignType,
  audienceScopedPayloadFields,
  ghsInputToPesewas,
  normalisePromoCampaign,
  normalisePromoCampaignDetail,
  normalisePromoCampaignListResponse,
  normalisePromoCampaignSanityLimits,
  pesewasToGhsInput,
  validatePromoBannerFile,
  validatePromoCampaignDraft,
  PROMO_BANNER_MAX_BYTES,
  type PromoCampaignSanityLimits,
} from '../lib/promo-campaign-contract.ts'

const campaign = {
  id: 'camp-1',
  name: 'Kumasi launch week',
  description: 'Launch discount',
  termsText: 'Applies to the pre-promo fare.',
  campaignType: 'percentage_discount',
  discountValue: 20,
  maxDiscountPesewas: 1500,
  minBookingPesewas: 500,
  promoScope: 'both',
  rideCategoryIds: ['ride-cat-1'],
  serviceCategoryIds: ['svc-cat-1', 'svc-cat-2'],
  newClientsOnly: true,
  maxUsesPerUser: 3,
  maxUsesPerUserPerDay: 1,
  budgetCapPesewas: 500_000,
  budgetSpentPesewas: 125_000,
  startsAt: '2026-08-10T00:00:00.000Z',
  endsAt: '2026-08-24T00:00:00.000Z',
  bannerUrl: 'https://cdn.example.com/banner.webp',
  bannerPriority: 5,
  status: 'approved',
  rejectionReason: null,
  createdBy: 'admin-maker',
  approvedBy: 'admin-checker',
  approvedAt: '2026-08-08T09:00:00.000Z',
  createdAt: '2026-08-07T12:00:00.000Z',
}

const LIMITS: PromoCampaignSanityLimits = {
  promoMaxDiscountPercent: 50,
  promoMaxFixedDiscountPesewas: 5000,
  promoMaxDurationDays: 90,
  promoMaxCommissionReliefPercent: 60,
}

const VALID_DRAFT = {
  name: 'Weekend rides',
  audience: 'client' as const,
  campaignType: 'percentage_discount' as const,
  discountValue: 20,
  maxDiscountPesewas: 1000,
  promoScope: 'ride' as const,
  rideCategoryIds: ['ride-cat-1'],
  serviceCategoryIds: [],
  startsAt: '2026-08-10T00:00:00.000Z',
  endsAt: '2026-08-17T00:00:00.000Z',
  budgetCapPesewas: 100_000,
}

// Provider-audience commission relief: discountValue is the percent of the
// platform commission forgiven, the cap (maxDiscountPesewas) is optional.
const VALID_RELIEF_DRAFT = {
  name: 'Driver relief week',
  audience: 'driver' as const,
  campaignType: 'commission_relief' as const,
  discountValue: 50,
  maxDiscountPesewas: null,
  promoScope: 'ride' as const,
  rideCategoryIds: ['ride-cat-1'],
  serviceCategoryIds: [],
  startsAt: '2026-08-10T00:00:00.000Z',
  endsAt: '2026-08-17T00:00:00.000Z',
  budgetCapPesewas: 100_000,
}

test('resume action is available for paused and reconciled budget-exhausted campaigns', () => {
  assert.equal(canResumePromoCampaign('paused'), true)
  assert.equal(canResumePromoCampaign('budget_exhausted'), true)
  assert.equal(canResumePromoCampaign('approved'), false)
  assert.equal(canResumePromoCampaign('ended'), false)
})

test('campaign normaliser preserves the full camelCase shape', () => {
  const result = normalisePromoCampaign(campaign)
  assert.equal(result.id, 'camp-1')
  assert.equal(result.campaignType, 'percentage_discount')
  assert.equal(result.maxDiscountPesewas, 1500)
  assert.deepEqual(result.serviceCategoryIds, ['svc-cat-1', 'svc-cat-2'])
  assert.equal(result.newClientsOnly, true)
  assert.equal(result.budgetSpentPesewas, 125_000)
  assert.equal(result.status, 'approved')
  assert.equal(result.approvedBy, 'admin-checker')
  // Pre-audience rows are client campaigns (the backend default).
  assert.equal(result.audience, 'client')
})

test('campaign normaliser reads provider audiences and derives the implied scope', () => {
  const driver = normalisePromoCampaign({
    ...campaign,
    audience: 'driver',
    campaignType: 'commission_relief',
    promoScope: undefined,
  })
  assert.equal(driver.audience, 'driver')
  assert.equal(driver.campaignType, 'commission_relief')
  assert.equal(driver.promoScope, 'ride')

  const artisan = normalisePromoCampaign({
    ...campaign,
    audience: 'artisan',
    campaignType: 'commission_relief',
    promoScope: undefined,
  })
  assert.equal(artisan.audience, 'artisan')
  assert.equal(artisan.promoScope, 'artisan_job')

  // An explicit transport scope still wins over the derived one.
  const explicit = normalisePromoCampaign({
    ...campaign, audience: 'driver', campaignType: 'commission_relief', promoScope: 'ride',
  })
  assert.equal(explicit.promoScope, 'ride')

  assert.throws(() => normalisePromoCampaign({ ...campaign, audience: 'merchant' }))
})

test('campaign normaliser accepts the snake_case transport variant', () => {
  const result = normalisePromoCampaign({
    id: 'camp-2',
    name: 'Fixed off',
    campaign_type: 'fixed_discount',
    discount_value: 300,
    promo_scope: 'artisan_job',
    service_category_ids: ['svc-1'],
    new_clients_only: false,
    budget_cap_pesewas: 20_000,
    budget_spent_pesewas: 0,
    starts_at: '2026-08-10T00:00:00.000Z',
    ends_at: '2026-08-12T00:00:00.000Z',
    banner_priority: 2,
    status: 'draft',
    rejection_reason: 'Cap too generous',
    created_by: 'admin-maker',
    created_at: '2026-08-07T12:00:00.000Z',
  })
  assert.equal(result.campaignType, 'fixed_discount')
  assert.equal(result.promoScope, 'artisan_job')
  assert.equal(result.budgetCapPesewas, 20_000)
  assert.equal(result.bannerPriority, 2)
  assert.equal(result.rejectionReason, 'Cap too generous')
  assert.deepEqual(result.rideCategoryIds, [])
})

test('campaign normaliser fails closed on unknown status, type or scope', () => {
  assert.throws(() => normalisePromoCampaign({ ...campaign, status: 'live' }))
  assert.throws(() => normalisePromoCampaign({ ...campaign, campaignType: 'bogo' }))
  assert.throws(() => normalisePromoCampaign({ ...campaign, promoScope: 'job' }))
  assert.throws(() => normalisePromoCampaign({ ...campaign, id: '' }))
})

test('detail normaliser attaches stats and defaults missing counters to zero', () => {
  const detail = normalisePromoCampaignDetail({
    ...campaign,
    stats: {
      reservedRedemptions: 4,
      settledRedemptions: 40,
      uniqueClients: 32,
      uniqueProviders: 0,
      uniqueBeneficiaries: 32,
      budgetReservedPesewas: 25_000,
      budgetSettledPesewas: 100_000,
      budgetCommittedPesewas: 125_000,
      budgetSpentPesewas: 125_000,
    },
  })
  assert.equal(detail.stats.settledRedemptions, 40)
  assert.equal(detail.stats.uniqueClients, 32)
  assert.equal(detail.stats.uniqueBeneficiaries, 32)
  assert.equal(detail.stats.budgetReservedPesewas, 25_000)
  assert.equal(detail.stats.budgetSettledPesewas, 100_000)
  assert.equal(detail.stats.budgetCommittedPesewas, 125_000)

  const bare = normalisePromoCampaignDetail(campaign)
  assert.equal(bare.stats.reservedRedemptions, 0)
  assert.equal(bare.stats.budgetReservedPesewas, null)
  assert.equal(bare.stats.budgetSettledPesewas, null)
  // Older APIs only expose the legacy committed-budget field.
  assert.equal(bare.stats.budgetCommittedPesewas, 125_000)
  assert.equal(bare.stats.budgetSpentPesewas, 125_000)
})

test('detail normaliser never mistakes the legacy client count for unique providers', () => {
  const oldProviderDetail = normalisePromoCampaignDetail({
    ...campaign,
    audience: 'driver',
    campaignType: 'commission_relief',
    promoScope: 'ride',
    stats: { uniqueClients: 1, budgetSpentPesewas: 900 },
  })
  assert.equal(oldProviderDetail.stats.uniqueProviders, null)
  assert.equal(oldProviderDetail.stats.uniqueBeneficiaries, null)

  const currentProviderDetail = normalisePromoCampaignDetail({
    ...campaign,
    audience: 'driver',
    campaignType: 'commission_relief',
    promoScope: 'ride',
    stats: {
      uniqueClients: 3,
      uniqueProviders: 3,
      uniqueBeneficiaries: 3,
      budget_reserved_pesewas: 200,
      budget_settled_pesewas: 700,
      budget_committed_pesewas: 900,
      budget_spent_pesewas: 900,
    },
  })
  assert.equal(currentProviderDetail.stats.uniqueProviders, 3)
  assert.equal(currentProviderDetail.stats.uniqueBeneficiaries, 3)
  assert.equal(currentProviderDetail.stats.budgetReservedPesewas, 200)
  assert.equal(currentProviderDetail.stats.budgetSettledPesewas, 700)
  assert.equal(currentProviderDetail.stats.budgetCommittedPesewas, 900)
})

test('list normaliser reads the campaigns envelope with pagination fallbacks', () => {
  const result = normalisePromoCampaignListResponse(
    { campaigns: [campaign], total: 1, page: 2, limit: 20 },
  )
  assert.equal(result.campaigns.length, 1)
  assert.equal(result.total, 1)
  assert.equal(result.page, 2)

  const fallback = normalisePromoCampaignListResponse(
    { campaigns: [campaign] },
    { page: 3, limit: 10 },
  )
  assert.equal(fallback.total, 1)
  assert.equal(fallback.page, 3)
  assert.equal(fallback.limit, 10)
})

test('sanity limits normaliser requires the three core limits', () => {
  const limits = normalisePromoCampaignSanityLimits({
    promoMaxDiscountPercent: 50,
    promoMaxFixedDiscountPesewas: 5000,
    promoMaxDurationDays: 90,
    promoMaxCommissionReliefPercent: 60,
  })
  assert.deepEqual(limits, LIMITS)
  assert.throws(() => normalisePromoCampaignSanityLimits({ promoMaxDiscountPercent: 50 }))
})

test('sanity limits normaliser defaults commission relief to the loosest bound on older backends', () => {
  const limits = normalisePromoCampaignSanityLimits({
    promoMaxDiscountPercent: 50,
    promoMaxFixedDiscountPesewas: 5000,
    promoMaxDurationDays: 90,
  })
  assert.equal(limits.promoMaxCommissionReliefPercent, 100)
})

test('draft validation requires a cap for percentage campaigns', () => {
  assert.equal(validatePromoCampaignDraft(VALID_DRAFT, LIMITS), null)
  assert.match(
    validatePromoCampaignDraft({ ...VALID_DRAFT, maxDiscountPesewas: null }, LIMITS) ?? '',
    /cap is required/i,
  )
})

test('draft validation mirrors the sanity limits', () => {
  assert.match(
    validatePromoCampaignDraft({ ...VALID_DRAFT, discountValue: 60 }, LIMITS) ?? '',
    /sanity limit of 50%/,
  )
  assert.match(
    validatePromoCampaignDraft(
      { ...VALID_DRAFT, campaignType: 'fixed_discount', discountValue: 6000 },
      LIMITS,
    ) ?? '',
    /sanity limit of GHS 50\.00/,
  )
  // Without loaded limits the client defers to the backend.
  assert.equal(validatePromoCampaignDraft({ ...VALID_DRAFT, discountValue: 60 }, null), null)
})

test('draft validation rejects inverted windows and over-long durations', () => {
  assert.match(
    validatePromoCampaignDraft(
      { ...VALID_DRAFT, endsAt: '2026-08-09T00:00:00.000Z' },
      LIMITS,
    ) ?? '',
    /end date must be after/i,
  )
  assert.match(
    validatePromoCampaignDraft(
      { ...VALID_DRAFT, endsAt: '2026-12-10T00:00:00.000Z' },
      LIMITS,
    ) ?? '',
    /longer than 90 days/,
  )
})

test('draft validation mirrors the audience/type pairing rule', () => {
  // PROMO_AUDIENCE_TYPE_MISMATCH: provider audiences require commission relief.
  assert.match(
    validatePromoCampaignDraft({ ...VALID_DRAFT, campaignType: 'commission_relief' }, LIMITS) ?? '',
    /commission-relief type/i,
  )
  assert.match(
    validatePromoCampaignDraft(
      { ...VALID_RELIEF_DRAFT, campaignType: 'percentage_discount', maxDiscountPesewas: 1000 },
      LIMITS,
    ) ?? '',
    /commission-relief type/i,
  )
  assert.equal(validatePromoCampaignDraft(VALID_RELIEF_DRAFT, LIMITS), null)
  assert.equal(
    validatePromoCampaignDraft({ ...VALID_RELIEF_DRAFT, audience: 'artisan', rideCategoryIds: [] }, LIMITS),
    null,
  )
})

test('draft validation bounds commission relief and keeps the cap optional', () => {
  assert.match(
    validatePromoCampaignDraft({ ...VALID_RELIEF_DRAFT, discountValue: 0 }, LIMITS) ?? '',
    /greater than zero/i,
  )
  assert.match(
    validatePromoCampaignDraft({ ...VALID_RELIEF_DRAFT, discountValue: 120 }, LIMITS) ?? '',
    /cannot exceed 100%/,
  )
  assert.match(
    validatePromoCampaignDraft({ ...VALID_RELIEF_DRAFT, discountValue: 70 }, LIMITS) ?? '',
    /sanity limit of 60%/,
  )
  // Without loaded limits the client defers to the backend for the relief cap.
  assert.equal(validatePromoCampaignDraft({ ...VALID_RELIEF_DRAFT, discountValue: 70 }, null), null)
  // The relief cap is optional but must be positive when set.
  assert.equal(validatePromoCampaignDraft({ ...VALID_RELIEF_DRAFT, maxDiscountPesewas: 2000 }, LIMITS), null)
  assert.match(
    validatePromoCampaignDraft({ ...VALID_RELIEF_DRAFT, maxDiscountPesewas: 0 }, LIMITS) ?? '',
    /relief cap must be greater than zero/i,
  )
})

test('draft validation keeps provider category restrictions in their own vertical', () => {
  assert.match(
    validatePromoCampaignDraft(
      { ...VALID_RELIEF_DRAFT, serviceCategoryIds: ['svc-cat-1'] },
      LIMITS,
    ) ?? '',
    /remove the service categories/i,
  )
  assert.match(
    validatePromoCampaignDraft(
      { ...VALID_RELIEF_DRAFT, audience: 'artisan', rideCategoryIds: ['ride-cat-1'] },
      LIMITS,
    ) ?? '',
    /remove the ride tiers/i,
  )
})

test('audience-scoped payload fields omit promoScope and cross-vertical categories for providers', () => {
  assert.deepEqual(
    audienceScopedPayloadFields({
      audience: 'client',
      promoScope: 'both',
      rideCategoryIds: ['ride-1'],
      serviceCategoryIds: ['svc-1'],
    }),
    {
      audience: 'client',
      promoScope: 'both',
      rideCategoryIds: ['ride-1'],
      serviceCategoryIds: ['svc-1'],
    },
  )
  // A ride-scoped client campaign never sends service categories.
  assert.deepEqual(
    audienceScopedPayloadFields({
      audience: 'client',
      promoScope: 'ride',
      rideCategoryIds: ['ride-1'],
      serviceCategoryIds: ['svc-1'],
    }),
    {
      audience: 'client',
      promoScope: 'ride',
      rideCategoryIds: ['ride-1'],
      serviceCategoryIds: undefined,
    },
  )
  assert.deepEqual(
    audienceScopedPayloadFields({
      audience: 'driver',
      promoScope: 'both',
      rideCategoryIds: ['ride-1'],
      serviceCategoryIds: ['svc-1'],
    }),
    {
      audience: 'driver',
      promoScope: undefined,
      rideCategoryIds: ['ride-1'],
      serviceCategoryIds: undefined,
    },
  )
  assert.deepEqual(
    audienceScopedPayloadFields({
      audience: 'artisan',
      promoScope: 'both',
      rideCategoryIds: ['ride-1'],
      serviceCategoryIds: ['svc-1'],
    }),
    {
      audience: 'artisan',
      promoScope: undefined,
      rideCategoryIds: undefined,
      serviceCategoryIds: ['svc-1'],
    },
  )
  // Empty selections are omitted entirely (= no restriction).
  assert.deepEqual(
    audienceScopedPayloadFields({
      audience: 'driver',
      promoScope: 'ride',
      rideCategoryIds: [],
      serviceCategoryIds: [],
    }),
    {
      audience: 'driver',
      promoScope: undefined,
      rideCategoryIds: undefined,
      serviceCategoryIds: undefined,
    },
  )
})

test('banner guard enforces type and the 5MB size cap', () => {
  assert.equal(validatePromoBannerFile({ type: 'image/webp', size: 1024 }), null)
  assert.match(validatePromoBannerFile({ type: 'image/gif', size: 1024 }) ?? '', /JPEG, PNG or WebP/)
  assert.match(
    validatePromoBannerFile({ type: 'image/png', size: PROMO_BANNER_MAX_BYTES + 1 }) ?? '',
    /5MB or smaller/,
  )
})

test('GHS input converts to integer pesewas at the API boundary', () => {
  assert.equal(ghsInputToPesewas('47.30'), 4730)
  assert.equal(ghsInputToPesewas('0.1'), 10)
  assert.ok(Number.isNaN(ghsInputToPesewas('abc')))
  assert.equal(pesewasToGhsInput(4730), '47.30')
  assert.equal(pesewasToGhsInput(null), '')
})

test('effectiveCampaignType makes the audience authoritative over stale UI state', () => {
  // The regression: Radix Select re-emitted percentage_discount after a
  // Client -> Drivers switch, producing PROMO_AUDIENCE_TYPE_MISMATCH.
  assert.equal(effectiveCampaignType('driver', 'percentage_discount'), 'commission_relief')
  assert.equal(effectiveCampaignType('artisan', 'fixed_discount'), 'commission_relief')
  assert.equal(effectiveCampaignType('client', 'commission_relief'), 'percentage_discount')
  assert.equal(effectiveCampaignType('client', 'fixed_discount'), 'fixed_discount')
  assert.equal(effectiveCampaignType('driver', 'commission_relief'), 'commission_relief')
})
