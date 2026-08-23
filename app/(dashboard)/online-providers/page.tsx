'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Car, Wrench, RefreshCw, Search, WifiOff, Radio, Navigation, Download } from 'lucide-react'
import { PageGuard } from '@/components/common/page-guard'
import { PageHeader } from '@/components/common/page-header'
import { StatCard } from '@/components/common/stat-card'
import { ReportTable, type ReportColumn } from '@/components/common/report-table'
import { EmptyState } from '@/components/common/empty-state'
import { Pager } from '@/components/common/pager'
import { VerticalTabs, type Vertical } from '@/components/common/vertical-tabs'
import { StatusBadge } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getOnlineProviders, type OnlineProvidersResponse, type OnlineProviderRow } from '@/lib/api'
import { ApiError, userSafeAdminError } from '@/lib/api-client'
import { isHeartbeatStale, ZERO_ONLINE_COUNTS } from '@/lib/online-providers-contract'
import { formatDateTime, timeAgo } from '@/lib/format-date'
import { useAutoRefresh, AUTO_REFRESH_DISABLED } from '@/hooks/use-auto-refresh'
import { exportTableCsv } from '@/lib/report-export'

const PAGE_SIZE = 50
type Activity = 'all' | 'idle' | 'busy'

function roleFor(vertical: Vertical): 'driver' | 'artisan' | 'all' {
  return vertical === 'rides' ? 'driver' : vertical === 'artisans' ? 'artisan' : 'all'
}

function bookingHref(row: OnlineProviderRow): string | null {
  if (!row.activeBookingId) return null
  return row.role === 'artisan' ? `/artisan-jobs/${row.activeBookingId}` : `/rides/${row.activeBookingId}`
}

export default function OnlineProvidersPage() {
  const [vertical, setVertical] = useState<Vertical>('all')
  const [activity, setActivity] = useState<Activity>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<OnlineProvidersResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [unavailable, setUnavailable] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => { setPage(1) }, [vertical])

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    setUnavailable(false)
    getOnlineProviders({ role: roleFor(vertical), page, limit: PAGE_SIZE })
      .then(result => {
        setData(result)
        setUpdatedAt(new Date())
        setNow(new Date())
      })
      .catch(err => {
        setData(null)
        if (err instanceof ApiError && err.status === 404) setUnavailable(true)
        else setError(userSafeAdminError(err, 'Failed to load online providers.'))
      })
      .finally(() => setLoading(false))
  }, [vertical, page])

  useEffect(() => { load() }, [load])
  useAutoRefresh(load, 30_000)

  // Tick the "ago" labels once a minute without refetching.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const counts = data?.counts ?? ZERO_ONLINE_COUNTS
  const rows = useMemo(() => {
    let items = data?.items ?? []
    if (activity === 'idle') items = items.filter(r => !r.activeBookingId)
    if (activity === 'busy') items = items.filter(r => r.activeBookingId)
    const q = search.trim().toLowerCase()
    if (q) items = items.filter(r => r.fullName.toLowerCase().includes(q) || (r.phone ?? '').includes(q) || (r.regionName ?? '').toLowerCase().includes(q))
    return items
  }, [data, activity, search])

  const staleCount = useMemo(() => (data?.items ?? []).filter(r => isHeartbeatStale(r.lastSeenAt, now)).length, [data, now])

  const columns: ReportColumn<OnlineProviderRow>[] = [
    {
      key: 'name', header: 'Provider',
      render: r => (
        <div className="min-w-[160px]">
          <p className="font-medium text-gray-900">{r.fullName}</p>
          <p className="text-xs text-gray-500">{r.phone ?? 'Phone not provided'}</p>
        </div>
      ),
    },
    {
      key: 'role', header: 'Role',
      render: r => (
        <span className="inline-flex items-center gap-1.5 text-gray-700">
          {r.role === 'driver' ? <Car className="h-3.5 w-3.5 text-gray-400" /> : <Wrench className="h-3.5 w-3.5 text-gray-400" />}
          {r.role === 'driver' ? 'Driver' : 'Artisan'}
        </span>
      ),
    },
    {
      key: 'status', header: 'Status',
      render: r => {
        const href = bookingHref(r)
        if (!href) return <span className="inline-flex items-center gap-1.5 text-gray-600"><span className="w-1.5 h-1.5 rounded-full bg-gray-400" /> Idle</span>
        return (
          <span className="inline-flex items-center gap-2">
            <StatusBadge status={r.activeBookingStatus ?? 'active'} />
            <Link href={href} onClick={e => e.stopPropagation()} className="text-xs font-medium text-blue-600 hover:underline">
              Open {r.role === 'driver' ? 'ride' : 'job'}
            </Link>
          </span>
        )
      },
    },
    { key: 'since', header: 'Online since', render: r => <span className="text-gray-600">{r.onlineSince ? `${formatDateTime(r.onlineSince)} (${timeAgo(r.onlineSince, now)})` : '-'}</span> },
    {
      key: 'seen', header: 'Last seen',
      render: r => {
        const stale = isHeartbeatStale(r.lastSeenAt, now)
        return (
          <span className={`inline-flex items-center gap-1.5 ${stale ? 'text-amber-700' : 'text-gray-600'}`}>
            {stale && <WifiOff className="h-3.5 w-3.5" />}
            {r.lastSeenAt ? timeAgo(r.lastSeenAt, now) : 'No heartbeat'}
            {stale && <span className="text-[11px] font-medium">stale</span>}
          </span>
        )
      },
    },
    {
      key: 'location', header: 'Last location', responsiveClassName: 'hidden lg:table-cell',
      render: r => r.lat != null && r.lng != null ? (
        <a
          href={`https://www.google.com/maps?q=${r.lat},${r.lng}`}
          target="_blank"
          rel="noreferrer"
          onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
        >
          <Navigation className="h-3 w-3" /> {r.lastLocationAt ? timeAgo(r.lastLocationAt, now) : 'Map'}
        </a>
      ) : <span className="text-gray-400">-</span>,
    },
    { key: 'region', header: 'Region', responsiveClassName: 'hidden md:table-cell', render: r => <span className="text-gray-600">{r.regionName ?? '-'}</span> },
  ]

  function exportCsv() {
    exportTableCsv(
      `online-providers-${vertical}`,
      ['Name', 'Role', 'Phone', 'Status', 'Active booking', 'Online since', 'Last seen', 'Last location at', 'Latitude', 'Longitude', 'Region'],
      rows.map(r => [r.fullName, r.role, r.phone, r.activeBookingId ? 'On booking' : 'Idle', r.activeBookingId, r.onlineSince, r.lastSeenAt, r.lastLocationAt, r.lat, r.lng, r.regionName]),
    )
  }

  return (
    <PageGuard permission="view_live_map">
      <div>
        <PageHeader
          title="Online Providers"
          subtitle="Who is online right now and whether they are on a booking"
          actions={
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv} disabled={rows.length === 0}>
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={load} disabled={loading}>
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </Button>
            </>
          }
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <StatCard icon={Car} label="Drivers online" value={counts.driversOnline.toLocaleString()} sub={`${counts.driversOnBooking} on a ride - ${Math.max(0, counts.driversOnline - counts.driversOnBooking)} idle`} loading={loading && !data} />
          <StatCard icon={Navigation} label="Drivers on a ride" value={counts.driversOnBooking.toLocaleString()} sub="Accepted through in progress" loading={loading && !data} />
          <StatCard icon={Wrench} label="Artisans online" value={counts.artisansOnline.toLocaleString()} sub={`${counts.artisansOnBooking} on a job - ${Math.max(0, counts.artisansOnline - counts.artisansOnBooking)} idle`} loading={loading && !data} />
          <StatCard icon={Radio} label="Artisans on a job" value={counts.artisansOnBooking.toLocaleString()} sub="Confirmed through marked complete" loading={loading && !data} />
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex items-center gap-3 flex-wrap">
          <VerticalTabs value={vertical} onChange={setVertical} />
          <div role="tablist" aria-label="Activity" className="inline-flex items-center h-9 rounded-lg bg-gray-100 p-[3px] gap-0.5">
            {([['all', 'All'], ['idle', 'Idle'], ['busy', 'On booking']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={activity === value}
                onClick={() => setActivity(value)}
                className={`h-full px-3 rounded-md text-xs font-semibold transition-colors ${activity === value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone or region" className="h-9 w-64 pl-8 bg-white" />
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
            {updatedAt && <span>Updated {timeAgo(updatedAt.toISOString(), now)}</span>}
            <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{AUTO_REFRESH_DISABLED ? 'Auto-refresh off' : 'Refreshes every 30 s'}</span>
            {staleCount > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700"><WifiOff className="h-3 w-3" /> {staleCount} stale</span>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">Couldn&apos;t load online providers</p>
              <p className="text-xs mt-0.5">{error}</p>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={load}>Retry</Button>
          </div>
        )}

        <ReportTable<OnlineProviderRow>
          columns={columns}
          rows={rows}
          rowKey={r => `${r.role}:${r.providerId}`}
          loading={loading && !data}
          minWidth={820}
          empty={unavailable
            ? <EmptyState variant="unavailable" title="Online provider list is not available yet" description="The server has not been updated with this endpoint. The page will populate automatically once it is deployed." />
            : <EmptyState icon={WifiOff} title={activity === 'all' && !search ? 'No providers are online right now' : 'No providers match this filter'} />}
          caption="Online means the provider switched themselves on in the app. A stale heartbeat (no update for over 5 minutes) usually means the app is closed or has lost signal; the server switches them off automatically after a while."
        />
        {data && data.total > PAGE_SIZE && (
          <Pager page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
        )}
      </div>
    </PageGuard>
  )
}
