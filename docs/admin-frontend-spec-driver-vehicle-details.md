# Admin Frontend Spec — Driver Vehicle Details

**Repo:** `MyShop-admin` (Next.js 15 App Router + React 19 + shadcn/ui)
**Goal:** Let admins (esp. regional managers) manually fill in driver vehicle details (make, model, year, plate, colour), and easily find which drivers are still missing them.
**Status:** Editing already exists. Discoverability queue implemented on branch `feature/driver-vehicle-details-queue`. One backend dependency remains (see §5).

---

## 1. Why this matters

Most production drivers have `NULL` vehicle details. Root cause is **not** a missing feature:

1. Vehicle capture is not part of driver registration → fields default to `NULL`.
2. Drivers cannot self-edit vehicle info (backend returns `403 PROVIDER_INFO_EDIT_DISABLED`).
3. The only write path is the admin-only `PATCH /admin/users/:id/driver-profile`.

So the data is empty simply because **an admin has to type it in per driver**, and until recently there was no easy way to see who was missing it. This spec closes that workflow gap.

---

## 2. What ALREADY EXISTS — do NOT rebuild

Vehicle-detail **editing is fully implemented** and working today:

- **Entry point:** User Management → **Drivers** tab → click a driver → profile **Sheet** opens → **pencil / Edit** button (shown only if the admin has `edit_provider_profile`).
- **Editor:** `components/users/edit-provider-profile-dialog.tsx` — `DRIVER_FIELDS` already includes `vehicleMake`, `vehicleModel`, `vehicleYear` (1990–2100, integer), `vehicleColor`, `vehiclePlate`. Sends only changed fields; maps backend errors (`OUT_OF_SCOPE`, `EMAIL_ALREADY_EXISTS`, `NO_UPDATE_FIELDS`, `INSUFFICIENT_PERMISSIONS`).
- **API:** `editDriverProfile()` → `PATCH /admin/users/:id/driver-profile` (`lib/api.ts`).
- **Permission:** `edit_provider_profile` (the `regional_manager` role already has it).

**Any agent implementing this must verify this path first and extend it, never duplicate it.**

---

## 3. What this plan DELIVERS (discoverability queue)

Already implemented on branch `feature/driver-vehicle-details-queue`:

- **`app/(dashboard)/users/drivers/page.tsx`**
  - A **"Vehicle"** table column with a completeness badge: **Complete** (emerald) / **Missing** (amber), driven by the server flag `driver.vehicleDetailsComplete`. When the flag is absent (older API build) it renders a neutral **"—"** — never a false "Missing".
  - A **"Missing details"** filter `Select` (All vehicles / Missing details) that passes `missingVehicleDetails=true` to the list endpoint, so filtering + pagination stay correct **server-side**.
- **`lib/api.ts`**
  - `listUsers()` gains a `missingVehicleDetails?: boolean` param.
  - `PlatformUser.driver` gains an optional `vehicleDetailsComplete?: boolean`, mapped in `normalisePlatformUser` (preserving `undefined` so absence is detectable).

If you are re-implementing from scratch, replicate exactly the above two files' changes, matching existing conventions: `'use client'`, plain `useState`/`useEffect` data loading (no react-query), shadcn `Select`/`Table`, inline errors, orange-500 accent, permission gating via `useRole().can(...)` and `PageGuard`/`RoleGate`.

---

## 4. Backend contract this consumes

All under the API's global `/v1` prefix (the admin proxies via `/api/proxy`; the `/v1` lives in `UPSTREAM_API_URL`).

| Endpoint | Used for | Notes |
|---|---|---|
| `GET /admin/users?role=driver&missingVehicleDetails=true&status=&search=&page=&limit=` | Drivers queue | **Region-scoped server-side** — a regional manager only sees their region's drivers (+ not-yet-regioned). Each driver item must carry `vehicleDetailsComplete` + the raw vehicle fields. |
| `GET /admin/users/:id` | Prefill the edit dialog | Returns the expanded `driver` with vehicle fields. |
| `PATCH /admin/users/:id/driver-profile` | Save | Accepts `vehicleMake/Model/Year(1990–2100)/Plate/Color` + `reason`; region-scoped; audit-logged; backfills a NULL-region driver with the admin's region. |

---

## 5. ⚠️ Dependency & sequencing (must read)

This is a **two-repo feature**. The queue's badge + filter depend on the **API** returning `vehicleDetailsComplete` and honouring `missingVehicleDetails`. That backend change lives on the API repo branch **`feature/MSP-rm-vehicle-details`** and is **not yet merged/deployed**.

**Order of operations:**
1. Merge + deploy the **API** branch to the backend this admin targets
   (prod `api.myshop.gilmoretechnologiesgh.com/v1`, test `myshop-api-test.onrender.com/v1`).
2. The admin branch then lights up automatically — no further frontend change needed.

Until step 1: the Vehicle column shows "—" and the filter no-ops (returns all drivers). **Editing still works throughout** — it does not depend on this.

---

## 6. Acceptance criteria

- A regional manager opens **Drivers**, sees only their region's drivers, and can set the **Missing details** filter to work a backlog.
- Each row shows an accurate **Complete / Missing** badge once the backend flag is live.
- Opening a driver → Edit → entering make/model/year/plate/colour + a reason → Save persists via the PATCH, and the badge flips to **Complete**.
- An admin lacking `edit_provider_profile` sees the data but no Edit button.
- `npx tsc --noEmit`, `npx eslint`, and `npx next build` are clean (no new warnings).

---

## 7. Ready-to-paste prompt (for an AI agent in `MyShop-admin`)

```
In this Next.js 15 admin dashboard, make it easy for admins to find and fill in driver vehicle
details. IMPORTANT: driver vehicle-detail EDITING already exists — components/users/
edit-provider-profile-dialog.tsx (opened from the pencil button in components/users/
user-profile-sheet.tsx, gated on the edit_provider_profile permission). Do NOT rebuild it. Verify
it works, then add discoverability to the Drivers list only:

1. lib/api.ts
   - Add `missingVehicleDetails?: boolean` to the listUsers() params (it's serialised into the
     /admin/users query string; older API builds ignore it).
   - Add optional `vehicleDetailsComplete?: boolean` to the PlatformUser.driver type, and map it in
     normalisePlatformUser as `d.vehicleDetailsComplete ?? d.vehicle_details_complete` (leave it
     undefined when absent — do not default to false).

2. app/(dashboard)/users/drivers/page.tsx
   - Add a "Missing details" filter (a shadcn Select: All vehicles / Missing details) next to the
     status filter. When "missing", pass missingVehicleDetails: true to listUsers; otherwise
     undefined. Reset page to 1 when it changes and include it in the fetch dependencies.
   - Add a "Vehicle" table column with a completeness badge: emerald "Complete" when
     driver.vehicleDetailsComplete === true, amber "Missing" when === false, and a neutral "—"
     when undefined (older API — must NOT show a false "Missing"). Update the skeleton cell count
     and the empty-state colSpan accordingly.

Match existing conventions: 'use client', plain useState/useEffect (no react-query), shadcn
Select/Table, inline styles/classes with orange-500 accent, permission gating via useRole().can(...)
and PageGuard/RoleGate.

Dependency: the badge + filter require the backend GET /admin/users to return vehicleDetailsComplete
and support missingVehicleDetails (API branch feature/MSP-rm-vehicle-details). Build so it degrades
gracefully until that deploys — "—" badge, filter returns all.

Verify: npx tsc --noEmit && npx next build are clean. Commit as
feat(users): add "missing vehicle details" queue to drivers list — and do NOT stage unrelated
working-tree changes.
```
