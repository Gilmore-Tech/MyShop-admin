'use client'

import { useEffect, useState } from 'react'
import { getTokenExpiresAt } from '@/lib/api-client'

const TICK_MS = 30_000
const WARN_THRESHOLD_SECONDS = 60 * 60 // 1 hour

/**
 * Tracks the JWT access-token lifetime. Returns `secondsRemaining` (null when
 * no token / unparsable) and `warn` (true when the token expires within the
 * next hour). Updates every 30 s while the tab is visible.
 *
 * The token has an 8 h hard expiry and there is no refresh endpoint yet — see
 * docs/admin-dashboard-handoff.md §7.4 + §12.
 */
export function useSessionExpiry() {
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null)

  useEffect(() => {
    function tick() {
      const exp = getTokenExpiresAt()
      if (exp == null) { setSecondsRemaining(null); return }
      setSecondsRemaining(Math.max(0, exp - Math.floor(Date.now() / 1000)))
    }

    tick()
    const id = setInterval(tick, TICK_MS)
    function onVisible() { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return {
    secondsRemaining,
    warn: secondsRemaining != null && secondsRemaining > 0 && secondsRemaining <= WARN_THRESHOLD_SECONDS,
  }
}

export function formatSessionRemaining(seconds: number): string {
  if (seconds <= 60) return 'less than a minute'
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `${mins} min`
  const hours = Math.floor(mins / 60)
  const remMins = mins % 60
  return remMins === 0 ? `${hours} h` : `${hours} h ${remMins} min`
}
