'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createUser, type PlatformUser } from '@/lib/api'
import { ApiError } from '@/lib/api-client'

interface CreateUserDialogProps {
  open: boolean
  defaultRole?: 'client' | 'driver' | 'artisan'
  onClose: () => void
  onCreated: (user: PlatformUser) => void
}

const EMPTY = { fullName: '', phone: '', email: '', role: 'client' as 'client' | 'driver' | 'artisan' }

export function CreateUserDialog({ open, defaultRole, onClose, onCreated }: CreateUserDialogProps) {
  const [form, setForm] = useState({ ...EMPTY, role: defaultRole ?? 'client' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function set(field: keyof typeof form, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.fullName.trim()) { setError('Full name is required.'); return }
    if (!form.phone.trim()) { setError('Phone number is required.'); return }
    setError('')
    setLoading(true)
    try {
      const user = await createUser({
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        role: form.role,
      })
      setForm({ ...EMPTY, role: defaultRole ?? 'client' })
      onCreated(user)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create user.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) { setError(''); onClose() } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create User</DialogTitle>
          <DialogDescription>Manually add a new platform user account.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Full Name <span className="text-red-400">*</span></Label>
            <Input placeholder="e.g. Kwame Mensah" value={form.fullName} onChange={e => set('fullName', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone Number <span className="text-red-400">*</span></Label>
            <Input placeholder="+233 XX XXX XXXX" value={form.phone} onChange={e => set('phone', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email <span className="text-gray-400 text-xs font-normal">(optional)</span></Label>
            <Input type="email" placeholder="user@example.com" value={form.email} onChange={e => set('email', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Role <span className="text-red-400">*</span></Label>
            <Select value={form.role} onValueChange={v => set('role', v)}>
              <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="client">Client</SelectItem>
                <SelectItem value="driver">Driver</SelectItem>
                <SelectItem value="artisan">Artisan</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading} style={{ backgroundColor: '#F5A623' }} className="text-white">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create User'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
