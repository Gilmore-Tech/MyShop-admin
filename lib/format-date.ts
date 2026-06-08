// Centralised, human-readable date/time formatting for the whole admin app.
// Use these instead of slicing ISO strings (which leaks "...T00:00:00.000Z").
const LOCALE = 'en-GB'

/** "11 May 2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString(LOCALE, { day: '2-digit', month: 'short', year: 'numeric' })
}

/** "11 May 2026, 14:30" */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString(LOCALE, {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/** Compact "11 May" — good for chart ticks and dense rows. */
export function formatDayShort(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(LOCALE, { day: '2-digit', month: 'short' })
}

/** Label a reporting period sensibly for its grouping (day/week → "11 May", month → "May 2026"). */
export function formatPeriodLabel(iso: string | null | undefined, groupBy?: 'day' | 'week' | 'month'): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  if (groupBy === 'month') return d.toLocaleDateString(LOCALE, { month: 'short', year: 'numeric' })
  return d.toLocaleDateString(LOCALE, { day: '2-digit', month: 'short' })
}
