"use client"

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { PageGuard } from '@/components/common/page-guard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAdminRegionScope } from '@/components/admin/admin-region-scope'
import { createManualSurge, getManualSurge, listManualSurges, toggleManualSurge, type ManualSurge, type ManualSurgeDetail } from '@/lib/api'
import { SurgeAreaMap } from './surge-area-map'
import { userSafeAdminError } from '@/lib/api-client'

export default function ManualSurgePage() {
  return <PageGuard permission="manage_surge"><ManualSurgeControls /></PageGuard>
}

function ManualSurgeControls() {
  const { activeRegionId, regions: availableRegions } = useAdminRegionScope()
  const region = { id: activeRegionId }
  const regions = availableRegions.filter(area => area.ridesEnabled && (!region.id || area.id === region.id))
  const [rules, setRules] = useState<ManualSurge[]>([])
  const [regionId, setRegionId] = useState('')
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null)
  const [radiusMeters, setRadiusMeters] = useState('1000')
  const [name, setName] = useState('')
  const [reason, setReason] = useState('')
  const [multiplier, setMultiplier] = useState('1.20')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState<ManualSurge | null>(null)
  const [detail, setDetail] = useState<ManualSurgeDetail | null>(null)
  const [detailError, setDetailError] = useState('')
  const [detailLoading, setDetailLoading] = useState(false)
  const detailRequest = useRef(0)
  useEffect(() => () => { detailRequest.current += 1 }, [])
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const items = await listManualSurges(region.id)
      setRules(items)
      setError('')
    } catch (err) { setError(userSafeAdminError(err, 'Could not load manual surge.')) }
    finally { setLoading(false) }
  }, [region.id])
  useEffect(() => { void load() }, [load])
  async function enable(event: FormEvent) {
    event.preventDefault()
    if (!center) { setError('Find an area by name or pin its centre on the map.'); return }
    setBusy(true); setError('')
    try {
      const created = await createManualSurge({ regionId: region.id ?? regionId, name: name.trim(), reason: reason.trim(), multiplier: Number(multiplier), centerLat: center.lat, centerLng: center.lng, radiusMeters: Number(radiusMeters) })
      setRules(previous => [created, ...previous.filter(item => item.id !== created.id)])
      setNotice(`${created.name} enabled. It applies to subsequent quote reads in its coverage area.`)
      setName(''); setReason(''); await load()
    } catch (err) { setError(userSafeAdminError(err, 'Could not enable manual surge.')) }
    finally { setBusy(false) }
  }
  async function toggle(rule: ManualSurge) {
    setBusy(true); setError('')
    try {
      const updated = await toggleManualSurge(rule.id, !rule.isActive)
      // Keep a confirmed server update visible even if the subsequent list read fails.
      const confirmed = { ...rule, ...updated }
      setRules(previous => previous.map(item => item.id === rule.id ? confirmed : item))
      setNotice(`${rule.name} ${confirmed.isActive ? 'enabled' : 'disabled'}. Subsequent quote reads use the updated state. Other covering surges may still apply.`)
      if (selected?.id === rule.id) await view(confirmed)
      await load()
    }
    catch (err) { setError(userSafeAdminError(err, 'Could not update manual surge.')) }
    finally { setBusy(false) }
  }
  async function view(rule: ManualSurge) {
    const request = ++detailRequest.current
    setSelected(rule); setDetail(null); setDetailError(''); setDetailLoading(true)
    try {
      const result = await getManualSurge(rule.id)
      if (request === detailRequest.current) { setDetail(result); setSelected(result) }
    } catch (err) {
      if (request === detailRequest.current) setDetailError(userSafeAdminError(err, 'Could not load surge activity.'))
    } finally { if (request === detailRequest.current) setDetailLoading(false) }
  }
  function closeDetails() {
    detailRequest.current += 1
    setSelected(null); setDetail(null); setDetailLoading(false); setDetailError('')
  }
  const enabledCount = rules.filter(rule => rule.isActive).length
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-semibold">Manual surge</h1>
      <p className="text-muted-foreground">Apply surge to new ride quotes inside a selected area of an operational region. Automatic surge continues running; the higher multiplier applies. Existing bookings keep their locked pricing.</p></div>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {notice && <p role="status" className="rounded-md border p-3 text-sm">{notice}</p>}
    <Card><CardHeader><CardTitle>Manual surge applications</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">{loading ? 'Refreshing applications…' : `${enabledCount} enabled · ${rules.length - enabledCount} disabled`}</p>
        <Button variant="outline" disabled={busy || loading} onClick={() => void load()}>Refresh</Button>
      </div>
      <p className="text-sm text-muted-foreground">View coverage and activity, or disable any enabled application. Disabled applications remain available to view and re-enable.</p>
      {loading && rules.length === 0 ? <p role="status">Loading…</p> : rules.length === 0 ? <p>{error ? 'Applications could not be loaded. Use Refresh to try again.' : 'No manual surge applications in this region.'}</p> : rules.map(rule => <div key={rule.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3">
        <div><p className="font-medium">{rule.name} · {Number(rule.multiplier).toFixed(2)}×</p><p className="text-sm text-muted-foreground">{rule.region?.name ?? 'Operational region'} · {rule.radiusMeters} m radius · {rule.isActive ? 'Enabled' : 'Disabled'}</p></div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void view(rule)}>View details</Button>
          <Button variant={rule.isActive ? 'destructive' : 'outline'} disabled={busy} onClick={() => void toggle(rule)}>{busy ? 'Saving…' : rule.isActive ? 'Disable' : 'Enable'}</Button>
        </div>
      </div>)}
    </CardContent></Card>
    {selected && <Card><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>{selected.name}</CardTitle><Button variant="outline" onClick={closeDetails}>Close details</Button></div></CardHeader><CardContent className="space-y-4">
      <p>{selected.isActive ? 'Enabled' : 'Disabled'} · {Number(selected.multiplier).toFixed(2)}× · {selected.region?.name ?? 'Operational region'} · {selected.radiusMeters} m radius</p>
      <p className="text-sm">Centre: {selected.centerLat.toFixed(5)}, {selected.centerLng.toFixed(5)}</p>
      <p className="text-sm text-muted-foreground">Coverage is the circle intersected with the operational region. The highest applicable manual or automatic multiplier wins.</p>
      <SurgeAreaMap center={{ lat: selected.centerLat, lng: selected.centerLng }} radiusMeters={selected.radiusMeters} onChange={() => {}} disabled readOnly regionName={selected.region?.name ?? ''} />
      <Button variant={selected.isActive ? 'destructive' : 'outline'} disabled={busy} onClick={() => void toggle(selected)}>{selected.isActive ? 'Disable this surge' : 'Enable this surge'}</Button>
      <p className="text-sm">Created: {new Date(selected.createdAt).toLocaleString()} · Last updated: {new Date(selected.updatedAt).toLocaleString()}</p>
      <h3 className="font-medium">Activity history</h3>
      {detailLoading && <p role="status">Loading activity…</p>}
      {detailError && <div><p role="alert" className="text-destructive">{detailError}</p><Button variant="outline" onClick={() => void view(selected)}>Retry activity</Button></div>}
      {detail && (detail.activity.length === 0 ? <p>No recorded activity.</p> : <ul className="space-y-3">{detail.activity.map(event => <li key={event.id} className="border-b pb-3 text-sm">
        <p>{event.action === 'manual_surge_enabled' ? 'Enabled' : 'Disabled'} by {event.admin.fullName} · {new Date(event.createdAt).toLocaleString()}</p>
        {typeof event.details?.reason === 'string' && <p>Reason: {event.details.reason}</p>}
      </li>)}</ul>)}
      <p className="text-sm text-muted-foreground">Shows up to 100 recent changes. Per-application ride and revenue analytics are unavailable because bookings do not record the manual surge application used.</p>
    </CardContent></Card>}
    <Card><CardHeader><CardTitle>Enable manual surge</CardTitle></CardHeader><CardContent>
      <form onSubmit={enable} className="grid max-w-xl gap-4">
        <Label htmlFor="surge-region">Location</Label>
        <select id="surge-region" className="rounded-md border bg-background p-2" required value={region.id ?? regionId} disabled={busy || loading || !!region.id} onChange={event => { setRegionId(event.target.value); setCenter(null) }}>
          <option value="">Select a ride region</option>
          {regions.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
        </select>
        <SurgeAreaMap center={center} radiusMeters={Number(radiusMeters)} onChange={setCenter} disabled={busy} regionName={regions.find(area => area.id === (region.id ?? regionId))?.name ?? ''} />
        <Label htmlFor="surge-radius">Coverage radius (metres)</Label><Input id="surge-radius" type="number" min="100" max="20000" step="1" required value={radiusMeters} disabled={busy} onChange={event => setRadiusMeters(event.target.value)} />
        <p className="text-sm text-muted-foreground">Applies to pickups within this radius and the selected operational region. Outside pickups use automatic surge.</p>
        <Label htmlFor="surge-name">Name</Label><Input id="surge-name" required maxLength={100} value={name} disabled={busy} onChange={event => setName(event.target.value)} />
        <Label htmlFor="surge-multiplier">Multiplier (1.01–2.00×)</Label><Input id="surge-multiplier" type="number" required min="1.01" max="2" step="0.01" value={multiplier} disabled={busy} onChange={event => setMultiplier(event.target.value)} />
        <Label htmlFor="surge-reason">Reason</Label><Input id="surge-reason" required minLength={3} maxLength={500} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} />
        <Button disabled={busy || loading} type="submit">{busy ? 'Saving…' : 'Enable manual surge'}</Button>
      </form>
    </CardContent></Card>
  </div>
}
