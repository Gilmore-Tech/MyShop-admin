'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getToken, clearTokens } from '@/lib/api-client'

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

    // Any API call that gets a 401 fires this event instead of wiping the session itself.
    // We clear here (one centralised place) and redirect.
    function handleUnauthorized() {
      clearTokens()
      router.replace('/login')
    }

    window.addEventListener('auth:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized)
  }, [router])

  if (!checked) return null

  return <>{children}</>
}
