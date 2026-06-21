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
  const [superFlag, setSuperFlag] = useState<boolean | undefined>(() => {
    if (typeof window === 'undefined') return undefined
    return getAdminUser()?.isSuperAdmin
  })

  useEffect(() => {
    const user = getAdminUser()
    setPermissions(user?.permissions ?? null)
    setAdminName(user?.fullName ?? '')
    setSuperFlag(user?.isSuperAdmin)
  }, [])

  return {
    permissions,
    adminName,
    can: (permission: Permission) => can(permissions, permission),
    // Effective "root" admin: the only account allowed to create admins and
    // assign permissions. Uses the explicit backend flag when present; until the
    // backend ships `isSuperAdmin`, falls back to the legacy `manage_admins`
    // holder so the page keeps working. See docs/backend-requests.md §8.
    isSuperAdmin: superFlag ?? can(permissions, 'manage_admins'),
  }
}
