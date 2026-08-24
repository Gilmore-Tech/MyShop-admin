'use client'

import { type Permission } from '@/lib/roles'
import { useRole } from '@/hooks/use-role'
import { AccessDenied } from './access-denied'

interface PageGuardProps {
  /** One permission, or several of which holding ANY grants access. */
  permission: Permission | Permission[]
  children: React.ReactNode
}

/**
 * Full-page access guard. Renders AccessDenied when the current admin lacks
 * the permission (or, given an array, lacks every one of them - any-of).
 * Wrap the page content (not the layout) with this component.
 */
export function PageGuard({ permission, children }: PageGuardProps) {
  const { can, permissions } = useRole()

  // permissions is null on first SSR render - wait until hydration resolves
  if (permissions === null) return null

  const allowed = Array.isArray(permission) ? permission.some(p => can(p)) : can(permission)
  if (!allowed) return <AccessDenied />

  return <>{children}</>
}
