'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { IdCard, RotateCcw, Shield, UserX, Users } from 'lucide-react'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { useRole } from '@/hooks/use-role'
import { verticalsForCategory, userLandingPath } from '@/lib/user-scope'
import { PageGuard } from '@/components/common/page-guard'
import { RoleGate } from '@/components/common/role-gate'
import { UserTabs } from '@/components/users/user-tabs'
import { Button } from '@/components/ui/button'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { DataTable, AvatarCell } from '@/components/common/data-table'
import { FilterBar, FilterSearch } from '@/components/common/filter-bar'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { EmptyState } from '@/components/common/empty-state'
import { formatDate } from '@/lib/format-date'
import { paymentMethodLabel } from '@/lib/payment-labels'
import { listUsers, suspendUser, banUser, reinstateUser, type PlatformUser } from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { UserProfileSheet } from '@/components/users/user-profile-sheet'

type ActionType = 'suspend' | 'ban' | 'reinstate'

const PAGE_SIZE = 50
// The account-action API enforces a 10-character minimum on suspend/ban
// reasons (higher than ConfirmDialog's 5-character default), so it is passed
// through explicitly. Reinstate reasons stay optional, as before.
const REASON_MIN = 10

function actionCopy(type: ActionType, name: string) {
  if (type === 'ban') {
    return {
      title: `Ban ${name}'s client account?`,
      description: 'The client account is blocked permanently. Driver and artisan sibling accounts under the same phone identity remain untouched.',
      confirmLabel: `Ban ${name}`,
    }
  }
  if (type === 'reinstate') {
    return {
      title: `Reinstate ${name}'s client account?`,
      description: 'Restores access to the client account. Driver and artisan sibling accounts remain untouched.',
      confirmLabel: `Reinstate ${name}`,
    }
  }
  return {
    title: `Suspend ${name}'s client account?`,
    description: 'The client account is blocked until you reinstate it. Driver and artisan sibling accounts remain untouched.',
    confirmLabel: `Suspend ${name}`,
  }
}

export default function ClientsPage() {
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [actionDialog, setActionDialog] = useState<{ user: PlatformUser; type: ActionType } | null>(null)
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
        limit: PAGE_SIZE,
      })
      setUsers(res.items)
      setTotal(res.total)
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

  async function handleAction(reason: string) {
    if (!actionDialog) return
    const { user, type } = actionDialog
    setSubmitError('')
    setSubmitting(true)
    try {
      if (type === 'suspend') await suspendUser('client', user.roleAccountId, reason)
      else if (type === 'ban') await banUser('client', user.roleAccountId, reason)
      else await reinstateUser('client', user.roleAccountId, reason || undefined)
      setActionDialog(null)
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
          title="Clients"
          subtitle="Client accounts and standing"
          tabs={<UserTabs active="clients" />}
          actions={
            <Link href="/users/clients/kyc-queue">
              <Button size="sm" variant="outline" className="gap-2">
                <IdCard className="h-4 w-4" /> Client ID checks
              </Button>
            </Link>
          }
        />

        <FilterBar onRefresh={() => load(1)} refreshing={loading} meta={`${total.toLocaleString()} clients`}>
          <FilterSearch value={search} onChange={setSearch} placeholder="Search by name, phone, email" />
        </FilterBar>

        <DataTable<PlatformUser>
          columns={[
            {
              key: 'client',
              header: 'Client',
              render: row => <AvatarCell name={row.fullName} sub={row.email ?? 'No email'} />,
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
              key: 'idCheck',
              header: 'ID check',
              render: row => <StatusBadge status={row.role === 'client' ? row.profile.kycStatus : 'not_started'} />,
            },
            {
              key: 'payment',
              header: 'Payment',
              render: row => row.role === 'client' ? paymentMethodLabel(row.profile.preferredPaymentMethod) : '-',
            },
          ]}
          rows={users}
          rowKey={row => row.id}
          loading={loading}
          error={error || null}
          onRetry={() => load(page)}
          onRowClick={row => setProfileUser(row)}
          rowAriaLabel={row => `View ${row.fullName}'s profile`}
          rowMenu={row => (
            <>
              <DropdownMenuItem onSelect={() => setProfileUser(row)}>View profile</DropdownMenuItem>
              <DropdownMenuSeparator />
              <RoleGate permission="suspend_user">
                {row.status === 'suspended' && (
                  <DropdownMenuItem className="gap-2 text-emerald-700" onSelect={() => setActionDialog({ user: row, type: 'reinstate' })}>
                    <RotateCcw className="h-4 w-4" /> Reinstate
                  </DropdownMenuItem>
                )}
                {row.status !== 'suspended' && row.status !== 'banned' && (
                  <DropdownMenuItem className="gap-2 text-orange-600" onSelect={() => setActionDialog({ user: row, type: 'suspend' })}>
                    <UserX className="h-4 w-4" /> Suspend
                  </DropdownMenuItem>
                )}
              </RoleGate>
              <RoleGate permission="ban_user">
                {row.status !== 'banned' && (
                  <DropdownMenuItem className="gap-2 text-red-600" onSelect={() => setActionDialog({ user: row, type: 'ban' })}>
                    <Shield className="h-4 w-4" /> Ban permanently
                  </DropdownMenuItem>
                )}
              </RoleGate>
            </>
          )}
          empty={
            <EmptyState
              icon={Users}
              title={search ? 'No matches' : 'No clients yet'}
              description={search ? 'Try a different search.' : 'Registered clients will appear here.'}
            />
          }
          pagination={{ page, pageSize: PAGE_SIZE, total, onPage: pg => load(pg) }}
        />

        {actionDialog && (
          <ConfirmDialog
            open={!!actionDialog}
            onClose={() => setActionDialog(null)}
            {...actionCopy(actionDialog.type, actionDialog.user.fullName)}
            destructive={actionDialog.type === 'ban'}
            requireReason={actionDialog.type !== 'reinstate'}
            minReason={REASON_MIN}
            loading={submitting}
            error={submitError || null}
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
