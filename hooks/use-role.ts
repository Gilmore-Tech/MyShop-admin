'use client'

import { useState, useEffect } from 'react'
import { getAdminUser } from '@/lib/api-client'
import {
  can,
  effectiveAdminPermissions,
  isSuperAdminRole,
  type Permission,
  type Role,
  type CategoryScope,
} from '@/lib/roles'

export function useRole() {
  const [permissions, setPermissions] = useState<Permission[] | null>(() => {
    if (typeof window === 'undefined') return null
    return getAdminUser()?.permissions ?? null
  })
  const [adminName, setAdminName] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return getAdminUser()?.fullName ?? ''
  })
  const [role, setRole] = useState<Role | null>(() => {
    if (typeof window === 'undefined') return null
    return getAdminUser()?.role ?? null
  })
  const [region, setRegion] = useState<{ id: string | null; name: string | null }>(() => {
    if (typeof window === 'undefined') return { id: null, name: null }
    const u = getAdminUser()
    return { id: u?.regionId ?? null, name: u?.regionName ?? null }
  })
  const [category, setCategory] = useState<CategoryScope | null>(() => {
    if (typeof window === 'undefined') return null
    return getAdminUser()?.categoryScope ?? null
  })

  useEffect(() => {
    const user = getAdminUser()
    setPermissions(user?.permissions ?? null)
    setAdminName(user?.fullName ?? '')
    setRole(user?.role ?? null)
    setRegion({ id: user?.regionId ?? null, name: user?.regionName ?? null })
    setCategory(user?.categoryScope ?? null)
  }, [])

  const isSuperAdmin = isSuperAdminRole(role)
  const effectivePermissions: Permission[] | null = permissions === null
    ? null
    : effectiveAdminPermissions(role, permissions)
  const canAccess = (permission: Permission) => can(effectivePermissions, permission)

  return {
    permissions: effectivePermissions,
    adminName,
    role,
    // Region the admin is scoped to (null = global). `region.name` drives the
    // sidebar scope indicator and locked region filters.
    region,
    // Category the admin is scoped to ('rides' | 'artisan'); null = both/global.
    category,
    can: canAccess,
    // The named root account. A custom `manage_admins` grant does not turn an
    // otherwise scoped administrator into a platform-wide Super Admin.
    isSuperAdmin,
  }
}
