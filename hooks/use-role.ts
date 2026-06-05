'use client'

import { useState, useEffect } from 'react'
import { getAdminUser } from '@/lib/api-client'
import { can, type Permission } from '@/lib/roles'

export function useRole() {
  const [permissions, setPermissions] = useState<Permission[] | null>(() => {
    if (typeof window === 'undefined') return null
    return getAdminUser()?.permissions ?? null
  })
  const [adminName, setAdminName] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return getAdminUser()?.fullName ?? ''
  })

  useEffect(() => {
    const user = getAdminUser()
    setPermissions(user?.permissions ?? null)
    setAdminName(user?.fullName ?? '')
  }, [])

  return {
    permissions,
    adminName,
    can: (permission: Permission) => can(permissions, permission),
  }
}
