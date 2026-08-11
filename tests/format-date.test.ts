import assert from 'node:assert/strict'
import test from 'node:test'
import { formatDayShort, ghanaWeekdayIndex } from '../lib/format-date.ts'

test('report date formatting stays on the Ghana calendar at an instant boundary', () => {
  const previous = process.env.TZ
  process.env.TZ = 'America/Los_Angeles'
  try {
    assert.equal(formatDayShort('2026-08-10T00:30:00.000Z'), '10 Aug')
    assert.equal(ghanaWeekdayIndex('2026-08-10'), 1)
  } finally {
    if (previous == null) delete process.env.TZ
    else process.env.TZ = previous
  }
})
