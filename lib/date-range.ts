export const GHANA_TIME_ZONE = 'Africa/Accra' as const

export type DateRangePreset = 'today' | 'week' | 'month' | 'custom' | 'all'

export interface InclusiveDateRange {
  from?: string
  to?: string
}

const DATE_KEY_RX = /^\d{4}-\d{2}-\d{2}$/

export function isValidDateKey(value: string): boolean {
  if (!DATE_KEY_RX.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
}

/** Returns the Ghana calendar date for an instant as YYYY-MM-DD. */
export function ghanaDateKey(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: GHANA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

/** Moves an ISO date key by whole calendar days without using the browser zone. */
export function shiftDateKey(dateKey: string, days: number): string {
  if (!isValidDateKey(dateKey)) throw new Error(`Invalid date key: ${dateKey}`)
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/**
 * Resolves inclusive calendar-date keys for admin APIs. "Last 7 days" and
 * "Last 30 days" include today, so they contain exactly 7 and 30 dates.
 */
export function resolveInclusiveDateRange(
  preset: DateRangePreset,
  customFrom = '',
  customTo = '',
  now: Date = new Date(),
): InclusiveDateRange {
  const today = ghanaDateKey(now)
  if (preset === 'today') return { from: today, to: today }
  if (preset === 'week') return { from: shiftDateKey(today, -6), to: today }
  if (preset === 'month') return { from: shiftDateKey(today, -29), to: today }
  if (preset === 'custom') {
    // A cleared/crafted custom range must never broaden into an unfiltered
    // request. Fail closed to the current Ghana calendar day.
    if (
      !isValidDateKey(customFrom) ||
      !isValidDateKey(customTo) ||
      customFrom > customTo ||
      customFrom > today ||
      customTo > today
    ) {
      return { from: today, to: today }
    }
    return { from: customFrom, to: customTo }
  }
  return {}
}

export function defaultCustomDateRange(
  customFrom = '',
  customTo = '',
  now: Date = new Date(),
): { from: string; to: string } {
  const today = ghanaDateKey(now)
  const valid = isValidDateKey(customFrom) &&
    isValidDateKey(customTo) &&
    customFrom <= customTo &&
    customFrom <= today &&
    customTo <= today
  return valid ? { from: customFrom, to: customTo } : { from: today, to: today }
}

export function dateRangeLabel(preset: DateRangePreset): string {
  if (preset === 'today') return 'Today (GMT)'
  if (preset === 'week') return 'Last 7 days'
  if (preset === 'month') return 'Last 30 days'
  if (preset === 'custom') return 'Custom range'
  return 'All time'
}

export function isInstantInInclusiveDateRange(
  instant: string,
  range: InclusiveDateRange,
): boolean {
  const date = new Date(instant)
  if (Number.isNaN(date.getTime())) return !range.from && !range.to
  const key = ghanaDateKey(date)
  if (range.from && key < range.from) return false
  if (range.to && key > range.to) return false
  return true
}

export function isDateRangePreset(value: string | null): value is DateRangePreset {
  return value === 'today' || value === 'week' || value === 'month' || value === 'custom' || value === 'all'
}
