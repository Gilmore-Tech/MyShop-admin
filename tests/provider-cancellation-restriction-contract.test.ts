import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  normaliseProviderCancellationRestriction,
  normaliseProviderRequestRestriction,
} from '../lib/provider-cancellation-restriction-contract.ts'

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
  assert.equal(driver.points, 3)
  assert.equal(driver.policyKind, 'accepted_cancellation')
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

test('normalises offer-response policy points and outcomes without breaking legacy counts', () => {
  const restriction = normaliseProviderRequestRestriction({
    request_restriction_id: 'response-restriction-1',
    provider_id: 'driver-3',
    provider_type: 'driver',
    policy_kind: 'offer_response',
    trigger_count: 4,
    trigger_offer_response_event: { outcome: 'no_response' },
    threshold: 6,
    blocked_until: '2026-08-30T12:15:00.000Z',
    shadow_only: true,
  }, Date.parse('2026-08-30T12:00:00.000Z'))

  assert.ok(restriction)
  assert.equal(restriction.policyKind, 'offer_response')
  assert.equal(restriction.triggerOutcome, 'no_response')
  assert.equal(restriction.triggerCount, 4)
  assert.equal(restriction.points, 4)
  assert.equal(restriction.threshold, 6)
  assert.equal(restriction.shadowOnly, true)
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

test('admin UI and API use provider-only request block and audited lift contracts', () => {
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
  assert.match(api, /item is ProviderRequestRestrictionListItem => item !== null/)
  assert.match(page, /Account suspensions/)
  assert.match(page, /Provider request blocks/)
  assert.match(page, /listProviderSuspensions/)
  assert.match(page, /liftProviderSuspension/)
  assert.match(page, /activeOnly: view === 'active'/)
  assert.match(page, /providerType: providerType === 'all'/)
  assert.match(page, /Latest outcome/)
  assert.match(page, /Count \/ threshold/)
  assert.match(page, /Deadline/)
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

  for (const key of [
    'providerOfferResponseEnabled',
    'providerOfferResponseShadowEnabled',
    'providerOfferResponseDeclinePoints',
    'providerOfferResponseNoResponsePoints',
    'providerOfferResponseWarnPoints',
    'providerOfferResponseThresholdPoints',
    'providerOfferResponseRollingWindowMins',
    'providerOfferResponseBlockMins',
    'jobOfferDeliveryWindowSecs',
    'jobOfferResponseWindowSecs',
  ]) {
    assert.match(config, new RegExp(key))
  }
  assert.match(config, /Job offer delivery and response windows cannot exceed the bid collection window/)
})
