'use client'

import { type Permission } from '@/lib/roles'
import { useRole } from '@/hooks/use-role'
import { AccessDenied } from './access-denied'

interface PageGuardProps {
  permission: Permission
  children: React.ReactNode
}

/**
 * Full-page access guard. Renders AccessDenied when the current admin lacks the permission.
 * Wrap the page content (not the layout) with this component.
 */
export function PageGuard({ permission, children }: PageGuardProps) {
  const { can, permissions } = useRole()

  // permissions is null on first SSR render — wait until hydration resolves
  if (permissions === null) return null

  if (!can(permission)) return <AccessDenied />

  return <>{children}</>
}
