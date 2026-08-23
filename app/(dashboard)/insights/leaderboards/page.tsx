'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Download, Trophy, Car, Wrench, Users, Medal } from 'lucide-react'
import { PageGuard } from '@/components/common/page-guard'
import { PageHeader } from '@/components/common/page-header'
import { StatCard } from '@/components/common/stat-card'
import { PeriodControls, usePeriod } from '@/components/common/period-controls'
import { LeaderboardList, type LeaderboardEntry } from '@/components/common/leaderboard-list'
import { EmptyState } from '@/components/common/empty-state'
import { Pager } from '@/components/common/pager'
import { useAllowedVerticals } from '@/components/common/vertical-tabs'
import { UserProfileSheet } from '@/components/users/user-profile-sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  getProviderLeaderboard, getTopClientsReport, getUser,
  type ProviderLeaderboardRow, type TopClientRow, type PlatformUser,
} from '@/lib/api'
import { ApiError, userSafeAdminError } from '@/lib/api-client'
import { useRole } from '@/hooks/use-role'
import type { Permission } from '@/lib/roles'
import { formatGhs } from '@/lib/money'
import { formatDate } from '@/lib/format-date'
import { dateRangeLabel } from '@/lib/date-range'
import { exportTableCsv } from '@/lib/report-export'
import { cn } from '@/lib/utils'

type BoardTab = 'drivers' | 'artisans' | 'clients_rides' | 'clients_artisans'

const PROVIDER_RANKS = [
  { value: 'completed', label: 'Completed bookings' },
  { value: 'gross', label: 'Gross fares' },
  { value: 'commission', label: 'Commission generated' },
  { value: 'earnings', label: 'Provider earnings' },
  { value: 'rating', label: 'Average rating' },
  { value: 'cancellations', label: 'Cancellations (most first)' },
] as const
type ProviderRank = (typeof PROVIDER_RANKS)[number]['value']

const CLIENT_RANKS = [
  { value: 'completed', label: 'Completed bookings' },
  { value: 'spend', label: 'Total spent' },
  { value: 'promo', label: 'Promo received' },
] as const
type ClientRank = (typeof CLIENT_RANKS)[number]['value']

const PAGE_SIZE = 20
const RERANK_POOL = 100

function providerMetric(row: ProviderLeaderboardRow, rank: ProviderRank): number {
  switch (rank) {
    case 'gross': return row.grossFaresPesewas
    case 'commission': return row.commissionPesewas
    case 'earnings': return row.earningsPesewas
    case 'rating': return row.avgRating ?? 0
    case 'cancellations': return row.cancelledCount
    default: return row.completedCount
  }
}

function providerMetricLabel(row: ProviderLeaderboardRow, rank: ProviderRank, noun: string): string {
  switch (rank) {
    case 'gross': return formatGhs(row.grossFaresPesewas)
    case 'commission': return formatGhs(row.commissionPesewas)
    case 'earnings': return formatGhs(row.earningsPesewas)
    case 'rating': return row.avgRating != null ? `${row.avgRating.toFixed(1)} stars` : 'No ratings'
    case 'cancellations': return `${row.cancelledCount} cancelled`
    default: return `${row.completedCount.toLocaleString()} ${noun}`
  }
}

function clientMetric(row: TopClientRow, rank: ClientRank): number {
  if (rank === 'spend') return row.totalSpendPesewas
  if (rank === 'promo') return row.promoReceivedPesewas
  return row.completedCount
}

function clientMetricLabel(row: TopClientRow, rank: ClientRank): string {
  if (rank === 'spend') return formatGhs(row.totalSpendPesewas)
  if (rank === 'promo') return formatGhs(row.promoReceivedPesewas)
  return `${row.completedCount.toLocaleString()} completed`
}

function Podium({ entries, loading }: { entries: LeaderboardEntry[]; loading: boolean }) {
  const top = entries.slice(0, 3)
  if (!loading && top.length === 0) return null
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
      {(loading ? [0, 1, 2] : top).map((entry, i) => (
        <div key={typeof entry === 'number' ? entry : entry.id} className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-full flex items-center justify-center shrink-0', i === 0 ? 'text-white' : 'bg-gray-100 text-gray-600')} style={i === 0 ? { backgroundColor: '#F5A623' } : undefined}>
            {i === 0 ? <Trophy className="h-5 w-5" /> : <Medal className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            {loading || typeof entry === 'number' ? (
              <>
                <div className="h-4 bg-gray-100 rounded animate-pulse w-32" />
                <div className="h-3 bg-gray-100 rounded animate-pulse w-20 mt-2" />
              </>
            ) : (
              <>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">#{i + 1}</p>
                <p className="text-sm font-semibold text-gray-900 truncate">{entry.name}</p>
                <p className="text-xs text-gray-500 truncate">{entry.metric}</p>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function LeaderboardsPage() {
  const router = useRouter()
  const { can } = useRole()
  const allowedVerticals = useAllowedVerticals()
  const period = usePeriod('this_month', 'day')
  const { from, to } = period

  const tabs: { id: BoardTab; label: string; icon: React.ElementType; permission: Permission; vertical: 'rides' | 'artisans' }[] = [
    { id: 'drivers', label: 'Drivers', icon: Car, permission: 'view_rides_report', vertical: 'rides' },
    { id: 'artisans', label: 'Artisans', icon: Wrench, permission: 'view_artisans_report', vertical: 'artisans' },
    { id: 'clients_rides', label: 'Clients - Rides', icon: Users, permission: 'view_reports', vertical: 'rides' },
    { id: 'clients_artisans', label: 'Clients - Artisan Services', icon: Users, permission: 'view_reports', vertical: 'artisans' },
  ]
  const visibleTabs = tabs.filter(t => can(t.permission) && (allowedVerticals.includes('all') || allowedVerticals.includes(t.vertical)))
  const [tab, setTab] = useState<BoardTab>('drivers')
  useEffect(() => {
    if (visibleTabs.length && !visibleTabs.some(t => t.id === tab)) setTab(visibleTabs[0].id)
  }, [visibleTabs, tab])

  const isClients = tab === 'clients_rides' || tab === 'clients_artisans'
  const [providerRank, setProviderRank] = useState<ProviderRank>('completed')
  const [clientRank, setClientRank] = useState<ClientRank>('completed')
  const [minCompleted, setMinCompleted] = useState(0)
  const [page, setPage] = useState(1)
  const [providers, setProviders] = useState<{ items: ProviderLeaderboardRow[]; total: number } | null>(null)
  const [clients, setClients] = useState<TopClientRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [unavailable, setUnavailable] = useState(false)
  const [profile, setProfile] = useState<PlatformUser | null>(null)
  const requestSequence = useRef(0)

  useEffect(() => { setPage(1) }, [tab, from, to, providerRank])

  const reranking = !isClients && providerRank !== 'completed'

  const load = useCallback(async () => {
    const request = ++requestSequence.current
    setLoading(true)
    setError('')
    setUnavailable(false)
    try {
      if (isClients) {
        const result = await getTopClientsReport({ from, to, vertical: tab === 'clients_rides' ? 'rides' : 'artisans', limit: 100 })
        if (request === requestSequence.current) setClients(result.items)
      } else {
        const vertical = tab === 'drivers' ? 'drivers' : 'artisans'
        const result = await getProviderLeaderboard({
          from, to, vertical,
          page: reranking ? 1 : page,
          limit: reranking ? RERANK_POOL : PAGE_SIZE,
        })
        const pageData = vertical === 'drivers' ? result.drivers : result.artisans
        if (request === requestSequence.current) setProviders(pageData ?? { items: [], total: 0 })
      }
    } catch (err) {
      if (request !== requestSequence.current) return
      setProviders(null)
      setClients(null)
      if (err instanceof ApiError && err.status === 404) setUnavailable(true)
      else setError(userSafeAdminError(err, 'Failed to load the leaderboard.'))
    } finally {
      if (request === requestSequence.current) setLoading(false)
    }
  }, [isClients, tab, from, to, page, reranking])

  useEffect(() => { load() }, [load])

  const noun = tab === 'drivers' ? 'rides' : 'jobs'

  const providerEntries = useMemo<LeaderboardEntry[]>(() => {
    const items = providers?.items ?? []
    const sorted = reranking
      ? [...items].sort((a, b) => providerMetric(b, providerRank) - providerMetric(a, providerRank) || b.completedCount - a.completedCount)
      : items
    return sorted.map(row => ({
      id: row.providerId,
      name: row.fullName,
      detail: [row.phone, row.regionName].filter(Boolean).join(' - ') || undefined,
      metric: providerMetricLabel(row, providerRank, noun),
      metricValue: providerMetric(row, providerRank),
      rating: row.avgRating,
      ratingCount: row.ratingCount,
      facts: [
        providerRank !== 'completed' ? `${row.completedCount} ${noun}` : formatGhs(row.grossFaresPesewas) + ' fares',
        row.cancelledCount > 0 ? `${row.cancelledCount} cancelled` : null,
      ].filter((f): f is string => Boolean(f)),
    }))
  }, [providers, providerRank, reranking, noun])

  const clientEntries = useMemo<LeaderboardEntry[]>(() => {
    const items = (clients ?? []).filter(c => c.completedCount >= minCompleted)
    return [...items]
      .sort((a, b) => clientMetric(b, clientRank) - clientMetric(a, clientRank) || b.completedCount - a.completedCount)
      .map(row => ({
        id: row.clientId,
        name: row.fullName,
        detail: [row.phone, row.lastBookingAt ? `last booking ${formatDate(row.lastBookingAt)}` : null].filter(Boolean).join(' - ') || undefined,
        metric: clientMetricLabel(row, clientRank),
        metricValue: clientMetric(row, clientRank),
        facts: [
          clientRank !== 'completed' ? `${row.completedCount} completed` : formatGhs(row.totalSpendPesewas) + ' spent',
          row.promoReceivedPesewas > 0 && clientRank !== 'promo' ? `${formatGhs(row.promoReceivedPesewas)} promo` : null,
          row.cancelledCount > 0 ? `${row.cancelledCount} cancelled` : null,
        ].filter((f): f is string => Boolean(f)),
      }))
  }, [clients, clientRank, minCompleted])

  const entries = isClients ? clientEntries : providerEntries
  const startRank = isClients || reranking ? 1 : (page - 1) * PAGE_SIZE + 1

  async function openProvider(entry: LeaderboardEntry) {
    const role = tab === 'drivers' ? 'driver' : 'artisan'
    try {
      const user = await getUser(role, entry.id)
      setProfile(user)
    } catch {
      // Fall back to the list page, which can search by name.
      router.push(`/users/${role}s?search=${encodeURIComponent(entry.name)}`)
    }
  }

  function exportCsv() {
    if (isClients) {
      const rows = (clients ?? []).filter(c => c.completedCount >= minCompleted)
      exportTableCsv(
        `top-clients-${tab === 'clients_rides' ? 'rides' : 'artisans'}`,
        ['Rank', 'Client', 'Phone', 'Completed', 'Requested', 'Cancelled', 'Total spent (GHS)', 'Promo received (GHS)', 'Last booking'],
        [...rows].sort((a, b) => clientMetric(b, clientRank) - clientMetric(a, clientRank)).map((c, i) => [
          i + 1, c.fullName, c.phone, c.completedCount, c.requestedCount, c.cancelledCount, c.totalSpendPesewas / 100, c.promoReceivedPesewas / 100, c.lastBookingAt,
        ]),
      )
      return
    }
    const rows = providers?.items ?? []
    exportTableCsv(
      `leaderboard-${tab}`,
      ['Rank', 'Name', 'Phone', 'Region', 'Completed', 'Cancelled', 'Gross fares (GHS)', 'Commission (GHS)', 'Earnings (GHS)', 'Avg rating', 'Ratings'],
      providerEntries.map((e, i) => {
        const r = rows.find(x => x.providerId === e.id)!
        return [startRank + i, r.fullName, r.phone, r.regionName, r.completedCount, r.cancelledCount, r.grossFaresPesewas / 100, r.commissionPesewas / 100, r.earningsPesewas / 100, r.avgRating ?? '', r.ratingCount]
      }),
    )
  }

  const totalLabel = isClients
    ? `${clientEntries.length} client${clientEntries.length === 1 ? '' : 's'}`
    : providers ? `${providers.total.toLocaleString()} ${tab}` : ''
  const caption = `${dateRangeLabel(period.preset)}${totalLabel ? ` - ${totalLabel}` : ''}`

  return (
    <PageGuard permission="view_reports">
      <div>
        <PageHeader
          title="Leaderboards"
          subtitle="Who did the most work and who uses MyShop the most - ranked over the selected period, strongest first"
          actions={
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv} disabled={entries.length === 0}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          }
        />

        <div role="tablist" aria-label="Leaderboard" className="mb-4 inline-flex items-center rounded-lg bg-gray-100 p-[3px] gap-0.5 flex-wrap">
          {visibleTabs.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn('inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold transition-colors', tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800')}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>

        <PeriodControls
          period={period}
          showGroupBy={false}
          onRefresh={load}
          loading={loading}
          caption={caption}
          extra={
            <>
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Rank by</Label>
                {isClients ? (
                  <Select value={clientRank} onValueChange={v => setClientRank(v as ClientRank)}>
                    <SelectTrigger className="w-48 bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>{CLIENT_RANKS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <Select value={providerRank} onValueChange={v => setProviderRank(v as ProviderRank)}>
                    <SelectTrigger className="w-56 bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>{PROVIDER_RANKS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
              {isClients && (
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Reward shortlist: at least</Label>
                  <div className="flex items-center gap-1.5">
                    <Input type="number" min={0} value={minCompleted} onChange={e => setMinCompleted(Math.max(0, Number(e.target.value) || 0))} className="h-9 w-20 bg-white" />
                    <span className="text-xs text-gray-500">completed</span>
                  </div>
                </div>
              )}
            </>
          }
        />

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">Couldn&apos;t load the leaderboard</p>
              <p className="text-xs mt-0.5">{error}</p>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={load}>Retry</Button>
          </div>
        )}

        {!isClients && providers && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatCard label={`Active ${tab}`} value={providers.total.toLocaleString()} sub={`Completed at least one ${noun.slice(0, -1)} in the period`} loading={loading} compact />
            <StatCard label={`Total ${noun} completed`} value={(providers.items.reduce((s, r) => s + r.completedCount, 0)).toLocaleString()} sub={reranking ? `Across the top ${RERANK_POOL}` : 'On this page'} loading={loading} compact />
            <StatCard label="Gross fares" value={formatGhs(providers.items.reduce((s, r) => s + r.grossFaresPesewas, 0))} sub={reranking ? `Across the top ${RERANK_POOL}` : 'On this page'} loading={loading} compact />
            <StatCard label="Commission generated" value={formatGhs(providers.items.reduce((s, r) => s + r.commissionPesewas, 0))} sub={reranking ? `Across the top ${RERANK_POOL}` : 'On this page'} loading={loading} compact />
          </div>
        )}
        {isClients && clients && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatCard label="Clients shown" value={clientEntries.length.toLocaleString()} sub={minCompleted > 0 ? `With ${minCompleted}+ completed bookings` : 'Top 100 by completed bookings'} loading={loading} compact />
            <StatCard label="Completed bookings" value={clientEntries.reduce((s, e) => s + (clients.find(c => c.clientId === e.id)?.completedCount ?? 0), 0).toLocaleString()} sub="Across clients shown" loading={loading} compact />
            <StatCard label="Total spent" value={formatGhs(clientEntries.reduce((s, e) => s + (clients.find(c => c.clientId === e.id)?.totalSpendPesewas ?? 0), 0))} sub="Across clients shown" loading={loading} compact />
            <StatCard label="Promo received" value={formatGhs(clientEntries.reduce((s, e) => s + (clients.find(c => c.clientId === e.id)?.promoReceivedPesewas ?? 0), 0))} sub="Across clients shown" loading={loading} compact />
          </div>
        )}

        {(isClients || page === 1 || reranking) && <Podium entries={entries} loading={loading} />}

        <LeaderboardList
          entries={entries}
          loading={loading}
          startRank={startRank}
          onSelect={isClients ? undefined : openProvider}
          empty={unavailable
            ? <EmptyState variant="unavailable" title="Leaderboards are not available yet" description="The server has not been updated with this report. The page will populate automatically once it is deployed." />
            : <EmptyState title={isClients ? 'No clients with completed bookings in this period' : `No ${tab} completed a ${noun.slice(0, -1)} in this period`} description="Try a wider date range." />}
        />
        <p className="mt-2 text-[11px] text-gray-400">
          {isClients
            ? 'Ranked by bookings requested in the period. Clients with no completed booking are not listed.'
            : reranking
              ? `Re-ranked by ${PROVIDER_RANKS.find(r => r.value === providerRank)?.label.toLowerCase()} among the top ${RERANK_POOL} by completed ${noun}. Providers with no completed ${noun.slice(0, -1)} are not listed.`
              : `Ranked by ${noun} completed in the period (by completion date). Providers with no completed ${noun.slice(0, -1)} are not listed. Click a row to open the profile.`}
        </p>

        {!isClients && !reranking && providers && (
          <Pager page={page} pageSize={PAGE_SIZE} total={providers.total} onPage={setPage} />
        )}

        <UserProfileSheet user={profile} onClose={() => setProfile(null)} />
      </div>
    </PageGuard>
  )
}
