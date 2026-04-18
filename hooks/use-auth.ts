'use client'

import { useState, useEffect, useCallback } from 'react'
import { getAdminUser, getToken, clearTokens, type AdminUser } from '@/lib/api-client'
import { adminLogin as apiAdminLogin, adminLogout as apiAdminLogout } from '@/lib/api'

export function useAuth() {
  const [admin, setAdmin] = useState<AdminUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getToken()
    const user = getAdminUser()
    if (token && user) {
      setAdmin(user)
    }
    setLoading(false)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiAdminLogin(email, password)
    setAdmin(res.admin)
    return res
  }, [])

  const logout = useCallback(() => {
    apiAdminLogout()
    setAdmin(null)
  }, [])

  return { admin, loading, login, logout, isAuthenticated: !!admin }
}
