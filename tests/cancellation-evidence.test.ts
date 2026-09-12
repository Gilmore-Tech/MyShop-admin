import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cancellationActorLabel,
  cancellationReasonLabel,
} from '../lib/cancellation-evidence.ts'

test('ride cancellation actor includes the responsible participant', () => {
  assert.equal(
    cancellationActorLabel({
      booking: 'ride',
      cancelledBy: 'client',
      clientName: 'Ama Mensah',
      providerName: 'Kojo Driver',
    }),
    'Rider - Ama Mensah',
  )
  assert.equal(
    cancellationActorLabel({
      booking: 'ride',
      cancelledBy: 'driver',
      clientName: 'Ama Mensah',
      providerName: 'Kojo Driver',
    }),
    'Driver - Kojo Driver',
  )
})

test('job cancellation actor distinguishes client, artisan and system', () => {
  assert.equal(
    cancellationActorLabel({ booking: 'job', cancelledBy: 'client', clientName: 'Ama' }),
    'Client - Ama',
  )
  assert.equal(
    cancellationActorLabel({ booking: 'job', cancelledBy: 'artisan', providerName: 'Kofi' }),
    'Artisan - Kofi',
  )
  assert.equal(
    cancellationActorLabel({ booking: 'job', cancelledBy: 'system' }),
    'System automation',
  )
})

test('legacy reason codes become honest human-readable evidence', () => {
  assert.equal(
    cancellationReasonLabel('rider_cancelled'),
    'Rider cancelled without selecting a detailed reason (recorded by an older app version).',
  )
  assert.equal(cancellationReasonLabel('no_drivers_available'), 'No eligible drivers were available.')
  assert.equal(cancellationReasonLabel('Vehicle problem'), 'Vehicle problem')
  assert.equal(cancellationReasonLabel(null), 'No reason was recorded.')
})
