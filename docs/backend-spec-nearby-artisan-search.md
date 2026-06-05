# Backend Spec — Nearby Artisan Search for Manual Assignment

> **Status:** Draft, awaiting backend implementation
> **Owners:** Backend (admin module) + Frontend (admin panel)
> **Frontend caller:** `app/(dashboard)/artisan-jobs/manual-assignment/page.tsx`
> **Related docs:** `admin-module.md` §Artisan Jobs, EDD §Auto-matching, PRD §Artisan request flow

---

## 1. Goal

When an admin manually assigns an artisan to an unassigned job (a job whose 5-minute bid window elapsed without bids), they should be able to **see and prioritise artisans physically near the client's job location**. Today the admin panel can list artisans by category but has no way to filter or sort by proximity.

This spec adds the minimum backend surface for the panel to:
- Render the job's pin location on a map (already true on `/admin/live-map`; need it on `/admin/jobs/unassigned` too).
- Search artisans within N km of that pin, sorted nearest-first, with `distanceKm` annotated on each result.

The new fields are **additive**. Existing callers continue to work unchanged.

---

## 2. Endpoint changes

### 2.1 `GET /v1/admin/jobs/unassigned` — extend response

Add `lat` and `lng` to each job. These already exist in the DB (`service_requests.location`, PostGIS `geography(Point, 4326)`); they're just not surfaced on this endpoint today.

**Response shape (additive, deltas in bold):**

```jsonc
{
  "total": 12,
  "jobs": [
    {
      "id": "uuid",
      "status": "queued",
      "description": "...",
      "addressText": "...",
      "createdAt": "2026-05-07T09:32:00Z",
      "scheduledFor": null,
      "categoryId": "uuid",
      "categoryName": "Plumbing",
      "minBidPesewas": 5000,
      "clientName": "...",
      "clientPhone": "...",
      "bidCount": 0,
      "hoursInQueue": 0.6,
      "adminLock": null,
      "lat": 6.6885,    // ← NEW, nullable
      "lng": -1.6244    // ← NEW, nullable
    }
  ]
}
```

**Notes:**
- `lat`/`lng` are `number | null`. Null only if the row genuinely has no location (legacy rows, USSD-pinless requests).
- Use the same PostGIS extraction pattern as live-map: `ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng`.
- No change to existing query filters or roles (L1, L3).

---

### 2.2 `GET /v1/admin/artisans/search` — add proximity params

Today the endpoint accepts `categoryId`, `q`, `limit`. Add three optional query params and four new fields per result.

**New query params:**

| Param      | Type             | Required          | Description                                                                  |
| ---------- | ---------------- | ----------------- | ---------------------------------------------------------------------------- |
| `lat`      | float            | only if `lng` set | Reference latitude (the job's pin) for distance annotation/sort/filter.      |
| `lng`      | float            | only if `lat` set | Reference longitude.                                                         |
| `maxKm`    | float            | optional          | Hard radius filter. Default unset (no radius cap).                           |
| `sort`     | `nearest`/`name` | optional          | Defaults to `name` when no `lat`/`lng`; defaults to `nearest` when both set. |

**Validation:**
- `lat` must be in `[-90, 90]`, `lng` in `[-180, 180]`. `400 INVALID_COORDINATES` on violation.
- `maxKm` must be `> 0` and `<= 200`. `400 INVALID_RADIUS` on violation.
- `sort=nearest` requires `lat`+`lng`. `400 SORT_REQUIRES_COORDS` if not.

**Result shape (additive, deltas in bold):**

```jsonc
[
  {
    "id": "uuid",
    "userId": "uuid",
    "fullName": "Kofi Mensah",
    "phone": "+233...",
    "displayName": "Kofi M.",
    "onlineStatus": "online",
    "rating": 4.7,
    "completedJobsCount": 32,
    "verificationStatus": "approved",
    "categories": [{ "id": "uuid", "name": "Plumbing" }],
    "lat": 6.6912,                  // ← NEW, nullable
    "lng": -1.6201,                 // ← NEW, nullable
    "lastLocationAt": "2026-05-07T10:14:00Z", // ← NEW, nullable
    "distanceKm": 0.42              // ← NEW, only present when lat/lng query params provided
  }
]
```

**Notes:**
- `lat`/`lng` come from the artisan's last broadcast location (same source as `/admin/live-map` for online providers). For offline artisans, return their last-known location with `lastLocationAt` set so the UI can label staleness.
- `distanceKm` is computed via `ST_Distance(artisan.location::geography, ST_MakePoint(:lng, :lat)::geography) / 1000`. Round to 2 decimal places. Omit (don't return as `null`) when `lat`/`lng` query params are absent.
- When `sort=nearest`, artisans without a known location sort to the bottom regardless of online status.
- `maxKm` filtering excludes artisans without a known location (they can't be confirmed inside the radius).

---

### 2.3 (Optional) Config key `manual_assign_default_radius_km`

Add to `platform_config` so ops can tune the default radius the panel pre-fills:

```json
{ "key": "manual_assign_default_radius_km", "value": "10" }
```

If not present, frontend falls back to no radius cap. Not strictly required for v1, but trivial to add and avoids hardcoding in the UI.

---

## 3. PostGIS query sketch

Reusing the live-map pattern. Build on the existing artisan search query (Prisma `findMany` followed by enrichment, or raw SQL — backend's call) by joining the latest known location.

```sql
-- Pseudocode; the team's actual query layer is Prisma + raw where needed.
SELECT
  a.id,
  a.user_id,
  u.full_name,
  u.phone,
  a.display_name,
  a.online_status,
  a.rating,
  a.completed_jobs_count,
  a.verification_status,
  ST_Y(a.last_location::geometry) AS lat,
  ST_X(a.last_location::geometry) AS lng,
  a.last_location_at,
  CASE
    WHEN $useDistance THEN ROUND(
      (ST_Distance(a.last_location::geography, ST_MakePoint($lng, $lat)::geography) / 1000)::numeric,
      2
    )
    ELSE NULL
  END AS distance_km
FROM artisans a
JOIN users u ON u.id = a.user_id
WHERE a.verification_status = 'approved'
  AND ($categoryId IS NULL OR EXISTS (
    SELECT 1 FROM artisan_categories ac
    WHERE ac.artisan_id = a.id AND ac.category_id = $categoryId
  ))
  AND ($q IS NULL OR u.full_name ILIKE '%' || $q || '%' OR u.phone ILIKE '%' || $q || '%')
  AND ($maxKm IS NULL OR a.last_location IS NULL OR
       ST_DWithin(a.last_location::geography, ST_MakePoint($lng, $lat)::geography, $maxKm * 1000))
ORDER BY
  CASE WHEN $sortNearest AND a.last_location IS NOT NULL THEN
    ST_Distance(a.last_location::geography, ST_MakePoint($lng, $lat)::geography)
  END ASC NULLS LAST,
  u.full_name ASC
LIMIT $limit;
```

**Index:** ensure a GIST index on `artisans.last_location` exists. If not:

```sql
CREATE INDEX IF NOT EXISTS artisans_last_location_gist_idx
ON artisans USING GIST (last_location);
```

---

## 4. Edge cases & error contract

| Case                                        | Behaviour                                                                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Job has no `location`                       | Endpoint returns `lat: null`, `lng: null`. Frontend disables proximity sort and shows "No location on this job."        |
| Artisan has never broadcast a location       | Returned with `lat: null`, `lng: null`, `lastLocationAt: null`. Excluded by `maxKm`, sorted last by `nearest`.         |
| Artisan offline but had a location yesterday | Returned with stale coords + `lastLocationAt`. Frontend shows "Last seen Xh ago" badge.                                  |
| Only one of `lat`/`lng` provided            | `400 COORDINATES_INCOMPLETE`.                                                                                          |
| `sort=nearest` without coords               | `400 SORT_REQUIRES_COORDS`.                                                                                            |
| `maxKm` excludes everyone                   | Empty array, `200 OK`. Frontend shows the existing empty state with a hint about widening the radius.                  |

No new error codes overall — just specific 400 messages for misuse of new params.

---

## 5. Acceptance criteria

- [ ] `/admin/jobs/unassigned` response includes `lat` and `lng` for every job that has a `location`.
- [ ] `/admin/artisans/search` accepts `lat`, `lng`, `maxKm`, `sort` per §2.2, with the validations listed.
- [ ] When `lat`+`lng` are provided, every result carries a `distanceKm` (rounded to 2dp). When absent, `distanceKm` is omitted.
- [ ] Each result carries `lat`, `lng`, `lastLocationAt` (nullable).
- [ ] `sort=nearest` orders results by ascending `distanceKm`, with no-location artisans last.
- [ ] `maxKm` enforces a hard radius (no-location artisans excluded).
- [ ] No regression for callers that don't send the new params (default behaviour identical to today).
- [ ] Roles unchanged: `L1, L3`.
- [ ] Index on `artisans.last_location` exists in migrations.

---

## 6. Frontend rollout (separate PRs)

This spec unblocks the panel work. Once the API is live:

1. **Types:** extend `UnassignedJob` with `lat`/`lng`; extend `ArtisanSearchResult` with `lat`/`lng`/`lastLocationAt`/`distanceKm`. `searchArtisans` gains `lat`/`lng`/`maxKm`/`sort` params.
2. **UI:** when a job is selected, pass its `lat`/`lng` into `searchArtisans`; render `distanceKm` per artisan card; default `sort=nearest`; expose a "within X km" filter pre-filled from `manual_assign_default_radius_km` (or a sensible static fallback).
3. **Empty/edge states:**
   - Job with no location → disable proximity controls, show notice.
   - Artisan with no location → render "—" for distance and a small "Location unavailable" hint.
   - Stale location → render distance + "Last seen Xh ago".
4. **Interim (Option C, parallel work):** while backend is in flight, optionally compute Haversine on the client by reusing `/admin/live-map` artisan markers as the location source. Drop this code the moment §2.2 ships.

---

## 7. Out of scope (for this spec)

- Pushing real-time artisan location changes to the panel (current pattern is poll-on-fetch; live updates can be a later enhancement once the WS live-map work lands — see `admin-module.md` known issue P2).
- Scoring artisans by anything beyond raw distance (rating-weighted ranking, fairness rotation, etc.). Out of scope for v1 — admin can still manually pick from the list.
- Changing the auto-matching algorithm itself (this spec only powers the **manual** assignment UI).
