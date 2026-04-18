'use client'

import { useState, useEffect } from 'react'
import { getAdminUser } from '@/lib/api-client'
import { can, type AdminRole, type Permission } from '@/lib/roles'

export function useRole() {
  const [role, setRole] = useState<AdminRole | null>(() => {
    if (typeof window === 'undefined') return null
    return (getAdminUser()?.role as AdminRole) ?? null
  })
  const [adminName, setAdminName] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return getAdminUser()?.fullName ?? ''
  })

  useEffect(() => {
    const user = getAdminUser()
    setRole((user?.role as AdminRole) ?? null)
    setAdminName(user?.fullName ?? '')
  }, [])

  return {
    role,
    adminName,
    isSuper: role === 'super_admin',
    can: (permission: Permission) => can(role, permission),
  }
}
