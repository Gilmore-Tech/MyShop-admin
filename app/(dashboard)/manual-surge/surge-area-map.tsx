"use client"

import { useEffect, useState } from 'react'
import { APIProvider, Map, useMap, useMapsLibrary } from '@vis.gl/react-google-maps'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Point = { lat: number; lng: number }
type Props = { center: Point | null; radiusMeters: number; onChange: (point: Point) => void; disabled: boolean; regionName: string }

function AreaOverlay({ center, radiusMeters }: Pick<Props, 'center' | 'radiusMeters'>) {
  const map = useMap()
  useEffect(() => {
    if (!map || !center) return
    map.panTo(center)
    const circle = new google.maps.Circle({ map, center, radius: radiusMeters,
      clickable: false, strokeColor: '#d97706', fillColor: '#f59e0b', fillOpacity: 0.2, strokeWeight: 2 })
    const marker = new google.maps.Marker({ map, position: center })
    return () => { circle.setMap(null); marker.setMap(null) }
  }, [map, center, radiusMeters])
  return null
}

function SearchArea({ onChange, disabled, regionName }: Pick<Props, 'onChange' | 'disabled' | 'regionName'>) {
  const library = useMapsLibrary('geocoding')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<google.maps.GeocoderResult[]>([])
  const [message, setMessage] = useState('')
  const [searching, setSearching] = useState(false)
  async function search() {
    if (!library || !query.trim()) return
    setSearching(true); setMessage(''); setResults([])
    try {
      const response = await new library.Geocoder().geocode({ address: `${query.trim()}, ${regionName}, Ghana`, componentRestrictions: { country: 'GH' } })
      setResults(response.results)
      if (!response.results.length) setMessage('No areas found. Try another name or pin the map.')
    } catch { setMessage('Area search is unavailable. Try again or pin the map.') }
    finally { setSearching(false) }
  }
  return <div className="space-y-2">
    <label htmlFor="surge-area-search" className="text-sm font-medium">Find an area by name or click the map</label>
    <div className="flex gap-2"><Input id="surge-area-search" placeholder="Area or landmark" value={query} disabled={disabled} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void search() } }} />
      <Button type="button" variant="outline" disabled={disabled || searching || !library || !query.trim()} onClick={() => void search()}>{searching ? 'Searching…' : 'Find area'}</Button></div>
    {message && <p role="status" className="text-sm">{message}</p>}
    {results.map(result => <Button className="h-auto whitespace-normal text-left" key={result.place_id} type="button" variant="outline" disabled={disabled} onClick={() => { onChange(result.geometry.location.toJSON()); setResults([]) }}>{result.formatted_address}</Button>)}
  </div>
}

export function SurgeAreaMap(props: Props) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (!key) return <p role="alert">Area selection needs the Google Maps API key. Configure it to enable map pinning and area search.</p>
  return <APIProvider apiKey={key}>
    <SearchArea {...props} />
    <div className="h-80 overflow-hidden rounded-md border">
      <Map defaultCenter={{ lat: 6.6885, lng: -1.6244 }} defaultZoom={12} gestureHandling="greedy" onClick={event => { if (!props.disabled && event.detail.latLng) props.onChange(event.detail.latLng) }}>
        <AreaOverlay {...props} />
      </Map>
    </div>
    {props.center && <p className="text-sm">Pinned centre: {props.center.lat.toFixed(5)}, {props.center.lng.toFixed(5)}</p>}
  </APIProvider>
}
