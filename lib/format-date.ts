// Centralised, human-readable date/time formatting for the whole admin app.
// Use these instead of slicing ISO strings (which leaks "...T00:00:00.000Z").
const LOCALE = 'en-GB'
const TIME_ZONE = 'Africa/Accra'

/** "11 May 2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString(LOCALE, { day: '2-digit', month: 'short', year: 'numeric', timeZone: TIME_ZONE })
}

/** "11 May 2026, 14:30" */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString(LOCALE, {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE,
  })
}

/** Compact "11 May" — good for chart ticks and dense rows. */
export function formatDayShort(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(LOCALE, { day: '2-digit', month: 'short', timeZone: TIME_ZONE })
}

export type ReportGroupBy = 'day' | 'week' | 'month' | 'year'

/**
 * Label a reporting period sensibly for its grouping (compact, for chart ticks
 * and dense rows): day → "11 May", week → "Wk of 11 May", month → "May 2026",
 * year → "2026". Use `formatDate` when the year must be visible.
 */
export function formatPeriodLabel(iso: string | null | undefined, groupBy?: ReportGroupBy): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  if (groupBy === 'year') return d.toLocaleDateString(LOCALE, { year: 'numeric', timeZone: TIME_ZONE })
  if (groupBy === 'month') return d.toLocaleDateString(LOCALE, { month: 'short', year: 'numeric', timeZone: TIME_ZONE })
  if (groupBy === 'week') return 'Wk of ' + d.toLocaleDateString(LOCALE, { day: '2-digit', month: 'short', timeZone: TIME_ZONE })
  return d.toLocaleDateString(LOCALE, { day: '2-digit', month: 'short', timeZone: TIME_ZONE })
}

/** Relative age for feeds: "12s ago", "5 min ago", "3h ago", "2d ago". */
export function timeAgo(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '-'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '-'
  const diff = Math.max(0, Math.floor((now.getTime() - then) / 1000))
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

/** Sunday = 0 ... Saturday = 6, pinned to the reporting timezone. */
export function ghanaWeekdayIndex(iso: string | null | undefined): number | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const label = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: TIME_ZONE,
  }).format(date)
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(label)
}
