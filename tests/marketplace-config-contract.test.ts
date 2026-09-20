import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('marketplace settings expose all backend-owned active-ride destination controls', () => {
  const source = readFileSync(
    new URL('../app/(dashboard)/configuration/page.tsx', import.meta.url),
    'utf8',
  )

  assert.match(source, /rideDestinationEditEnabled:\s+'false'/)
  assert.match(source, /rideDestinationEditMaxAddedKm:\s+10/)
  assert.match(source, /rideDestinationEditMaxAddedMins:\s+30/)
  assert.match(source, /rideDestinationEditPreviewTtlSecs:\s+120/)
  assert.match(source, /Active Ride Drop-off Changes/)
  assert.match(
    source,
    /field\('Active Ride Drop-off Changes', 'rideDestinationEditEnabled', \{[\s\S]*?type: 'boolean'/,
  )
  assert.match(source, /rideDestinationEditMaxAddedKm:\s+\{ min: 0\.5, max: 100/)
  assert.match(source, /rideDestinationEditMaxAddedMins:\s+\{ min: 1, max: 240/)
  assert.match(source, /rideDestinationEditPreviewTtlSecs:\s+\{ min: 60, max: 300/)
  assert.match(source, /field\('Maximum Added Distance', 'rideDestinationEditMaxAddedKm'/)
  assert.match(source, /field\('Maximum Added Time', 'rideDestinationEditMaxAddedMins'/)
  assert.match(source, /field\('Preview Expiry', 'rideDestinationEditPreviewTtlSecs'/)
})

test('marketplace settings expose separate reviewed commission debt caps', () => {
  const source = readFileSync(
    new URL('../app/(dashboard)/configuration/page.tsx', import.meta.url),
    'utf8',
  )

  assert.match(source, /driverCommissionDebtCapPesewas:\s+0/)
  assert.match(source, /artisanCommissionDebtCapPesewas:\s+0/)
  assert.match(source, /Driver commission owing cap/)
  assert.match(source, /Artisan commission owing cap/)
  assert.match(source, /driverCommissionDebtCapPesewas:\s+\{ min: 0, max: 100000000, pattern: \/\^\\d\+\$\//)
  assert.match(source, /artisanCommissionDebtCapPesewas:\s+\{ min: 0, max: 100000000, pattern: \/\^\\d\+\$\//)
  assert.match(source, /Drivers at or above this pending cash-commission balance cannot receive new rides/)
  assert.match(source, /Artisans at or above this pending cash-commission balance cannot receive new jobs/)
  assert.match(source, /Enter 0 to disable/)
})
