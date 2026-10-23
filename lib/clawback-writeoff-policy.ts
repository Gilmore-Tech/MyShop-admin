import type { AdminClawback } from './api'

const COLLECTIBLE_STATUSES = new Set(['outstanding', 'partial', 'escalated'])

/** A debt can be forgiven only while it still represents open principal. */
export function isCollectibleDebt(debt: AdminClawback): boolean {
  return debt.outstandingPesewas > 0 && COLLECTIBLE_STATUSES.has(debt.status)
}

/** Ordinary reviewed write-offs retain the platform's small/aged-debt policy. */
export function isRoutineWriteOffEligible(debt: AdminClawback): boolean {
  return (
    isCollectibleDebt(debt) &&
    debt.outstandingPesewas < 10_000 &&
    debt.daysOutstanding >= 90
  )
}

/** Root administrators may review any open debt, regardless of age or amount. */
export function canShowClearAmount(debt: AdminClawback, isSuperAdmin: boolean): boolean {
  return isRoutineWriteOffEligible(debt) || (isSuperAdmin && isCollectibleDebt(debt))
}
