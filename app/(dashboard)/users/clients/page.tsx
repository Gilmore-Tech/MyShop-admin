'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { PageGuard } from '@/components/common/page-guard'
import { RoleGate } from '@/components/common/role-gate'
import Link from 'next/link'
import { Search, MoreHorizontal, UserX, Shield, RefreshCw, Users, UserPlus, RotateCcw, IdCard, CheckCircle2, CircleDashed } from 'lucide-react'
import { UserTabs } from '@/components/users/user-tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { listUsers, suspendUser, banUser, reinstateUser, type PlatformUser } from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { UserProfileSheet } from '@/components/users/user-profile-sheet'
import { CreateUserDialog } from '@/components/users/create-user-dialog'

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Whether a user finished registration. The backend has no dedicated flag yet
// (see docs/backend-requests.md §4), so we DERIVE it from the user payload:
// a finished registration has a name, at least one role, and the profile row for
// each claimed role populated, and is not parked in `pending`. If/when the backend
// adds `registrationComplete`, that authoritative value wins automatically.
function isRegistrationComplete(u: PlatformUser): boolean {
  if (u.registrationComplete != null) return u.registrationComplete
  if (u.status === 'pending') return false
  if (!u.fullName?.trim()) return false
  if (u.roles.length === 0) return false
  return u.roles.every(r =>
    r === 'client'  ? u.client  != null :
    r === 'driver'  ? u.driver  != null :
    r === 'artisan' ? u.artisan != null :
    true, // unknown role types don't block completion
  )
}

function RegistrationCell({ user }: { user: PlatformUser }) {
  const complete = isRegistrationComplete(user)
  // Tooltip notes the source so admins know derived vs. backend-reported.
  const derived = user.registrationComplete == null
  if (complete) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700"
        title={user.registrationCompletedAt ? `Completed ${formatDate(user.registrationCompletedAt)}` : derived ? 'Registration complete (derived from profile)' : 'Registration completed'}
      >
        <CheckCircle2 className="h-3.5 w-3.5" /> Completed
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700"
      title={derived ? 'Registration incomplete (derived from profile)' : 'Registration not finished'}
    >
      <CircleDashed className="h-3.5 w-3.5" /> Incomplete
    </span>
  )
}

type ActionType = 'suspend' | 'ban' | 'reinstate'

export default function UsersPage() {
  const [users, setUsers] = useState<PlatformUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [actionDialog, setActionDialog] = useState<{ user: PlatformUser; type: ActionType } | null>(null)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [profileUser, setProfileUser] = useState<PlatformUser | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const load = useCallback(async (pg = page) => {
    setLoading(true)
    setError('')
    try {
      const res = await listUsers({
        role: roleFilter === 'all' ? undefined : roleFilter,
        search: search || undefined,
        page: pg,
        limit: 50,
      })
      setUsers(res.items)
      setTotal(res.total)
      setTotalPages(res.totalPages)
      setPage(pg)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load users.')
    } finally {
      setLoading(false)
    }
  }, [page, roleFilter, search])

  useEffect(() => {
    const t = setTimeout(() => load(1), 400)
    return () => clearTimeout(t)
  }, [search, roleFilter]) // eslint-disable-line react-hooks/exhaustive-deps
  useAutoRefresh(load)

  async function handleAction() {
    if (!actionDialog) return
    const { user, type } = actionDialog
    if (type !== 'reinstate' && reason.trim().length < 10) { setSubmitError('Reason must be at least 10 characters.'); return }
    setSubmitError('')
    setSubmitting(true)
    try {
      if (type === 'suspend') await suspendUser(user.id, reason.trim())
      else if (type === 'ban') await banUser(user.id, reason.trim())
      else if (type === 'reinstate') await reinstateUser(user.id, reason.trim() || undefined)
      setActionDialog(null)
      setReason('')
      await load(page)
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Action failed.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleProfileUpdate(updated: PlatformUser) {
    setUsers(prev => prev.map(u => u.id === updated.id ? updated : u))
    setProfileUser(updated)
  }

  return (
    <PageGuard permission="view_users">
    <div>
      <PageHeader
        title="User Management"
        subtitle="Manage all platform users"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/users/clients/kyc-queue">
              <Button size="sm" variant="outline" className="gap-2 border-amber-200 text-amber-700 hover:bg-amber-50">
                <IdCard className="h-4 w-4" /> Client KYC Queue
              </Button>
            </Link>
            <Button size="sm" className="gap-2 text-white" style={{ backgroundColor: '#F5A623' }} onClick={() => setCreateOpen(true)}>
              <UserPlus className="h-4 w-4" /> Add User
            </Button>
          </div>
        }
      />

      <UserTabs active="all" />

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input placeholder="Search by name, phone, email…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {(['all', 'client', 'driver', 'artisan'] as const).map(r => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                roleFilter === r ? 'text-white' : 'text-gray-500 bg-white hover:bg-gray-50'
              }`}
              style={roleFilter === r ? { backgroundColor: '#F5A623' } : {}}
            >
              {r === 'all' ? 'All Roles' : r.charAt(0).toUpperCase() + r.slice(1) + 's'}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => load(1)} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
        <div className="ml-auto text-sm text-gray-400">{total.toLocaleString()} users total</div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>User</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Registered</TableHead>
              <TableHead>Registration</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Loyalty Pts</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-gray-400">
                  <Users className="h-8 w-8 mx-auto mb-2 text-gray-200" />
                  {search ? 'No users match your search.' : 'No users found.'}
                </TableCell>
              </TableRow>
            ) : (
              users.map(u => (
                <TableRow key={u.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setProfileUser(u)}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-gray-100 text-gray-600 text-xs font-bold">
                          {initials(u.fullName)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm text-gray-900">{u.fullName}</p>
                        <p className="text-xs text-gray-400 font-mono">{u.email ?? u.id.slice(0, 8) + '…'}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm font-mono">{u.phone}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {u.roles.map(r => (
                        <span key={r} className="text-[11px] px-1.5 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600">
                          {r}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">{formatDate(u.createdAt)}</TableCell>
                  <TableCell><RegistrationCell user={u} /></TableCell>
                  <TableCell><StatusBadge status={u.status} /></TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {u.client ? u.client.loyaltyPointsBalance.toLocaleString() : '-'}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {u.client?.preferredPaymentMethod ?? '-'}
                  </TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setProfileUser(u)}>View Profile</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <RoleGate permission="suspend_user">
                          {u.status === 'suspended' && (
                            <DropdownMenuItem
                              className="gap-2 text-emerald-700"
                              onSelect={() => { setActionDialog({ user: u, type: 'reinstate' }); setReason(''); setSubmitError('') }}
                            >
                              <RotateCcw className="h-4 w-4" /> Reinstate
                            </DropdownMenuItem>
                          )}
                          {u.status !== 'suspended' && u.status !== 'banned' && (
                            <DropdownMenuItem
                              className="gap-2 text-orange-600"
                              onSelect={() => { setActionDialog({ user: u, type: 'suspend' }); setReason(''); setSubmitError('') }}
                            >
                              <UserX className="h-4 w-4" /> Suspend
                            </DropdownMenuItem>
                          )}
                        </RoleGate>
                        <RoleGate permission="ban_user">
                          {u.status !== 'banned' && (
                            <DropdownMenuItem
                              className="gap-2 text-red-600"
                              onSelect={() => { setActionDialog({ user: u, type: 'ban' }); setReason(''); setSubmitError('') }}
                            >
                              <Shield className="h-4 w-4" /> Ban Permanently
                            </DropdownMenuItem>
                          )}
                        </RoleGate>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
          <p className="text-xs text-gray-400">
            {loading ? 'Loading…' : `Page ${page} of ${totalPages} - ${total.toLocaleString()} users`}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => load(page - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => load(page + 1)}>Next</Button>
          </div>
        </div>
      </div>

      {/* Action Dialog */}
      <Dialog open={!!actionDialog} onOpenChange={open => { if (!open) setActionDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className={actionDialog?.type === 'ban' ? 'text-red-600' : actionDialog?.type === 'reinstate' ? 'text-emerald-700' : 'text-orange-600'}>
              {actionDialog?.type === 'reinstate' ? 'Reinstate' : actionDialog?.type === 'ban' ? 'Ban User Permanently' : 'Suspend User'} - {actionDialog?.user.fullName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {actionDialog?.type === 'ban' && (
              <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <strong>Warning:</strong> This will permanently ban the user and block all future access.
              </div>
            )}
            <div className="space-y-1.5">
              <Label>
                Reason{' '}
                <span className="text-gray-400 text-xs">
                  {actionDialog?.type === 'reinstate' ? '(optional)' : '(min 10 characters)'}
                </span>
              </Label>
              <Textarea
                placeholder="Describe the reason for this action…"
                rows={3}
                value={reason}
                onChange={e => setReason(e.target.value)}
              />
              {actionDialog?.type !== 'reinstate' && (
                <p className={`text-xs ${reason.length >= 10 ? 'text-emerald-600' : 'text-gray-400'}`}>
                  {reason.length}/10 characters minimum
                </p>
              )}
            </div>
            {submitError && <p className="text-xs text-red-600">{submitError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>Cancel</Button>
            <Button
              disabled={reason.length < (actionDialog?.type === 'reinstate' ? 0 : 10) || submitting}
              onClick={handleAction}
              className={actionDialog?.type === 'ban'
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : actionDialog?.type === 'reinstate'
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-orange-500 hover:bg-orange-600 text-white'
              }
            >
              {submitting ? 'Processing…' : `Confirm ${actionDialog?.type === 'reinstate' ? 'Reinstatement' : actionDialog?.type === 'ban' ? 'Ban' : 'Suspension'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UserProfileSheet
        user={profileUser}
        onClose={() => setProfileUser(null)}
        onUpdate={handleProfileUpdate}
      />

      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={user => { setUsers(prev => [user, ...prev]); setTotal(t => t + 1) }}
      />
    </div>
    </PageGuard>
  )
}
