'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { useRole } from '@/hooks/use-role'
import { verticalsForCategory, userLandingPath } from '@/lib/user-scope'
import { PageGuard } from '@/components/common/page-guard'
import { RoleGate } from '@/components/common/role-gate'
import { UserTabs } from '@/components/users/user-tabs'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, MoreHorizontal, Loader2, RotateCcw } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { listUsers, suspendUser, banUser, reinstateUser, type PlatformUser } from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { UserProfileSheet } from '@/components/users/user-profile-sheet'

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

type ActionType = 'suspend' | 'ban' | 'reinstate'

export default function ArtisansPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Category scope decides which user verticals this admin may browse. A rides
  // coordinator has no business on the artisans list — bounce them.
  const { category, permissions } = useRole()
  const allowed = verticalsForCategory(category, permissions)
  const blocked = permissions !== null && !allowed.includes('artisans')
  useEffect(() => {
    if (blocked) router.replace(userLandingPath(category, permissions))
  }, [blocked, category, permissions, router])
  const [users, setUsers] = useState<PlatformUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  const [profileUser, setProfileUser] = useState<PlatformUser | null>(null)

  const [actionUser, setActionUser] = useState<PlatformUser | null>(null)
  const [actionType, setActionType] = useState<ActionType | null>(null)
  const [actionReason, setActionReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')

  const LIMIT = 50

  const fetchUsers = useCallback(() => {
    setLoading(true)
    listUsers({
      role: 'artisan',
      status: statusFilter === 'all' ? undefined : statusFilter,
      search: search || undefined,
      page,
      limit: LIMIT,
    })
      .then(res => {
        setUsers(res.items)
        setTotal(res.total)
        setTotalPages(res.totalPages)
      })
      .catch(() => setUsers([]))
      .finally(() => setLoading(false))
  }, [statusFilter, search, page])

  useEffect(() => { fetchUsers() }, [fetchUsers])
  useAutoRefresh(fetchUsers)
  useEffect(() => { setPage(1) }, [statusFilter, search])

  function openAction(user: PlatformUser, type: ActionType) {
    setActionUser(user)
    setActionType(type)
    setActionReason('')
    setActionError('')
  }

  async function handleAction() {
    if (!actionUser || !actionType) return
    if (actionType !== 'reinstate' && actionReason.trim().length < 10) {
      setActionError('Reason must be at least 10 characters.')
      return
    }
    setActionLoading(true)
    setActionError('')
    try {
      if (actionType === 'suspend') await suspendUser('artisan', actionUser.roleAccountId, actionReason.trim())
      else if (actionType === 'ban') await banUser('artisan', actionUser.roleAccountId, actionReason.trim())
      else if (actionType === 'reinstate') await reinstateUser('artisan', actionUser.roleAccountId, actionReason.trim() || undefined)
      setActionUser(null)
      setActionType(null)
      setActionReason('')
      fetchUsers()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Action failed. Please try again.')
    } finally {
      setActionLoading(false)
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
        title="Artisan Accounts"
        subtitle="Manage artisan accounts independently from client and driver accounts"
      />

      <UserTabs active="artisans" />

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
          <Input placeholder="Search by name, phone…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 bg-white"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="banned">Banned</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-sm text-gray-500">{total} artisans</div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Artisan</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Registered</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Verification</TableHead>
              <TableHead>Online Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(8)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(7)].map((_, j) => (
                    <TableCell key={j}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-gray-400 text-sm">No artisans found</TableCell>
              </TableRow>
            ) : (
              users.map(user => (
                <TableRow key={user.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setProfileUser(user)}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-gray-100 text-gray-600 text-xs font-bold">
                          {initials(user.fullName)}
                        </AvatarFallback>
                      </Avatar>
                      <p className="font-medium text-sm text-gray-900">{user.fullName}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-gray-500 font-mono">{user.phone}</TableCell>
                  <TableCell className="text-sm text-gray-500">{formatDate(user.createdAt)}</TableCell>
                  <TableCell><StatusBadge status={user.status} /></TableCell>
                  <TableCell>
                    <StatusBadge status={user.role === 'artisan' ? user.profile.verificationStatus : 'pending'} />
                  </TableCell>
                  <TableCell>
                    {user.role === 'artisan' && user.profile.onlineStatus === 'online'
                      ? <span className="flex items-center gap-1.5 text-xs text-gray-600 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-gray-400" />Online</span>
                      : <span className="text-xs text-gray-400">Offline</span>
                    }
                  </TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setProfileUser(user)}>View Profile</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => router.push(`/artisan-jobs?search=${encodeURIComponent(user.fullName)}`)}>
                          Job History
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <RoleGate permission="suspend_user">
                          {user.status === 'suspended' && (
                            <DropdownMenuItem className="text-emerald-700 gap-2" onSelect={() => openAction(user, 'reinstate')}>
                              <RotateCcw className="h-4 w-4" /> Reinstate
                            </DropdownMenuItem>
                          )}
                          {user.status !== 'suspended' && user.status !== 'banned' && (
                            <DropdownMenuItem className="text-orange-600" onSelect={() => openAction(user, 'suspend')}>
                              Suspend
                            </DropdownMenuItem>
                          )}
                        </RoleGate>
                        <RoleGate permission="ban_user">
                          {user.status !== 'banned' && (
                            <DropdownMenuItem className="text-red-600" onSelect={() => openAction(user, 'ban')}>
                              Ban
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
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
          <p className="text-xs text-gray-500">
            {loading ? <Loader2 className="h-3 w-3 animate-spin inline" /> : `Page ${page} of ${totalPages} (${total} total)`}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      </div>

      {/* Action dialog */}
      <Dialog open={!!actionUser} onOpenChange={open => { if (!open) { setActionUser(null); setActionType(null); setActionReason('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className={actionType === 'ban' ? 'text-red-600' : actionType === 'reinstate' ? 'text-emerald-700' : 'text-orange-600'}>
              {actionType === 'reinstate' ? 'Reinstate artisan account' : actionType === 'ban' ? 'Ban artisan account' : 'Suspend artisan account'} {actionUser?.fullName}
            </DialogTitle>
            <DialogDescription>
              {actionType === 'reinstate'
                ? 'Restore only this artisan account. Client and driver sibling accounts remain untouched.'
                : actionType === 'ban'
                ? 'This bans only the artisan account. Client and driver sibling accounts remain untouched.'
                : 'This suspends only the artisan account. Client and driver sibling accounts remain untouched.'
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <textarea
              className="w-full rounded-lg border border-gray-200 text-sm px-3 py-2 h-24 resize-none focus:outline-none focus:ring-2 focus:ring-orange-200"
              placeholder={actionType === 'reinstate' ? 'Reason (optional)…' : 'Reason (min 10 characters)…'}
              value={actionReason}
              onChange={e => { setActionReason(e.target.value); setActionError('') }}
            />
            {actionError && <p className="text-xs text-red-600">{actionError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActionUser(null); setActionType(null) }}>Cancel</Button>
            <Button
              disabled={actionLoading || (actionType !== 'reinstate' && actionReason.trim().length < 10)}
              onClick={handleAction}
              className={actionType === 'ban'
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : actionType === 'reinstate'
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-orange-500 hover:bg-orange-600 text-white'
              }
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Confirm ${actionType === 'reinstate' ? 'Reinstatement' : actionType === 'ban' ? 'Ban' : 'Suspension'}`}
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
