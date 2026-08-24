import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normaliseRevenueDataPoint,
  normaliseRevenueReport,
  sumGhs,
} from '../lib/revenue-report-contract.ts'

test('promo fields default to zero on a backend that predates them', () => {
  const point = normaliseRevenueDataPoint({
    period: '2026-08-22',
    collectionsGhs: 200,
    commissionGhs: 40,
    payoutsGhs: 160,
    tipsGhs: 0,
    refundsGhs: 5,
    clawbacksGhs: 1,
    totalPayments: 10,
    successfulPayments: 9,
    momoCount: 6,
    cardCount: 3,
    cashCount: 1,
  })
  assert.ok(point)
  assert.equal(point.promoGhs, 0)
  assert.equal(point.loyaltyGhs, 0)
  assert.equal(point.subsidyGhs, 0)
  assert.equal(point.commissionReliefGhs, 0)
  // Net revenue falls back to the legacy formula, net commission to commission itself.
  assert.equal(point.netRevenueGhs, 40 - 5 + 1)
  assert.equal(point.netCommissionAfterPromoGhs, 40)
  assert.equal(point.netRevenueAfterPromoGhs, 36)
  assert.equal(point.byVertical, undefined)
})

test('net after promo is derived as commission - relief - subsidy when absent', () => {
  const point = normaliseRevenueDataPoint({
    period: '2026-08-22',
    commission_ghs: 200,
    promo_ghs: 50,
    loyalty_ghs: 5,
    commission_relief_ghs: 10,
  })
  assert.ok(point)
  assert.equal(point.subsidyGhs, 55)
  assert.equal(point.netCommissionAfterPromoGhs, 200 - 10 - 55)
})

test('backend-supplied nets win over the derived fallback', () => {
  const point = normaliseRevenueDataPoint({
    period: '2026-08-22',
    commissionGhs: 200,
    subsidyGhs: 55,
    netCommissionAfterPromoGhs: 140,
    netRevenueAfterPromoGhs: 139,
  })
  assert.ok(point)
  assert.equal(point.netCommissionAfterPromoGhs, 140)
  assert.equal(point.netRevenueAfterPromoGhs, 139)
})

test('per-vertical split is kept only when both verticals are present', () => {
  const full = normaliseRevenueDataPoint({
    period: '2026-08-22',
    commissionGhs: 200,
    byVertical: {
      rides: { collectionsGhs: 800, commissionGhs: 160, payoutsGhs: 640, totalPayments: 40, promoGhs: 40, loyaltyGhs: 0 },
      artisans: { collectionsGhs: 400, commissionGhs: 40, payoutsGhs: 360, totalPayments: 12 },
    },
  })
  assert.ok(full?.byVertical)
  assert.equal(full.byVertical.rides.subsidyGhs, 40)
  assert.equal(full.byVertical.rides.netCommissionAfterPromoGhs, 120)
  assert.equal(full.byVertical.artisans.netCommissionAfterPromoGhs, 40)
  assert.equal(full.byVertical.artisans.refundsGhs, 0)

  const partial = normaliseRevenueDataPoint({ period: '2026-08-22', byVertical: { rides: { commissionGhs: 1 } } })
  assert.equal(partial?.byVertical, undefined)
})

test('report envelope tolerates legacy `data` arrays and drops periods without a date', () => {
  const report = normaliseRevenueReport({
    from: '2026-08-01', to: '2026-08-03', groupBy: 'day',
    data: [{ period: '2026-08-01', commissionGhs: 1 }, { commissionGhs: 99 }, null],
  }, 'week')
  assert.equal(report.groupBy, 'day')
  assert.equal(report.periods.length, 1)
  assert.equal(sumGhs(report.periods, 'commissionGhs'), 1)

  assert.deepEqual(normaliseRevenueReport(undefined, 'year'), { from: '', to: '', groupBy: 'year', periods: [] })
})
