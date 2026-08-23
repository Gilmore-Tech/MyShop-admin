import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normaliseProviderLeaderboard,
  normaliseProviderLeaderboardRow,
  normaliseTopClients,
} from '../lib/leaderboard-contract.ts'

test('provider rankings are re-sorted descending so rank 1 is the strongest', () => {
  const report = normaliseProviderLeaderboard({
    from: '2026-08-01', to: '2026-08-22', vertical: 'drivers', page: 1, limit: 20,
    drivers: {
      total: 3,
      items: [
        { providerId: 'b', fullName: 'B', completedCount: 5, grossFaresPesewas: 100 },
        { providerId: 'a', fullName: 'A', completedCount: 9, grossFaresPesewas: 50 },
        { providerId: 'c', fullName: 'C', completedCount: 5, grossFaresPesewas: 200 },
      ],
    },
  }, { vertical: 'drivers' })
  assert.ok(report.drivers)
  assert.deepEqual(report.drivers.items.map(r => r.providerId), ['a', 'c', 'b'])
  assert.equal(report.drivers.total, 3)
  assert.equal(report.artisans, null)
  assert.equal(report.drivers.items[0].role, 'driver')
})

test('settled count never exceeds completed count and null ratings stay null', () => {
  const row = normaliseProviderLeaderboardRow({
    provider_id: 'x', completed_count: 4, settled_count: 9, avg_rating: null, rating_count: 0,
  }, 'artisan')
  assert.ok(row)
  assert.equal(row.settledCount, 4)
  assert.equal(row.avgRating, null)
  assert.equal(row.role, 'artisan')
  assert.equal(row.fullName, 'Artisan')
  assert.equal(normaliseProviderLeaderboardRow({ completedCount: 1 }, 'driver'), null)
})

test('top clients sort by completed bookings then spend and tolerate snake_case', () => {
  const report = normaliseTopClients({
    vertical: 'rides', limit: 50,
    items: [
      { client_id: 'c1', full_name: 'Ama', completed_count: 3, total_spend_pesewas: 900 },
      { client_id: 'c2', full_name: 'Yaw', completed_count: 3, total_spend_pesewas: 1500, promo_received_pesewas: 200, last_booking_at: '2026-08-22T10:00:00.000Z' },
      { client_id: 'c3', full_name: 'Efua', completed_count: 7 },
      { completed_count: 99 },
    ],
  }, { vertical: 'all' })
  assert.equal(report.vertical, 'rides')
  assert.deepEqual(report.items.map(c => c.clientId), ['c3', 'c2', 'c1'])
  assert.equal(report.items[1].promoReceivedPesewas, 200)
  assert.equal(report.items[1].lastBookingAt, '2026-08-22T10:00:00.000Z')
  assert.equal(report.items[2].lastBookingAt, null)
})

test('unknown verticals fall back to the requested one and empty payloads are safe', () => {
  const providers = normaliseProviderLeaderboard({ vertical: 'everyone' }, { vertical: 'all', page: 2, limit: 10 })
  assert.equal(providers.vertical, 'all')
  assert.equal(providers.page, 2)
  assert.equal(providers.drivers, null)
  const clients = normaliseTopClients(null, { vertical: 'artisans' })
  assert.equal(clients.vertical, 'artisans')
  assert.deepEqual(clients.items, [])
})
