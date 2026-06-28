'use client'

import { useState, useEffect } from 'react'
import { getAdminUser } from '@/lib/api-client'
import { can, type Permission, type Role, type CategoryScope } from '@/lib/roles'

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

  return {
    permissions,
    adminName,
    role,
    // Region the admin is scoped to (null = global). `region.name` drives the
    // sidebar scope indicator and locked region filters.
    region,
    // Category the admin is scoped to ('rides' | 'artisan'); null = both/global.
    category,
    can: (permission: Permission) => can(permissions, permission),
    // The only account allowed to create admins and assign permissions: the
    // Product Owner. Keyed off the role when present, falling back to the
    // `manage_admins` permission for legacy/custom admins.
    isSuperAdmin: role === 'product_owner' || can(permissions, 'manage_admins'),
  }
}
