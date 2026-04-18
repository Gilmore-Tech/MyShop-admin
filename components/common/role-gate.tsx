'use client'

import { type Permission } from '@/lib/roles'
import { useRole } from '@/hooks/use-role'

interface RoleGateProps {
  permission: Permission
  children: React.ReactNode
  fallback?: React.ReactNode
}

/**
 * Conditionally renders children only if the current admin has the given permission.
 * Use for inline UI elements (buttons, menu items).
 * For full-page access control use PageGuard.
 */
export function RoleGate({ permission, children, fallback = null }: RoleGateProps) {
  const { can } = useRole()
  return can(permission) ? <>{children}</> : <>{fallback}</>
}
