'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ADMIN_ACTIVITY_KEY, getToken, clearTokens } from '@/lib/api-client'

const ADMIN_IDLE_TIMEOUT_MS = 15 * 60 * 1000
const IDLE_CHECK_INTERVAL_MS = 5_000
const ACTIVITY_WRITE_THROTTLE_MS = 2_000

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    // Initial token check
    if (!getToken()) {
      router.replace('/login')
      return
    }
    setChecked(true)

    let expired = false
    let lastActivity = Number(localStorage.getItem(ADMIN_ACTIVITY_KEY))
    if (!Number.isFinite(lastActivity) || lastActivity <= 0) {
      lastActivity = Date.now()
      localStorage.setItem(ADMIN_ACTIVITY_KEY, String(lastActivity))
    }
    let lastPersistedAt = lastActivity

    function endSession() {
      if (expired) return
      expired = true
      clearTokens()
      router.replace('/login')
    }

    function checkIdle() {
      if (Date.now() - lastActivity >= ADMIN_IDLE_TIMEOUT_MS) endSession()
    }

    function recordActivity() {
      if (expired) return
      const now = Date.now()
      lastActivity = now
      if (now - lastPersistedAt >= ACTIVITY_WRITE_THROTTLE_MS) {
        lastPersistedAt = now
        localStorage.setItem(ADMIN_ACTIVITY_KEY, String(now))
      }
    }

    function handleVisibilityChange() {
      if (document.hidden) return
      checkIdle()
      if (!expired) recordActivity()
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === ADMIN_ACTIVITY_KEY && event.newValue) {
        const sharedActivity = Number(event.newValue)
        if (Number.isFinite(sharedActivity)) lastActivity = sharedActivity
      }
      if (event.key === 'myshop_admin_token' && event.newValue === null) endSession()
    }

    const activityEvents: Array<keyof WindowEventMap> = [
      'pointerdown',
      'mousemove',
      'keydown',
      'touchstart',
      'scroll',
    ]
    for (const event of activityEvents) {
      window.addEventListener(event, recordActivity, { passive: true })
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('storage', handleStorage)
    const idleCheck = window.setInterval(checkIdle, IDLE_CHECK_INTERVAL_MS)

    // Any API call that gets a 401 fires this event instead of wiping the session itself.
    // We clear here (one centralised place) and redirect.
    function handleUnauthorized() {
      endSession()
    }

    window.addEventListener('auth:unauthorized', handleUnauthorized)
    return () => {
      window.clearInterval(idleCheck)
      for (const event of activityEvents) window.removeEventListener(event, recordActivity)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('auth:unauthorized', handleUnauthorized)
    }
  }, [router])

  if (!checked) return null

  return <>{children}</>
}
