export const RIDE_TOLL_APPLICATION_MODES = ['pickup', 'dropoff', 'either'] as const
export type RideTollApplicationMode = (typeof RIDE_TOLL_APPLICATION_MODES)[number]

export type GeoJsonPosition = [longitude: number, latitude: number]

export interface GeoJsonMultiPolygon {
  type: 'MultiPolygon'
  coordinates: GeoJsonPosition[][][]
}

export interface RideTollActor {
  id: string
  displayName: string
}

export interface RideTollZone {
  id: string
  stableKey: string
  label: string
  amountPesewas: number
  applicationMode: RideTollApplicationMode
  boundary: GeoJsonMultiPolygon
}

export interface RideTollZoneInput {
  stableKey: string
  label: string
  amountPesewas: number
  applicationMode: RideTollApplicationMode
  boundary: GeoJsonMultiPolygon
}

export interface RideTollPolicyRevision {
  revision: number
  enabled: boolean
  effectiveFrom: string
  reason: string
  actor: RideTollActor
  changedAt: string
  fingerprint: string
  zones: RideTollZone[]
}

export interface RideTollPolicyState {
  revision: number
  runtimeEnabled: boolean
  activePolicy: RideTollPolicyRevision
  effectivePolicy: RideTollPolicyRevision | null
  draft: RideTollPolicyRevision | null
}

export interface SaveRideTollPolicyDraftInput {
  expectedRevision: number
  enabled: boolean
  effectiveFrom: string
  reason: string
  zones: RideTollZoneInput[]
}

export interface RideTollPolicyPreview {
  revision: number
  draftRevision: number
  previewToken: string
  fingerprint: string
  generatedAt: string
  policy: RideTollPolicyRevision
}

export type RideTollPointClassification = 'inside' | 'boundary' | 'outside'

export interface RideTollPreviewZoneResult {
  stableKey: string
  label: string
  pickup: RideTollPointClassification
  dropoff: RideTollPointClassification
  applies: boolean
  amountPesewas: number
}

export interface RideTollSampleResult {
  zones: RideTollPreviewZoneResult[]
  ambiguous: boolean
  totalTollPesewas: number | null
}

type JsonObject = Record<string, unknown>

function unsafe(message: string): never {
  throw new Error(`Unsafe ride toll policy response: ${message}`)
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

function stringAt(value: unknown, label: string, maximum = 500): string {
  if (typeof value !== 'string') return unsafe(`${label} must be a string.`)
  const result = value.trim()
  if (result.length === 0 || result.length > maximum) {
    return unsafe(`${label} must contain 1–${maximum} characters.`)
  }
  return result
}

function booleanAt(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') return unsafe(`${label} must be a boolean.`)
  return value
}

function safeIntegerAt(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    return unsafe(`${label} must be a safe integer greater than or equal to ${minimum}.`)
  }
  return value
}

function finiteAt(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    return unsafe(`${label} must be between ${minimum} and ${maximum}.`)
  }
  return value
}

function timestampAt(value: unknown, label: string): string {
  const timestamp = stringAt(value, label, 100)
  if (!Number.isFinite(Date.parse(timestamp))) return unsafe(`${label} must be an ISO-8601 timestamp.`)
  return timestamp
}

function applicationModeAt(value: unknown, label: string): RideTollApplicationMode {
  if (value === 'pickup' || value === 'dropoff' || value === 'either') return value
  return unsafe(`${label} has an unsupported application mode.`)
}

function normalisePosition(raw: unknown, label: string): GeoJsonPosition {
  if (!Array.isArray(raw) || raw.length !== 2) {
    return unsafe(`${label} must be a [longitude, latitude] position.`)
  }
  return [
    finiteAt(raw[0], `${label}[0]`, -180, 180),
    finiteAt(raw[1], `${label}[1]`, -90, 90),
  ]
}

function positionEqual(a: GeoJsonPosition, b: GeoJsonPosition): boolean {
  return a[0] === b[0] && a[1] === b[1]
}

export function normaliseRideTollBoundary(raw: unknown, label = 'boundary'): GeoJsonMultiPolygon {
  const boundary = objectAt(raw, label)
  if (boundary.type !== 'MultiPolygon') return unsafe(`${label}.type must be MultiPolygon.`)
  if (!Array.isArray(boundary.coordinates) || boundary.coordinates.length === 0) {
    return unsafe(`${label}.coordinates must contain at least one polygon.`)
  }
  const coordinates = boundary.coordinates.map((polygonRaw, polygonIndex) => {
    const polygonLabel = `${label}.coordinates[${polygonIndex}]`
    if (!Array.isArray(polygonRaw) || polygonRaw.length === 0) {
      return unsafe(`${polygonLabel} must contain an exterior ring.`)
    }
    return polygonRaw.map((ringRaw, ringIndex) => {
      const ringLabel = `${polygonLabel}[${ringIndex}]`
      if (!Array.isArray(ringRaw) || ringRaw.length < 4) {
        return unsafe(`${ringLabel} must contain at least four positions.`)
      }
      const ring = ringRaw.map((position, positionIndex) =>
        normalisePosition(position, `${ringLabel}[${positionIndex}]`),
      )
      if (!positionEqual(ring[0], ring[ring.length - 1])) {
        return unsafe(`${ringLabel} must be closed (first and last positions equal).`)
      }
      return ring
    })
  })
  return { type: 'MultiPolygon', coordinates }
}

function normaliseActor(raw: unknown, label: string): RideTollActor {
  const actor = objectAt(raw, label)
  return {
    id: stringAt(actor.id, `${label}.id`, 200),
    displayName: stringAt(valueAt(actor, 'displayName', 'display_name'), `${label}.displayName`, 200),
  }
}

function normaliseZone(raw: unknown, label: string): RideTollZone {
  const zone = objectAt(raw, label)
  const stableKey = stringAt(valueAt(zone, 'stableKey', 'stable_key'), `${label}.stableKey`, 80)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(stableKey)) {
    return unsafe(`${label}.stableKey must be a lowercase kebab-case key.`)
  }
  return {
    id: stringAt(zone.id, `${label}.id`, 200),
    stableKey,
    label: stringAt(zone.label, `${label}.label`, 120),
    amountPesewas: safeIntegerAt(
      valueAt(zone, 'amountPesewas', 'amount_pesewas'),
      `${label}.amountPesewas`,
      1,
    ),
    applicationMode: applicationModeAt(
      valueAt(zone, 'applicationMode', 'application_mode'),
      `${label}.applicationMode`,
    ),
    boundary: normaliseRideTollBoundary(zone.boundary, `${label}.boundary`),
  }
}

function uniqueZones(zones: RideTollZone[], label: string): RideTollZone[] {
  const keys = new Set<string>()
  const ids = new Set<string>()
  for (const zone of zones) {
    if (keys.has(zone.stableKey)) return unsafe(`${label} contains duplicate stableKey ${zone.stableKey}.`)
    if (ids.has(zone.id)) return unsafe(`${label} contains duplicate id ${zone.id}.`)
    keys.add(zone.stableKey)
    ids.add(zone.id)
  }
  return zones
}

function normaliseRevision(raw: unknown, label: string): RideTollPolicyRevision {
  const revision = objectAt(raw, label)
  if (!Array.isArray(revision.zones)) return unsafe(`${label}.zones must be an array.`)
  return {
    revision: safeIntegerAt(revision.revision, `${label}.revision`, 1),
    enabled: booleanAt(revision.enabled, `${label}.enabled`),
    effectiveFrom: timestampAt(valueAt(revision, 'effectiveFrom', 'effective_from'), `${label}.effectiveFrom`),
    reason: stringAt(revision.reason, `${label}.reason`),
    actor: normaliseActor(revision.actor, `${label}.actor`),
    changedAt: timestampAt(valueAt(revision, 'changedAt', 'changed_at'), `${label}.changedAt`),
    fingerprint: stringAt(revision.fingerprint, `${label}.fingerprint`, 200),
    zones: uniqueZones(
      revision.zones.map((zone, index) => normaliseZone(zone, `${label}.zones[${index}]`)),
      `${label}.zones`,
    ),
  }
}

export function normaliseRideTollPolicyState(raw: unknown): RideTollPolicyState {
  const state = objectAt(raw, 'state')
  const draftRaw = state.draft
  const effectiveRaw = valueAt(state, 'effectivePolicy', 'effective_policy')
  return {
    revision: safeIntegerAt(state.revision, 'state.revision', 1),
    runtimeEnabled: booleanAt(
      valueAt(state, 'runtimeEnabled', 'runtime_enabled'),
      'state.runtimeEnabled',
    ),
    activePolicy: normaliseRevision(
      valueAt(state, 'activePolicy', 'active_policy'),
      'state.activePolicy',
    ),
    effectivePolicy: effectiveRaw == null
      ? null
      : normaliseRevision(effectiveRaw, 'state.effectivePolicy'),
    draft: draftRaw == null ? null : normaliseRevision(draftRaw, 'state.draft'),
  }
}

export function normaliseRideTollPolicyPreview(raw: unknown): RideTollPolicyPreview {
  const preview = objectAt(raw, 'preview')
  const policy = normaliseRevision(preview.policy, 'preview.policy')
  const result = {
    revision: safeIntegerAt(preview.revision, 'preview.revision', 1),
    draftRevision: safeIntegerAt(valueAt(preview, 'draftRevision', 'draft_revision'), 'preview.draftRevision', 1),
    previewToken: stringAt(valueAt(preview, 'previewToken', 'preview_token'), 'preview.previewToken', 500),
    fingerprint: stringAt(preview.fingerprint, 'preview.fingerprint', 200),
    generatedAt: timestampAt(valueAt(preview, 'generatedAt', 'generated_at'), 'preview.generatedAt'),
    policy,
  }
  if (result.fingerprint !== policy.fingerprint) {
    return unsafe('preview fingerprint does not match preview.policy.')
  }
  return result
}

function comparablePolicy(policy: RideTollPolicyRevision): string {
  return JSON.stringify({
    revision: policy.revision,
    enabled: policy.enabled,
    effectiveFrom: policy.effectiveFrom,
    reason: policy.reason,
    actor: policy.actor,
    changedAt: policy.changedAt,
    fingerprint: policy.fingerprint,
    zones: policy.zones,
  })
}

export function assertRideTollPreviewMatchesState(
  preview: RideTollPolicyPreview,
  state: RideTollPolicyState,
): void {
  if (!state.draft) return unsafe('preview cannot be published without a saved draft.')
  if (
    preview.revision !== state.revision ||
    preview.draftRevision !== state.draft.revision ||
    preview.fingerprint !== state.draft.fingerprint ||
    comparablePolicy(preview.policy) !== comparablePolicy(state.draft)
  ) {
    return unsafe('preview does not match the exact saved draft.')
  }
}

export function ghsTollInputToPesewas(input: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim())
  if (!match) return null
  const whole = Number(match[1])
  const fraction = Number((match[2] ?? '').padEnd(2, '0'))
  const value = whole * 100 + fraction
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

export function pesewasToGhsTollInput(pesewas: number): string {
  return (pesewas / 100).toFixed(2)
}

export function boundaryToText(boundary: GeoJsonMultiPolygon): string {
  return JSON.stringify(boundary, null, 2)
}

export function boundaryFromText(input: string): GeoJsonMultiPolygon | null {
  try {
    return normaliseRideTollBoundary(JSON.parse(input))
  } catch {
    return null
  }
}

function pointOnSegment(point: GeoJsonPosition, start: GeoJsonPosition, end: GeoJsonPosition): boolean {
  const cross = (point[1] - start[1]) * (end[0] - start[0]) -
    (point[0] - start[0]) * (end[1] - start[1])
  if (Math.abs(cross) > 1e-10) return false
  return point[0] >= Math.min(start[0], end[0]) - 1e-10 &&
    point[0] <= Math.max(start[0], end[0]) + 1e-10 &&
    point[1] >= Math.min(start[1], end[1]) - 1e-10 &&
    point[1] <= Math.max(start[1], end[1]) + 1e-10
}

function classifyInRing(point: GeoJsonPosition, ring: GeoJsonPosition[]): RideTollPointClassification {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const a = ring[previous]
    const b = ring[index]
    if (pointOnSegment(point, a, b)) return 'boundary'
    if (
      (a[1] > point[1]) !== (b[1] > point[1]) &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    ) inside = !inside
  }
  return inside ? 'inside' : 'outside'
}

export function classifyPointInBoundary(
  boundary: GeoJsonMultiPolygon,
  point: { latitude: number; longitude: number },
): RideTollPointClassification {
  const position: GeoJsonPosition = [point.longitude, point.latitude]
  for (const polygon of boundary.coordinates) {
    const outer = classifyInRing(position, polygon[0])
    if (outer === 'boundary') return 'boundary'
    if (outer === 'outside') continue
    let inHole = false
    for (const hole of polygon.slice(1)) {
      const holeResult = classifyInRing(position, hole)
      if (holeResult === 'boundary') return 'boundary'
      if (holeResult === 'inside') {
        inHole = true
        break
      }
    }
    if (!inHole) return 'inside'
  }
  return 'outside'
}

export function evaluateRideTollSample(
  policy: Pick<RideTollPolicyRevision, 'enabled' | 'zones'>,
  pickup: { latitude: number; longitude: number },
  dropoff: { latitude: number; longitude: number },
): RideTollSampleResult {
  const zones = policy.zones.map((zone) => {
    const pickupClass = classifyPointInBoundary(zone.boundary, pickup)
    const dropoffClass = classifyPointInBoundary(zone.boundary, dropoff)
    const pickupMatches = pickupClass !== 'outside'
    const dropoffMatches = dropoffClass !== 'outside'
    const applies = policy.enabled && (
      zone.applicationMode === 'pickup' ? pickupMatches
        : zone.applicationMode === 'dropoff' ? dropoffMatches
          : pickupMatches || dropoffMatches
    )
    return {
      stableKey: zone.stableKey,
      label: zone.label,
      pickup: pickupClass,
      dropoff: dropoffClass,
      applies,
      amountPesewas: zone.amountPesewas,
    }
  })
  return {
    zones,
    // More than one distinct matching zone is a policy ambiguity, never an
    // instruction to stack or silently choose a toll.
    ambiguous: zones.filter((zone) => zone.applies).length > 1,
    totalTollPesewas: zones.filter((zone) => zone.applies).length > 1
      ? null
      : zones.find((zone) => zone.applies)?.amountPesewas ?? 0,
  }
}

function orientation(a: GeoJsonPosition, b: GeoJsonPosition, c: GeoJsonPosition): number {
  return (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1])
}

function segmentsIntersect(a: GeoJsonPosition, b: GeoJsonPosition, c: GeoJsonPosition, d: GeoJsonPosition): boolean {
  const o1 = orientation(a, b, c)
  const o2 = orientation(a, b, d)
  const o3 = orientation(c, d, a)
  const o4 = orientation(c, d, b)
  if ((o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0)) return true
  return Math.abs(o1) <= 1e-10 && pointOnSegment(c, a, b) ||
    Math.abs(o2) <= 1e-10 && pointOnSegment(d, a, b) ||
    Math.abs(o3) <= 1e-10 && pointOnSegment(a, c, d) ||
    Math.abs(o4) <= 1e-10 && pointOnSegment(b, c, d)
}

function exteriorRings(boundary: GeoJsonMultiPolygon): GeoJsonPosition[][] {
  return boundary.coordinates.map((polygon) => polygon[0])
}

function allRings(boundary: GeoJsonMultiPolygon): GeoJsonPosition[][] {
  return boundary.coordinates.flatMap((polygon) => polygon)
}

function boundaryBounds(boundary: GeoJsonMultiPolygon) {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  for (const ring of allRings(boundary)) {
    for (const [lng, lat] of ring) {
      minLng = Math.min(minLng, lng)
      minLat = Math.min(minLat, lat)
      maxLng = Math.max(maxLng, lng)
      maxLat = Math.max(maxLat, lat)
    }
  }
  return { minLng, minLat, maxLng, maxLat }
}

export function boundariesOverlap(a: GeoJsonMultiPolygon, b: GeoJsonMultiPolygon): boolean {
  const aBounds = boundaryBounds(a)
  const bBounds = boundaryBounds(b)
  if (
    aBounds.maxLng < bBounds.minLng || bBounds.maxLng < aBounds.minLng ||
    aBounds.maxLat < bBounds.minLat || bBounds.maxLat < aBounds.minLat
  ) return false
  const aRings = exteriorRings(a)
  const bRings = exteriorRings(b)
  // PostGIS rejects both overlapping areas and touching boundaries. Include
  // interior rings here so a zone touching the edge of another zone's hole is
  // also caught before publish.
  for (const aRing of allRings(a)) {
    for (const bRing of allRings(b)) {
      for (let ai = 1; ai < aRing.length; ai += 1) {
        for (let bi = 1; bi < bRing.length; bi += 1) {
          if (segmentsIntersect(aRing[ai - 1], aRing[ai], bRing[bi - 1], bRing[bi])) return true
        }
      }
    }
  }
  return aRings.some((ring) => {
    const point = ring[0]
    return point && classifyPointInBoundary(b, { longitude: point[0], latitude: point[1] }) !== 'outside'
  }) || bRings.some((ring) => {
    const point = ring[0]
    return point && classifyPointInBoundary(a, { longitude: point[0], latitude: point[1] }) !== 'outside'
  })
}

export function overlappingRideTollZoneKeys(zones: RideTollZone[]): string[][] {
  const overlaps: string[][] = []
  for (let left = 0; left < zones.length; left += 1) {
    for (let right = left + 1; right < zones.length; right += 1) {
      if (boundariesOverlap(zones[left].boundary, zones[right].boundary)) {
        overlaps.push([zones[left].stableKey, zones[right].stableKey])
      }
    }
  }
  return overlaps
}
