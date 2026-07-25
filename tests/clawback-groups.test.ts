import assert from 'node:assert/strict'
import test from 'node:test'
import { groupClawbacksByProvider } from '../lib/clawback-groups.ts'
import type { AdminClawback } from '../lib/api.ts'

function debt(overrides: Partial<AdminClawback>): AdminClawback {
  return {
    id: 'debt-1', providerId: 'provider-1', providerName: 'Ama Driver', providerPhone: null,
    source: 'DISPUTE', amountPesewas: 5000, paidAmountPesewas: 1000,
    outstandingPesewas: 4000, originalDisputeId: null, initiatedAt: '2026-05-01T00:00:00Z',
    daysOutstanding: 80, status: 'partial', ...overrides,
  }
}

test('groups debt rows by provider and aggregates their financial values', () => {
  const groups = groupClawbacksByProvider([
    debt({}),
    debt({ id: 'debt-2', amountPesewas: 3000, paidAmountPesewas: 0, outstandingPesewas: 3000, source: 'MANUAL' }),
    debt({ id: 'debt-3', providerId: 'provider-2', providerName: 'Kojo Driver', outstandingPesewas: 2000 }),
  ])

  assert.equal(groups.length, 2)
  assert.equal(groups[0].clawbacks.length, 2)
  assert.equal(groups[0].amountPesewas, 8000)
  assert.equal(groups[0].paidAmountPesewas, 1000)
  assert.equal(groups[0].outstandingPesewas, 7000)
  assert.deepEqual(groups[0].sources, ['DISPUTE', 'MANUAL'])
})

test('uses the oldest debt date, longest age, unique disputes, and reports mixed statuses', () => {
  const [group] = groupClawbacksByProvider([
    debt({ originalDisputeId: 'dispute-1' }),
    debt({ id: 'debt-2', initiatedAt: '2026-04-01T00:00:00Z', daysOutstanding: 110, status: 'escalated', originalDisputeId: 'dispute-1' }),
  ])

  assert.equal(group.initiatedAt, '2026-04-01T00:00:00Z')
  assert.equal(group.daysOutstanding, 110)
  assert.equal(group.status, 'mixed')
  assert.deepEqual(group.disputeIds, ['dispute-1'])
})
