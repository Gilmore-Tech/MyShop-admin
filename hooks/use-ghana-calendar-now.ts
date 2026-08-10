'use client'

import { useEffect, useState } from 'react'
import { ghanaDateKey, shiftDateKey } from '@/lib/date-range'

/**
 * A clock that advances when the Africa/Accra calendar day changes. Consumers
 * can resolve relative date presets without requiring an admin to reload a tab
 * that stayed open overnight.
 */
export function useGhanaCalendarNow(): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      const current = new Date()
      const tomorrow = shiftDateKey(ghanaDateKey(current), 1)
      const delay = Math.max(
        1_000,
        Date.parse(`${tomorrow}T00:00:00.000Z`) - current.getTime() + 100,
      )
      timer = setTimeout(() => {
        setNow(new Date())
        schedule()
      }, delay)
    }

    schedule()
    return () => clearTimeout(timer)
  }, [])

  return now
}
