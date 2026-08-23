import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normaliseBookingOutcomesReport,
  normaliseOutcomeCounters,
  sumOutcomePeriods,
} from '../lib/booking-outcomes-contract.ts'

const period = (date: string, rides: number[], artisans: number[]) => {
  const [rr, rc, rx, ru, ra] = rides
  const [ar, ac, ax, au, aa] = artisans
  return {
    period: date,
    requested: rr + ar, completed: rc + ac, cancelled: rx + ax, unassigned: ru + au, active: ra + aa,
    byVertical: {
      rides: { requested: rr, completed: rc, cancelled: rx, unassigned: ru, active: ra },
      artisans: { requested: ar, completed: ac, cancelled: ax, unassigned: au, active: aa },
    },
  }
}

test('each period partitions requested bookings into four outcomes', () => {
  const report = normaliseBookingOutcomesReport({
    from: '2026-08-21', to: '2026-08-22', groupBy: 'day', vertical: 'all',
    periods: [
      period('2026-08-22', [850, 500, 200, 150, 0], [20, 10, 5, 3, 2]),
      period('2026-08-21', [1030, 700, 210, 120, 0], [0, 0, 0, 0, 0]),
    ],
  })
  assert.equal(report.periods.length, 2)
  for (const p of report.periods) {
    assert.equal(p.completed + p.cancelled + p.unassigned + p.active, p.requested)
    assert.equal(
      p.byVertical.rides.completed + p.byVertical.rides.cancelled + p.byVertical.rides.unassigned + p.byVertical.rides.active,
      p.byVertical.rides.requested,
    )
  }
  assert.equal(report.periods[0].completionRatePct, 58.6)
  assert.equal(report.periods[0].unassignedRatePct, 17.6)
})

test('totals are summed from periods when the backend omits them', () => {
  const report = normaliseBookingOutcomesReport({
    periods: [
      period('2026-08-22', [10, 6, 2, 1, 1], [4, 2, 1, 1, 0]),
      period('2026-08-21', [5, 5, 0, 0, 0], [1, 0, 0, 1, 0]),
    ],
  }, { groupBy: 'week', vertical: 'rides' })
  assert.equal(report.groupBy, 'week')
  assert.equal(report.vertical, 'rides')
  assert.equal(report.totals.requested, 20)
  assert.equal(report.totals.completed, 13)
  assert.equal(report.totals.byVertical.rides.requested, 15)
  assert.equal(report.totals.byVertical.artisans.unassigned, 2)
  assert.equal(report.totals.completionRatePct, 65)
})

test('backend totals are preferred and a missing `active` is inferred from the remainder', () => {
  const counters = normaliseOutcomeCounters({ requested: 10, completed: 4, cancelled: 3, unassigned: 1 })
  assert.equal(counters.active, 2)
  assert.equal(counters.completionRatePct, 40)

  const report = normaliseBookingOutcomesReport({
    periods: [period('2026-08-22', [1, 1, 0, 0, 0], [0, 0, 0, 0, 0])],
    totals: { requested: 99, completed: 1, cancelled: 0, unassigned: 0, active: 98, byVertical: {} },
  })
  assert.equal(report.totals.requested, 99)
  assert.equal(report.totals.byVertical.rides.requested, 0)
})

test('empty or malformed payloads normalise to an empty report with zero totals', () => {
  const report = normaliseBookingOutcomesReport(null)
  assert.deepEqual(report.periods, [])
  assert.equal(report.totals.requested, 0)
  assert.equal(report.totals.completionRatePct, null)
  assert.equal(report.vertical, 'all')
  assert.equal(sumOutcomePeriods([]).unassignedRatePct, null)
})

test('unknown verticals fall back to the requested one and bad period rows are dropped', () => {
  const report = normaliseBookingOutcomesReport(
    { vertical: 'drivers', periods: [{ requested: 3 }, 'x', period('2026-08-22', [1, 0, 0, 1, 0], [0, 0, 0, 0, 0])] },
    { vertical: 'artisans' },
  )
  assert.equal(report.vertical, 'artisans')
  assert.equal(report.periods.length, 1)
})
