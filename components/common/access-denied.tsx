'use client'

import Link from 'next/link'
import { ShieldX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ROLE_LABELS } from '@/lib/roles'
import { useRole } from '@/hooks/use-role'

export function AccessDenied() {
  const { role } = useRole()

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
        <ShieldX className="h-8 w-8 text-red-400" />
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Access Denied</h2>
      <p className="text-sm text-gray-500 mb-1">
        You don&apos;t have permission to view this page.
      </p>
      {role && (
        <p className="text-xs text-gray-400 mb-6">
          Your role: <span className="font-medium text-gray-600">{ROLE_LABELS[role]}</span>
        </p>
      )}
      <Button asChild variant="outline" size="sm">
        <Link href="/dashboard">Go to Dashboard</Link>
      </Button>
    </div>
  )
}
