'use client'

import Link from 'next/link'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { getAdminUser } from '@/lib/api-client'
import { roleLabel } from '@/lib/roles'

/**
 * The signed-in admin's profile, read-only. Password changes live in ONE
 * place — Your account (/account) — so the same flow is never duplicated.
 * Opened from the header user menu.
 */
export function ProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const admin = getAdminUser()

  const fields: [string, string][] = [
    ['Full name', admin?.fullName ?? '-'],
    ['Email', admin?.email ?? '-'],
    ['Role', roleLabel(admin?.role)],
    ['Region', admin?.regionName ?? (admin?.regionScope ?? 'All regions')],
    ['Category', admin?.categoryScope ? (admin.categoryScope === 'rides' ? 'Rides' : 'Artisan services') : 'All'],
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Your profile</DialogTitle></DialogHeader>
        <div className="py-2 space-y-3">
          <div className="rounded-lg border border-gray-100 divide-y divide-gray-50">
            {fields.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between px-3 py-2">
                <span className="text-xs text-gray-400">{k}</span>
                <span className="text-sm text-gray-800 font-medium">{v}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400">
            Your details are managed by IT.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="brand" asChild>
            <Link href="/account" onClick={() => onOpenChange(false)}>Change password</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
