"use client"

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { PageGuard } from '@/components/common/page-guard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAdminRegionScope } from '@/components/admin/admin-region-scope'
import { createManualSurge, listManualSurges, listRegions, toggleManualSurge, type ManualSurge, type Region } from '@/lib/api'
import { SurgeAreaMap } from './surge-area-map'
import { userSafeAdminError } from '@/lib/api-client'

export default function ManualSurgePage() {
  return <PageGuard permission="manage_surge"><ManualSurgeControls /></PageGuard>
}

function ManualSurgeControls() {
  const { activeRegionId } = useAdminRegionScope()
  const region = { id: activeRegionId }
  const [regions, setRegions] = useState<Region[]>([])
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
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [items, areas] = await Promise.all([listManualSurges(), listRegions()])
      setRules(items)
      setRegions(areas.filter(area => area.ridesEnabled && (!region.id || area.id === region.id)))
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
      await createManualSurge({ regionId: region.id ?? regionId, name: name.trim(), reason: reason.trim(), multiplier: Number(multiplier), centerLat: center.lat, centerLng: center.lng, radiusMeters: Number(radiusMeters) })
      setName(''); setReason(''); await load()
    } catch (err) { setError(userSafeAdminError(err, 'Could not enable manual surge.')) }
    finally { setBusy(false) }
  }
  async function toggle(rule: ManualSurge) {
    setBusy(true); setError('')
    try { await toggleManualSurge(rule.id, !rule.isActive); await load() }
    catch (err) { setError(userSafeAdminError(err, 'Could not update manual surge.')) }
    finally { setBusy(false) }
  }
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-semibold">Manual surge</h1>
      <p className="text-muted-foreground">Apply surge to new ride quotes inside a selected area of an operational region. Automatic surge continues running; the higher multiplier applies. Existing bookings keep their locked pricing.</p></div>
    {error && <p role="alert" className="text-destructive">{error}</p>}
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
    <Card><CardHeader><CardTitle>Manual surge applications</CardTitle></CardHeader><CardContent className="space-y-4">
      <Button variant="outline" disabled={busy || loading} onClick={() => void load()}>Refresh</Button>
      {loading ? <p role="status">Loading…</p> : rules.length === 0 ? <p>No manual surge applications.</p> : rules.map(rule => <div key={rule.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3">
        <div><p className="font-medium">{rule.name} · {Number(rule.multiplier).toFixed(2)}×</p><p className="text-sm text-muted-foreground">{rule.region.name} · {rule.radiusMeters} m radius · {rule.isActive ? 'Enabled' : 'Disabled'}</p></div>
        <Button variant={rule.isActive ? 'destructive' : 'outline'} disabled={busy} onClick={() => void toggle(rule)}>{rule.isActive ? 'Disable' : 'Enable'}</Button>
      </div>)}
    </CardContent></Card>
  </div>
}
