'use client'

import { useState, useEffect } from 'react'
import { KeyRound, CheckCircle2, Check, X, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { changeMyPassword } from '@/lib/api'
import { ApiError, getAdminUser, type AdminUser } from '@/lib/api-client'

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

// A single live-validation rule shown under the new-password field.
function Rule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-1.5 transition-colors ${ok ? 'text-green-600' : 'text-text-secondary'}`}>
      {ok ? <Check className="h-3.5 w-3.5 shrink-0" /> : <X className="h-3.5 w-3.5 shrink-0 text-gray-300" />}
      {label}
    </li>
  )
}

export default function AccountPage() {
  const [admin, setAdmin] = useState<AdminUser | null>(null)
  useEffect(() => { setAdmin(getAdminUser()) }, [])

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // ── Live validation
  const hasLength = newPw.length >= 8
  const hasLetter = /[a-zA-Z]/.test(newPw)
  const hasNumber = /[0-9]/.test(newPw)
  const isDifferent = newPw.length > 0 && newPw !== currentPw
  const matches = confirmPw.length > 0 && newPw === confirmPw
  const newPwValid = hasLength && hasLetter && hasNumber && isDifferent
  const canSubmit = currentPw.length > 0 && newPwValid && matches && !submitting

  async function handleSubmit() {
    setError('')
    setSuccess(false)
    if (!currentPw) { setError('Enter your current password.'); return }
    if (!hasLength) { setError('New password must be at least 8 characters.'); return }
    if (!hasLetter || !hasNumber) { setError('New password must include at least one letter and one number.'); return }
    if (!isDifferent) { setError('New password must be different from your current password.'); return }
    if (!matches) { setError('Passwords do not match.'); return }
    setSubmitting(true)
    try {
      await changeMyPassword(currentPw, newPw)
      setSuccess(true)
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center py-8">
      <div className="w-full max-w-md">
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          {/* Header band */}
          <div className="flex flex-col items-center gap-3 border-b border-gray-100 px-6 pt-7 pb-6">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary text-white text-lg font-bold">
                {admin ? initials(admin.fullName) : 'AU'}
              </AvatarFallback>
            </Avatar>
            <div className="text-center">
              <p className="text-base font-semibold text-text-primary">{admin?.fullName ?? 'Admin User'}</p>
              <p className="text-xs text-text-secondary">{admin?.email ?? ''}</p>
            </div>
          </div>

          {/* Change-password form */}
          <div className="px-6 py-6">
            <div className="mb-5 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-50">
                <KeyRound className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-text-primary leading-tight">Change Password</h2>
                <p className="text-xs text-text-secondary leading-tight">Update your account password</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Current password */}
              <div className="space-y-1.5">
                <Label>Current Password</Label>
                <div className="relative">
                  <Input
                    type={showCurrent ? 'text' : 'password'}
                    placeholder="Enter current password"
                    value={currentPw}
                    className="pr-10"
                    onChange={e => { setCurrentPw(e.target.value); setSuccess(false); setError('') }}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowCurrent(s => !s)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                    aria-label={showCurrent ? 'Hide password' : 'Show password'}
                  >
                    {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* New password */}
              <div className="space-y-1.5">
                <Label>New Password</Label>
                <div className="relative">
                  <Input
                    type={showNew ? 'text' : 'password'}
                    placeholder="Enter new password"
                    value={newPw}
                    className="pr-10"
                    onChange={e => { setNewPw(e.target.value); setSuccess(false); setError('') }}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowNew(s => !s)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                    aria-label={showNew ? 'Hide password' : 'Show password'}
                  >
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {newPw.length > 0 && (
                  <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <Rule ok={hasLength} label="At least 8 characters" />
                    <Rule ok={hasLetter} label="Contains a letter" />
                    <Rule ok={hasNumber} label="Contains a number" />
                    <Rule ok={isDifferent} label="Different from current" />
                  </ul>
                )}
              </div>

              {/* Confirm password */}
              <div className="space-y-1.5">
                <Label>Confirm New Password</Label>
                <Input
                  type={showNew ? 'text' : 'password'}
                  placeholder="Repeat new password"
                  value={confirmPw}
                  onChange={e => { setConfirmPw(e.target.value); setSuccess(false); setError('') }}
                />
                {confirmPw.length > 0 && !matches && (
                  <p className="text-xs text-red-600">Passwords do not match.</p>
                )}
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
              )}
              {success && (
                <div className="flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Password changed successfully.
                </div>
              )}

              <Button
                disabled={!canSubmit}
                onClick={handleSubmit}
                className="w-full text-white"
                style={{ backgroundColor: '#F5A623' }}
              >
                {submitting ? 'Saving…' : 'Change Password'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
