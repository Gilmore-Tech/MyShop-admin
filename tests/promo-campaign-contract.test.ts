import assert from 'node:assert/strict'
import test from 'node:test'

import {
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
}

const VALID_DRAFT = {
  name: 'Weekend rides',
  campaignType: 'percentage_discount' as const,
  discountValue: 20,
  maxDiscountPesewas: 1000,
  promoScope: 'ride' as const,
  startsAt: '2026-08-10T00:00:00.000Z',
  endsAt: '2026-08-17T00:00:00.000Z',
  budgetCapPesewas: 100_000,
}

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
      budgetSpentPesewas: 125_000,
    },
  })
  assert.equal(detail.stats.settledRedemptions, 40)
  assert.equal(detail.stats.uniqueClients, 32)

  const bare = normalisePromoCampaignDetail(campaign)
  assert.equal(bare.stats.reservedRedemptions, 0)
  // Missing stats fall back to the campaign's own spent figure.
  assert.equal(bare.stats.budgetSpentPesewas, 125_000)
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

test('sanity limits normaliser requires all three limits', () => {
  const limits = normalisePromoCampaignSanityLimits({
    promoMaxDiscountPercent: 50,
    promoMaxFixedDiscountPesewas: 5000,
    promoMaxDurationDays: 90,
  })
  assert.deepEqual(limits, LIMITS)
  assert.throws(() => normalisePromoCampaignSanityLimits({ promoMaxDiscountPercent: 50 }))
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
