# Ride Categories — Admin Dashboard Integration Spec

> **Audience:** Admin dashboard team (separate React 19 + Vite + TanStack Query + Zustand repo).
> **Backend status:** ✅ Shipped on branch `feature/MSP-ride-categories` (commit `f3c4b64`). All endpoints below are live behind the API.
> **Goal for the admin team:** Build the UI that lets ops staff (1) manage ride tiers and their pricing, and (2) approve/reject each driver per tier.
> **Out of scope for the admin team:** Mobile (driver signup category picker + client booking sheet) is handled in the `myshop-mobile` repo.

---

## 1. What we just built (context)

Rides are now **tiered**. Instead of one global fare, the platform has admin-managed **ride categories** (seeded: **Regular** + **Comfort**), each with its own independent fare rates. Two consequences the admin UI exists to manage:

1. **Tiers are CRUD-able.** Ops can create/edit tiers, set per-tier pricing, and activate/deactivate them — no code deploy (rates live in the `ride_categories` table).
2. **Drivers are verified per tier.** A driver picks the tiers they want at signup; each lands as a **`pending`** request. Matching is **mutually exclusive** — a Comfort ride only reaches drivers an admin has **approved** for Comfort. So the per-driver approve/reject screen directly gates which requests a driver receives.

The admin dashboard needs **two surfaces**:

| Surface | Purpose | Endpoints |
| --- | --- | --- |
| **A. Ride Tiers** (new page, under Payments/Config area) | List + create + edit + activate/deactivate tiers and their pricing | `GET/POST/PATCH /v1/admin/ride-categories` |
| **B. Driver tier verification** (extends the existing Verification / driver-detail page) | Per-driver, per-tier approve/reject | `GET` + `PATCH /v1/admin/drivers/:driverId/ride-categories` |

---

## 2. Permissions

Two **new** permissions were added to the catalogue and auto-granted by migration to admins who already manage service categories:

| Permission | Gates | Auto-granted to admins holding |
| --- | --- | --- |
| `view_ride_categories` | Viewing the Ride Tiers page (list) | `view_categories` or `edit_categories` |
| `edit_ride_categories` | Create / edit / activate / deactivate tiers | `edit_categories` |

The **driver tier verification** endpoints reuse the existing verification permissions — no new grant needed:

| Permission | Gates |
| --- | --- |
| `view_verifications` | Reading a driver's per-tier statuses |
| `review_verification` | Approving/rejecting a driver for a tier |

**Frontend guard:** gate menu items and buttons on these permission strings (they're in the admin's JWT `permissions[]` claim), **not** on role level (L1–L4). The catalogue now has 43 entries.

---

## 3. API contracts

Base URL: `/v1` · All admin endpoints require `Authorization: Bearer <admin access token>`.

> **Response envelope note:** the tier CRUD endpoints return `{ success, data, meta? }` from the service. Confirm the final wire shape in Swagger (`/docs`) in case the global response interceptor re-wraps it as the standard `{ success, data, error, meta }` envelope — build your API client to read `data` either way. The driver-review endpoint returns a **bare** object (see 3.5).

### 3.1 `GET /v1/admin/ride-categories` — list all tiers (incl. inactive)

- **Permission:** `view_ride_categories`
- **Query:** none
- **200 response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Regular",
      "slug": "regular",
      "description": "Affordable everyday rides",
      "baseFarePesewas": 300,
      "perKmPesewas": 150,
      "perMinPesewas": 20,
      "minimumFarePesewas": 2600,
      "capacityPersons": 4,
      "iconUrl": null,
      "isActive": true,
      "sortOrder": 1
    }
  ],
  "meta": { "total": 2 }
}
```

- Ordered by `sortOrder` asc. Includes deactivated tiers (`isActive: false`) — render them visually muted with a "Reactivate" affordance.

### 3.2 `POST /v1/admin/ride-categories` — create a tier

- **Permission:** `edit_ride_categories`
- **Request body:**

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | string | ✅ | non-empty |
| `slug` | string | ✅ | lowercase kebab-case `^[a-z0-9]+(?:-[a-z0-9]+)*$`; unique |
| `description` | string | — | |
| `baseFarePesewas` | int | ✅ | ≥ 0, **pesewas** (integer) |
| `perKmPesewas` | int | ✅ | ≥ 0 |
| `perMinPesewas` | int | ✅ | ≥ 0 |
| `minimumFarePesewas` | int | ✅ | ≥ 0 |
| `capacityPersons` | int | — | 1–20, default 4 |
| `iconUrl` | string (URL) | — | must be a valid URL |
| `sortOrder` | int | — | 0–999, default = next highest |

- **201 response:** `{ "success": true, "data": { ...category } }`
- **Errors:** `409 SLUG_ALREADY_EXISTS`, `400 INVALID_SLUG`, `400 INVALID_RATE_<field>` (e.g. `INVALID_RATE_baseFarePesewas`), `400 VALIDATION_ERROR` (class-validator).

### 3.3 `PATCH /v1/admin/ride-categories/:id` — update / activate / deactivate

- **Permission:** `edit_ride_categories`
- **Request body:** any subset of the create fields, **plus** `isActive: boolean`. All fields optional.
  - **Deactivate** = `{ "isActive": false }`. **Reactivate** = `{ "isActive": true }`. Deactivating hides the tier from the public list and new bookings but **keeps** the row and its driver-verification history.
- **200 response:** `{ "success": true, "data": { ...category } }`
- **Errors:** `404 RIDE_CATEGORY_NOT_FOUND`, `409 SLUG_ALREADY_EXISTS` (only when changing slug to a taken one), `400 INVALID_SLUG` / `INVALID_RATE_*`.

> There is **no DELETE.** Tiers are deactivated, never hard-deleted (rides + driver history reference them). Don't build a delete button.

### 3.4 `GET /v1/admin/drivers/:driverId/ride-categories` — a driver's per-tier statuses

- **Permission:** `view_verifications`
- **200 response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "driver-ride-category-row-uuid",
      "status": "pending",
      "rejectionReason": null,
      "reviewedAt": null,
      "rideCategory": { "id": "uuid", "name": "Comfort", "slug": "comfort", "isActive": true }
    }
  ],
  "meta": { "total": 1 }
}
```

- `status` ∈ `pending | approved | rejected`. Ordered by the category's `sortOrder`.
- A driver only has rows for tiers they **requested at signup** (or that an admin granted). Don't assume every tier appears.
- **Errors:** `404 PROVIDER_NOT_FOUND`.

### 3.5 `PATCH /v1/admin/drivers/:driverId/ride-categories/:rideCategoryId` — approve/reject a tier

- **Permission:** `review_verification`
- **Request body:**

```json
{ "action": "approve" }
// or
{ "action": "reject", "reason": "Vehicle photos show a Regular-tier car." }
```

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `action` | `'approve' \| 'reject'` | ✅ | |
| `reason` | string | ✅ **when rejecting** | min 5 chars; shown to the driver |

- **200 response (bare object, no envelope):** `{ "driverId": "uuid", "rideCategoryId": "uuid", "status": "approved" }`
- **Side effects:** writes an audit log (`driver_ride_category.approved` / `.rejected`) and sends the driver an in-app + push notification. Approving makes the driver immediately matchable for that tier.
- **Upsert behavior:** if the driver had no row for that tier, this **creates** one — so an admin can grant a tier the driver didn't request.
- **Errors:** `404 PROVIDER_NOT_FOUND`, `404 RIDE_CATEGORY_NOT_FOUND`, `400 REASON_REQUIRED` (reject with missing/short reason).

### 3.6 (Reference only) Public `GET /v1/ride-categories`

Not an admin endpoint — public, returns **active** tiers only, same item shape as 3.1. The mobile apps consume it. Listed here so you know the public surface exists; the admin page should use 3.1 (which includes inactive).

---

## 4. UI workflows to build

### Surface A — Ride Tiers page

**Route:** e.g. `/ride-categories` (role-guard on `view_ride_categories`).

**Workflow:**

1. **List view** — table/cards from `GET /v1/admin/ride-categories`, ordered by `sortOrder`. Columns: Name, Slug, Base / per-km / per-min / Min fare (render pesewas → GHS for display, e.g. `2600 → GHS 26.00`), Capacity, Active toggle, Sort order. Inactive rows muted.
2. **Create** (button gated on `edit_ride_categories`) → modal/drawer with the 3.2 form. Show pricing inputs in **GHS** but convert to integer **pesewas** before sending (× 100; never send floats). On `409 SLUG_ALREADY_EXISTS` surface a field-level "slug taken" error.
3. **Edit** → same form pre-filled, PATCH only changed fields (3.3).
4. **Activate/Deactivate** → a toggle that PATCHes `{ isActive }`. Confirm on deactivate ("New bookings won't see this tier; existing rides and driver approvals are kept").
5. Invalidate the list query (TanStack Query) after any mutation.

**Money handling (critical):** all rates are **integer pesewas** on the wire (GHS 26.00 = `2600`). Display helper: `pesewas / 100` with 2 decimals. Input helper: `Math.round(ghs * 100)`. Never use floats for money — matches backend (CLAUDE.md §6).

### Surface B — Driver tier verification (extend the driver/verification detail page)

**Status:** ✅ Shipped. Implemented once as the shared component
[`components/users/driver-ride-categories-section.tsx`](../components/users/driver-ride-categories-section.tsx)
(`<DriverRideCategoriesSection driverId canReview />`) and mounted in **two** places so
the same review surface appears wherever an admin is assessing a driver:

- **Driver profile sheet** (Users → Drivers → open a driver) — `components/users/user-profile-sheet.tsx`.
- **Document verification drawer** (Verifications → Review a driver → final decision step) —
  `app/(dashboard)/verifications/page.tsx`. This is where an admin confirms the driver's
  vehicle photos actually qualify for each requested tier, alongside the document review.

In both, `driverId` is the driver-record id (the same id `PATCH /v1/admin/verifications/:id`
uses for a driver). The section is shown for drivers only and gated on `view_verifications`;
the approve/reject/grant actions are gated on `review_verification` (`canReview`).

**Workflow:**

1. On open, fetch `GET /v1/admin/drivers/:driverId/ride-categories` (gated on `view_verifications`) and render a small table: Tier name · Status badge (`pending`/`approved`/`rejected`) · Reviewed at · Rejection reason.
2. Per row, **Approve** / **Reject** actions (gated on `review_verification`):
   - **Approve** → `PATCH …/:rideCategoryId` `{ action: 'approve' }` (optimistic flip, then refetch).
   - **Reject** → open a reason prompt (min 5 chars, required) → `{ action: 'reject', reason }`.
3. Optimistically reflect the new status, then refetch. Show the notification side-effect implicitly (no extra call needed — backend notifies the driver).
4. **Grant tier** affordance: because the PATCH upserts, an admin can approve a tier the driver never requested. The tier dropdown is populated from `GET /v1/admin/ride-categories` (active only, minus tiers the driver already has a row for).

---

## 5. Business rules & edge cases (must handle)

- **Pesewas, not floats.** Every fare field is an integer in pesewas. Validate client-side: integers ≥ 0; `capacityPersons` 1–20; `sortOrder` 0–999; slug lowercase kebab-case.
- **No delete.** Lifecycle is create → edit → deactivate/reactivate.
- **Reject requires a reason** (≥ 5 chars). Block submit otherwise; backend returns `400 REASON_REQUIRED` if bypassed.
- **Approval is consequential.** Approving a tier makes the driver live for that tier's requests immediately. Rejecting (or never approving) means they never receive that tier. Make the status badges unambiguous.
- **Deactivating a tier** doesn't unwind driver approvals or past rides — it only hides the tier from new bookings and the public list. Reactivation restores it intact.
- **Slug is the wire value** used by mobile + matching. Editing a slug is allowed but risky (mobile clients may hardcode `regular`/`comfort`). Surface a soft warning when editing the slug of an existing tier.
- **Seeded tiers:** `regular` and `comfort` already exist in every environment. Don't recreate them.

---

## 6. Acceptance criteria / QA checklist

- [ ] Ride Tiers page lists all tiers (incl. inactive), gated on `view_ride_categories`; create/edit/toggle hidden without `edit_ride_categories`.
- [ ] Create a tier with GHS inputs → persists correct **pesewas**; reload shows same values.
- [ ] Duplicate slug → inline `SLUG_ALREADY_EXISTS` error, no crash.
- [ ] Invalid slug (`Comfort Plus`) and negative/decimal rate → blocked client-side and (if bypassed) handled from `400`.
- [ ] Deactivate a tier → disappears from public `GET /v1/ride-categories`, still visible (muted) in admin list; reactivate restores.
- [ ] Driver detail shows per-tier statuses; Approve flips to `approved`; Reject requires reason and flips to `rejected` with the reason shown.
- [ ] Approve/Reject actions hidden without `review_verification`.
- [ ] All money rendered as GHS, stored/sent as pesewas; no floats on the wire.

---

## 7. Rollout / coordination notes

- Backend is on `feature/MSP-ride-categories` — coordinate so the API is deployed (and migrations applied) to the environment the admin dashboard points at **before** shipping this UI.
- Migrations seed `regular` + `comfort`, backfill approved drivers into `regular` (so existing drivers keep receiving Regular requests), and grant the two new permissions to existing category-manager admins.
- Verify exact response envelopes against live **Swagger** (`/docs`) before finalizing the API client — see the envelope note in §3.
- Mobile changes (driver signup tier picker, client booking sheet) ship separately in `myshop-mobile`; the admin per-tier approvals are what make those drivers matchable, so the two need to land together for an end-to-end demo.
