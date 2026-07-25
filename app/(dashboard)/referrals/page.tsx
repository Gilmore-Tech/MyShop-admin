'use client'

import { useCallback, useEffect, useState } from 'react'
import { Award, Clock, Gift, Loader2, Search, Undo2, Users } from 'lucide-react'
import { PageGuard } from '@/components/common/page-guard'
import { RoleGate } from '@/components/common/role-gate'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: React.ElementType
}) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
        <Icon className="h-4 w-4 text-orange-500" />
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

function ExactRoleCell({
  person,
  onOpen,
}: {
  person: ReferralUserRef
  onOpen: () => void
}) {
  return (
    <button className="text-left group" onClick={onOpen} title="View exact-role funnel">
      <p className="text-sm font-medium text-gray-900 group-hover:text-orange-600">
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
          : 'Could not load the exact-role referral ledger.',
      )
    } finally {
      setLoading(false)
    }
  }, [page, status, search])

  useEffect(() => {
    void load()
  }, [load])

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <PageGuard permission="view_referrals">
      <div>
        <PageHeader
          title="Referrals"
          subtitle="Exact client, driver and artisan referral ownership"
        />

        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            label="Total referrals"
            value={loading ? '…' : String(metrics?.totalReferrals ?? 0)}
            icon={Gift}
          />
          <MetricCard
            label="Awarded"
            value={loading ? '…' : String(metrics?.awardedCount ?? 0)}
            icon={Award}
          />
          <MetricCard
            label="Pending"
            value={loading ? '…' : String(metrics?.pendingCount ?? 0)}
            icon={Clock}
          />
          <MetricCard
            label="Conversion"
            value={loading ? '…' : `${(metrics?.conversionRatePct ?? 0).toFixed(1)}%`}
            icon={Users}
          />
        </div>

        <div className="mb-5 grid gap-5 lg:grid-cols-2">
          <ReferralAvailabilityCard />
          <RewardConfigCard />
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="Search role name or code"
              className="bg-white pl-9"
            />
          </div>
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
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Refresh
          </Button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead>Code</TableHead>
                <TableHead>Referrer role</TableHead>
                <TableHead>Referred role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reward</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-gray-400">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-gray-400">
                    No exact-role referrals match this view.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">{item.referralCode}</TableCell>
                    <TableCell>
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
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                    <TableCell>
                      <ReferralStatusBadge awarded={item.bonusAwarded} />
                    </TableCell>
                    <TableCell>{formatPoints(item.bonusPoints)}</TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {formatDate(item.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage && (
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
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between border-t bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-500">{total} exact-role referral(s)</p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1 || loading}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </Button>
              <span className="text-xs text-gray-500">
                {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>

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
      </div>
    </PageGuard>
  )
}
