'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { useRole } from '@/hooks/use-role'
import { verticalsForCategory, userLandingPath } from '@/lib/user-scope'
import { PageGuard } from '@/components/common/page-guard'
import { RoleGate } from '@/components/common/role-gate'
import { UserTabs } from '@/components/users/user-tabs'
import { useRouter, useSearchParams } from 'next/navigation'
import { Car, RotateCcw } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { DataTable, AvatarCell } from '@/components/common/data-table'
import { FilterBar, FilterSearch } from '@/components/common/filter-bar'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { EmptyState } from '@/components/common/empty-state'
import { formatDate } from '@/lib/format-date'
import { listUsers, suspendUser, banUser, reinstateUser, type PlatformUser } from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { UserProfileSheet } from '@/components/users/user-profile-sheet'

// Vehicle-detail completeness badge. `complete` is the server-computed
// `vehicleDetailsComplete` flag; when undefined (older API build that doesn't
// return it) we render a neutral dash rather than a misleading "Missing".
// Styled to match StatusBadge's neutral pill so every badge on the table
// reads the same way.
function VehicleBadge({ complete }: { complete: boolean | undefined }) {
  if (complete === undefined) return <span className="text-gray-300">-</span>
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap bg-gray-100 text-gray-600">
      {complete ? 'Complete' : 'Missing'}
    </span>
  )
}

type ActionType = 'suspend' | 'ban' | 'reinstate'

const PAGE_SIZE = 50
// The account-action API enforces a 10-character minimum on suspend/ban
// reasons (higher than ConfirmDialog's 5-character default), so it is passed
// through explicitly. Reinstate reasons stay optional, as before.
const REASON_MIN = 10

function actionCopy(type: ActionType, name: string) {
  if (type === 'ban') {
    return {
      title: `Ban ${name}'s driver account?`,
      description: 'This bans only the driver account. Client and artisan sibling accounts remain untouched.',
      confirmLabel: `Ban ${name}`,
    }
  }
  if (type === 'reinstate') {
    return {
      title: `Reinstate ${name}'s driver account?`,
      description: 'Restores only this driver account. Client and artisan sibling accounts remain untouched.',
      confirmLabel: `Reinstate ${name}`,
    }
  }
  return {
    title: `Suspend ${name}'s driver account?`,
    description: 'This suspends only the driver account. Client and artisan sibling accounts remain untouched.',
    confirmLabel: `Suspend ${name}`,
  }
}

export default function DriversPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Category scope decides which user verticals this admin may browse. An
  // artisan coordinator has no business on the drivers list - bounce them.
  const { category, permissions } = useRole()
  const allowed = verticalsForCategory(category, permissions)
  const blocked = permissions !== null && !allowed.includes('drivers')
  useEffect(() => {
    if (blocked) router.replace(userLandingPath(category, permissions))
  }, [blocked, category, permissions, router])
  const [users, setUsers] = useState<PlatformUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '')
  const [statusFilter, setStatusFilter] = useState('all')
  const [vehicleFilter, setVehicleFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [profileUser, setProfileUser] = useState<PlatformUser | null>(null)

  const [actionUser, setActionUser] = useState<PlatformUser | null>(null)
  const [actionType, setActionType] = useState<ActionType | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')

  const fetchUsers = useCallback(() => {
    setLoading(true)
    setError('')
    listUsers({
      role: 'driver',
      status: statusFilter === 'all' ? undefined : statusFilter,
      search: search || undefined,
      missingVehicleDetails: vehicleFilter === 'missing' ? true : undefined,
      page,
      limit: PAGE_SIZE,
    })
      .then(res => {
        setUsers(res.items)
        setTotal(res.total)
      })
      .catch(err => {
        setUsers([])
        setError(err instanceof ApiError ? err.message : 'Failed to load drivers.')
      })
      .finally(() => setLoading(false))
  }, [statusFilter, search, vehicleFilter, page])

  useEffect(() => { fetchUsers() }, [fetchUsers])
  useAutoRefresh(fetchUsers)
  useEffect(() => { setPage(1) }, [statusFilter, search, vehicleFilter])

  function openAction(user: PlatformUser, type: ActionType) {
    setActionUser(user)
    setActionType(type)
    setActionError('')
  }

  async function handleAction(reason: string) {
    if (!actionUser || !actionType) return
    setActionLoading(true)
    setActionError('')
    try {
      if (actionType === 'suspend') await suspendUser('driver', actionUser.roleAccountId, reason)
      else if (actionType === 'ban') await banUser('driver', actionUser.roleAccountId, reason)
      else if (actionType === 'reinstate') await reinstateUser('driver', actionUser.roleAccountId, reason || undefined)
      setActionUser(null)
      setActionType(null)
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
          title="Drivers"
          subtitle="Driver accounts and standing"
          tabs={<UserTabs active="drivers" />}
        />

        <FilterBar onRefresh={fetchUsers} refreshing={loading} meta={`${total.toLocaleString()} drivers`}>
          <FilterSearch value={search} onChange={setSearch} placeholder="Search by name, phone" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-36 bg-white"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="banned">Banned</SelectItem>
            </SelectContent>
          </Select>
          <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
            <SelectTrigger className="h-9 w-44 bg-white"><SelectValue placeholder="Vehicle" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vehicles</SelectItem>
              <SelectItem value="missing">Missing details</SelectItem>
            </SelectContent>
          </Select>
        </FilterBar>

        <DataTable<PlatformUser>
          columns={[
            {
              key: 'driver',
              header: 'Driver',
              render: row => <AvatarCell name={row.fullName} />,
            },
            {
              key: 'phone',
              header: 'Phone',
              render: row => <span className="font-mono">{row.phone}</span>,
            },
            {
              key: 'registered',
              header: 'Registered',
              render: row => formatDate(row.createdAt),
            },
            {
              key: 'status',
              header: 'Status',
              render: row => <StatusBadge status={row.status} />,
            },
            {
              key: 'verification',
              header: 'Verification',
              render: row => <StatusBadge status={row.role === 'driver' ? row.profile.verificationStatus : 'pending'} />,
            },
            {
              key: 'vehicle',
              header: 'Vehicle',
              render: row => <VehicleBadge complete={row.role === 'driver' ? row.profile.vehicleDetailsComplete : undefined} />,
            },
            {
              key: 'online',
              header: 'Online status',
              render: row => row.role === 'driver' && row.profile.onlineStatus === 'online'
                ? <span className="flex items-center gap-1.5 text-xs text-gray-600 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-gray-400" />Online</span>
                : <span className="text-xs text-gray-400">Offline</span>,
            },
          ]}
          rows={users}
          rowKey={row => row.id}
          loading={loading}
          error={error || null}
          onRetry={fetchUsers}
          onRowClick={row => setProfileUser(row)}
          rowAriaLabel={row => `View ${row.fullName}'s profile`}
          rowMenu={row => (
            <>
              <DropdownMenuItem onSelect={() => setProfileUser(row)}>View profile</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push(`/rides?search=${encodeURIComponent(row.fullName)}`)}>
                Ride history
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <RoleGate permission="suspend_user">
                {row.status === 'suspended' && (
                  <DropdownMenuItem className="text-emerald-700 gap-2" onSelect={() => openAction(row, 'reinstate')}>
                    <RotateCcw className="h-4 w-4" /> Reinstate
                  </DropdownMenuItem>
                )}
                {row.status !== 'suspended' && row.status !== 'banned' && (
                  <DropdownMenuItem className="text-orange-600" onSelect={() => openAction(row, 'suspend')}>
                    Suspend
                  </DropdownMenuItem>
                )}
              </RoleGate>
              <RoleGate permission="ban_user">
                {row.status !== 'banned' && (
                  <DropdownMenuItem className="text-red-600" onSelect={() => openAction(row, 'ban')}>
                    Ban
                  </DropdownMenuItem>
                )}
              </RoleGate>
            </>
          )}
          empty={
            <EmptyState
              icon={Car}
              title={search || statusFilter !== 'all' || vehicleFilter !== 'all' ? 'No matches' : 'No drivers yet'}
              description={search || statusFilter !== 'all' || vehicleFilter !== 'all' ? 'Try a different search or filter.' : 'Registered drivers will appear here.'}
            />
          }
          pagination={{ page, pageSize: PAGE_SIZE, total, onPage: setPage }}
        />

        {actionUser && actionType && (
          <ConfirmDialog
            open={!!actionUser}
            onClose={() => { setActionUser(null); setActionType(null) }}
            {...actionCopy(actionType, actionUser.fullName)}
            destructive={actionType === 'ban'}
            requireReason={actionType !== 'reinstate'}
            minReason={REASON_MIN}
            loading={actionLoading}
            error={actionError || null}
            onConfirm={handleAction}
          />
        )}

        <UserProfileSheet
          user={profileUser}
          onClose={() => setProfileUser(null)}
          onUpdate={handleProfileUpdate}
        />
      </div>
    </PageGuard>
  )
}
