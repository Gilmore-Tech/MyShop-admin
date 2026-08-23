import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  assertRideTollPreviewMatchesState,
  boundariesOverlap,
  boundaryFromText,
  boundaryToText,
  classifyPointInBoundary,
  evaluateRideTollSample,
  ghsTollInputToPesewas,
  normaliseRideTollPolicyPreview,
  normaliseRideTollPolicyState,
  overlappingRideTollZoneKeys,
  pesewasToGhsTollInput,
  type GeoJsonMultiPolygon,
} from '../lib/ride-toll-policy-contract.ts'

const boundary: GeoJsonMultiPolygon = {
  type: 'MultiPolygon',
  coordinates: [[[
    [-1.0, 6.0],
    [0.0, 6.0],
    [0.0, 7.0],
    [-1.0, 7.0],
    [-1.0, 6.0],
  ]]],
}

const actor = { id: 'admin-1', displayName: 'Policy Maker' }

function zone(overrides: Record<string, unknown> = {}) {
  return {
    id: 'zone-id-1',
    stableKey: 'kumasi-airport',
    label: 'Airport toll',
    amountPesewas: 500,
    applicationMode: 'either',
    boundary,
    ...overrides,
  }
}

function policy(overrides: Record<string, unknown> = {}) {
  return {
    revision: 4,
    enabled: true,
    effectiveFrom: '2026-08-23T00:00:00.000Z',
    reason: 'Reviewed airport access fee',
    actor,
    changedAt: '2026-08-22T15:00:00.000Z',
    fingerprint: 'sha256:reviewed-policy',
    zones: [zone()],
    ...overrides,
  }
}

function stateFixture() {
  return {
    revision: 9,
    runtimeEnabled: false,
    activePolicy: policy({ revision: 3, enabled: false, zones: [] }),
    effectivePolicy: policy({ revision: 3, enabled: false, zones: [] }),
    draft: policy(),
  }
}

test('normalises complete policy revisions and preserves exact integer pesewas', () => {
  const state = normaliseRideTollPolicyState(stateFixture())
  assert.equal(state.revision, 9)
  assert.equal(state.runtimeEnabled, false)
  assert.equal(state.activePolicy.zones.length, 0)
  assert.equal(state.effectivePolicy?.enabled, false)
  assert.equal(state.draft?.zones[0].amountPesewas, 500)
  assert.equal(state.draft?.zones[0].stableKey, 'kumasi-airport')
  assert.deepEqual(state.draft?.zones[0].boundary, boundary)
})

test('accepts the safe disabled/no-zone state', () => {
  const state = normaliseRideTollPolicyState({
    ...stateFixture(),
    draft: policy({ revision: 4, enabled: false, zones: [] }),
  })
  assert.equal(state.draft?.enabled, false)
  assert.deepEqual(state.draft?.zones, [])
})

test('fails closed on duplicate keys, invalid amounts and malformed polygons', () => {
  assert.throws(
    () => normaliseRideTollPolicyState({
      ...stateFixture(),
      draft: policy({ zones: [zone(), zone({ id: 'zone-id-2' })] }),
    }),
    /duplicate stableKey/,
  )
  assert.throws(
    () => normaliseRideTollPolicyState({
      ...stateFixture(),
      draft: policy({ zones: [zone({ amountPesewas: 1.25 })] }),
    }),
    /safe integer/,
  )
  assert.throws(
    () => normaliseRideTollPolicyState({
      ...stateFixture(),
      draft: policy({
        zones: [zone({ boundary: { type: 'Polygon', coordinates: boundary.coordinates[0] } })],
      }),
    }),
    /MultiPolygon/,
  )
  assert.throws(
    () => normaliseRideTollPolicyState({
      ...stateFixture(),
      draft: policy({
        zones: [zone({
          boundary: {
            type: 'MultiPolygon',
            coordinates: [[[[-1, 6], [0, 6], [0, 7], [-1, 7]]]],
          },
        })],
      }),
    }),
    /must be closed/,
  )
})

test('parses preview and binds it to the exact saved draft fingerprint and terms', () => {
  const state = normaliseRideTollPolicyState(stateFixture())
  const preview = normaliseRideTollPolicyPreview({
    revision: 9,
    draftRevision: 4,
    previewToken: 'opaque-one-use-preview-token',
    fingerprint: 'sha256:reviewed-policy',
    generatedAt: '2026-08-22T16:00:00.000Z',
    policy: policy(),
  })
  assert.doesNotThrow(() => assertRideTollPreviewMatchesState(preview, state))

  assert.throws(
    () => assertRideTollPreviewMatchesState({ ...preview, revision: 10 }, state),
    /does not match/,
  )
  assert.throws(
    () => assertRideTollPreviewMatchesState({
      ...preview,
      policy: { ...preview.policy, reason: 'Substituted review reason' },
    }, state),
    /does not match/,
  )
  assert.throws(
    () => normaliseRideTollPolicyPreview({
      ...preview,
      fingerprint: 'sha256:different',
    }),
    /fingerprint/,
  )
})

test('converts GHS input without floating-point fare arithmetic', () => {
  assert.equal(ghsTollInputToPesewas('5'), 500)
  assert.equal(ghsTollInputToPesewas('5.2'), 520)
  assert.equal(ghsTollInputToPesewas('5.25'), 525)
  assert.equal(ghsTollInputToPesewas('5.255'), null)
  assert.equal(ghsTollInputToPesewas('0'), null)
  assert.equal(pesewasToGhsTollInput(525), '5.25')
})

test('round trips valid MultiPolygon JSON and rejects lat/lng-order mistakes outside bounds', () => {
  assert.deepEqual(boundaryFromText(boundaryToText(boundary)), boundary)
  assert.equal(boundaryFromText('{broken'), null)
  assert.equal(boundaryFromText(JSON.stringify({
    type: 'MultiPolygon',
    coordinates: [[[[200, 6], [0, 6], [0, 7], [200, 6]]]],
  })), null)
})

test('classifies inside, boundary, outside and polygon holes explicitly', () => {
  assert.equal(classifyPointInBoundary(boundary, { longitude: -0.5, latitude: 6.5 }), 'inside')
  assert.equal(classifyPointInBoundary(boundary, { longitude: -1, latitude: 6.5 }), 'boundary')
  assert.equal(classifyPointInBoundary(boundary, { longitude: 1, latitude: 6.5 }), 'outside')

  const withHole: GeoJsonMultiPolygon = {
    type: 'MultiPolygon',
    coordinates: [[
      boundary.coordinates[0][0],
      [[-0.75, 6.25], [-0.25, 6.25], [-0.25, 6.75], [-0.75, 6.75], [-0.75, 6.25]],
    ]],
  }
  assert.equal(classifyPointInBoundary(withHole, { longitude: -0.5, latitude: 6.5 }), 'outside')
  assert.equal(classifyPointInBoundary(withHole, { longitude: -0.75, latitude: 6.5 }), 'boundary')
})

test('sample preview blocks ambiguous multi-zone matches instead of stacking or choosing', () => {
  const parsed = normaliseRideTollPolicyState({
    ...stateFixture(),
    draft: policy({
      zones: [
        zone({ applicationMode: 'pickup' }),
        zone({ id: 'zone-id-2', stableKey: 'dropoff-zone', label: 'Drop-off toll', applicationMode: 'dropoff', amountPesewas: 700 }),
        zone({ id: 'zone-id-3', stableKey: 'either-zone', label: 'Either toll', applicationMode: 'either', amountPesewas: 200 }),
      ],
    }),
  }).draft!
  const result = evaluateRideTollSample(
    parsed,
    { longitude: -0.5, latitude: 6.5 },
    { longitude: -0.5, latitude: 6.5 },
  )
  assert.deepEqual(result.zones.map((item) => item.applies), [true, true, true])
  assert.equal(result.ambiguous, true)
  assert.equal(result.totalTollPesewas, null)
})

test('detects overlaps and keeps separate polygons outside', () => {
  const overlapping: GeoJsonMultiPolygon = {
    type: 'MultiPolygon',
    coordinates: [[[[-0.5, 6.5], [0.5, 6.5], [0.5, 7.5], [-0.5, 7.5], [-0.5, 6.5]]]],
  }
  const outside: GeoJsonMultiPolygon = {
    type: 'MultiPolygon',
    coordinates: [[[[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]]]],
  }
  assert.equal(boundariesOverlap(boundary, overlapping), true)
  assert.equal(boundariesOverlap(boundary, outside), false)
  const touching: GeoJsonMultiPolygon = {
    type: 'MultiPolygon',
    coordinates: [[[[0, 6.2], [0.5, 6.2], [0.5, 6.8], [0, 6.8], [0, 6.2]]]],
  }
  assert.equal(boundariesOverlap(boundary, touching), true)
  const secondComponentContained: GeoJsonMultiPolygon = {
    type: 'MultiPolygon',
    coordinates: [
      [[[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]]],
      [[[-0.8, 6.2], [-0.6, 6.2], [-0.6, 6.4], [-0.8, 6.4], [-0.8, 6.2]]],
    ],
  }
  assert.equal(boundariesOverlap(boundary, secondComponentContained), true)

  const parsed = normaliseRideTollPolicyState({
    ...stateFixture(),
    draft: policy({
      zones: [
        zone(),
        zone({ id: 'zone-id-2', stableKey: 'overlap', boundary: overlapping }),
        zone({ id: 'zone-id-3', stableKey: 'outside', boundary: outside }),
      ],
    }),
  }).draft!
  assert.deepEqual(overlappingRideTollZoneKeys(parsed.zones), [['kumasi-airport', 'overlap']])
})

test('admin surface is exact-root gated and has no direct charging activation path', () => {
  const page = readFileSync(
    new URL('../app/(dashboard)/ride-toll-zones/page.tsx', import.meta.url),
    'utf8',
  )
  const map = readFileSync(
    new URL('../app/(dashboard)/ride-toll-zones/_components/toll-zone-map.tsx', import.meta.url),
    'utf8',
  )
  const api = readFileSync(new URL('../lib/api.ts', import.meta.url), 'utf8')
  const sidebar = readFileSync(new URL('../components/app-sidebar.tsx', import.meta.url), 'utf8')

  assert.match(page, /<SuperAdminPageGuard>/)
  assert.match(page, /isDraftMaker/)
  assert.match(page, /previewOverlaps\.length > 0/)
  assert.match(page, /Generate server preview/)
  assert.match(page, /RIDE_TOLLS_ENABLED/)
  assert.match(map, /overlay\.setPaths\(new google\.maps\.MVCArray\(paths\)\)/)
  assert.match(map, /overlay\.setPaths[\s\S]*overlay\.setMap\(map\)/)
  assert.match(map, /paths\.forEach\(\(path\)/)
  assert.doesNotMatch(map, /getPaths\(\)/)
  assert.match(map, /if \(listener && typeof listener\.remove === 'function'\)/)
  assert.match(map, /listener\?\.remove\?\.\(\)/)
  assert.doesNotMatch(map, /listeners\.push\(path\.addListener/)
  assert.match(sidebar, /href: '\/ride-toll-zones'.*superAdmin: true/)
  assert.match(api, /\/admin\/ride-toll-policy/)
  assert.match(api, /\/draft/)
  assert.match(api, /\/preview/)
  assert.match(api, /\/publish/)
  assert.doesNotMatch(api, /RIDE_TOLL_POLICY_PATH}\/(activate|enable|disable)/)
})
