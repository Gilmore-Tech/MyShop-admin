'use client'

import { useEffect, useMemo, useRef } from 'react'
import {
  AdvancedMarker,
  APIProvider,
  Map,
  useMap,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps'
import { MapPin } from 'lucide-react'
import type {
  GeoJsonMultiPolygon,
  GeoJsonPosition,
  RideTollZone,
} from '@/lib/ride-toll-policy-contract'

interface BoundaryOverlayProps {
  boundary: GeoJsonMultiPolygon
  colour: string
  editable: boolean
  onChange?: (boundary: GeoJsonMultiPolygon) => void
}

function normalisePath(path: google.maps.MVCArray<google.maps.LatLng>): GeoJsonPosition[] {
  const positions = path.getArray().map((point) => [point.lng(), point.lat()] as GeoJsonPosition)
  if (positions.length > 0) positions.push([...positions[0]] as GeoJsonPosition)
  return positions
}

function BoundaryOverlay({ boundary, colour, editable, onChange }: BoundaryOverlayProps) {
  const map = useMap()
  const callbackRef = useRef(onChange)
  callbackRef.current = onChange

  useEffect(() => {
    if (!map) return
    const polygons = boundary.coordinates.map((polygon) => {
      const paths = polygon.map((ring) => new google.maps.MVCArray(
        ring.slice(0, -1).map(([lng, lat]) => new google.maps.LatLng(lat, lng)),
      ))
      const overlay = new google.maps.Polygon({
        editable,
        draggable: false,
        clickable: false,
        strokeColor: colour,
        strokeOpacity: 0.95,
        strokeWeight: editable ? 3 : 2,
        fillColor: colour,
        fillOpacity: editable ? 0.25 : 0.12,
        zIndex: editable ? 10 : 1,
      })
      overlay.setPaths(new google.maps.MVCArray(paths))
      overlay.setMap(map)
      return { overlay, paths }
    })

    const listeners: google.maps.MapsEventListener[] = []
    const emit = () => {
      if (!callbackRef.current) return
      const coordinates = polygons.map(({ paths }) =>
        paths.map((path) => normalisePath(path)),
      )
      if (coordinates.every((polygon) =>
        polygon.length > 0 && polygon.every((ring) => ring.length >= 4))) {
        callbackRef.current({ type: 'MultiPolygon', coordinates })
      }
    }
    if (editable) {
      for (const { paths } of polygons) {
        paths.forEach((path) => {
          listeners.push(path.addListener('insert_at', emit))
          listeners.push(path.addListener('set_at', emit))
          listeners.push(path.addListener('remove_at', emit))
        })
      }
    }
    return () => {
      listeners.forEach((listener) => listener.remove())
      polygons.forEach(({ overlay }) => overlay.setMap(null))
    }
  }, [boundary, colour, editable, map])

  return null
}

function DraftOverlay({ points }: { points: GeoJsonPosition[] }) {
  const map = useMap()
  useEffect(() => {
    if (!map || points.length < 2) return
    const path = points.map(([lng, lat]) => ({ lat, lng }))
    const polyline = new google.maps.Polyline({
      map,
      path,
      strokeColor: '#dc2626',
      strokeOpacity: 1,
      strokeWeight: 3,
      zIndex: 20,
    })
    return () => polyline.setMap(null)
  }, [map, points])
  return null
}

const COLOURS = ['#f97316', '#2563eb', '#16a34a', '#9333ea', '#db2777', '#0891b2']

export function TollZoneMap({
  zones,
  selectedZoneId,
  drawing,
  drawingPoints,
  onMapPoint,
  onBoundaryChange,
}: {
  zones: RideTollZone[]
  selectedZoneId: string | null
  drawing: boolean
  drawingPoints: GeoJsonPosition[]
  onMapPoint: (point: GeoJsonPosition) => void
  onBoundaryChange: (boundary: GeoJsonMultiPolygon) => void
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? 'DEMO_MAP_ID'
  const center = useMemo(() => {
    const first = zones[0]?.boundary.coordinates[0]?.[0]?.[0]
    return first ? { lng: first[0], lat: first[1] } : { lat: 6.6884, lng: -1.6244 }
  }, [zones])

  if (!apiKey) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg border border-dashed border-amber-300 bg-amber-50 p-6 text-center">
        <div>
          <MapPin className="mx-auto h-6 w-6 text-amber-600" />
          <p className="mt-2 text-sm font-medium text-amber-900">Map editor unavailable</p>
          <p className="mt-1 max-w-md text-xs text-amber-700">
            NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not configured. Paste a validated GeoJSON
            MultiPolygon in the manual editor below; saving and preview remain fail-closed.
          </p>
        </div>
      </div>
    )
  }

  function handleMapClick(event: MapMouseEvent) {
    if (!drawing || !event.detail.latLng) return
    onMapPoint([event.detail.latLng.lng, event.detail.latLng.lat])
  }

  return (
    <div className="relative h-80 overflow-hidden rounded-lg border border-gray-200">
      <APIProvider apiKey={apiKey}>
        <Map
          mapId={mapId}
          defaultCenter={center}
          defaultZoom={13}
          gestureHandling="greedy"
          fullscreenControl
          zoomControl
          mapTypeControl
          style={{ width: '100%', height: '100%' }}
          onClick={handleMapClick}
        >
          {zones.map((zone, index) => (
            <BoundaryOverlay
              key={`${zone.id}-${JSON.stringify(zone.boundary.coordinates)}`}
              boundary={zone.boundary}
              colour={COLOURS[index % COLOURS.length]}
              editable={!drawing && zone.id === selectedZoneId}
              onChange={zone.id === selectedZoneId ? onBoundaryChange : undefined}
            />
          ))}
          {drawing && <DraftOverlay points={drawingPoints} />}
          {drawingPoints.map(([lng, lat], index) => (
            <AdvancedMarker key={`${lng}-${lat}-${index}`} position={{ lng, lat }}>
              <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-red-600 text-[10px] font-bold text-white shadow">
                {index + 1}
              </span>
            </AdvancedMarker>
          ))}
        </Map>
      </APIProvider>
      {drawing && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-red-600 px-3 py-2 text-xs font-semibold text-white shadow">
          Click at least three boundary points in order · {drawingPoints.length} selected
        </div>
      )}
    </div>
  )
}
