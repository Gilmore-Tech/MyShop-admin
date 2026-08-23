import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isHeartbeatStale,
  normaliseOnlineProviderCounts,
  normaliseOnlineProviderRow,
  normaliseOnlineProviders,
} from '../lib/online-providers-contract.ts'

test('counts read from a bare object or a `counts` envelope', () => {
  assert.deepEqual(normaliseOnlineProviderCounts({ driversOnline: 12, artisansOnline: 4, driversOnBooking: 5, artisansOnBooking: 1 }), {
    driversOnline: 12, artisansOnline: 4, driversOnBooking: 5, artisansOnBooking: 1,
  })
  assert.deepEqual(normaliseOnlineProviderCounts({ counts: { drivers_online: '3' } }), {
    driversOnline: 3, artisansOnline: 0, driversOnBooking: 0, artisansOnBooking: 0,
  })
})

test('rows need an id and a known role; a half-missing location is dropped as a pair', () => {
  const row = normaliseOnlineProviderRow({
    providerId: 'p1', role: 'driver', fullName: 'Kofi', lat: 6.69, lng: null,
    activeBookingId: 'ride-9', activeBookingStatus: 'in_progress', region_name: 'Ashanti',
  })
  assert.ok(row)
  assert.equal(row.lat, null)
  assert.equal(row.lng, null)
  assert.equal(row.activeBookingId, 'ride-9')
  assert.equal(row.regionName, 'Ashanti')

  const located = normaliseOnlineProviderRow({ provider_id: 'p2', role: 'artisan', latitude: 6.7, longitude: -1.6 })
  assert.equal(located?.lat, 6.7)
  assert.equal(located?.lng, -1.6)
  assert.equal(located?.fullName, 'Artisan')

  assert.equal(normaliseOnlineProviderRow({ providerId: 'p3', role: 'client' }), null)
  assert.equal(normaliseOnlineProviderRow({ role: 'driver' }), null)
  assert.equal(normaliseOnlineProviderRow({ providerId: 'p4', role: 'driver', lat: 95, lng: 0 })?.lat, null)
})

test('list envelope keeps counts, pagination and drops malformed rows', () => {
  const list = normaliseOnlineProviders({
    counts: { driversOnline: 2 },
    items: [{ providerId: 'a', role: 'driver' }, null, { providerId: 'b', role: 'artisan' }],
    total: 2, page: 1, limit: 50,
  })
  assert.equal(list.items.length, 2)
  assert.equal(list.counts.driversOnline, 2)
  assert.equal(list.total, 2)
  assert.deepEqual(normaliseOnlineProviders(undefined, { page: 3, limit: 10 }).page, 3)
})

test('a heartbeat older than five minutes (or missing) is stale', () => {
  const now = new Date('2026-08-22T12:10:00.000Z')
  assert.equal(isHeartbeatStale('2026-08-22T12:06:00.000Z', now), false)
  assert.equal(isHeartbeatStale('2026-08-22T12:04:59.000Z', now), true)
  assert.equal(isHeartbeatStale(null, now), true)
  assert.equal(isHeartbeatStale('not-a-date', now), true)
})
