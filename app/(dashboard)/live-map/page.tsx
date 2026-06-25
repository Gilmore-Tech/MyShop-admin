'use client'

import { useState, useCallback, useEffect } from 'react'
import { io, type Socket } from 'socket.io-client'
import { PageGuard } from '@/components/common/page-guard'
import { APIProvider, Map, AdvancedMarker, AdvancedMarkerAnchorPoint, ColorScheme } from '@vis.gl/react-google-maps'
import {
  Car, Wrench, Search, X, RefreshCw, Activity, MapPin,
  ChevronDown, ChevronUp, AlertCircle,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  getLiveMapData, getRideMarkerDetail, getJobMarkerDetail, type LiveMapMarker,
  listRides, listArtisanJobs, type AdminRide, type AdminJob,
} from '@/lib/api'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'

type SelectedMarker = LiveMapMarker & { detail: Record<string, unknown> | null }

const C = {
  gold: '#F5A623',
  blue: '#3B82F6',
  purple: '#8B5CF6',
  green: '#10B981',
  orange: '#F97316',
}

// ─── Marker dot colours ────────────────────────────────────────────────────────
const markerStyle: Record<string, { dot: string; ring: string; label: string }> = {
  ride_en_route:    { dot: C.green,  ring: `${C.green}30`,  label: 'Ride en route' },
  ride_in_progress: { dot: C.blue,   ring: `${C.blue}30`,   label: 'Ride in progress' },
  ride_default:     { dot: C.blue,   ring: `${C.blue}30`,   label: 'Ride active' },
  job_en_route:     { dot: C.orange, ring: `${C.orange}30`, label: 'Artisan en route' },
  job_arrived:      { dot: C.purple, ring: `${C.purple}30`, label: 'Artisan on site' },
  job_default:      { dot: C.orange, ring: `${C.orange}30`, label: 'Artisan active' },
}

function getStyle(type: string, status: string) {
  return (
    markerStyle[`${type}_${status}`] ??
    markerStyle[`${type}_default`] ??
    { dot: '#6b7280', ring: '#6b728030', label: status }
  )
}

function Pin({ type, status, selected }: { type: string; status: string; selected: boolean }) {
  const s = getStyle(type, status)
  return (
    <div className="relative flex items-center justify-center cursor-pointer">
      <span className="absolute w-8 h-8 rounded-full animate-ping opacity-60" style={{ backgroundColor: s.ring }} />
      <span
        className="absolute rounded-full transition-all"
        style={{ width: selected ? 32 : 24, height: selected ? 32 : 24, backgroundColor: s.ring }}
      />
      <span
        className="relative z-10 flex items-center justify-center rounded-full shadow-lg transition-all"
        style={{ width: selected ? 20 : 16, height: selected ? 20 : 16, backgroundColor: s.dot }}
      >
        {type === 'ride'
          ? <Car style={{ width: selected ? 11 : 9, height: selected ? 11 : 9, color: '#fff' }} />
          : <Wrench style={{ width: selected ? 11 : 9, height: selected ? 11 : 9, color: '#fff' }} />}
      </span>
    </div>
  )
}

// ─── Status badge helper ───────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  open:          'bg-gray-100 text-gray-600',
  pending:       'bg-gray-100 text-gray-600',
  accepted:      'bg-gray-100 text-gray-600',
  assigned:      'bg-gray-100 text-gray-600',
  en_route:      'bg-gray-100 text-gray-600',
  in_progress:   'bg-gray-100 text-gray-600',
  arrived:       'bg-gray-100 text-gray-600',
  completed:     'bg-gray-100 text-gray-600',
  cancelled:     'bg-gray-100 text-gray-600',
  disputed:      'bg-gray-100 text-gray-600',
  payment_pending:'bg-gray-100 text-gray-600',
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-gray-300">-</span>
  const cls = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-500'
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function normaliseStatus(status: string): string {
  switch (status) {
    case 'driver_en_route':
    case 'artisan_en_route': return 'en_route'
    case 'arrived_at_pickup':
    case 'artisan_arrived':  return 'arrived'
    default:                 return status
  }
}

function fmt(pesewas: number | null | undefined) {
  if (pesewas == null) return '-'
  return `GHS ${(pesewas / 100).toFixed(2)}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })
}

// ─── All-Bookings Table ────────────────────────────────────────────────────────
const RIDE_STATUSES = ['all', 'pending', 'accepted', 'en_route', 'in_progress', 'completed', 'cancelled', 'disputed']
const JOB_STATUSES  = ['all', 'open', 'assigned', 'en_route', 'arrived', 'in_progress', 'completed', 'cancelled', 'disputed']

function RidesTable() {
  const [rides, setRides]         = useState<AdminRide[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [status, setStatus]       = useState('all')
  const [search, setSearch]       = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await listRides({ page, limit: 15, status: status === 'all' ? undefined : status, search: search || undefined })
      setRides(res.items)
      setTotal(res.total)
      setTotalPages(res.totalPages)
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load rides')
    } finally {
      setLoading(false)
    }
  }, [page, status, search])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={status} onValueChange={v => { setStatus(v); setPage(1) }}>
          <SelectTrigger className="w-44 h-8 text-sm bg-gray-50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RIDE_STATUSES.map(s => (
              <SelectItem key={s} value={s}>{s === 'all' ? 'All Statuses' : s.replace(/_/g, ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          <Input
            placeholder="Search client or driver…"
            className="pl-8 h-8 text-sm w-52 bg-gray-50"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput); setPage(1) } }}
          />
        </div>
        <span className="text-xs text-gray-400">{total} total</span>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2.5">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Booking ID', 'Client', 'Driver', 'Pickup -> Dropoff', 'Status', 'Fare', 'Payment', 'Created'].map(h => (
                <th key={h} className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 8 }).map((_, j) => (
                  <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse w-20" /></td>
                ))}
              </tr>
            ))}
            {!loading && rides.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-gray-400 text-sm">No rides found</td>
              </tr>
            )}
            {!loading && rides.map(r => (
              <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.id.slice(0, 8)}…</td>
                <td className="px-4 py-3 text-gray-800 font-medium">{r.clientName ?? '-'}</td>
                <td className="px-4 py-3 text-gray-600">{r.driverName ?? '-'}</td>
                <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px]">
                  <span className="block truncate">{r.pickupAddress || '-'}</span>
                  <span className="block truncate text-gray-400">{'->'} {r.dropoffAddress || '-'}</span>
                </td>
                <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-3 font-medium text-gray-800">{fmt(r.farePesewas)}</td>
                <td className="px-4 py-3"><StatusBadge status={r.paymentStatus} /></td>
                <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  )
}

function JobsTable() {
  const [jobs, setJobs]           = useState<AdminJob[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [status, setStatus]       = useState('all')
  const [search, setSearch]       = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await listArtisanJobs({ page, limit: 15, status: status === 'all' ? undefined : status, search: search || undefined })
      setJobs(res.items)
      setTotal(res.total)
      setTotalPages(res.totalPages)
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load jobs')
    } finally {
      setLoading(false)
    }
  }, [page, status, search])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={status} onValueChange={v => { setStatus(v); setPage(1) }}>
          <SelectTrigger className="w-44 h-8 text-sm bg-gray-50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {JOB_STATUSES.map(s => (
              <SelectItem key={s} value={s}>{s === 'all' ? 'All Statuses' : s.replace(/_/g, ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          <Input
            placeholder="Search client or artisan…"
            className="pl-8 h-8 text-sm w-52 bg-gray-50"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput); setPage(1) } }}
          />
        </div>
        <span className="text-xs text-gray-400">{total} total</span>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2.5">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Job ID', 'Client', 'Artisan', 'Category', 'Status', 'Agreed Price', 'Supplement', 'Payment', 'Created'].map(h => (
                <th key={h} className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 9 }).map((_, j) => (
                  <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse w-20" /></td>
                ))}
              </tr>
            ))}
            {!loading && jobs.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-gray-400 text-sm">No jobs found</td>
              </tr>
            )}
            {!loading && jobs.map(j => (
              <tr key={j.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{j.id.slice(0, 8)}…</td>
                <td className="px-4 py-3 text-gray-800 font-medium">{j.clientName ?? '-'}</td>
                <td className="px-4 py-3 text-gray-600">{j.artisanName ?? '-'}</td>
                <td className="px-4 py-3 text-gray-500">{j.categoryName ?? '-'}</td>
                <td className="px-4 py-3"><StatusBadge status={j.status} /></td>
                <td className="px-4 py-3 font-medium text-gray-800">{fmt(j.agreedPricePesewas)}</td>
                <td className="px-4 py-3 text-gray-600">{fmt(j.supplementPesewas)}</td>
                <td className="px-4 py-3">
                  {j.paymentStatus ? <StatusBadge status={j.paymentStatus} /> : <span className="text-gray-300">-</span>}
                </td>
                <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(j.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function LiveMapPage() {
  const [markers, setMarkers]         = useState<LiveMapMarker[]>([])
  const [showFilter, setShowFilter]   = useState('both')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch]           = useState('')
  const [selected, setSelected]       = useState<SelectedMarker | null>(null)
  const [tableTab, setTableTab]       = useState<'rides' | 'jobs'>('rides')
  const [tableOpen, setTableOpen]     = useState(true)

  const [wsConnected, setWsConnected] = useState(false)

  const loadMarkers = useCallback(async () => {
    try {
      const data = await getLiveMapData()
      setMarkers(data)
    } catch { /* silently keep last state */ }
  }, [])

  // Merge a real-time marker update into state without a full reload
  const applyMarkerUpdate = useCallback((update: {
    type: 'ride' | 'job'
    bookingId: string
    status: string
    lat: number
    lng: number
    providerName?: string | null
    clientName?: string | null
    markerColor?: string
  }) => {
    const status = normaliseStatus(update.status)
    setMarkers(prev => {
      const idx = prev.findIndex(m => m.bookingId === update.bookingId)
      const marker: LiveMapMarker = {
        type: update.type,
        bookingId: update.bookingId,
        providerName: update.providerName ?? (idx >= 0 ? prev[idx].providerName : null),
        clientName: update.clientName ?? (idx >= 0 ? prev[idx].clientName : null),
        status,
        lat: update.lat,
        lng: update.lng,
        markerColor: update.type === 'ride' ? 'blue' : 'orange',
      }
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = marker
        return next
      }
      return [...prev, marker]
    })
  }, [])

  // Fallback poll (no-op while auto-refresh is globally disabled — see
  // AUTO_REFRESH_DISABLED). Live updates come from the WebSocket below.
  useAutoRefresh(loadMarkers, 30_000)

  useEffect(() => {
    // WebSocket — subscribe to real-time marker updates
    const token = typeof window !== 'undefined' ? localStorage.getItem('myshop_admin_token') : null
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? 'https://myshop-api-2hy2.onrender.com'
    const socket: Socket = io(wsUrl, {
      auth: { token },
      transports: ['websocket'],
      reconnectionAttempts: 5,
    })

    socket.on('connect', () => setWsConnected(true))
    socket.on('disconnect', () => setWsConnected(false))
    socket.on('admin:marker:updated', applyMarkerUpdate)

    return () => { socket.disconnect() }
  }, [applyMarkerUpdate])

  async function handleMarkerClick(m: LiveMapMarker) {
    if (selected?.bookingId === m.bookingId) { setSelected(null); return }
    setSelected({ ...m, detail: null })
    try {
      const detail = m.type === 'ride'
        ? await getRideMarkerDetail(m.bookingId)
        : await getJobMarkerDetail(m.bookingId)
      setSelected(prev => prev ? { ...prev, detail: detail as unknown as Record<string, unknown> } : null)
    } catch { /* detail unavailable */ }
  }

  const filtered = markers.filter(m => {
    const matchType   = showFilter === 'both' || m.type === showFilter
    const matchStatus = statusFilter === 'all' || m.status === statusFilter
    const matchSearch = !search ||
      m.bookingId.toLowerCase().includes(search.toLowerCase()) ||
      (m.providerName ?? '').toLowerCase().includes(search.toLowerCase())
    return matchType && matchStatus && matchSearch
  })

  const rideCount = markers.filter(m => m.type === 'ride').length
  const jobCount  = markers.filter(m => m.type === 'job').length

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!
  const mapId  = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? 'DEMO_MAP_ID'

  return (
    <PageGuard permission="view_live_map">
      {/* Outer wrapper — scrollable so the table can live below the map */}
      <div className="-m-6 flex flex-col min-h-[calc(100vh-4rem)]">

        {/* ── Map section (fixed height) ──────────────────────────────────── */}
        <div className="h-[calc(100vh-4rem)] flex flex-col shrink-0">

          {/* Top bar */}
          <div className="shrink-0 bg-white shadow-sm z-10">
            <div className="flex items-center justify-between px-5 pt-4 pb-3">
              <div>
                <h1 className="text-xl font-bold text-gray-900 leading-tight">Live Operations Map</h1>
                <p className="text-sm text-gray-400 mt-0.5">Real-time tracking</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-1.5">
                    <Car className="h-3.5 w-3.5 text-gray-600" />
                    <span className="text-sm font-semibold text-gray-700">{rideCount}</span>
                    <span className="text-xs text-gray-400">rides</span>
                  </div>
                  <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-1.5">
                    <Wrench className="h-3.5 w-3.5 text-gray-600" />
                    <span className="text-sm font-semibold text-gray-700">{jobCount}</span>
                    <span className="text-xs text-gray-400">jobs</span>
                  </div>
                  <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
                    <Activity className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-sm font-semibold text-gray-700">{markers.length}</span>
                    <span className="text-xs text-gray-400">total</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium rounded-lg px-2.5 py-1.5 text-gray-600 bg-gray-100">
                  <span className={`w-1.5 h-1.5 rounded-full inline-block bg-gray-400 ${wsConnected ? 'animate-pulse' : ''}`} />
                  {wsConnected ? 'Live' : 'Polling'}
                </div>
                <Button variant="outline" size="sm" onClick={loadMarkers} className="gap-1.5 text-xs h-8">
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </Button>
              </div>
            </div>

            {/* Filter row */}
            <div className="flex items-center gap-3 px-5 pb-3 flex-wrap">
              <Select value={showFilter} onValueChange={setShowFilter}>
                <SelectTrigger className="w-44 h-8 text-sm bg-gray-50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Rides + Artisan Jobs</SelectItem>
                  <SelectItem value="ride">Rides Only</SelectItem>
                  <SelectItem value="job">Artisan Jobs Only</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40 h-8 text-sm bg-gray-50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Active</SelectItem>
                  <SelectItem value="en_route">En Route</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="arrived">Arrived</SelectItem>
                </SelectContent>
              </Select>

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                <Input
                  placeholder="Search provider or booking ID…"
                  className="pl-8 h-8 text-sm w-56 bg-gray-50"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              <div className="ml-auto text-xs text-gray-400 font-medium">
                {filtered.length} of {markers.length} bookings visible
              </div>
            </div>
          </div>

          {/* Map + side panel */}
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 relative">
              <APIProvider apiKey={apiKey}>
                <Map
                  mapId={mapId}
                  colorScheme={ColorScheme.DARK}
                  defaultCenter={{ lat: 6.6884, lng: -1.6244 }}
                  defaultZoom={13}
                  gestureHandling="greedy"
                  fullscreenControl
                  zoomControl
                  scaleControl
                  style={{ width: '100%', height: '100%' }}
                  onClick={() => setSelected(null)}
                >
                  {filtered.map(m => (
                    <AdvancedMarker
                      key={m.bookingId}
                      position={{ lat: m.lat, lng: m.lng }}
                      anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
                      onClick={() => handleMarkerClick(m)}
                    >
                      <Pin type={m.type} status={m.status} selected={selected?.bookingId === m.bookingId} />
                    </AdvancedMarker>
                  ))}
                </Map>
              </APIProvider>

              {/* Legend overlay */}
              <div className="absolute bottom-8 left-4 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-4 text-xs space-y-2 z-10 min-w-[160px]">
                <p className="font-semibold text-gray-700 text-xs uppercase tracking-wide mb-2">Legend</p>
                {Object.entries(markerStyle).filter(([k]) => !k.endsWith('_default')).map(([key, s]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.dot }} />
                    <span className="text-gray-500">{s.label}</span>
                  </div>
                ))}
              </div>

              {/* Active count badge */}
              <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg px-3.5 py-2.5 z-10 flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-sm font-bold text-gray-800">{filtered.length}</span>
                <span className="text-xs text-gray-400">{filtered.length === 1 ? 'booking' : 'bookings'} active</span>
              </div>

              {/* Live-map info banner: explains why jobs may be missing */}
              {markers.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl px-6 py-5 max-w-sm text-center">
                    <AlertCircle className="h-8 w-8 text-gray-400 mx-auto mb-3" />
                    <p className="font-semibold text-gray-800 text-sm mb-1">No active bookings on map</p>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Only bookings with a live GPS position are shown here
                      (status: en route, in progress, or arrived). Jobs that are
                      open, accepted, or not yet broadcasting location will not
                      appear. Check the <strong>All Bookings</strong> table below.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Side panel */}
            {selected && (
              <div className="w-80 bg-white shadow-xl flex flex-col shrink-0 z-20">
                <div className="px-5 py-4 flex items-start justify-between">
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">Booking ID</p>
                    <p className="font-semibold text-sm text-gray-900 font-mono">{selected.bookingId.slice(0, 12)}…</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-gray-600" onClick={() => setSelected(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="h-1 w-full" style={{ backgroundColor: getStyle(selected.type, selected.status).dot }} />

                <div className="px-5 pt-4 pb-2 flex items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
                    style={{
                      backgroundColor: `${getStyle(selected.type, selected.status).dot}18`,
                      color: getStyle(selected.type, selected.status).dot,
                    }}
                  >
                    {selected.type === 'ride' ? <Car className="h-3 w-3" /> : <Wrench className="h-3 w-3" />}
                    {selected.status.replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs text-gray-400 capitalize">{selected.type}</span>
                </div>

                <div className="px-5 pb-5 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[11px] text-gray-400 font-medium mb-1">Provider</p>
                      <p className="text-sm font-semibold text-gray-800">{selected.providerName ?? '-'}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[11px] text-gray-400 font-medium mb-1">Client</p>
                      <p className="text-sm font-semibold text-gray-800">{selected.clientName ?? '-'}</p>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-[11px] text-gray-400 font-medium mb-1">Coordinates</p>
                    <p className="text-xs font-mono text-gray-600">{selected.lat.toFixed(5)}° N &nbsp;|&nbsp; {Math.abs(selected.lng).toFixed(5)}° W</p>
                  </div>

                  {selected.detail && (
                    <div className="bg-orange-50 rounded-lg p-3">
                      <p className="text-[11px] text-orange-400 font-medium mb-1">
                        {selected.type === 'ride' ? 'Fare' : 'Agreed Price'}
                      </p>
                      <p className="text-base font-bold" style={{ color: C.gold }}>
                        {selected.type === 'ride'
                          ? fmt(selected.detail.farePesewas as number)
                          : fmt(selected.detail.agreedPricePesewas as number | null)}
                      </p>
                    </div>
                  )}

                  {selected.detail && selected.type === 'ride' && (
                    <div className="space-y-2">
                      {(selected.detail.pickupAddress as string) && (
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-[11px] text-gray-400 font-medium mb-1">Pickup</p>
                          <p className="text-xs text-gray-700">{selected.detail.pickupAddress as string}</p>
                        </div>
                      )}
                      {(selected.detail.dropoffAddress as string) && (
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-[11px] text-gray-400 font-medium mb-1">Dropoff</p>
                          <p className="text-xs text-gray-700">{selected.detail.dropoffAddress as string}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {selected.detail && selected.type === 'job' && (selected.detail.address as string) && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[11px] text-gray-400 font-medium mb-1">Address</p>
                      <p className="text-xs text-gray-700">{selected.detail.address as string}</p>
                    </div>
                  )}

                  {!selected.detail && (
                    <div className="flex items-center gap-2.5 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2.5">
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 border-t-gray-500 animate-spin shrink-0" />
                      Loading booking details…
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── All Bookings Table ───────────────────────────────────────────── */}
        <div className="bg-white border-t border-gray-200">
          {/* Collapsible header */}
          <button
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
            onClick={() => setTableOpen(v => !v)}
          >
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-gray-900">All Bookings</h2>
              <span className="text-xs text-gray-400 font-normal">All rides &amp; artisan jobs - every status</span>
            </div>
            {tableOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
          </button>

          {tableOpen && (
            <div className="px-6 pb-6">
              {/* Tabs */}
              <div className="flex gap-1 mb-5 border-b border-gray-100">
                {(['rides', 'jobs'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setTableTab(tab)}
                    className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px capitalize ${
                      tableTab === tab
                        ? 'border-orange-500 text-orange-600'
                        : 'border-transparent text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    {tab === 'rides' ? (
                      <span className="flex items-center gap-1.5"><Car className="h-3.5 w-3.5" /> Rides</span>
                    ) : (
                      <span className="flex items-center gap-1.5"><Wrench className="h-3.5 w-3.5" /> Artisan Jobs</span>
                    )}
                  </button>
                ))}
              </div>

              {tableTab === 'rides' ? <RidesTable /> : <JobsTable />}
            </div>
          )}
        </div>

      </div>
    </PageGuard>
  )
}
