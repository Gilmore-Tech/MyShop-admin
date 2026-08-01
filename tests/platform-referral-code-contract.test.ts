import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  normalisePlatformReferralCodeInput,
  normalisePlatformReferralCodeItem,
  normalisePlatformReferralCodeListResponse,
  PLATFORM_REFERRAL_CODE_PATTERN,
} from '../lib/platform-referral-code-contract.ts'

const item = {
  id: 'platform-code-1',
  code: 'MYSHOP-KMS123',
  campaignName: 'Kumasi launch flyers',
  isActive: true,
  createdAt: '2026-07-31T12:00:00.000Z',
  lastUsedAt: '2026-07-31T13:00:00.000Z',
  deactivatedAt: null,
  deactivationReason: null,
  counts: {
    total: 6,
    byRole: { client: 3, driver: 2, artisan: 1 },
  },
}

test('platform code format is exact and input normalisation is deterministic', () => {
  assert.equal(normalisePlatformReferralCodeInput(' myshop-ab12cd '), 'MYSHOP-AB12CD')
  assert.equal(PLATFORM_REFERRAL_CODE_PATTERN.test('MYSHOP-AB12CD'), true)
  assert.equal(PLATFORM_REFERRAL_CODE_PATTERN.test('MYSHOP-ABCDE'), false)
  assert.equal(PLATFORM_REFERRAL_CODE_PATTERN.test('OTHER-AB12CD'), false)
})

test('platform attribution response remains separate and preserves role aggregates', () => {
  const result = normalisePlatformReferralCodeListResponse({
    items: [item],
    pagination: { page: 1, limit: 20, total: 1 },
    aggregates: {
      total: 6,
      byRole: { client: 3, driver: 2, artisan: 1 },
      daily: [
        {
          date: '2026-07-31',
          total: 6,
          byRole: { client: 3, driver: 2, artisan: 1 },
        },
      ],
    },
    signupAttributionEnabled: false,
  })

  assert.equal(result.items[0].campaignName, 'Kumasi launch flyers')
  assert.deepEqual(result.aggregates.byRole, { client: 3, driver: 2, artisan: 1 })
  assert.equal(result.aggregates.daily[0].total, 6)
  assert.equal(result.signupAttributionEnabled, false)
})

test('platform code parser accepts the backend snake-case transport variant', () => {
  assert.deepEqual(
    normalisePlatformReferralCodeItem({
      id: 'platform-code-2',
      code: 'MYSHOP-ABC123',
      campaign_name: 'Physical event campaign',
      is_active: false,
      created_at: '2026-07-31T12:00:00.000Z',
      last_used_at: null,
      deactivated_at: '2026-07-31T14:00:00.000Z',
      deactivation_reason: 'Campaign ended',
      counts: {
        total: 0,
        by_role: { client: 0, driver: 0, artisan: 0 },
      },
    }).isActive,
    false,
  )
})

test('platform code parser fails closed on malformed codes or inconsistent aggregates', () => {
  assert.throws(
    () => normalisePlatformReferralCodeItem({ ...item, code: 'ROLE-OWNED' }),
    /invalid format/,
  )
  assert.throws(
    () => normalisePlatformReferralCodeItem({
      ...item,
      counts: { total: 7, byRole: { client: 3, driver: 2, artisan: 1 } },
    }),
    /totals do not reconcile/,
  )
  assert.throws(
    () => normalisePlatformReferralCodeItem({
      ...item,
      isActive: false,
      deactivatedAt: null,
      deactivationReason: null,
    }),
    /deactivation state is inconsistent/,
  )
})

test('admin platform promo UI is independent, aggregate-only and exact-Super-Admin controlled', () => {
  const page = readFileSync(new URL('../app/(dashboard)/referrals/page.tsx', import.meta.url), 'utf8')
  const panel = readFileSync(
    new URL('../app/(dashboard)/referrals/_components/platform-referral-codes-panel.tsx', import.meta.url),
    'utf8',
  )
  const api = readFileSync(new URL('../lib/api.ts', import.meta.url), 'utf8')
  const contract = readFileSync(
    new URL('../lib/platform-referral-code-contract.ts', import.meta.url),
    'utf8',
  )

  assert.match(page, /TabsTrigger value="platform-codes"/)
  assert.match(page, /PlatformReferralCodesPanel/)
  assert.match(panel, /const \{ isSuperAdmin \} = useRole\(\)/)
  assert.doesNotMatch(panel, /can\('manage_referrals'\)/)
  assert.doesNotMatch(panel, /ReferralListItem/)
  assert.doesNotMatch(panel, /phone|email|roleAccountId|referrer|referee/i)
  assert.match(panel, /no individual account receives points or money/i)
  assert.match(panel, /cannot be reactivated or deleted/i)
  assert.doesNotMatch(panel, /awardReferral|voidReferral|ReferralUserSheet/)
  assert.doesNotMatch(contract, /phone|email|roleAccountId|referrer|referee/i)
  assert.match(api, /\/admin\/platform-referral-codes/)
  assert.match(api, /campaignName: input\.campaignName\.trim\(\)/)
  assert.match(api, /\/deactivate/)
  assert.doesNotMatch(api, /(?:reactivate|delete)PlatformReferralCode/)
})
