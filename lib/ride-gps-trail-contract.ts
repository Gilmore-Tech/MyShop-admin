import { isRecord, nullableNumber, nullableString } from './contract-utils.ts'

/**
 * Recorded GPS route on `GET /admin/rides/:id`. The backend stores the trail
 * as a PostGIS LineString (no per-point timestamps) and only records while the
 * ride is `in_progress`, so the pickup leg is never part of it. The admin
 * accepts either an array of points or a GeoJSON LineString, and never
 * invents a timestamp.
 */
export interface RideGpsPoint {
  lat: number
  lng: number
  recordedAt: string | null
}

export interface RideGpsTrailMeta {
  pointCount: number
  distanceKm: number | null
  pickup: { lat: number; lng: number } | null
  dropoff: { lat: number; lng: number } | null
}

function validPair(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const la = nullableNumber(lat)
  const ln = nullableNumber(lng)
  if (la == null || ln == null || Math.abs(la) > 90 || Math.abs(ln) > 180) return null
  return { lat: la, lng: ln }
}

export function normaliseRideGpsPoint(raw: unknown): RideGpsPoint | null {
  if (Array.isArray(raw)) {
    // Bare GeoJSON position: [lng, lat]
    const pair = validPair(raw[1], raw[0])
    return pair ? { ...pair, recordedAt: null } : null
  }
  if (!isRecord(raw)) return null
  const coordinates = isRecord(raw.location) && Array.isArray(raw.location.coordinates)
    ? raw.location.coordinates
    : Array.isArray(raw.coordinates) ? raw.coordinates : null
  const pair = validPair(
    raw.lat ?? raw.latitude ?? (coordinates ? coordinates[1] : undefined),
    raw.lng ?? raw.longitude ?? (coordinates ? coordinates[0] : undefined),
  )
  if (!pair) return null
  return {
    ...pair,
    recordedAt: nullableString(raw.recordedAt ?? raw.recorded_at ?? raw.createdAt ?? raw.timestamp),
  }
}

/** Accepts `[{lat,lng}]`, `[[lng,lat]]`, or `{type:'LineString', coordinates:[[lng,lat]]}`. */
export function normaliseRideGpsTrail(raw: unknown): RideGpsPoint[] {
  const source = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.coordinates)
      ? raw.coordinates
      : []
  const points = source.map(normaliseRideGpsPoint).filter((p): p is RideGpsPoint => p !== null)
  // Collapse consecutive duplicates (the backend seeds the LineString with the
  // first fix twice so it is a valid two-point line).
  return points.filter((p, i) => i === 0 || p.lat !== points[i - 1].lat || p.lng !== points[i - 1].lng)
}

export function normaliseRideGpsTrailMeta(raw: unknown, trail: RideGpsPoint[]): RideGpsTrailMeta {
  const record = isRecord(raw) ? raw : {}
  const distance = nullableNumber(record.gpsTrailDistanceKm ?? record.gps_trail_distance_km)
  return {
    pointCount: Math.max(trail.length, nullableNumber(record.gpsTrailPointCount ?? record.gps_trail_point_count) ?? 0),
    distanceKm: distance != null && distance >= 0 ? distance : null,
    pickup: validPair(record.pickupLat ?? record.pickup_lat, record.pickupLng ?? record.pickup_lng),
    dropoff: validPair(record.dropoffLat ?? record.dropoff_lat, record.dropoffLng ?? record.dropoff_lng),
  }
}

export type RouteAvailability =
  | 'available'
  | 'not_started'
  | 'cancelled_before_start'
  | 'recording'
  | 'missing'

/**
 * Why there is (or is not) a drawable route, so the ride page can explain
 * instead of showing one generic "no route" line.
 */
export function rideRouteAvailability(params: {
  status: string
  startedAt: string | null
  pointCount: number
}): RouteAvailability {
  if (params.pointCount >= 2) return 'available'
  const pre = ['requested', 'accepted', 'driver_en_route', 'arrived_at_pickup']
  if (params.status === 'in_progress') return 'recording'
  if (pre.includes(params.status)) return 'not_started'
  if (params.status === 'cancelled' && !params.startedAt) return 'cancelled_before_start'
  return 'missing'
}
