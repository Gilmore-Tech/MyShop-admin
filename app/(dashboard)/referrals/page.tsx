'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Gift, Award, Clock, Percent, Coins, Search, AlertTriangle, Loader2,
  ChevronLeft, ChevronRight, Undo2, Users,
} from 'lucide-react'
import { PageGuard } from '@/components/common/page-guard'
import { RoleGate } from '@/components/common/role-gate'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDateRange, PageSizeSelect } from '@/components/common/table-controls'
import { useRole } from '@/hooks/use-role'
import { formatGhs } from '@/lib/money'
import { formatDate } from '@/lib/format-date'
import {
  listReferrals, getReferralMetrics,
  type ReferralListItem, type ReferralMetrics, type ReferralStatusFilter,
} from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { ReferralStatusBadge, RoleChips, formatPoints } from './_components/referral-shared'
import { ReferralTrendChart } from './_components/referral-trend-chart'
import { RewardConfigCard } from './_components/reward-config-card'
import { ReferralActionDialog, type ReferralAction } from './_components/referral-action-dialog'
import { ReferralUserSheet, type DrilldownTarget } from './_components/referral-user-sheet'

// ── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string; sub?: string; icon: React.ElementType; accent?: string
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4" style={{ color: accent ?? '#6b7280' }} />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// Clickable user cell that opens the drilldown panel.
function UserCell({ name, phone, roles, onOpen }: {
  name: string | null; phone: string | null; roles: string[]; onOpen: () => void
}) {
  return (
    <button onClick={onOpen} className="text-left group" title="View referral funnel">
      <p className="text-sm font-medium text-gray-900 group-hover:text-orange-600 group-hover:underline">
        {name ?? 'Unknown'}
      </p>
      <p className="text-xs text-gray-400">{phone ?? '—'}</p>
      <div className="mt-1"><RoleChips roles={roles} /></div>
    </button>
  )
}

export default function ReferralsPage() {
  const { can } = useRole()
  const canManage = can('manage_referrals')

  // Shared date range drives the KPIs, trend chart and table filter.
  const { from, to, control: dateControl } = useDateRange()

  // ── Metrics ────────────────────────────────────────────────────────────────
  const [metrics, setMetrics] = useState<ReferralMetrics | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(true)
  const [metricsError, setMetricsError] = useState(false)

  const loadMetrics = useCallback(() => {
    setMetricsLoading(true)
    setMetricsError(false)
    getReferralMetrics({ from, to })
      .then(setMetrics)
      .catch(() => { setMetrics(null); setMetricsError(true) })
      .finally(() => setMetricsLoading(false))
  }, [from, to])

  // ── List ───────────────────────────────────────────────────────────────────
  const [items, setItems] = useState<ReferralListItem[]>([])
  const [total, setTotal] = useState(0)
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(15)
  const [status, setStatus] = useState<ReferralStatusFilter>('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  // Debounce the search box (300ms) and reset to page 1 on new query.
  useEffect(() => {
    const id = setTimeout(() => { setSearch(searchInput.trim()); setPage(1) }, 300)
    return () => clearTimeout(id)
  }, [searchInput])

  // Reset to page 1 when filters that change the result set change.
  useEffect(() => { setPage(1) }, [status, from, to, limit])

  const loadList = useCallback(() => {
    setListLoading(true)
    setListError(null)
    listReferrals({ page, limit, status, search: search || undefined, from, to })
      .then(res => { setItems(res.items); setTotal(res.total) })
      .catch(err => {
        setItems([]); setTotal(0)
        setListError(err instanceof ApiError
          ? (err.status === 404 ? 'The referrals endpoint is not yet available on the backend.' : err.message)
          : 'Failed to load referrals.')
      })
      .finally(() => setListLoading(false))
  }, [page, limit, status, search, from, to])

  useEffect(() => { loadMetrics() }, [loadMetrics])
  useEffect(() => { loadList() }, [loadList])

  const refreshAll = useCallback(() => { loadList(); loadMetrics() }, [loadList, loadMetrics])

  // ── Actions + drilldown ──────────────────────────────────────────────────────
  const [actionTarget, setActionTarget] = useState<{ referral: ReferralListItem; action: ReferralAction } | null>(null)
  const [drilldown, setDrilldown] = useState<DrilldownTarget | null>(null)

  function handleActionDone() {
    setActionTarget(null)
    refreshAll()
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))
  const conversion = metrics ? `${metrics.conversionRatePct.toFixed(1)}%` : '—'

  const kpis = useMemo(() => ([
    { label: 'Total referrals', value: metrics ? metrics.totalReferrals.toLocaleString('en-GH') : '—', icon: Gift, accent: '#F5A623' },
    { label: 'Awarded', value: metrics ? metrics.awardedCount.toLocaleString('en-GH') : '—', icon: Award, accent: '#27AE60', sub: 'Bonuses credited' },
    { label: 'Pending', value: metrics ? metrics.pendingCount.toLocaleString('en-GH') : '—', icon: Clock, accent: '#F2994A', sub: 'Awaiting first activity' },
    { label: 'Conversion rate', value: conversion, icon: Percent, accent: '#2F80ED', sub: 'Awarded / total' },
    { label: 'Total bonus value', value: metrics ? formatGhs(metrics.totalBonusValuePesewas) : '—', icon: Coins, accent: '#8B5CF6', sub: metrics ? `${metrics.totalBonusPointsAwarded.toLocaleString('en-GH')} pts awarded` : undefined },
  ]), [metrics, conversion])

  return (
    <PageGuard permission="view_referrals">
      <div>
        <PageHeader
          title="Referrals"
          subtitle="Referral ledger, conversion metrics and reward management"
          actions={dateControl}
        />

        {/* ── KPI row ─────────────────────────────────────────────────────── */}
        {metricsError ? (
          <div className="mb-5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center justify-between">
            <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Couldn&apos;t load referral metrics.</span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={loadMetrics}>Retry</Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
            {kpis.map(k => (
              <KpiCard key={k.label} label={k.label} value={metricsLoading ? '…' : k.value} sub={k.sub} icon={k.icon} accent={k.accent} />
            ))}
          </div>
        )}

        {/* ── Trend chart + reward config ─────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-5">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Referral trend</h2>
              <p className="text-xs text-gray-400 -mt-0.5">Referrals created vs awarded per day</p>
            </div>
            {metricsLoading ? (
              <div className="flex items-center justify-center min-h-[220px] text-gray-400 gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading trend…
              </div>
            ) : (
              <ReferralTrendChart byDay={metrics?.byDay ?? []} />
            )}
          </div>
          <RewardConfigCard />
        </div>

        {/* ── Filters ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search name, phone or code…"
              className="pl-9 h-9 bg-white"
              aria-label="Search referrals"
            />
          </div>
          <Select value={status} onValueChange={v => setStatus(v as ReferralStatusFilter)}>
            <SelectTrigger className="w-36 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="awarded">Awarded</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto"><PageSizeSelect value={limit} onChange={setLimit} /></div>
        </div>

        {listError && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">Couldn&apos;t load referrals</p>
              <p className="text-xs mt-0.5">{listError}</p>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={loadList}>Retry</Button>
          </div>
        )}

        {/* ── Table ───────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead>Code</TableHead>
                <TableHead>Referrer</TableHead>
                <TableHead>Referee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Bonus</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listLoading ? (
                [...Array(6)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(7)].map((_, j) => (
                      <TableCell key={j}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-gray-400 text-sm">
                    <Users className="h-6 w-6 mx-auto mb-2 text-gray-300" />
                    {listError ? 'No referrals to display while the endpoint is unavailable.'
                      : search || status !== 'all' ? 'No referrals match your filters.'
                      : 'No referrals yet.'}
                  </TableCell>
                </TableRow>
              ) : (
                items.map(r => (
                  <TableRow key={r.id} className="hover:bg-gray-50">
                    <TableCell className="font-mono text-xs font-medium text-gray-700">{r.referralCode}</TableCell>
                    <TableCell>
                      <UserCell name={r.referrer.fullName} phone={r.referrer.phone} roles={r.referrer.roles}
                        onOpen={() => setDrilldown({ userId: r.referrer.userId, name: r.referrer.fullName })} />
                    </TableCell>
                    <TableCell>
                      <UserCell name={r.referee.fullName} phone={r.referee.phone} roles={r.referee.roles}
                        onOpen={() => setDrilldown({ userId: r.referee.userId, name: r.referee.fullName })} />
                    </TableCell>
                    <TableCell><ReferralStatusBadge awarded={r.bonusAwarded} /></TableCell>
                    <TableCell className="text-right text-sm font-medium text-gray-700">
                      {r.bonusAwarded ? formatPoints(r.bonusPoints) : <span className="text-gray-300">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">{formatDate(r.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 justify-end">
                        {canManage ? (
                          r.bonusAwarded ? (
                            <RoleGate permission="manage_referrals">
                              <Button size="sm" variant="outline" className="text-xs h-7 gap-1 text-red-600 hover:bg-red-50"
                                onClick={() => setActionTarget({ referral: r, action: 'void' })}>
                                <Undo2 className="h-3.5 w-3.5" /> Void
                              </Button>
                            </RoleGate>
                          ) : (
                            <RoleGate permission="manage_referrals">
                              <Button size="sm" variant="outline" className="text-xs h-7 gap-1 text-emerald-600 hover:bg-emerald-50"
                                onClick={() => setActionTarget({ referral: r, action: 'award' })}>
                                <Gift className="h-3.5 w-3.5" /> Award now
                              </Button>
                            </RoleGate>
                          )
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              {total > 0
                ? `Showing ${(page - 1) * limit + 1}–${Math.min(page * limit, total)} of ${total.toLocaleString('en-GH')}`
                : '—'}
            </p>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={page <= 1 || listLoading}
                onClick={() => setPage(p => Math.max(1, p - 1))} aria-label="Previous page">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-gray-500 px-1">Page {page} / {totalPages}</span>
              <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={page >= totalPages || listLoading}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))} aria-label="Next page">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Action dialogs + drilldown */}
        <ReferralActionDialog
          referral={actionTarget?.referral ?? null}
          action={actionTarget?.action ?? null}
          onClose={() => setActionTarget(null)}
          onDone={handleActionDone}
        />
        <ReferralUserSheet target={drilldown} onClose={() => setDrilldown(null)} />
      </div>
    </PageGuard>
  )
}
