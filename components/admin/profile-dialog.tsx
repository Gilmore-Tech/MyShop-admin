'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getAdminUser, ApiError } from '@/lib/api-client'
import { changeOwnPassword } from '@/lib/api'
import { roleLabel } from '@/lib/roles'

/**
 * The signed-in admin's profile. Everything is locked/read-only except the
 * password, which they can change here. Opened from the header user menu.
 */
export function ProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const admin = getAdminUser()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleChange() {
    setError(''); setSuccess('')
    if (next.length < 8) { setError('New password must be at least 8 characters.'); return }
    if (next !== confirm) { setError('Passwords do not match.'); return }
    setSaving(true)
    try {
      await changeOwnPassword(current, next)
      setSuccess('Password updated.')
      setCurrent(''); setNext(''); setConfirm('')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to update password.')
    } finally {
      setSaving(false)
    }
  }

  const fields: [string, string][] = [
    ['Full name', admin?.fullName ?? '-'],
    ['Email', admin?.email ?? '-'],
    ['Role', roleLabel(admin?.role)],
    ['Region', admin?.regionName ?? (admin?.regionScope ?? 'All regions')],
    ['Category', admin?.categoryScope ? (admin.categoryScope === 'rides' ? 'Rides' : 'Artisan') : 'All'],
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>My Profile</DialogTitle></DialogHeader>
        <div className="py-2 space-y-4">
          <div className="rounded-lg border border-gray-100 divide-y divide-gray-50">
            {fields.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between px-3 py-2">
                <span className="text-xs text-gray-400">{k}</span>
                <span className="text-sm text-gray-800 font-medium">{v}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400">
            Your details are managed by IT. You can change your password below.
          </p>
          <div className="space-y-2.5">
            <div className="space-y-1.5">
              <Label>Current password</Label>
              <Input type="password" value={current} onChange={e => setCurrent(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>New password</Label>
              <Input type="password" placeholder="Min 8 characters" value={next} onChange={e => setNext(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm new password</Label>
              <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            {success && <p className="text-xs text-emerald-600">{success}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            disabled={saving || !current || !next}
            onClick={handleChange}
            className="text-white"
            style={{ backgroundColor: '#F5A623' }}
          >
            {saving ? 'Updating…' : 'Update Password'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
