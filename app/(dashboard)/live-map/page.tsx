'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { PageGuard } from '@/components/common/page-guard'
import Map, { Marker, NavigationControl, FullscreenControl, ScaleControl } from 'react-map-gl/mapbox'
import'mapbox-gl/dist/mapbox-gl.css'
import { Car, Wrench, Search, X, RefreshCw, Activity, MapPin } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getLiveMapData, getRideMarkerDetail, getJobMarkerDetail, type LiveMapMarker } from '@/lib/api'

type SelectedMarker = LiveMapMarker & { detail: Record<string, unknown> | null }

const C = {
 gold:'#F5A623',
 blue:'#3B82F6',
 purple:'#8B5CF6',
 green:'#10B981',
 orange:'#F97316',
}

// ─── Marker dot colours ──────────────────────────────────────────────────────
const markerStyle: Record<string, { dot: string; ring: string; label: string }> = {
 ride_en_route: { dot: C.green, ring: `${C.green}30`, label:'Ride en route' },
 ride_in_progress: { dot: C.blue, ring: `${C.blue}30`, label:'Ride in progress' },
 ride_default: { dot: C.blue, ring: `${C.blue}30`, label:'Ride active' },
 job_en_route: { dot: C.orange, ring: `${C.orange}30`, label:'Artisan en route' },
 job_arrived: { dot: C.purple, ring: `${C.purple}30`, label:'Artisan on site' },
 job_default: { dot: C.orange, ring: `${C.orange}30`, label:'Artisan active' },
}

function getStyle(type: string, status: string) {
 return (
 markerStyle[`${type}_${status}`] ??
 markerStyle[`${type}_default`] ??
 { dot:'#6b7280', ring:'#6b728030', label: status }
 )
}

// ─── Custom pin ───────────────────────────────────────────────────────────────
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
 {type ==='ride'
 ? <Car style={{ width: selected ? 11 : 9, height: selected ? 11 : 9, color:'#fff' }} />
 : <Wrench style={{ width: selected ? 11 : 9, height: selected ? 11 : 9, color:'#fff' }} />
 }
 </span>
 </div>
 )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LiveMapPage() {
 const [markers, setMarkers] = useState<LiveMapMarker[]>([])
 const [showFilter, setShowFilter] = useState('both')
 const [statusFilter, setStatusFilter] = useState('all')
 const [search, setSearch] = useState('')
 const [selected, setSelected] = useState<SelectedMarker | null>(null)
 const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

 const loadMarkers = useCallback(async () => {
 try {
 const data = await getLiveMapData()
 setMarkers(Array.isArray(data) ? data : [])
 } catch { /* silently keep last state */ }
 }, [])

 useEffect(() => {
 loadMarkers()
 pollRef.current = setInterval(loadMarkers, 30_000)
 return () => { if (pollRef.current) clearInterval(pollRef.current) }
 }, [loadMarkers])

 async function handleMarkerClick(m: LiveMapMarker) {
 if (selected?.bookingId === m.bookingId) { setSelected(null); return }
 setSelected({ ...m, detail: null })
 try {
 const detail = m.type ==='ride'
 ? await getRideMarkerDetail(m.bookingId)
 : await getJobMarkerDetail(m.bookingId)
 setSelected(prev => prev ? { ...prev, detail: detail as unknown as Record<string, unknown> } : null)
 } catch { /* detail unavailable */ }
 }

 const filtered = markers.filter(m => {
 const matchType = showFilter ==='both' || m.type === showFilter
 const matchStatus = statusFilter ==='all' || m.status === statusFilter
 const matchSearch = !search ||
 m.bookingId.toLowerCase().includes(search.toLowerCase()) ||
 (m.providerName ??'').toLowerCase().includes(search.toLowerCase())
 return matchType && matchStatus && matchSearch
 })

 const rideCount = markers.filter(m => m.type ==='ride').length
 const jobCount = markers.filter(m => m.type ==='job').length

 const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!
 const styleUrl='mapbox://styles/mapbox/dark-v11'

 return (
 <PageGuard permission="view_live_map">
 <div className="-m-6 h-[calc(100vh-4rem)] flex flex-col">

 {/* ── Top bar ──────────────────────────────────────────────────────────── */}
 <div className="shrink-0 bg-white shadow-sm z-10">
 {/* Header row */}
 <div className="flex items-center justify-between px-5 pt-4 pb-3">
 <div>
 <h1 className="text-xl font-bold text-gray-900 leading-tight">Live Operations Map</h1>
 <p className="text-sm text-gray-400 mt-0.5">Real-time tracking of active rides &amp; artisan jobs · auto-refreshes every 30 s</p>
 </div>
 <div className="flex items-center gap-3">
 {/* KPI chips */}
 <div className="flex items-center gap-2">
 <div className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-1.5">
 <Car className="h-3.5 w-3.5 text-blue-500" />
 <span className="text-sm font-semibold text-blue-700">{rideCount}</span>
 <span className="text-xs text-blue-400">rides</span>
 </div>
 <div className="flex items-center gap-2 bg-orange-50 rounded-lg px-3 py-1.5">
 <Wrench className="h-3.5 w-3.5 text-orange-500" />
 <span className="text-sm font-semibold text-orange-700">{jobCount}</span>
 <span className="text-xs text-orange-400">jobs</span>
 </div>
 <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
 <Activity className="h-3.5 w-3.5 text-gray-400" />
 <span className="text-sm font-semibold text-gray-700">{markers.length}</span>
 <span className="text-xs text-gray-400">total</span>
 </div>
 </div>
 <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 rounded-lg px-2.5 py-1.5">
 <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" /> Live
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

 {/* ── Map + side panel ─────────────────────────────────────────────────── */}
 <div className="flex flex-1 overflow-hidden">
 {/* Map */}
 <div className="flex-1 relative">
 <Map
 mapboxAccessToken={token}
 initialViewState={{ longitude: -1.6244, latitude: 6.6884, zoom: 13 }}
 style={{ width:'100%', height:'100%' }}
 mapStyle={styleUrl}
 onClick={() => setSelected(null)}
 >
 <NavigationControl position="top-right" />
 <FullscreenControl position="top-right" />
 <ScaleControl position="bottom-right" unit="metric" />

 {filtered.map(m => (
 <Marker
 key={m.bookingId}
 longitude={m.lng}
 latitude={m.lat}
 anchor="center"
 onClick={e => { e.originalEvent.stopPropagation(); handleMarkerClick(m) }}
 >
 <Pin type={m.type} status={m.status} selected={selected?.bookingId === m.bookingId} />
 </Marker>
 ))}
 </Map>

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
 <span className="text-xs text-gray-400">{filtered.length === 1 ?'booking' :'bookings'} active</span>
 </div>
 </div>

 {/* Side panel */}
 {selected && (
 <div className="w-80 bg-white shadow-xl flex flex-col shrink-0 z-20">
 {/* Panel header */}
 <div className="px-5 py-4 flex items-start justify-between">
 <div>
 <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">Booking ID</p>
 <p className="font-semibold text-sm text-gray-900 font-mono">{selected.bookingId.slice(0, 12)}…</p>
 </div>
 <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-gray-600" onClick={() => setSelected(null)}>
 <X className="h-4 w-4" />
 </Button>
 </div>

 {/* Status colour bar */}
 <div className="h-1 w-full" style={{ backgroundColor: getStyle(selected.type, selected.status).dot }} />

 {/* Type + status badge */}
 <div className="px-5 pt-4 pb-2 flex items-center gap-2">
 <span
 className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
 style={{
 backgroundColor: `${getStyle(selected.type, selected.status).dot}18`,
 color: getStyle(selected.type, selected.status).dot,
 }}
 >
 {selected.type ==='ride' ? <Car className="h-3 w-3" /> : <Wrench className="h-3 w-3" />}
 {selected.status.replace(/_/g,'')}
 </span>
 <span className="text-xs text-gray-400 capitalize">{selected.type}</span>
 </div>

 {/* Detail fields */}
 <div className="px-5 pb-5 space-y-4">
 <div className="grid grid-cols-2 gap-4">
 <div className="bg-gray-50 rounded-lg p-3">
 <p className="text-[11px] text-gray-400 font-medium mb-1">Provider</p>
 <p className="text-sm font-semibold text-gray-800">{selected.providerName ??'—'}</p>
 </div>
 <div className="bg-gray-50 rounded-lg p-3">
 <p className="text-[11px] text-gray-400 font-medium mb-1">Client</p>
 <p className="text-sm font-semibold text-gray-800">{selected.clientName ??'—'}</p>
 </div>
 </div>

 <div className="bg-gray-50 rounded-lg p-3">
 <p className="text-[11px] text-gray-400 font-medium mb-1">Coordinates</p>
 <p className="text-xs font-mono text-gray-600">{selected.lat.toFixed(5)}° N &nbsp;·&nbsp; {Math.abs(selected.lng).toFixed(5)}° W</p>
 </div>

 {selected.detail && (
 <div className="bg-orange-50 rounded-lg p-3">
 <p className="text-[11px] text-orange-400 font-medium mb-1">
 {selected.type ==='ride' ?'Fare' :'Agreed Price'}
 </p>
 <p className="text-base font-bold" style={{ color: C.gold }}>
 {selected.type ==='ride'
 ? `GHS ${((selected.detail.farePesewas as number ?? 0) / 100).toFixed(2)}`
 : selected.detail.agreedPricePesewas != null
 ? `GHS ${((selected.detail.agreedPricePesewas as number) / 100).toFixed(2)}`
 :'—'
 }
 </p>
 </div>
 )}

 {selected.detail && selected.type ==='ride' && (
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

 {selected.detail && selected.type ==='job' && (selected.detail.address as string) && (
 <div className="bg-gray-50 rounded-lg p-3">
 <p className="text-[11px] text-gray-400 font-medium mb-1">Address</p>
 <p className="text-xs text-gray-700">{selected.detail.address as string}</p>
 </div>
 )}

 {!selected.detail && (
 <div className="flex items-center gap-2.5 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2.5">
 <span className="w-3.5 h-3.5 rounded-full -gray-500 animate-spin shrink-0" />
 Loading booking details…
 </div>
 )}
 </div>
 </div>
 )}
 </div>
 </div>
 </PageGuard>
 )
}
