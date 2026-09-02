export interface ManualAssignmentAdminLock {
  lockedBy: string
  expiresAt: string
}

export interface ManualAssignmentConfigEntry {
  key: string
  value: string
}

/**
 * A malformed lock remains active (fail closed); a valid lock stops hiding the
 * job as soon as its server-authored expiry is reached.
 */
export function isManualAssignmentLockActive(
  lock: ManualAssignmentAdminLock | null,
  nowMs = Date.now(),
): boolean {
  if (!lock) return false
  const expiresAtMs = Date.parse(lock.expiresAt)
  return !Number.isFinite(expiresAtMs) || expiresAtMs > nowMs
}

/** Read the backend's canonical seconds value and preserve a safe fallback. */
export function manualAssignmentBidWindowSeconds(
  rows: ManualAssignmentConfigEntry[],
  fallbackSeconds: number,
): number {
  const raw = rows.find(row => row.key === 'job_bid_window_secs')?.value
  const seconds = raw == null ? Number.NaN : Number(raw)
  return Number.isSafeInteger(seconds) && seconds > 0
    ? seconds
    : fallbackSeconds
}

export function formatManualAssignmentWindow(seconds: number): string {
  if (seconds % 60 === 0) {
    const minutes = seconds / 60
    return `${minutes} minute${minutes === 1 ? '' : 's'}`
  }
  return `${seconds} seconds`
}
