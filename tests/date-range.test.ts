import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DATE_RANGE_PRESETS,
  dateBasisCaption,
  ghanaDateKey,
  defaultCustomDateRange,
  isDateRangePreset,
  isValidDateKey,
  isInstantInInclusiveDateRange,
  resolveInclusiveDateRange,
  shiftDateKey,
} from '../lib/date-range.ts'

const NOW = new Date('2026-08-10T13:45:00.000Z')

test('Today resolves to one inclusive Ghana calendar date', () => {
  assert.deepEqual(resolveInclusiveDateRange('today', '', '', NOW), {
    from: '2026-08-10',
    to: '2026-08-10',
  })
})

test('relative presets advance when Ghana crosses midnight', () => {
  assert.deepEqual(
    resolveInclusiveDateRange('today', '', '', new Date('2026-08-10T23:59:59.999Z')),
    { from: '2026-08-10', to: '2026-08-10' },
  )
  assert.deepEqual(
    resolveInclusiveDateRange('today', '', '', new Date('2026-08-11T00:00:00.000Z')),
    { from: '2026-08-11', to: '2026-08-11' },
  )
})

test('rolling presets include today and contain exactly 7 or 30 calendar dates', () => {
  assert.deepEqual(resolveInclusiveDateRange('week', '', '', NOW), {
    from: '2026-08-04',
    to: '2026-08-10',
  })
  assert.deepEqual(resolveInclusiveDateRange('month', '', '', NOW), {
    from: '2026-07-12',
    to: '2026-08-10',
  })
})

test('calendar presets start at the Ghana period boundary and end today', () => {
  // 2026-08-10 is a Monday, so "this week" is a single day.
  assert.deepEqual(resolveInclusiveDateRange('this_week', '', '', NOW), {
    from: '2026-08-10',
    to: '2026-08-10',
  })
  // A Sunday belongs to the week that began the previous Monday.
  assert.deepEqual(
    resolveInclusiveDateRange('this_week', '', '', new Date('2026-08-16T09:00:00.000Z')),
    { from: '2026-08-10', to: '2026-08-16' },
  )
  assert.deepEqual(resolveInclusiveDateRange('this_month', '', '', NOW), {
    from: '2026-08-01',
    to: '2026-08-10',
  })
  assert.deepEqual(resolveInclusiveDateRange('this_year', '', '', NOW), {
    from: '2026-01-01',
    to: '2026-08-10',
  })
})

test('last 12 months is a rolling 365-day window that includes today', () => {
  assert.deepEqual(resolveInclusiveDateRange('year', '', '', NOW), {
    from: '2025-08-11',
    to: '2026-08-10',
  })
})

test('date-basis captions share one sentence shape', () => {
  assert.equal(
    dateBasisCaption('bookings', 'requested'),
    'Bookings are counted by the date they were requested (GMT, Africa/Accra).',
  )
  assert.equal(
    dateBasisCaption('payments', 'recorded'),
    'Payments are counted by the date they were recorded (GMT, Africa/Accra).',
  )
  assert.equal(
    dateBasisCaption('events', 'last seen'),
    'Events are counted by the date they were last seen (GMT, Africa/Accra).',
  )
})

test('every preset in the catalogue is recognised', () => {
  for (const preset of DATE_RANGE_PRESETS) assert.equal(isDateRangePreset(preset), true)
  assert.equal(isDateRangePreset('fortnight'), false)
  assert.equal(isDateRangePreset(null), false)
})

test('calendar arithmetic crosses month and year boundaries safely', () => {
  assert.equal(shiftDateKey('2026-01-01', -1), '2025-12-31')
  assert.equal(shiftDateKey('2026-03-01', -1), '2026-02-28')
})

test('custom and all-time ranges preserve explicit inclusive API keys', () => {
  assert.deepEqual(resolveInclusiveDateRange('custom', '2026-08-01', '2026-08-03', NOW), {
    from: '2026-08-01',
    to: '2026-08-03',
  })
  assert.deepEqual(resolveInclusiveDateRange('all', '', '', NOW), {})
})

test('custom ranges reject impossible calendar keys', () => {
  assert.equal(isValidDateKey('2026-02-29'), false)
  assert.equal(isValidDateKey('2028-02-29'), true)
  assert.deepEqual(resolveInclusiveDateRange('custom', '2026-02-29', '2026-02-28', NOW), {
    from: '2026-08-10',
    to: '2026-08-10',
  })
  assert.deepEqual(resolveInclusiveDateRange('custom', '2026-03-02', '2026-03-01', NOW), {
    from: '2026-08-10',
    to: '2026-08-10',
  })
  assert.deepEqual(resolveInclusiveDateRange('custom', '', '', NOW), {
    from: '2026-08-10',
    to: '2026-08-10',
  })
  assert.deepEqual(resolveInclusiveDateRange('custom', '2026-08-11', '2026-08-12', NOW), {
    from: '2026-08-10',
    to: '2026-08-10',
  })
})

test('opening Custom starts with a complete Today range', () => {
  assert.deepEqual(defaultCustomDateRange('', '', NOW), {
    from: '2026-08-10',
    to: '2026-08-10',
  })
})

test('Ghana date keys do not depend on the machine locale', () => {
  assert.equal(ghanaDateKey(new Date('2026-08-10T00:00:00.000Z')), '2026-08-10')
})

test('instant filtering uses inclusive Ghana calendar keys', () => {
  const range = { from: '2026-08-10', to: '2026-08-10' }
  assert.equal(isInstantInInclusiveDateRange('2026-08-10T00:00:00.000Z', range), true)
  assert.equal(isInstantInInclusiveDateRange('2026-08-10T23:59:59.999Z', range), true)
  assert.equal(isInstantInInclusiveDateRange('2026-08-11T00:00:00.000Z', range), false)
  assert.equal(isInstantInInclusiveDateRange('not-a-date', range), false)
  assert.equal(isInstantInInclusiveDateRange('not-a-date', {}), true)
})
