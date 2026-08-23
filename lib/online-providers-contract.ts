import { isRecord, count, nullableNumber, nullableString, pick } from './contract-utils.ts'

/**
 * `GET /admin/providers/online` and `/admin/providers/online/counts`.
 * "Online" is the provider's own toggle (`online_status = 'online'`); the
 * backend's zombie sweeper flips stale sessions off, and `lastSeenAt` lets the
 * UI flag anyone whose heartbeat has gone quiet.
 */
export interface OnlineProviderCounts {
  driversOnline: number
  artisansOnline: number
  driversOnBooking: number
  artisansOnBooking: number
}

export interface OnlineProviderRow {
  providerId: string
  userId: string | null
  role: 'driver' | 'artisan'
  fullName: string
  phone: string | null
  onlineSince: string | null
  lastSeenAt: string | null
  lastLocationAt: string | null
  lat: number | null
  lng: number | null
  activeBookingId: string | null
  activeBookingStatus: string | null
  regionName: string | null
}

export interface OnlineProvidersResponse {
  counts: OnlineProviderCounts
  items: OnlineProviderRow[]
  total: number
  page: number
  limit: number
}

export const ZERO_ONLINE_COUNTS: OnlineProviderCounts = {
  driversOnline: 0, artisansOnline: 0, driversOnBooking: 0, artisansOnBooking: 0,
}

export function normaliseOnlineProviderCounts(raw: unknown): OnlineProviderCounts {
  const record = isRecord(raw) ? (isRecord(raw.counts) ? raw.counts : raw) : {}
  return {
    driversOnline: count(pick(record, 'driversOnline', 'drivers_online')),
    artisansOnline: count(pick(record, 'artisansOnline', 'artisans_online')),
    driversOnBooking: count(pick(record, 'driversOnBooking', 'drivers_on_booking')),
    artisansOnBooking: count(pick(record, 'artisansOnBooking', 'artisans_on_booking')),
  }
}

function coordinate(value: unknown, limit: number): number | null {
  const n = nullableNumber(value)
  return n != null && Math.abs(n) <= limit ? n : null
}

export function normaliseOnlineProviderRow(raw: unknown): OnlineProviderRow | null {
  if (!isRecord(raw)) return null
  const providerId = nullableString(pick(raw, 'providerId', 'provider_id', 'id'))
  if (!providerId) return null
  const role = raw.role === 'artisan' ? 'artisan' : raw.role === 'driver' ? 'driver' : null
  if (!role) return null
  const lat = coordinate(pick(raw, 'lat', 'latitude'), 90)
  const lng = coordinate(pick(raw, 'lng', 'longitude'), 180)
  return {
    providerId,
    userId: nullableString(pick(raw, 'userId', 'user_id')),
    role,
    fullName: nullableString(pick(raw, 'fullName', 'full_name', 'name')) ?? (role === 'driver' ? 'Driver' : 'Artisan'),
    phone: nullableString(raw.phone),
    onlineSince: nullableString(pick(raw, 'onlineSince', 'online_since')),
    lastSeenAt: nullableString(pick(raw, 'lastSeenAt', 'last_seen_at')),
    lastLocationAt: nullableString(pick(raw, 'lastLocationAt', 'last_location_at')),
    // Only a complete pair is a location.
    lat: lat != null && lng != null ? lat : null,
    lng: lat != null && lng != null ? lng : null,
    activeBookingId: nullableString(pick(raw, 'activeBookingId', 'active_booking_id')),
    activeBookingStatus: nullableString(pick(raw, 'activeBookingStatus', 'active_booking_status')),
    regionName: nullableString(pick(raw, 'regionName', 'region_name')),
  }
}

export function normaliseOnlineProviders(raw: unknown, requested: { page?: number; limit?: number } = {}): OnlineProvidersResponse {
  const record = isRecord(raw) ? raw : {}
  const items = (Array.isArray(record.items) ? record.items : [])
    .map(normaliseOnlineProviderRow)
    .filter((r): r is OnlineProviderRow => r !== null)
  return {
    counts: normaliseOnlineProviderCounts(record.counts),
    items,
    total: count(record.total, items.length),
    page: Math.max(1, count(record.page, requested.page ?? 1)),
    limit: count(record.limit, requested.limit ?? items.length),
  }
}

/** Heartbeats older than this are shown as "stale" (backend TTL is 5 min). */
export const STALE_HEARTBEAT_MS = 5 * 60 * 1000

export function isHeartbeatStale(lastSeenAt: string | null, now: Date = new Date()): boolean {
  if (!lastSeenAt) return true
  const t = new Date(lastSeenAt).getTime()
  if (Number.isNaN(t)) return true
  return now.getTime() - t > STALE_HEARTBEAT_MS
}
