'use client'

import { useCallback, useEffect, useState } from 'react'
import { Award, Clock, Gift, Undo2, Users } from 'lucide-react'
import { PageGuard } from '@/components/common/page-guard'
import { RoleGate } from '@/components/common/role-gate'
import { PageHeader } from '@/components/common/page-header'
import { StatCard } from '@/components/common/stat-card'
import { FilterBar, FilterSearch } from '@/components/common/filter-bar'
import { DataTable, type DataTableColumn } from '@/components/common/data-table'
import { EmptyState } from '@/components/common/empty-state'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useRole } from '@/hooks/use-role'
import { formatDate } from '@/lib/format-date'
import {
  getReferralMetrics,
  listReferrals,
  type ReferralListItem,
  type ReferralMetrics,
  type ReferralStatusFilter,
  type ReferralUserRef,
} from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { ReferralActionDialog, type ReferralAction } from './_components/referral-action-dialog'
import { ReferralStatusBadge, RoleChips, formatPoints } from './_components/referral-shared'
import { ReferralUserSheet, type DrilldownTarget } from './_components/referral-user-sheet'
import { RewardConfigCard } from './_components/reward-config-card'
import { ReferralAvailabilityCard } from './_components/referral-availability-card'
import { PlatformReferralCodesPanel } from './_components/platform-referral-codes-panel'

function ExactRoleCell({
  person,
  onOpen,
}: {
  person: ReferralUserRef
  onOpen: () => void
}) {
  return (
    <button className="text-left group" onClick={onOpen} title="View referral funnel">
      <p className="text-sm font-medium text-gray-900 group-hover:text-primary">
        {person.fullName ?? 'Unknown'}
      </p>
      <RoleChips roles={[person.role]} className="mt-1" />
    </button>
  )
}

export default function ReferralsPage() {
  const { can } = useRole()
  const canManage = can('manage_referrals')
  const [metrics, setMetrics] = useState<ReferralMetrics | null>(null)
  const [items, setItems] = useState<ReferralListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<ReferralStatusFilter>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const limit = 20
  const [actionTarget, setActionTarget] = useState<{
    referral: ReferralListItem
    action: ReferralAction
  } | null>(null)
  const [drilldown, setDrilldown] = useState<DrilldownTarget | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextMetrics, list] = await Promise.all([
        getReferralMetrics(),
        listReferrals({
          page,
          limit,
          status,
          search: search.trim() || undefined,
        }),
      ])
      setMetrics(nextMetrics)
      setItems(list.items)
      setTotal(list.total)
    } catch (caught) {
      setMetrics(null)
      setItems([])
      setTotal(0)
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not load the referral history.',
      )
    } finally {
      setLoading(false)
    }
  }, [page, status, search])

  useEffect(() => {
    void load()
  }, [load])

  const columns: DataTableColumn<ReferralListItem>[] = [
    { key: 'code', header: 'Code', render: item => <span className="font-mono text-xs">{item.referralCode}</span> },
    {
      key: 'referrer', header: 'Referrer role',
      render: item => (
        <ExactRoleCell
          person={item.referrer}
          onOpen={() =>
            setDrilldown({
              role: item.referrer.role,
              roleAccountId: item.referrer.roleAccountId,
              name: item.referrer.fullName,
            })
          }
        />
      ),
    },
    {
      key: 'referee', header: 'Referred role',
      render: item => (
        <ExactRoleCell
          person={item.referee}
          onOpen={() =>
            setDrilldown({
              role: item.referee.role,
              roleAccountId: item.referee.roleAccountId,
              name: item.referee.fullName,
            })
          }
        />
      ),
    },
    { key: 'status', header: 'Status', render: item => <ReferralStatusBadge awarded={item.bonusAwarded} /> },
    { key: 'reward', header: 'Reward', render: item => formatPoints(item.bonusPoints) },
    {
      key: 'created', header: 'Created', responsiveClassName: 'hidden md:table-cell',
      render: item => <span className="text-sm text-gray-500">{formatDate(item.createdAt)}</span>,
    },
    {
      key: 'action', header: '', align: 'right',
      render: item => canManage ? (
        <RoleGate permission="manage_referrals">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setActionTarget({
                referral: item,
                action: item.bonusAwarded ? 'void' : 'award',
              })
            }
          >
            {item.bonusAwarded ? (
              <Undo2 className="mr-1 h-3.5 w-3.5" />
            ) : (
              <Gift className="mr-1 h-3.5 w-3.5" />
            )}
            {item.bonusAwarded ? 'Void' : 'Award'}
          </Button>
        </RoleGate>
      ) : null,
    },
  ]

  return (
    <PageGuard permission="view_referrals">
      <div>
        <PageHeader
          title="Referrals"
          subtitle="Referral history - who invited whom, scoped to the exact client, driver or artisan account, plus platform promo attribution"
        />

        <Tabs defaultValue="role-referrals">
          <TabsList variant="line" aria-label="Referral views">
            <TabsTrigger value="role-referrals">Role referrals</TabsTrigger>
            <TabsTrigger value="platform-codes">Platform promo codes</TabsTrigger>
          </TabsList>

          <TabsContent value="role-referrals" className="mt-4">
            {!error && (
              <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Total referrals" value={metrics?.totalReferrals ?? 0} icon={Gift} loading={loading} />
                <StatCard label="Awarded" value={metrics?.awardedCount ?? 0} icon={Award} loading={loading} />
                <StatCard label="Pending" value={metrics?.pendingCount ?? 0} icon={Clock} loading={loading} />
                <StatCard label="Conversion" value={`${(metrics?.conversionRatePct ?? 0).toFixed(1)}%`} icon={Users} loading={loading} />
              </div>
            )}

            <div className="mb-5 grid gap-5 lg:grid-cols-2">
              <ReferralAvailabilityCard />
              <RewardConfigCard />
            </div>

            <FilterBar
              onRefresh={() => void load()}
              refreshing={loading}
              meta={`${total} referral${total === 1 ? '' : 's'}`}
            >
              <FilterSearch
                value={search}
                onChange={value => { setSearch(value); setPage(1) }}
                placeholder="Search role name or code"
              />
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value as ReferralStatusFilter)
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-40 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="awarded">Awarded</SelectItem>
                </SelectContent>
              </Select>
            </FilterBar>

            <DataTable<ReferralListItem>
              columns={columns}
              rows={items}
              rowKey={item => item.id}
              loading={loading}
              error={error}
              onRetry={() => void load()}
              empty={<EmptyState title="No referrals match this view." />}
              pagination={{ page, pageSize: limit, total, onPage: setPage }}
            />

            <ReferralActionDialog
              referral={actionTarget?.referral ?? null}
              action={actionTarget?.action ?? null}
              onClose={() => setActionTarget(null)}
              onDone={() => {
                setActionTarget(null)
                void load()
              }}
            />
            <ReferralUserSheet target={drilldown} onClose={() => setDrilldown(null)} />
          </TabsContent>

          <TabsContent value="platform-codes" className="mt-4">
            <PlatformReferralCodesPanel />
          </TabsContent>
        </Tabs>
      </div>
    </PageGuard>
  )
}
