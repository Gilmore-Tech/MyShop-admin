'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { PageGuard } from '@/components/common/page-guard'
import { RoleGate } from '@/components/common/role-gate'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, MoreHorizontal, Loader2, RotateCcw, ShieldCheck } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { listUsers, suspendUser, banUser, reinstateUser, liftVerificationSuspension, type PlatformUser } from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { UserProfileSheet } from '@/components/users/user-profile-sheet'

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

type ActionType = 'suspend' | 'ban' | 'reinstate' | 'lift_verification'

export default function DriversPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
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
      role: 'driver',
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
      if (actionType === 'suspend') await suspendUser(actionUser.id, actionReason.trim())
      else if (actionType === 'ban') await banUser(actionUser.id, actionReason.trim())
      else if (actionType === 'reinstate') await reinstateUser(actionUser.id, actionReason.trim() || undefined)
      else if (actionType === 'lift_verification') {
        if (!actionUser.driver?.id) throw new Error('Driver profile missing on this user.')
        await liftVerificationSuspension(actionUser.driver.id, 'driver', actionReason.trim())
      }
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

  return (
    <PageGuard permission="view_users">
    <div>
      <PageHeader
        title="User Management"
        subtitle="Manage all platform users"
      />

      <Tabs defaultValue="drivers" className="mb-6">
        <TabsList className="bg-white">
          <TabsTrigger value="clients" asChild><Link href="/users/clients">Clients</Link></TabsTrigger>
          <TabsTrigger value="drivers" asChild><Link href="/users/drivers">Drivers</Link></TabsTrigger>
          <TabsTrigger value="artisans" asChild><Link href="/users/artisans">Artisans</Link></TabsTrigger>
        </TabsList>
      </Tabs>

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
        <div className="ml-auto text-sm text-gray-500">{total} drivers</div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Driver</TableHead>
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
                <TableCell colSpan={7} className="text-center py-12 text-gray-400 text-sm">No drivers found</TableCell>
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
                    <StatusBadge status={user.driver?.verificationStatus ?? 'pending'} />
                  </TableCell>
                  <TableCell>
                    {user.driver?.onlineStatus === 'online'
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
                        <DropdownMenuItem onSelect={() => router.push(`/rides?search=${encodeURIComponent(user.fullName)}`)}>
                          Ride History
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <RoleGate permission="lift_verification_suspension">
                          {user.driver?.verificationStatus === 'suspended' && (
                            <DropdownMenuItem
                              className="text-emerald-700 gap-2"
                              onSelect={() => openAction(user, 'lift_verification')}
                            >
                              <ShieldCheck className="h-4 w-4" /> Lift verification suspension
                            </DropdownMenuItem>
                          )}
                        </RoleGate>
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
            <DialogTitle className={
              actionType === 'ban' ? 'text-red-600'
              : actionType === 'reinstate' || actionType === 'lift_verification' ? 'text-emerald-700'
              : 'text-orange-600'
            }>
              {actionType === 'reinstate' ? 'Reinstate'
                : actionType === 'ban' ? 'Ban'
                : actionType === 'lift_verification' ? 'Lift verification suspension for'
                : 'Suspend'} {actionUser?.fullName}
            </DialogTitle>
            <DialogDescription>
              {actionType === 'reinstate'
                ? 'Restore this driver\'s access to the platform.'
                : actionType === 'ban'
                ? 'This will permanently ban the driver. They will not be able to log in again.'
                : actionType === 'lift_verification'
                ? 'Restores the driver to "approved" verification status, lifting an auto-suspension from the rating or cancellation engine. They\'ll be able to go online again.'
                : 'This will suspend the driver. You can reinstate them later.'
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
                : actionType === 'reinstate' || actionType === 'lift_verification'
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-orange-500 hover:bg-orange-600 text-white'
              }
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Confirm ${
                actionType === 'reinstate' ? 'Reinstatement'
                : actionType === 'ban' ? 'Ban'
                : actionType === 'lift_verification' ? 'Lift Suspension'
                : 'Suspension'
              }`}
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
