import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatManualAssignmentWindow,
  isManualAssignmentLockActive,
  manualAssignmentBidWindowSeconds,
} from '../lib/manual-assignment-contract.ts'

test('expired admin locks stop hiding assignable jobs', () => {
  const now = Date.parse('2026-08-30T12:00:00.000Z')
  assert.equal(isManualAssignmentLockActive(null, now), false)
  assert.equal(isManualAssignmentLockActive({
    lockedBy: 'admin-1',
    expiresAt: '2026-08-30T11:59:59.000Z',
  }, now), false)
  assert.equal(isManualAssignmentLockActive({
    lockedBy: 'admin-2',
    expiresAt: '2026-08-30T12:00:01.000Z',
  }, now), true)
  assert.equal(isManualAssignmentLockActive({
    lockedBy: 'admin-3',
    expiresAt: 'not-a-date',
  }, now), true)
})

test('converts canonical job_bid_window_secs without treating seconds as minutes', () => {
  assert.equal(manualAssignmentBidWindowSeconds([
    { key: 'job_bid_window_secs', value: '120' },
    { key: 'bid_window_minutes', value: '99' },
  ], 300), 120)
  assert.equal(manualAssignmentBidWindowSeconds([
    { key: 'job_bid_window_secs', value: '2.5' },
  ], 300), 300)
  assert.equal(formatManualAssignmentWindow(120), '2 minutes')
  assert.equal(formatManualAssignmentWindow(45), '45 seconds')
})
