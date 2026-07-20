'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { useRole } from '@/hooks/use-role'
import { verticalsForCategory, userLandingPath } from '@/lib/user-scope'
import { PageGuard } from '@/components/common/page-guard'
import { RoleGate } from '@/components/common/role-gate'
import Link from 'next/link'
import { Search, MoreHorizontal, UserX, Shield, RefreshCw, Users, RotateCcw, IdCard } from 'lucide-react'
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

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

type ActionType = 'suspend' | 'ban' | 'reinstate'

export default function UsersPage() {
  const router = useRouter()
  // Clients are an exact role-account surface. Category-scoped coordinators are
  // redirected to their own provider vertical.
  const { category, permissions } = useRole()
  const allowed = verticalsForCategory(category, permissions)
  const blocked = permissions !== null && !allowed.includes('clients')
  useEffect(() => {
    if (blocked) router.replace(userLandingPath(category, permissions))
  }, [blocked, category, permissions, router])

  const [users, setUsers] = useState<PlatformUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [actionDialog, setActionDialog] = useState<{ user: PlatformUser; type: ActionType } | null>(null)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [profileUser, setProfileUser] = useState<PlatformUser | null>(null)

  const load = useCallback(async (pg = page) => {
    setLoading(true)
    setError('')
    try {
      const res = await listUsers({
        role: 'client',
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
  }, [page, search])

  useEffect(() => {
    const t = setTimeout(() => load(1), 400)
    return () => clearTimeout(t)
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps
  useAutoRefresh(load)

  async function handleAction() {
    if (!actionDialog) return
    const { user, type } = actionDialog
    if (type !== 'reinstate' && reason.trim().length < 10) { setSubmitError('Reason must be at least 10 characters.'); return }
    setSubmitError('')
    setSubmitting(true)
    try {
      if (type === 'suspend') await suspendUser('client', user.roleAccountId, reason.trim())
      else if (type === 'ban') await banUser('client', user.roleAccountId, reason.trim())
      else if (type === 'reinstate') await reinstateUser('client', user.roleAccountId, reason.trim() || undefined)
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

  // While redirecting a category-scoped admin away, render nothing.
  if (blocked) return null

  return (
    <PageGuard permission="view_users">
    <div>
      <PageHeader
        title="Client Accounts"
        subtitle="Manage client accounts independently from driver and artisan accounts"
        actions={
          <Link href="/users/clients/kyc-queue">
            <Button size="sm" variant="outline" className="gap-2 border-amber-200 text-amber-700 hover:bg-amber-50">
              <IdCard className="h-4 w-4" /> Client KYC Queue
            </Button>
          </Link>
        }
      />

      <UserTabs active="clients" />

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input placeholder="Search by name, phone, email…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button variant="outline" size="sm" onClick={() => load(1)} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
        <div className="ml-auto text-sm text-gray-400">{total.toLocaleString()} clients total</div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Client</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Registered</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>KYC</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-gray-400">
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
                        <p className="text-xs text-gray-400">{u.email ?? 'No email'}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm font-mono">{u.phone}</TableCell>
                  <TableCell className="text-sm text-gray-500">{formatDate(u.createdAt)}</TableCell>
                  <TableCell><StatusBadge status={u.status} /></TableCell>
                  <TableCell><StatusBadge status={u.role === 'client' ? u.profile.kycStatus : 'not_started'} /></TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {u.role === 'client' ? (u.profile.preferredPaymentMethod ?? '-') : '-'}
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
            {loading ? 'Loading…' : `Page ${page} of ${totalPages} - ${total.toLocaleString()} clients`}
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
              {actionDialog?.type === 'reinstate' ? 'Reinstate client account' : actionDialog?.type === 'ban' ? 'Ban client account' : 'Suspend client account'} - {actionDialog?.user.fullName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {actionDialog?.type === 'ban' && (
              <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <strong>Client account only:</strong> This blocks this client account. Any driver or artisan account under the same phone identity remains untouched.
              </div>
            )}
            {actionDialog?.type !== 'ban' && (
              <div className="rounded-lg bg-blue-50 px-3 py-2.5 text-sm text-blue-700">
                This action affects only the client account. Driver and artisan sibling accounts remain untouched.
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
    </div>
    </PageGuard>
  )
}
