import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canShowClearAmount,
  isCollectibleDebt,
  isRoutineWriteOffEligible,
} from '../lib/clawback-writeoff-policy.ts'
import type { AdminClawback } from '../lib/api.ts'

function debt(overrides: Partial<AdminClawback> = {}): AdminClawback {
  return {
    id: 'debt-1',
    providerId: 'artisan-1',
    providerName: 'Ama Artisan',
    providerType: 'artisan',
    providerPhone: null,
    source: 'CASH_COMMISSION',
    amountPesewas: 25_000,
    paidAmountPesewas: 0,
    outstandingPesewas: 25_000,
    originalDisputeId: null,
    linkedPaymentId: 'payment-1',
    reason: null,
    initiatedAt: '2026-10-22T00:00:00.000Z',
    settledAt: null,
    daysOutstanding: 0,
    status: 'outstanding',
    ...overrides,
  }
}

test('super administrators can review every genuinely open debt', () => {
  const freshLargeDebt = debt()

  assert.equal(isRoutineWriteOffEligible(freshLargeDebt), false)
  assert.equal(canShowClearAmount(freshLargeDebt, false), false)
  assert.equal(canShowClearAmount(freshLargeDebt, true), true)
})

test('ordinary write-off roles retain the small and aged debt policy', () => {
  const agedSmallDebt = debt({ outstandingPesewas: 9_999, daysOutstanding: 90 })

  assert.equal(isRoutineWriteOffEligible(agedSmallDebt), true)
  assert.equal(canShowClearAmount(agedSmallDebt, false), true)
})

test('closed and reconciliation-held rows cannot be cleared by any role', () => {
  for (const status of ['settled', 'written_off', 'reconciliation_required']) {
    const closedDebt = debt({ status })
    assert.equal(isCollectibleDebt(closedDebt), false)
    assert.equal(canShowClearAmount(closedDebt, true), false)
  }
})
