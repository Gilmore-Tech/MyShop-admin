export const DISTANCE_SAFEGUARD_SURGE_MODE = 'excess_distance_only' as const
export const MAX_DISTANCE_SAFEGUARD_METRES = 1_000_000

export const REQUIRED_DISTANCE_SAFEGUARD_SCENARIOS = [
  'included_distance_boundary_1x',
  'included_distance_plus_one_meter_1x',
  'four_km_eight_min_1x',
  'five_point_three_km_eight_min_1x',
  'ten_km_eight_min_1x',
  'ten_km_three_min_1_2x',
] as const

export type DistanceSafeguardFloorMode = 'category_minimum' | 'custom'

export interface DistanceSafeguardActor {
  id: string
  displayName: string
}

export interface DistanceSafeguardCategoryFloor {
  rideCategoryId: string
  mode: DistanceSafeguardFloorMode
  customFloorPesewas: number | null
  resolvedFloorPesewas: number
}

export interface DistanceSafeguardPolicyRevision {
  revision: number
  enabled: boolean
  includedDistanceMeters: number
  surgeMode: typeof DISTANCE_SAFEGUARD_SURGE_MODE
  categoryFloors: DistanceSafeguardCategoryFloor[]
  actor: DistanceSafeguardActor
  changedAt: string
  reason: string
}

export interface DistanceSafeguardRideCategory {
  id: string
  slug: string
  name: string
  isActive: boolean
  minimumFarePesewas: number
  perKmPesewas: number
}

export interface DistanceSafeguardState {
  revision: number
  activePolicy: DistanceSafeguardPolicyRevision
  draft: DistanceSafeguardPolicyRevision | null
  categories: DistanceSafeguardRideCategory[]
}

export interface DistanceSafeguardFloorInput {
  rideCategoryId: string
  mode: DistanceSafeguardFloorMode
  customFloorPesewas: number | null
}

export interface SaveDistanceSafeguardDraftInput {
  expectedRevision: number
  includedDistanceMeters: number
  categoryFloors: DistanceSafeguardFloorInput[]
  reason: string
}

export interface DistanceSafeguardPreviewScenario {
  key: string
  label: string
  distanceMeters: number
  durationSeconds: number
  surgeMultiplier: number
  safeguardOffFarePesewas: number
  safeguardOnFarePesewas: number
  deltaPesewas: number
}

export interface DistanceSafeguardPreviewCategory {
  rideCategoryId: string
  slug: string
  name: string
  minimumFarePesewas: number
  perKmPesewas: number
  effectiveFloorPesewas: number
  scenarios: DistanceSafeguardPreviewScenario[]
}

export interface DistanceSafeguardPreview {
  revision: number
  draftRevision: number
  previewToken: string
  generatedAt: string
  includedDistanceMeters: number
  surgeMode: typeof DISTANCE_SAFEGUARD_SURGE_MODE
  categories: DistanceSafeguardPreviewCategory[]
}

type JsonObject = Record<string, unknown>

function unsafe(message: string): never {
  throw new Error(`Unsafe distance safeguard response: ${message}`)
}

function objectAt(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return unsafe(`${label} must be an object.`)
  }
  return value as JsonObject
}

function valueAt(object: JsonObject, camel: string, snake?: string): unknown {
  return object[camel] ?? (snake ? object[snake] : undefined)
}

function stringAt(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return unsafe(`${label} must be a non-empty string.`)
  }
  return value
}

function booleanAt(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') return unsafe(`${label} must be a boolean.`)
  return value
}

function safeIntegerAt(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    return unsafe(`${label} must be a safe integer greater than or equal to ${minimum}.`)
  }
  return value as number
}

function finiteNumberAt(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    return unsafe(`${label} must be a finite number greater than or equal to ${minimum}.`)
  }
  return value
}

function timestampAt(value: unknown, label: string): string {
  const timestamp = stringAt(value, label)
  if (!Number.isFinite(Date.parse(timestamp))) return unsafe(`${label} must be a timestamp.`)
  return timestamp
}

function floorModeAt(value: unknown, label: string): DistanceSafeguardFloorMode {
  if (value === 'category_minimum' || value === 'custom') return value
  return unsafe(`${label} has an unknown floor mode.`)
}

function normaliseActor(raw: unknown, label: string): DistanceSafeguardActor {
  const actor = objectAt(raw, label)
  return {
    id: stringAt(actor.id, `${label}.id`),
    displayName: stringAt(
      valueAt(actor, 'displayName', 'display_name'),
      `${label}.displayName`,
    ),
  }
}

function normaliseFloor(raw: unknown, label: string): DistanceSafeguardCategoryFloor {
  const floor = objectAt(raw, label)
  const mode = floorModeAt(floor.mode, `${label}.mode`)
  const customRaw = valueAt(floor, 'customFloorPesewas', 'custom_floor_pesewas')
  const customFloorPesewas = customRaw == null
    ? null
    : safeIntegerAt(customRaw, `${label}.customFloorPesewas`)
  if (mode === 'category_minimum' && customFloorPesewas !== null) {
    return unsafe(`${label}.customFloorPesewas must be null for category minimum mode.`)
  }
  if (mode === 'custom' && customFloorPesewas === null) {
    return unsafe(`${label}.customFloorPesewas is required for custom mode.`)
  }
  return {
    rideCategoryId: stringAt(
      valueAt(floor, 'rideCategoryId', 'ride_category_id'),
      `${label}.rideCategoryId`,
    ),
    mode,
    customFloorPesewas,
    resolvedFloorPesewas: safeIntegerAt(
      valueAt(floor, 'resolvedFloorPesewas', 'resolved_floor_pesewas'),
      `${label}.resolvedFloorPesewas`,
    ),
  }
}

function uniqueById<T>(items: T[], id: (item: T) => string, label: string): T[] {
  const ids = new Set<string>()
  for (const item of items) {
    const itemId = id(item)
    if (ids.has(itemId)) return unsafe(`${label} contains a duplicate id.`)
    ids.add(itemId)
  }
  return items
}

function normalisePolicyRevision(raw: unknown, label: string): DistanceSafeguardPolicyRevision {
  const policy = objectAt(raw, label)
  const floorsRaw = valueAt(policy, 'categoryFloors', 'category_floors')
  if (!Array.isArray(floorsRaw)) return unsafe(`${label}.categoryFloors must be an array.`)
  const surgeMode = valueAt(policy, 'surgeMode', 'surge_mode')
  if (surgeMode !== DISTANCE_SAFEGUARD_SURGE_MODE) {
    return unsafe(`${label}.surgeMode is unsupported.`)
  }
  const includedDistanceMeters = safeIntegerAt(
    valueAt(policy, 'includedDistanceMeters', 'included_distance_meters'),
    `${label}.includedDistanceMeters`,
    1,
  )
  if (includedDistanceMeters > MAX_DISTANCE_SAFEGUARD_METRES) {
    return unsafe(`${label}.includedDistanceMeters cannot exceed ${MAX_DISTANCE_SAFEGUARD_METRES}.`)
  }
  return {
    revision: safeIntegerAt(policy.revision, `${label}.revision`, 1),
    enabled: booleanAt(policy.enabled, `${label}.enabled`),
    includedDistanceMeters,
    surgeMode,
    categoryFloors: uniqueById(
      floorsRaw.map((floor, index) => normaliseFloor(floor, `${label}.categoryFloors[${index}]`)),
      (floor) => floor.rideCategoryId,
      `${label}.categoryFloors`,
    ),
    actor: normaliseActor(policy.actor, `${label}.actor`),
    changedAt: timestampAt(
      valueAt(policy, 'changedAt', 'changed_at'),
      `${label}.changedAt`,
    ),
    reason: stringAt(policy.reason, `${label}.reason`),
  }
}

function normaliseCategory(raw: unknown, label: string): DistanceSafeguardRideCategory {
  const category = objectAt(raw, label)
  return {
    id: stringAt(category.id, `${label}.id`),
    slug: stringAt(category.slug, `${label}.slug`),
    name: stringAt(category.name, `${label}.name`),
    isActive: booleanAt(valueAt(category, 'isActive', 'is_active'), `${label}.isActive`),
    minimumFarePesewas: safeIntegerAt(
      valueAt(category, 'minimumFarePesewas', 'minimum_fare_pesewas'),
      `${label}.minimumFarePesewas`,
    ),
    perKmPesewas: safeIntegerAt(
      valueAt(category, 'perKmPesewas', 'per_km_pesewas'),
      `${label}.perKmPesewas`,
    ),
  }
}

function assertFloorConservation(
  floor: DistanceSafeguardCategoryFloor,
  category: DistanceSafeguardRideCategory,
  label: string,
): void {
  const expected = floor.mode === 'category_minimum'
    ? category.minimumFarePesewas
    : Math.max(floor.customFloorPesewas as number, category.minimumFarePesewas)
  if (floor.resolvedFloorPesewas !== expected) {
    return unsafe(`${label} has an inconsistent resolved floor.`)
  }
}

function assertActivePolicyFloors(
  policy: DistanceSafeguardPolicyRevision,
  categories: DistanceSafeguardRideCategory[],
  label: string,
): void {
  const activeCategories = categories.filter((category) => category.isActive)
  const categoriesById = new Map(activeCategories.map((category) => [category.id, category]))
  if (policy.categoryFloors.length !== activeCategories.length) {
    return unsafe(`${label} must cover every active ride category exactly once.`)
  }
  for (const floor of policy.categoryFloors) {
    const category = categoriesById.get(floor.rideCategoryId)
    if (!category) return unsafe(`${label} references a non-active ride category.`)
    assertFloorConservation(floor, category, label)
  }
}

function assertStoredDraftFloors(
  policy: DistanceSafeguardPolicyRevision,
  categories: DistanceSafeguardRideCategory[],
  label: string,
): void {
  const categoriesById = new Map(categories.map((category) => [category.id, category]))
  for (const floor of policy.categoryFloors) {
    const category = categoriesById.get(floor.rideCategoryId)
    if (category?.isActive) {
      assertFloorConservation(floor, category, label)
      continue
    }
    // Stored draft membership is intentionally not synthesized. Obsolete rows
    // remain visible to the client as a repair signal until a new immutable
    // draft is saved with exactly the current active category IDs.
    const expected = floor.mode === 'category_minimum'
      ? 0
      : floor.customFloorPesewas as number
    if (floor.resolvedFloorPesewas !== expected) {
      return unsafe(`${label} has an inconsistent inactive-category floor.`)
    }
  }
}

export function normaliseDistanceSafeguardState(raw: unknown): DistanceSafeguardState {
  const state = objectAt(raw, 'state')
  const categoriesRaw = state.categories
  if (!Array.isArray(categoriesRaw)) return unsafe('state.categories must be an array.')
  const categories = uniqueById(
    categoriesRaw.map((category, index) => normaliseCategory(category, `state.categories[${index}]`)),
    (category) => category.id,
    'state.categories',
  )
  const activePolicy = normalisePolicyRevision(
    valueAt(state, 'activePolicy', 'active_policy'),
    'state.activePolicy',
  )
  const draftRaw = state.draft
  const draft = draftRaw == null ? null : normalisePolicyRevision(draftRaw, 'state.draft')
  if (draft && !draft.enabled) return unsafe('state.draft must describe an enabled policy.')
  assertActivePolicyFloors(activePolicy, categories, 'state.activePolicy.categoryFloors')
  if (draft) assertStoredDraftFloors(draft, categories, 'state.draft.categoryFloors')
  return {
    revision: safeIntegerAt(state.revision, 'state.revision', 1),
    activePolicy,
    draft,
    categories,
  }
}

function normaliseScenario(raw: unknown, label: string): DistanceSafeguardPreviewScenario {
  const scenario = objectAt(raw, label)
  const result: DistanceSafeguardPreviewScenario = {
    key: stringAt(scenario.key, `${label}.key`),
    label: stringAt(scenario.label, `${label}.label`),
    distanceMeters: safeIntegerAt(
      valueAt(scenario, 'distanceMeters', 'distance_meters'),
      `${label}.distanceMeters`,
    ),
    durationSeconds: safeIntegerAt(
      valueAt(scenario, 'durationSeconds', 'duration_seconds'),
      `${label}.durationSeconds`,
    ),
    surgeMultiplier: finiteNumberAt(
      valueAt(scenario, 'surgeMultiplier', 'surge_multiplier'),
      `${label}.surgeMultiplier`,
    ),
    safeguardOffFarePesewas: safeIntegerAt(
      valueAt(scenario, 'safeguardOffFarePesewas', 'safeguard_off_fare_pesewas'),
      `${label}.safeguardOffFarePesewas`,
    ),
    safeguardOnFarePesewas: safeIntegerAt(
      valueAt(scenario, 'safeguardOnFarePesewas', 'safeguard_on_fare_pesewas'),
      `${label}.safeguardOnFarePesewas`,
    ),
    deltaPesewas: safeIntegerAt(
      valueAt(scenario, 'deltaPesewas', 'delta_pesewas'),
      `${label}.deltaPesewas`,
    ),
  }
  if (result.surgeMultiplier <= 0) return unsafe(`${label}.surgeMultiplier must be positive.`)
  if (
    result.safeguardOnFarePesewas - result.safeguardOffFarePesewas !==
    result.deltaPesewas
  ) {
    return unsafe(`${label}.deltaPesewas does not reconcile.`)
  }
  return result
}

function normalisePreviewCategory(raw: unknown, label: string): DistanceSafeguardPreviewCategory {
  const category = objectAt(raw, label)
  const scenariosRaw = category.scenarios
  if (!Array.isArray(scenariosRaw)) return unsafe(`${label}.scenarios must be an array.`)
  const scenarios = scenariosRaw.map((scenario, index) =>
    normaliseScenario(scenario, `${label}.scenarios[${index}]`),
  )
  const keys = scenarios.map((scenario) => scenario.key)
  if (new Set(keys).size !== keys.length) {
    return unsafe(`${label}.scenarios contains a duplicate key.`)
  }
  for (const requiredKey of REQUIRED_DISTANCE_SAFEGUARD_SCENARIOS) {
    if (!keys.includes(requiredKey)) return unsafe(`${label} is missing scenario ${requiredKey}.`)
  }
  return {
    rideCategoryId: stringAt(
      valueAt(category, 'rideCategoryId', 'ride_category_id'),
      `${label}.rideCategoryId`,
    ),
    slug: stringAt(category.slug, `${label}.slug`),
    name: stringAt(category.name, `${label}.name`),
    minimumFarePesewas: safeIntegerAt(
      valueAt(category, 'minimumFarePesewas', 'minimum_fare_pesewas'),
      `${label}.minimumFarePesewas`,
    ),
    perKmPesewas: safeIntegerAt(
      valueAt(category, 'perKmPesewas', 'per_km_pesewas'),
      `${label}.perKmPesewas`,
    ),
    effectiveFloorPesewas: safeIntegerAt(
      valueAt(category, 'effectiveFloorPesewas', 'effective_floor_pesewas'),
      `${label}.effectiveFloorPesewas`,
    ),
    scenarios,
  }
}

export function normaliseDistanceSafeguardPreview(raw: unknown): DistanceSafeguardPreview {
  const preview = objectAt(raw, 'preview')
  const categoriesRaw = preview.categories
  if (!Array.isArray(categoriesRaw)) return unsafe('preview.categories must be an array.')
  const surgeMode = valueAt(preview, 'surgeMode', 'surge_mode')
  if (surgeMode !== DISTANCE_SAFEGUARD_SURGE_MODE) {
    return unsafe('preview.surgeMode is unsupported.')
  }
  const result: DistanceSafeguardPreview = {
    revision: safeIntegerAt(preview.revision, 'preview.revision', 1),
    draftRevision: safeIntegerAt(
      valueAt(preview, 'draftRevision', 'draft_revision'),
      'preview.draftRevision',
      1,
    ),
    previewToken: stringAt(
      valueAt(preview, 'previewToken', 'preview_token'),
      'preview.previewToken',
    ),
    generatedAt: timestampAt(
      valueAt(preview, 'generatedAt', 'generated_at'),
      'preview.generatedAt',
    ),
    includedDistanceMeters: safeIntegerAt(
      valueAt(preview, 'includedDistanceMeters', 'included_distance_meters'),
      'preview.includedDistanceMeters',
      1,
    ),
    surgeMode,
    categories: uniqueById(
      categoriesRaw.map((category, index) =>
        normalisePreviewCategory(category, `preview.categories[${index}]`),
      ),
      (category) => category.rideCategoryId,
      'preview.categories',
    ),
  }
  if (result.includedDistanceMeters > MAX_DISTANCE_SAFEGUARD_METRES) {
    return unsafe(`preview.includedDistanceMeters cannot exceed ${MAX_DISTANCE_SAFEGUARD_METRES}.`)
  }
  for (const category of result.categories) {
    const canonical = [
      ['included_distance_boundary_1x', result.includedDistanceMeters, 480, 1],
      ['included_distance_plus_one_meter_1x', result.includedDistanceMeters + 1, 480, 1],
      ['four_km_eight_min_1x', 4000, 480, 1],
      ['five_point_three_km_eight_min_1x', 5300, 480, 1],
      ['ten_km_eight_min_1x', 10000, 480, 1],
      ['ten_km_three_min_1_2x', 10000, 180, 1.2],
    ] as const
    for (const [index, [key, distanceMeters, durationSeconds, surgeMultiplier]] of canonical.entries()) {
      const scenario = category.scenarios[index]
      if (
        !scenario ||
        scenario.key !== key ||
        scenario.distanceMeters !== distanceMeters ||
        scenario.durationSeconds !== durationSeconds ||
        scenario.surgeMultiplier !== surgeMultiplier
      ) {
        return unsafe(`preview scenario ${key} is non-canonical or out of order.`)
      }
    }
  }
  return result
}

export function assertPreviewMatchesState(
  preview: DistanceSafeguardPreview,
  state: DistanceSafeguardState,
): void {
  if (!state.draft) return unsafe('preview cannot be used without a saved draft.')
  if (preview.revision !== state.revision || preview.draftRevision !== state.draft.revision) {
    return unsafe('preview revision does not match the saved draft.')
  }
  if (preview.includedDistanceMeters !== state.draft.includedDistanceMeters) {
    return unsafe('preview distance does not match the saved draft.')
  }
  const activeCategories = state.categories.filter((category) => category.isActive)
  const activeCategoryIds = activeCategories.map((category) => category.id).sort()
  const draftFloorIds = state.draft.categoryFloors.map((floor) => floor.rideCategoryId).sort()
  const previewCategoryIds = preview.categories.map((category) => category.rideCategoryId).sort()
  if (
    activeCategoryIds.length !== previewCategoryIds.length ||
    activeCategoryIds.some((id, index) => id !== previewCategoryIds[index]) ||
    activeCategoryIds.length !== draftFloorIds.length ||
    activeCategoryIds.some((id, index) => id !== draftFloorIds[index])
  ) {
    return unsafe('preview and saved-draft categories do not match the active ride categories.')
  }
  const categoriesById = new Map(activeCategories.map((category) => [category.id, category]))
  const floorsById = new Map(state.draft.categoryFloors.map((floor) => [floor.rideCategoryId, floor]))
  for (const previewCategory of preview.categories) {
    const category = categoriesById.get(previewCategory.rideCategoryId)
    const floor = floorsById.get(previewCategory.rideCategoryId)
    if (!category || !floor) return unsafe('preview category is not present in the saved draft.')
    if (
      previewCategory.slug !== category.slug ||
      previewCategory.name !== category.name ||
      previewCategory.minimumFarePesewas !== category.minimumFarePesewas ||
      previewCategory.perKmPesewas !== category.perKmPesewas ||
      previewCategory.effectiveFloorPesewas !== floor.resolvedFloorPesewas ||
      (floor.mode === 'custom' &&
        (floor.customFloorPesewas as number) < category.minimumFarePesewas)
    ) {
      return unsafe('preview category rates or floor do not match the saved state.')
    }
  }
}

export function isDistanceSafeguardDraftCurrent(state: DistanceSafeguardState): boolean {
  if (!state.draft) return false
  const activeCategories = state.categories.filter((category) => category.isActive)
  const floorsById = new Map(
    state.draft.categoryFloors.map((floor) => [floor.rideCategoryId, floor]),
  )
  if (floorsById.size !== activeCategories.length) return false
  return activeCategories.every((category) => {
    const floor = floorsById.get(category.id)
    if (!floor) return false
    if (floor.mode === 'category_minimum') return floor.customFloorPesewas === null
    return floor.customFloorPesewas !== null &&
      floor.customFloorPesewas >= category.minimumFarePesewas
  })
}

export function metresToKmInput(metres: number): string {
  return (metres / 1000).toFixed(3)
}

export function kmInputToMetres(input: string): number | null {
  const value = input.trim()
  const match = /^(\d+)(?:\.(\d{1,3}))?$/.exec(value)
  if (!match) return null
  const whole = Number(match[1])
  const fraction = Number((match[2] ?? '').padEnd(3, '0'))
  const metres = whole * 1000 + fraction
  return Number.isSafeInteger(metres) &&
    metres > 0 &&
    metres <= MAX_DISTANCE_SAFEGUARD_METRES
    ? metres
    : null
}

export function pesewasToGhsInput(pesewas: number): string {
  return (pesewas / 100).toFixed(2)
}

export function ghsInputToPesewas(input: string): number | null {
  const value = input.trim()
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value)
  if (!match) return null
  const whole = Number(match[1])
  const fraction = Number((match[2] ?? '').padEnd(2, '0'))
  const pesewas = whole * 100 + fraction
  return Number.isSafeInteger(pesewas) ? pesewas : null
}
