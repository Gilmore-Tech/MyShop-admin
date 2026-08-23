import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normaliseRideGpsPoint,
  normaliseRideGpsTrail,
  normaliseRideGpsTrailMeta,
  rideRouteAvailability,
} from '../lib/ride-gps-trail-contract.ts'

test('accepts point objects, GeoJSON positions and a LineString, in that order of coordinates', () => {
  assert.deepEqual(normaliseRideGpsPoint({ lat: 6.69, lng: -1.62, recordedAt: '2026-08-22T10:00:00.000Z' }), {
    lat: 6.69, lng: -1.62, recordedAt: '2026-08-22T10:00:00.000Z',
  })
  assert.deepEqual(normaliseRideGpsPoint([-1.62, 6.69]), { lat: 6.69, lng: -1.62, recordedAt: null })
  assert.deepEqual(normaliseRideGpsPoint({ location: { coordinates: [-1.62, 6.69] }, timestamp: 't' }), {
    lat: 6.69, lng: -1.62, recordedAt: 't',
  })

  const fromLineString = normaliseRideGpsTrail({ type: 'LineString', coordinates: [[-1.62, 6.69], [-1.63, 6.7]] })
  assert.deepEqual(fromLineString.map(p => [p.lat, p.lng]), [[6.69, -1.62], [6.7, -1.63]])
  assert.equal(fromLineString[0].recordedAt, null)
})

test('collapses the duplicated seed point and drops invalid coordinates', () => {
  const trail = normaliseRideGpsTrail([
    [-1.62, 6.69], [-1.62, 6.69], [-1.63, 6.7], [200, 6.7], { lat: 'x', lng: 1 }, [-1.64, 6.71],
  ])
  assert.deepEqual(trail.map(p => [p.lat, p.lng]), [[6.69, -1.62], [6.7, -1.63], [6.71, -1.64]])
  assert.deepEqual(normaliseRideGpsTrail(null), [])
  assert.deepEqual(normaliseRideGpsTrail('nope'), [])
})

test('trail meta prefers backend counts but never under-reports the parsed trail', () => {
  const trail = normaliseRideGpsTrail([[-1.62, 6.69], [-1.63, 6.7]])
  const meta = normaliseRideGpsTrailMeta({
    gpsTrailPointCount: 1, gpsTrailDistanceKm: 3.42, pickupLat: 6.69, pickupLng: -1.62, dropoff_lat: 6.7, dropoff_lng: -1.63,
  }, trail)
  assert.equal(meta.pointCount, 2)
  assert.equal(meta.distanceKm, 3.42)
  assert.deepEqual(meta.pickup, { lat: 6.69, lng: -1.62 })
  assert.deepEqual(meta.dropoff, { lat: 6.7, lng: -1.63 })

  const empty = normaliseRideGpsTrailMeta({ gpsTrailDistanceKm: -1 }, [])
  assert.equal(empty.pointCount, 0)
  assert.equal(empty.distanceKm, null)
  assert.equal(empty.pickup, null)
})

test('route availability explains why nothing is drawn', () => {
  assert.equal(rideRouteAvailability({ status: 'completed', startedAt: 'x', pointCount: 2 }), 'available')
  assert.equal(rideRouteAvailability({ status: 'in_progress', startedAt: 'x', pointCount: 1 }), 'recording')
  assert.equal(rideRouteAvailability({ status: 'driver_en_route', startedAt: null, pointCount: 0 }), 'not_started')
  assert.equal(rideRouteAvailability({ status: 'cancelled', startedAt: null, pointCount: 0 }), 'cancelled_before_start')
  assert.equal(rideRouteAvailability({ status: 'cancelled', startedAt: 'x', pointCount: 0 }), 'missing')
  assert.equal(rideRouteAvailability({ status: 'completed', startedAt: 'x', pointCount: 0 }), 'missing')
})
