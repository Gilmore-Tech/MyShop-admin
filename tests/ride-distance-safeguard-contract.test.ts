import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  assertPreviewMatchesState,
  ghsInputToPesewas,
  isDistanceSafeguardDraftCurrent,
  kmInputToMetres,
  MAX_DISTANCE_SAFEGUARD_METRES,
  metresToKmInput,
  normaliseDistanceSafeguardPreview,
  normaliseDistanceSafeguardState,
  pesewasToGhsInput,
  REQUIRED_DISTANCE_SAFEGUARD_SCENARIOS,
} from '../lib/ride-distance-safeguard-contract.ts'

const actor = { id: 'admin-root', displayName: 'Root Admin' }
const categories = [
  {
    id: 'regular-id',
    slug: 'regular',
    name: 'Regular',
    isActive: true,
    minimumFarePesewas: 2600,
    perKmPesewas: 180,
  },
]

const activePolicy = {
  revision: 3,
  enabled: false,
  includedDistanceMeters: 4000,
  surgeMode: 'excess_distance_only',
  categoryFloors: [
    {
      rideCategoryId: 'regular-id',
      mode: 'category_minimum',
      customFloorPesewas: null,
      resolvedFloorPesewas: 2600,
    },
  ],
  actor,
  changedAt: '2026-08-16T12:00:00.000Z',
  reason: 'Initial inactive barrier',
}

const draft = {
  ...activePolicy,
  revision: 4,
  enabled: true,
  categoryFloors: [
    {
      rideCategoryId: 'regular-id',
      mode: 'custom',
      customFloorPesewas: 2800,
      resolvedFloorPesewas: 2800,
    },
  ],
  reason: 'Staging fairness check',
}

const stateFixture = {
  revision: 8,
  activePolicy,
  draft,
  categories,
}

function scenario(
  key: string,
  distanceMeters: number,
  surgeMultiplier: number,
  off: number,
  on: number,
  durationSeconds = 480,
) {
  return {
    key,
    label: key.replaceAll('_', ' '),
    distanceMeters,
    durationSeconds,
    surgeMultiplier,
    safeguardOffFarePesewas: off,
    safeguardOnFarePesewas: on,
    deltaPesewas: on - off,
  }
}

function previewFixture() {
  return {
    revision: 8,
    draftRevision: 4,
    previewToken: 'opaque-server-preview-token',
    generatedAt: '2026-08-16T12:05:00.000Z',
    includedDistanceMeters: 4000,
    surgeMode: 'excess_distance_only',
    categories: [
      {
        rideCategoryId: 'regular-id',
        slug: 'regular',
        name: 'Regular',
        minimumFarePesewas: 2600,
        perKmPesewas: 180,
        effectiveFloorPesewas: 2800,
        scenarios: [
          scenario('included_distance_boundary_1x', 4000, 1, 2600, 2600),
          scenario('included_distance_plus_one_meter_1x', 4001, 1, 2600, 2800),
          scenario('four_km_eight_min_1x', 4000, 1, 2600, 2600),
          scenario('five_point_three_km_eight_min_1x', 5300, 1, 2600, 3100),
          scenario('ten_km_eight_min_1x', 10000, 1, 3100, 3900),
          scenario('ten_km_three_min_1_2x', 10000, 1.2, 3100, 4100, 180),
        ],
      },
    ],
  }
}

test('state parser preserves active and draft terms without exposing writer versions', () => {
  const state = normaliseDistanceSafeguardState(stateFixture)
  assert.equal(state.revision, 8)
  assert.equal(state.activePolicy.enabled, false)
  assert.equal(state.draft?.enabled, true)
  assert.equal(state.draft?.categoryFloors[0].customFloorPesewas, 2800)
  assert.equal(state.categories[0].perKmPesewas, 180)
  assert.equal(isDistanceSafeguardDraftCurrent(state), true)
})

test('state parser safely accepts the backend-authored system actor', () => {
  const state = normaliseDistanceSafeguardState({
    ...stateFixture,
    activePolicy: {
      ...activePolicy,
      actor: { id: 'system', displayName: 'System' },
    },
  })

  assert.deepEqual(state.activePolicy.actor, { id: 'system', displayName: 'System' })
})

test('state parser enforces exact active floor coverage and conservation', () => {
  const missingActiveFloor = {
    ...stateFixture,
    activePolicy: { ...activePolicy, categoryFloors: [] },
  }
  assert.throws(
    () => normaliseDistanceSafeguardState(missingActiveFloor),
    /cover every active ride category exactly once/,
  )

  const wrongCategoryMinimumResolution = {
    ...stateFixture,
    activePolicy: {
      ...activePolicy,
      categoryFloors: [{ ...activePolicy.categoryFloors[0], resolvedFloorPesewas: 2599 }],
    },
  }
  assert.throws(
    () => normaliseDistanceSafeguardState(wrongCategoryMinimumResolution),
    /inconsistent resolved floor/,
  )

  const customActive = normaliseDistanceSafeguardState({
    ...stateFixture,
    activePolicy: {
      ...activePolicy,
      categoryFloors: [{
        rideCategoryId: 'regular-id',
        mode: 'custom',
        customFloorPesewas: 2500,
        resolvedFloorPesewas: 2600,
      }],
    },
  })
  assert.equal(customActive.activePolicy.categoryFloors[0].resolvedFloorPesewas, 2600)

  assert.throws(() => normaliseDistanceSafeguardState({
    ...stateFixture,
    activePolicy: {
      ...activePolicy,
      categoryFloors: [{
        rideCategoryId: 'regular-id',
        mode: 'custom',
        customFloorPesewas: 2500,
        resolvedFloorPesewas: 2700,
      }],
    },
  }), /inconsistent resolved floor/)
})

test('stored draft membership remains visible and repairable after active tiers change', () => {
  const state = normaliseDistanceSafeguardState({
    ...stateFixture,
    draft: {
      ...draft,
      categoryFloors: [{
        rideCategoryId: 'retired-tier-id',
        mode: 'category_minimum',
        customFloorPesewas: null,
        resolvedFloorPesewas: 0,
      }],
    },
  })
  assert.equal(state.draft?.categoryFloors[0].rideCategoryId, 'retired-tier-id')
  assert.equal(isDistanceSafeguardDraftCurrent(state), false)

  const preview = normaliseDistanceSafeguardPreview(previewFixture())
  assert.throws(
    () => assertPreviewMatchesState(preview, state),
    /saved-draft categories do not match/,
  )
})

test('state parser displays a stale custom amount resolved up to a newer category minimum', () => {
  const state = normaliseDistanceSafeguardState({
    ...stateFixture,
    categories: [{ ...categories[0], minimumFarePesewas: 3000 }],
    activePolicy: {
      ...activePolicy,
      categoryFloors: [{ ...activePolicy.categoryFloors[0], resolvedFloorPesewas: 3000 }],
    },
    draft: {
      ...draft,
      categoryFloors: [{
        ...draft.categoryFloors[0],
        customFloorPesewas: 2800,
        resolvedFloorPesewas: 3000,
      }],
    },
  })

  assert.equal(state.draft?.categoryFloors[0].customFloorPesewas, 2800)
  assert.equal(state.draft?.categoryFloors[0].resolvedFloorPesewas, 3000)
  assert.equal(isDistanceSafeguardDraftCurrent(state), false)

  assert.throws(() => normaliseDistanceSafeguardState({
    ...stateFixture,
    categories: [{ ...categories[0], minimumFarePesewas: 3000 }],
    activePolicy: {
      ...activePolicy,
      categoryFloors: [{ ...activePolicy.categoryFloors[0], resolvedFloorPesewas: 3000 }],
    },
    draft: {
      ...draft,
      categoryFloors: [{
        ...draft.categoryFloors[0],
        customFloorPesewas: 2800,
        resolvedFloorPesewas: 2900,
      }],
    },
  }), /inconsistent resolved floor/)
})

test('preview parser requires the equal and plus-one-metre threshold proof', () => {
  const preview = normaliseDistanceSafeguardPreview(previewFixture())
  assert.equal(preview.categories[0].scenarios[0].distanceMeters, 4000)
  assert.equal(preview.categories[0].scenarios[1].distanceMeters, 4001)
  assert.deepEqual(
    REQUIRED_DISTANCE_SAFEGUARD_SCENARIOS.every((key) =>
      preview.categories[0].scenarios.some((row) => row.key === key),
    ),
    true,
  )
  assertPreviewMatchesState(preview, normaliseDistanceSafeguardState(stateFixture))
})

test('preview parser rejects missing, duplicate, reordered or malformed scenario proof', () => {
  const missing = previewFixture()
  missing.categories[0].scenarios = missing.categories[0].scenarios.filter(
    (row) => row.key !== 'included_distance_plus_one_meter_1x',
  )
  assert.throws(() => normaliseDistanceSafeguardPreview(missing), /missing scenario/)

  const duplicate = previewFixture()
  duplicate.categories[0].scenarios.push({ ...duplicate.categories[0].scenarios[0] })
  assert.throws(() => normaliseDistanceSafeguardPreview(duplicate), /duplicate key/)

  const reordered = previewFixture()
  const rows = reordered.categories[0].scenarios
  ;[rows[1], rows[2]] = [rows[2], rows[1]]
  assert.throws(() => normaliseDistanceSafeguardPreview(reordered), /out of order/)

  const zeroSurge = previewFixture()
  zeroSurge.categories[0].scenarios[0].surgeMultiplier = 0
  assert.throws(() => normaliseDistanceSafeguardPreview(zeroSurge), /must be positive/)

  const badDelta = previewFixture()
  badDelta.categories[0].scenarios[0].deltaPesewas = 1
  assert.throws(() => normaliseDistanceSafeguardPreview(badDelta), /does not reconcile/)
})

test('preview parser enforces canonical route, duration and surge for every required scenario', () => {
  const canonical = normaliseDistanceSafeguardPreview(previewFixture())
  assert.deepEqual(
    canonical.categories[0].scenarios.map((row) => [
      row.key,
      row.distanceMeters,
      row.durationSeconds,
      row.surgeMultiplier,
    ]),
    [
      ['included_distance_boundary_1x', 4000, 480, 1],
      ['included_distance_plus_one_meter_1x', 4001, 480, 1],
      ['four_km_eight_min_1x', 4000, 480, 1],
      ['five_point_three_km_eight_min_1x', 5300, 480, 1],
      ['ten_km_eight_min_1x', 10000, 480, 1],
      ['ten_km_three_min_1_2x', 10000, 180, 1.2],
    ],
  )

  for (let index = 0; index < REQUIRED_DISTANCE_SAFEGUARD_SCENARIOS.length; index += 1) {
    for (const field of ['distanceMeters', 'durationSeconds', 'surgeMultiplier'] as const) {
      const malformed = previewFixture()
      malformed.categories[0].scenarios[index][field] += 1
      assert.throws(
        () => normaliseDistanceSafeguardPreview(malformed),
        /non-canonical or out of order/,
        `${REQUIRED_DISTANCE_SAFEGUARD_SCENARIOS[index]} must reject a changed ${field}`,
      )
    }
  }
})

test('preview is rejected when its revision, draft or active categories are stale', () => {
  const state = normaliseDistanceSafeguardState(stateFixture)
  const wrongRevision = normaliseDistanceSafeguardPreview({ ...previewFixture(), revision: 9 })
  assert.throws(() => assertPreviewMatchesState(wrongRevision, state), /revision/)

  const noDraft = normaliseDistanceSafeguardState({ ...stateFixture, draft: null })
  assert.throws(
    () => assertPreviewMatchesState(normaliseDistanceSafeguardPreview(previewFixture()), noDraft),
    /without a saved draft/,
  )
})

test('preview category identity, rates and effective floor must match current saved state', () => {
  const state = normaliseDistanceSafeguardState(stateFixture)
  const mismatches: Array<[string, string | number]> = [
    ['slug', 'wrong-slug'],
    ['name', 'Wrong name'],
    ['minimumFarePesewas', 2601],
    ['perKmPesewas', 181],
    ['effectiveFloorPesewas', 2801],
  ]

  for (const [field, value] of mismatches) {
    const raw = previewFixture()
    Object.assign(raw.categories[0], { [field]: value })
    assert.throws(
      () => assertPreviewMatchesState(normaliseDistanceSafeguardPreview(raw), state),
      /rates or floor do not match/,
      `${field} mismatch must invalidate the preview token surface`,
    )
  }
})

test('distance and money inputs convert without floating-point wire values', () => {
  assert.equal(kmInputToMetres('4.000'), 4000)
  assert.equal(kmInputToMetres('5.3'), 5300)
  assert.equal(kmInputToMetres('4.0001'), null)
  assert.equal(kmInputToMetres('0'), null)
  assert.equal(kmInputToMetres('1000.000'), MAX_DISTANCE_SAFEGUARD_METRES)
  assert.equal(kmInputToMetres('1000.001'), null)
  assert.equal(metresToKmInput(4001), '4.001')

  assert.equal(ghsInputToPesewas('28.00'), 2800)
  assert.equal(ghsInputToPesewas('28.005'), null)
  assert.equal(pesewasToGhsInput(2801), '28.01')

  assert.throws(() => normaliseDistanceSafeguardState({
    ...stateFixture,
    activePolicy: {
      ...activePolicy,
      includedDistanceMeters: MAX_DISTANCE_SAFEGUARD_METRES + 1,
    },
  }), /cannot exceed/)
})

test('ride-tier UI is exact-root gated and follows the token-bound workflow', () => {
  const page = readFileSync(
    new URL('../app/(dashboard)/ride-categories/page.tsx', import.meta.url),
    'utf8',
  )
  const card = readFileSync(
    new URL(
      '../app/(dashboard)/ride-categories/_components/distance-fare-safeguard-card.tsx',
      import.meta.url,
    ),
    'utf8',
  )
  const api = readFileSync(new URL('../lib/api.ts', import.meta.url), 'utf8')

  assert.match(page, /<DistanceFareSafeguardCard \/>/)
  assert.doesNotMatch(page, /sampleFare|Math\.max\(base/)
  assert.match(card, /const \{ permissions, isSuperAdmin \} = useRole\(\)/)
  assert.match(card, /if \(permissions === null \|\| !isSuperAdmin\) return null/)
  assert.match(card, /Save Draft/)
  assert.match(card, /Preview Saved Draft/)
  assert.match(card, /previewToken/)
  assert.match(card, /new bookings only/i)
  assert.match(card, /At or below/)
  assert.match(card, /Immediately above/)
  assert.match(card, /customFloorPesewas < category\.minimumFarePesewas/)
  assert.match(card, /RIDE_FARE_POLICY_CATEGORY_FLOORS_INVALID/)
  assert.match(card, /saved draft no longer covers the current active tiers exactly/i)
  assert.match(card, /state\?\.draft !== null && !savedDraftCurrent/)
  assert.match(card, /existing\?\.mode \?\? 'category_minimum'/)
  assert.match(card, /max=\{MAX_DISTANCE_SAFEGUARD_METRES \/ 1000\}/)
  assert.match(card, /htmlFor=\{selectorId\}/)
  assert.match(card, /aria-label=\{`\$\{category\.name\} safeguard floor mode`\}/)
  assert.match(card, /role="status" aria-live="polite"/)
  assert.match(card, /role="alert" aria-live="assertive"/)
  assert.match(card, /category\.scenarios\.map/)
  assert.doesNotMatch(card, /ride_fare_policy_version|\bV[123]\b/)
  assert.doesNotMatch(card, /baseFarePesewas|perMinPesewas/)

  assert.match(api, /\/admin\/ride-fare-policy\/distance-safeguard/)
  assert.match(api, /expectedRevision: input\.expectedRevision/)
  assert.match(api, /previewToken: input\.previewToken/)
  assert.doesNotMatch(api, /draftRevision: input\.draftRevision/)
})
