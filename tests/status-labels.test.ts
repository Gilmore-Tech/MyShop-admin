import assert from 'node:assert/strict'
import test from 'node:test'
import {
  hasStatusLabel,
  paymentMethodLabel,
  paymentStatusLabel,
  statusLabel,
  transactionTypeLabel,
} from '../lib/status-labels.ts'
import * as paymentLabels from '../lib/payment-labels.ts'

test('the payment-labels module is a pure re-export of the registry', () => {
  assert.equal(paymentLabels.paymentStatusLabel, paymentStatusLabel)
  assert.equal(paymentLabels.paymentMethodLabel, paymentMethodLabel)
  assert.equal(paymentLabels.transactionTypeLabel, transactionTypeLabel)
})

test('payment context refines the generic reading where money needs different words', () => {
  assert.equal(statusLabel('pending'), 'Pending')
  assert.equal(statusLabel('pending', 'payment'), 'Waiting')
  assert.equal(paymentStatusLabel('pending'), 'Waiting')
  assert.equal(paymentStatusLabel('refunded'), 'Returned')
  assert.equal(paymentStatusLabel('escrowed'), 'Payment held safely')
  assert.equal(paymentStatusLabel('reconciliation_required'), 'Financial review required')
  assert.equal(paymentStatusLabel('written_off'), 'Cleared')
})

test('every booking status the backend writes has a plain-English label', () => {
  // Rides + artisan jobs, including the values the audit caught rendering raw.
  const bookingStatuses = [
    'requested', 'accepted', 'driver_en_route', 'arrived_at_pickup', 'in_progress',
    'completed', 'cancelled', 'disputed',
    'queued', 'open', 'bidding', 'pending_admin', 'admin_assigned', 'open_for_bids',
    'bids_received', 'confirmed', 'artisan_en_route', 'arrived', 'artisan_marked_complete',
    'pending_payment', 'expired',
  ]
  for (const status of bookingStatuses) {
    assert.equal(hasStatusLabel(status), true, `missing label for ${status}`)
    assert.notEqual(statusLabel(status), status.replace(/_/g, ' '), `label for ${status} is just de-underscored`)
  }
  assert.equal(statusLabel('driver_en_route'), 'Driver on the way')
  assert.equal(statusLabel('artisan_marked_complete'), 'Marked complete')
})

test('unmapped values degrade to readable text, never raw snake_case', () => {
  assert.equal(statusLabel('some_new_status'), 'some new status')
  assert.equal(statusLabel(null), '-')
  assert.equal(paymentMethodLabel('momo_mtn'), 'MoMo MTN')
  assert.equal(paymentMethodLabel('new_wallet_kind'), 'new wallet kind')
  assert.equal(paymentMethodLabel(null), '-')
  assert.equal(transactionTypeLabel('remittance'), 'Debt payment')
  assert.equal(transactionTypeLabel('unknown'), 'unknown')
})

test('labels are sentence case (no Title Case drift back)', () => {
  for (const value of ['in_progress', 'under_review', 'bids_received', 'open_for_bids', 'pending_approval']) {
    const label = statusLabel(value)
    const words = label.split(' ')
    for (const word of words.slice(1)) {
      // Second and later words start lowercase unless they are proper nouns we allow.
      if (['Regional', 'Manager', 'MoMo', 'MTN'].includes(word)) continue
      assert.match(word[0], /[a-z0-9]/, `"${label}" is not sentence case`)
    }
  }
})
