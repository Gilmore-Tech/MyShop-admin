import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { normaliseProviderCancellationRestriction } from '../lib/provider-cancellation-restriction-contract.ts'

test('normalises enforced and shadow provider blocks with provider identity', () => {
  const now = Date.parse('2026-08-30T12:00:00.000Z')
  const driver = normaliseProviderCancellationRestriction({
    restriction_id: 'restriction-1',
    provider_id: 'driver-1',
    provider_type: 'driver',
    provider: { user: { full_name: 'Kojo Mensah', phone: '+233200000000' } },
    blocked_until: '2026-08-30T12:15:00.000Z',
    trigger_count: 3,
    threshold: 3,
    shadow_only: false,
    created_at: '2026-08-30T12:00:00.000Z',
  }, now)
  assert.ok(driver)
  assert.equal(driver.status, 'active')
  assert.equal(driver.providerType, 'driver')
  assert.equal(driver.fullName, 'Kojo Mensah')
  assert.equal(driver.triggerCount, 3)
  assert.equal(driver.shadowOnly, false)

  const artisan = normaliseProviderCancellationRestriction({
    id: 'restriction-2',
    artisanId: 'artisan-1',
    providerType: 'artisan',
    fullName: 'Ama Boateng',
    endsAt: '2026-08-30T12:20:00.000Z',
    triggerCount: 4,
    shadowOnly: true,
  }, now)
  assert.ok(artisan)
  assert.equal(artisan.status, 'active')
  assert.equal(artisan.providerType, 'artisan')
  assert.equal(artisan.providerId, 'artisan-1')
  assert.equal(artisan.shadowOnly, true)
})

test('normalises expiry and audited lift fields deterministically', () => {
  const now = Date.parse('2026-08-30T12:00:00.000Z')
  const expired = normaliseProviderCancellationRestriction({
    id: 'restriction-3',
    providerId: 'driver-2',
    providerType: 'driver',
    blockedUntil: '2026-08-30T11:59:59.000Z',
  }, now)
  assert.ok(expired)
  assert.equal(expired.status, 'expired')

  const lifted = normaliseProviderCancellationRestriction({
    id: 'restriction-4',
    providerId: 'artisan-2',
    providerType: 'artisan',
    status: 'lifted',
    endsAt: '2026-08-30T12:15:00.000Z',
    liftedAt: '2026-08-30T12:02:00.000Z',
    liftedBy: { fullName: 'Operations Admin' },
    liftedReason: 'Verified that the cancellation was caused by an emergency.',
  }, now)
  assert.ok(lifted)
  assert.equal(lifted.status, 'lifted')
  assert.equal(lifted.liftedBy, 'Operations Admin')
  assert.equal(lifted.liftReason, 'Verified that the cancellation was caused by an emergency.')
})

test('drops malformed provider restriction identities instead of guessing a route', () => {
  const validBase = {
    id: 'restriction-1',
    providerId: 'provider-1',
    providerType: 'driver',
    blockedUntil: '2026-08-30T12:15:00.000Z',
  }

  assert.equal(normaliseProviderCancellationRestriction({
    ...validBase,
    providerType: 'client',
  }), null)
  assert.equal(normaliseProviderCancellationRestriction({
    ...validBase,
    providerType: '',
  }), null)
  assert.equal(normaliseProviderCancellationRestriction({
    ...validBase,
    id: '',
  }), null)
  assert.equal(normaliseProviderCancellationRestriction({
    ...validBase,
    providerId: '',
  }), null)
})

test('admin UI and API use provider-only list and audited lift contracts', () => {
  const api = readFileSync(new URL('../lib/api.ts', import.meta.url), 'utf8')
  const page = readFileSync(
    new URL('../app/(dashboard)/suspensions/page.tsx', import.meta.url),
    'utf8',
  )
  const config = readFileSync(
    new URL('../app/(dashboard)/configuration/page.tsx', import.meta.url),
    'utf8',
  )

  assert.match(api, /\/admin\/providers\/cancellation-restrictions/)
  assert.match(api, /\/admin\/providers\/\$\{providerType\}\/\$\{providerId\}\/cancellation-restrictions\/\$\{restrictionId\}\/lift/)
  assert.match(api, /\{ reason: trimmedReason \}/)
  assert.match(api, /item is ProviderCancellationRestrictionListItem => item !== null/)
  assert.match(page, /Account suspensions/)
  assert.match(page, /Cancellation blocks/)
  assert.match(page, /listProviderSuspensions/)
  assert.match(page, /liftProviderSuspension/)
  assert.match(page, /activeOnly: view === 'active'/)
  assert.match(page, /providerType: providerType === 'all'/)
  assert.match(page, /Trigger count/)
  assert.match(page, /Blocked until/)
  assert.match(page, /Shadow only/)
  assert.match(page, /Lift audit/)
  assert.match(page, /can\('suspend_user'\)/)
  assert.match(page, /requireReason/)

  for (const key of [
    'providerCancellationBlockWarnCount',
    'providerCancellationBlockThreshold',
    'providerCancellationBlockRollingWindowMins',
    'providerCancellationBlockMins',
    'providerCancellationBlockShadowEnabled',
    'providerCancellationBlockEnabled',
  ]) {
    assert.match(config, new RegExp(key))
  }
})
