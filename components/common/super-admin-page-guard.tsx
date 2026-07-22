'use client'

import { useRole } from '@/hooks/use-role'
import { AccessDenied } from './access-denied'

export function SuperAdminPageGuard({ children }: { children: React.ReactNode }) {
  const { permissions, isSuperAdmin } = useRole()
  if (permissions === null) return null
  if (!isSuperAdmin) return <AccessDenied />
  return <>{children}</>
}
