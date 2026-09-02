import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  buildDriverPriorityDriverListQuery,
  buildDriverPriorityPolicyUpdatePayload,
  DEFAULT_DRIVER_PRIORITY_POLICY,
  normaliseDriverPriorityDriverList,
  normaliseDriverPriorityMetrics,
  normaliseDriverPriorityPolicy,
  validateDriverPriorityPolicy,
} from '../lib/driver-priority-contract.ts'

test('omits the false manual-only filter so older APIs return all drivers', () => {
  const defaults = new URLSearchParams(buildDriverPriorityDriverListQuery({ manualOnly: false }))
  assert.equal(defaults.get('page'), '1')
  assert.equal(defaults.get('limit'), '25')
  assert.equal(defaults.has('manualOnly'), false)

  const filtered = new URLSearchParams(buildDriverPriorityDriverListQuery({
    page: 2,
    limit: 10,
    search: '  Eric Debrah  ',
    tier: 'gold',
    manualOnly: true,
  }))
  assert.equal(filtered.get('page'), '2')
  assert.equal(filtered.get('limit'), '10')
  assert.equal(filtered.get('search'), 'Eric Debrah')
  assert.equal(filtered.get('tier'), 'gold')
  assert.equal(filtered.get('manualOnly'), 'true')
})

test('driver-list request failures render as errors instead of false empty results', () => {
  const source = readFileSync(
    new URL('../app/(dashboard)/driver-priority/page.tsx', import.meta.url),
    'utf8',
  )

  assert.match(source, /setListError\(userSafeAdminError\(caught, 'Could not load priority drivers\.'\)\)/)
  assert.match(source, /error=\{listError\}/)
  assert.match(source, /onRetry=\{\(\) => \{ void loadDrivers\(\) \}\}/)
})

test('builds the exact nested runtime payload required by the backend policy DTO', () => {
  const payload = buildDriverPriorityPolicyUpdatePayload({
    ...DEFAULT_DRIVER_PRIORITY_POLICY,
    expectedRevision: 4,
    shadowEnabled: true,
    enabled: false,
    rolloutPercent: 25,
    reason: '  Start the reviewed shadow rollout  ',
  })

  assert.deepEqual(payload, {
    ...DEFAULT_DRIVER_PRIORITY_POLICY,
    expectedRevision: 4,
    runtime: {
      shadowEnabled: true,
      enabled: false,
      rolloutPercent: 25,
    },
    reason: 'Start the reviewed shadow rollout',
  })
  assert.equal('shadowEnabled' in payload, false)
  assert.equal('enabled' in payload, false)
  assert.equal('rolloutPercent' in payload, false)
})

test('validates the backend priority-policy constraints before publish', () => {
  const valid = {
    ...DEFAULT_DRIVER_PRIORITY_POLICY,
    shadowEnabled: true,
    enabled: false,
    rolloutPercent: 0,
  }
  assert.equal(validateDriverPriorityPolicy(valid), null)
  assert.match(validateDriverPriorityPolicy({
    ...valid,
    thresholds: {
      ...valid.thresholds,
      silver: { ...valid.thresholds.silver, weeklyMinutes: valid.thresholds.bronze.weeklyMinutes },
    },
  }) ?? '', /strictly increase/)
  assert.match(validateDriverPriorityPolicy({
    ...valid,
    thresholds: {
      ...valid.thresholds,
      bronze: { ...valid.thresholds.bronze, minSevenHourDays: 0 },
    },
  }) ?? '', /between 1 and 7/)
  assert.match(validateDriverPriorityPolicy({
    ...valid,
    assumedPickupSpeedKmh: 4,
  }) ?? '', /between 5 and 80/)
  assert.match(validateDriverPriorityPolicy({
    ...valid,
    dailyCapMinutes: 59,
  }) ?? '', /between 1 and 12 hours/)
  assert.equal(validateDriverPriorityPolicy({
    ...valid,
    dailyCapMinutes: 60,
  }), null)
})

test('normalises the approved priority policy and safe runtime defaults', () => {
  const policy = normaliseDriverPriorityPolicy({
    revision: {
      id: 'policy-1',
      revision_number: 4,
      thresholds: {
        bronze: { weekly_minutes: 2100, min_seven_hour_days: 5 },
        silver: { weekly_minutes: 2520, min_seven_hour_days: 6 },
        gold: { weekly_minutes: 2940, min_seven_hour_days: 7 },
        platinum: { weekly_minutes: 3360, min_seven_hour_days: 7 },
        diamond: { weekly_minutes: 3780, min_seven_hour_days: 7 },
      },
      bonuses_meters: { bronze: 150, silver: 300, gold: 450, platinum: 600, diamond: 750 },
      daily_cap_minutes: 720,
      max_advantage_meters: 750,
      max_eta_advantage_seconds: 120,
      assumed_pickup_speed_kmh: 25,
      candidate_limit: 50,
    },
  })

  assert.equal(policy.revision.revisionNumber, 4)
  assert.deepEqual(policy.revision.policy.thresholds.bronze, {
    weeklyMinutes: 2100,
    minSevenHourDays: 5,
  })
  assert.equal(policy.revision.policy.bonusesMeters.diamond, 750)
  assert.deepEqual(policy.runtime, {
    shadowEnabled: true,
    enabled: false,
    rolloutPercent: 0,
  })
})

test('normalises priority driver pagination and manual floor evidence', () => {
  const response = normaliseDriverPriorityDriverList({
    items: [{
      driver_id: 'driver-1',
      full_name: 'Ama Driver',
      phone_number: '+233200000000',
      automatic_tier: 'silver',
      manual_floor_tier: 'gold',
      effective_tier: 'gold',
      weekly_minutes: 2600,
      qualifying_days: 6,
      review_at: '2026-09-29T00:00:00.000Z',
      last_evaluated_at: '2026-09-01T18:30:00.000Z',
    }],
    page: 2,
    limit: 25,
    total: 30,
  }, { page: 1, limit: 25 })

  assert.equal(response.items[0]?.driverId, 'driver-1')
  assert.equal(response.items[0]?.manualFloorTier, 'gold')
  assert.equal(response.items[0]?.effectiveTier, 'gold')
  assert.equal(response.items[0]?.evaluatedAt, '2026-09-01T18:30:00.000Z')
  assert.equal(response.totalPages, 2)
})

test('normalises dispatch metrics without treating missing evidence as success', () => {
  const metrics = normaliseDriverPriorityMetrics({
    dispatch: {
      total: 200,
      shadow_changed: 30,
      shadow_changed_percent: 15,
      enforced: 0,
      avg_distance_delta_meters: 184.5,
      max_distance_delta_meters: 748,
      invariant_violations: 0,
    },
    tiers: { none: 8, bronze: 2, silver: 1, gold: 1, platinum: 0, diamond: 0 },
    measurement: { last_bucket_at: '2026-09-01T18:30:00.000Z', eligible_drivers_last_bucket: 12 },
  })

  assert.equal(metrics.dispatch.shadowChanged, 30)
  assert.equal(metrics.dispatch.maxDistanceDeltaMeters, 748)
  assert.equal(metrics.dispatch.invariantViolations, 0)
  assert.equal(metrics.tiers.bronze, 2)
  assert.equal(metrics.measurement.eligibleDriversLastBucket, 12)
})
