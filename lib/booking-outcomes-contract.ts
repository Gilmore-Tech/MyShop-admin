import { isRecord, count, nullableNumber, nullableString, oneOf, pct } from './contract-utils.ts'

/**
 * `GET /admin/reports/bookings/outcomes` — every booking *requested* in a
 * period, by what happened to it. The backend buckets by booking date
 * (cohort), so for each row: completed + cancelled + unassigned + active =
 * requested. "Unassigned" means no provider ever took it (rides: no driver
 * found / still searching; jobs: no bids / awaiting admin).
 */
export const OUTCOME_VERTICALS = ['all', 'rides', 'artisans'] as const
export type OutcomeVertical = (typeof OUTCOME_VERTICALS)[number]

export interface BookingOutcomeCounters {
  requested: number
  completed: number
  cancelled: number
  unassigned: number
  active: number
  completionRatePct: number | null
  unassignedRatePct: number | null
}

export interface BookingOutcomePeriod extends BookingOutcomeCounters {
  period: string
  byVertical: { rides: BookingOutcomeCounters; artisans: BookingOutcomeCounters }
}

export interface BookingOutcomesReport {
  from: string
  to: string
  groupBy: string
  vertical: OutcomeVertical
  periods: BookingOutcomePeriod[]
  totals: BookingOutcomeCounters & { byVertical: { rides: BookingOutcomeCounters; artisans: BookingOutcomeCounters } }
}

const ZERO: BookingOutcomeCounters = {
  requested: 0, completed: 0, cancelled: 0, unassigned: 0, active: 0, completionRatePct: null, unassignedRatePct: null,
}

export function normaliseOutcomeCounters(raw: unknown): BookingOutcomeCounters {
  if (!isRecord(raw)) return { ...ZERO }
  const requested = count(raw.requested)
  const completed = count(raw.completed)
  const cancelled = count(raw.cancelled)
  const unassigned = count(raw.unassigned)
  // Tolerate a backend that omits `active`: it is whatever is left of the cohort.
  const active = nullableNumber(raw.active) != null
    ? count(raw.active)
    : Math.max(0, requested - completed - cancelled - unassigned)
  return {
    requested,
    completed,
    cancelled,
    unassigned,
    active,
    completionRatePct: nullableNumber(raw.completionRatePct ?? raw.completion_rate_pct) ?? pct(completed, requested),
    unassignedRatePct: nullableNumber(raw.unassignedRatePct ?? raw.unassigned_rate_pct) ?? pct(unassigned, requested),
  }
}

function normaliseByVertical(raw: unknown) {
  const record = isRecord(raw) ? raw : {}
  return {
    rides: normaliseOutcomeCounters(record.rides),
    artisans: normaliseOutcomeCounters(record.artisans),
  }
}

export function normaliseBookingOutcomePeriod(raw: unknown): BookingOutcomePeriod | null {
  if (!isRecord(raw)) return null
  const period = nullableString(raw.period ?? raw.date)
  if (!period) return null
  return {
    period,
    ...normaliseOutcomeCounters(raw),
    byVertical: normaliseByVertical(raw.byVertical ?? raw.by_vertical),
  }
}

export function normaliseBookingOutcomesReport(raw: unknown, requested: { groupBy?: string; vertical?: OutcomeVertical } = {}): BookingOutcomesReport {
  const record = isRecord(raw) ? raw : {}
  const periods = (Array.isArray(record.periods) ? record.periods : [])
    .map(normaliseBookingOutcomePeriod)
    .filter((p): p is BookingOutcomePeriod => p !== null)

  // Totals: prefer the backend's, otherwise sum the periods so the footer
  // never disagrees with the rows it sits under.
  const totals = isRecord(record.totals)
    ? { ...normaliseOutcomeCounters(record.totals), byVertical: normaliseByVertical(record.totals.byVertical ?? record.totals.by_vertical) }
    : sumOutcomePeriods(periods)

  return {
    from: nullableString(record.from) ?? '',
    to: nullableString(record.to) ?? '',
    groupBy: nullableString(record.groupBy ?? record.group_by) ?? requested.groupBy ?? 'day',
    vertical: oneOf(record.vertical, OUTCOME_VERTICALS, requested.vertical ?? 'all'),
    periods,
    totals,
  }
}

function addCounters(a: BookingOutcomeCounters, b: BookingOutcomeCounters): BookingOutcomeCounters {
  const requested = a.requested + b.requested
  const completed = a.completed + b.completed
  const unassigned = a.unassigned + b.unassigned
  return {
    requested,
    completed,
    cancelled: a.cancelled + b.cancelled,
    unassigned,
    active: a.active + b.active,
    completionRatePct: pct(completed, requested),
    unassignedRatePct: pct(unassigned, requested),
  }
}

export function sumOutcomePeriods(periods: BookingOutcomePeriod[]): BookingOutcomesReport['totals'] {
  let all = { ...ZERO }
  let rides = { ...ZERO }
  let artisans = { ...ZERO }
  for (const p of periods) {
    all = addCounters(all, p)
    rides = addCounters(rides, p.byVertical.rides)
    artisans = addCounters(artisans, p.byVertical.artisans)
  }
  return { ...all, byVertical: { rides, artisans } }
}
