import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ledgerRowBalances,
  normaliseCommissionLedger,
  normaliseCommissionLedgerRow,
  normaliseLedgerMoney,
} from '../lib/commission-ledger-contract.ts'

// A cash ride on a GHS 100 fare with 20% commission, GHS 5 relief and a GHS 12
// promo: effective commission 15, netted 12, cash debt 3.
const cashRow = {
  providerId: 'drv-1', providerType: 'driver', fullName: 'Kofi Mensah', phone: '+233241234567',
  bookings: 1,
  prePromoFaresPesewas: 10000,
  commissionPesewas: 2000,
  commissionReliefPesewas: 500,
  promoSubsidyPesewas: 1200,
  commissionNettedAgainstPromoPesewas: 1200,
  cashCommissionOwedPesewas: 300,
  cashPlatformPayablePesewas: 0,
  digitalCommissionWithheldPesewas: 0,
  clawbackRecordedPesewas: 300,
  clawbackPaidPesewas: 100,
  clawbackWrittenOffPesewas: 0,
  clawbackOutstandingPesewas: 200,
  paymentMethods: { cash: 1, momo: 0, card: 0, other: 0 },
}

test('provider rows carry the identity and the netting columns in integer pesewas', () => {
  const row = normaliseCommissionLedgerRow(cashRow, 'provider')
  assert.ok(row)
  assert.equal(row.key, 'drv-1')
  assert.equal(row.providerType, 'driver')
  assert.equal(row.fullName, 'Kofi Mensah')
  assert.equal(row.commissionNettedAgainstPromoPesewas, 1200)
  assert.equal(row.cashCommissionOwedPesewas, 300)
  assert.equal(row.clawbackOutstandingPesewas, 200)
  assert.equal(row.paymentMethods.cash, 1)
  assert.equal(ledgerRowBalances(row), true)
})

test('the reconciliation identity flags rows the backend got wrong', () => {
  const broken = normaliseLedgerMoney({ ...cashRow, digitalCommissionWithheldPesewas: 1 })
  assert.equal(ledgerRowBalances(broken), false)
})

test('row keys follow the grouping: provider id, period, or payment id', () => {
  assert.equal(normaliseCommissionLedgerRow({ period: '2026-08-22', bookings: 2 }, 'day')?.key, '2026-08-22')
  assert.equal(normaliseCommissionLedgerRow({ payment_id: 'pay-1', booking_id: 'ride-1', booking_type: 'ride' }, 'booking')?.key, 'pay-1')
  assert.equal(normaliseCommissionLedgerRow({ booking_id: 'ride-1' }, 'booking')?.key, 'ride-1')
  // A provider row without a provider id cannot be keyed and is dropped.
  assert.equal(normaliseCommissionLedgerRow({ bookings: 3 }, 'provider'), null)
})

test('snake_case, bigint strings and missing totals are tolerated', () => {
  const report = normaliseCommissionLedger({
    from: '2026-08-01', to: '2026-08-22', group_by: 'day', page: '1', limit: '50', total: '1',
    rows: [{ period: '2026-08-22', bookings: '3', commission_pesewas: '600', cash_commission_owed_pesewas: '600', clawback_outstanding_pesewas: '-100' }],
  }, { groupBy: 'provider' })
  assert.equal(report.groupBy, 'day')
  assert.equal(report.rows.length, 1)
  assert.equal(report.rows[0].commissionPesewas, 600)
  assert.equal(report.rows[0].bookings, 3)
  // Outstanding can be negative after an over-remittance; never clamp it.
  assert.equal(report.rows[0].clawbackOutstandingPesewas, -100)
  assert.equal(report.totals.commissionPesewas, 0)
  assert.equal(report.total, 1)
})

test('non-integer or negative money is rejected rather than coerced', () => {
  const money = normaliseLedgerMoney({ commissionPesewas: 12.5, promoSubsidyPesewas: -1, bookings: '2' })
  assert.equal(money.commissionPesewas, 0)
  assert.equal(money.promoSubsidyPesewas, 0)
  assert.equal(money.bookings, 2)
  assert.deepEqual(normaliseCommissionLedger(undefined, { groupBy: 'booking' }).rows, [])
})
