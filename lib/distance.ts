import { getLiveMapData, type ArtisanSearchResult } from './api'

export interface LatLng {
  lat: number
  lng: number
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Best-effort interim distance annotation for the manual-assignment page.
//
// Reads /admin/live-map markers and pairs them to artisan results by id, then
// computes Haversine distance from the job pin. Used only when
// FEATURES.nearbyArtisanHaversine is on AND the backend hasn't yet returned a
// distanceKm of its own.
//
// LIMITATION: live-map only carries providers currently engaged in an active
// ride/job. Idle/available artisans — the ones we usually want to assign —
// won't have a marker and will keep `distanceKm: null`. Treat it as a hint, not
// a sort key. Spec A in docs/backend-spec-nearby-artisan-search.md replaces
// this with first-class server-side distance.
export async function annotateDistancesFromLiveMap(
  artisans: ArtisanSearchResult[],
  origin: LatLng,
): Promise<ArtisanSearchResult[]> {
  let markers: unknown[]
  try {
    markers = (await getLiveMapData()) as unknown as unknown[]
  } catch (err) {
    console.warn('[manual-assignment] live-map fallback failed', err)
    return artisans
  }

  const byId = new Map<string, LatLng>()
  for (const raw of markers) {
    const m = raw as Record<string, unknown>
    const id = (m.artisanId ?? m.providerId ?? m.userId) as string | undefined
    if (id && typeof m.lat === 'number' && typeof m.lng === 'number') {
      byId.set(id, { lat: m.lat, lng: m.lng })
    }
  }
  if (byId.size === 0) return artisans

  return artisans.map(a => {
    if (a.distanceKm != null) return a
    const m = byId.get(a.id) ?? byId.get(a.userId)
    if (!m) return a
    return {
      ...a,
      lat: a.lat ?? m.lat,
      lng: a.lng ?? m.lng,
      distanceKm: Number(haversineKm(origin, m).toFixed(2)),
    }
  })
}
