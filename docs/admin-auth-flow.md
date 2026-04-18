# Admin Auth Flow & Endpoint Reference

> **Audience**: Frontend developers integrating the MyShop Admin Dashboard with the NestJS backend.
> All routes are prefixed `/v1`. The admin panel proxies through `/api/proxy` to the upstream API.

---

## 1. Authentication Architecture

Admin auth is **separate** from the regular user (client/driver/artisan) auth system:

| Concern              | Regular Users            | Admin Users                |
| -------------------- | ------------------------ | -------------------------- |
| Login method         | Passwordless OTP (phone) | Email + password (bcrypt)  |
| JWT signing secret   | `JWT_ACCESS_SECRET`      | `ADMIN_JWT_ACCESS_SECRET`  |
| Refresh secret       | `JWT_REFRESH_SECRET`     | `ADMIN_JWT_REFRESH_SECRET` |
| Access token expiry  | 15 minutes               | 8 hours (default)          |
| Refresh token expiry | 30 days                  | 30 days (default)          |
| Passport strategy    | `jwt`                    | `admin-jwt`                |
| JWT payload fields   | `sub`, `role`, `phone`   | `sub`, `email`, `role`     |

### Guard execution order (every request)

```
1. JwtAuthGuard (global)
   ├─ @Public() route?  → pass through
   ├─ Valid user JWT?   → set req.user, continue
   └─ Valid admin JWT?  → set req.user (admin), continue   ← fallback added for admin tokens
                                                              (uses ADMIN_JWT_ACCESS_SECRET)
2. RolesGuard (global)
   ├─ No @Roles() on route?  → pass through
   └─ req.user.role in allowed roles?  → continue / 403
3. ThrottlerGuard (global)
4. AdminJwtAuthGuard (controller-level on AdminController)
   └─ Re-validates token as admin-jwt strategy (secondary check)
```

> **Why dual-secret**: Admin tokens survive longer (8 h vs 15 min) and carry different claims.
> Keeping secrets separate means a compromised user JWT cannot be used to access the admin surface.

---

## 2. Login Flow

### Step 1 — Admin Login

```
POST /v1/auth/admin/login
```

No `Authorization` header required (`@Public()`). Rate-limited to **10 requests / 60 s**.

**Request body**

```json
{
  "email": "admin@gilmoretechnologies.com",
  "password": "securepassword"
}
```

**200 OK — success**

```json
{
  "success": true,
  "data": {
    "accessToken": "<JWT signed with ADMIN_JWT_ACCESS_SECRET, 8 h>",
    "refreshToken": "<JWT signed with ADMIN_JWT_REFRESH_SECRET, 30 d>",
    "admin": {
      "id": "<uuid>",
      "email": "admin@gilmoretechnologies.com",
      "fullName": "Kwame Asante",
      "role": "super_admin"
    }
  }
}
```

**401 INVALID_CREDENTIALS** — wrong email/password, inactive account, or soft-deleted account.

### Step 2 — Persist tokens

The admin panel stores tokens in `localStorage`:

```
myshop_admin_token    ← accessToken  (used as Bearer in every subsequent request)
myshop_admin_refresh  ← refreshToken
myshop_admin_user     ← serialised admin object
```

### Step 3 — Authenticated requests

Every admin API call must include:

```
Authorization: Bearer <accessToken>
```

The `apiFetch` helper in `lib/api-client.ts` attaches this header automatically from `localStorage`.

### Step 4 — Session expiry / logout

- Token expires after 8 hours. The backend returns **401** on an expired token.
- The `AuthGuard` in `components/auth-guard.tsx` listens for `auth:unauthorized` window events, clears `localStorage`, and redirects to `/login`.
- Logout calls `clearTokens()` which removes all three `localStorage` keys.

> **No token-refresh endpoint exists yet** for admin sessions. When the 8-hour access token expires the admin must log in again.

---

## 3. Role Model

| Role             | Level | Capabilities                                                             |
| ---------------- | ----- | ------------------------------------------------------------------------ |
| `super_admin`    | L1    | Full access — all endpoints, user bans, admin account management         |
| `regional_admin` | L2    | Verification queue, live map, user list, provider reports, overview KPIs |
| `ops_admin`      | L3    | Live map, disputes, user list/suspend, manual job assignment, config     |
| `support_agent`  | L4    | User list (read-only), disputes (read + resolve)                         |

Roles are enforced by `RolesGuard` reading the `@Roles()` decorator on each controller method.
A mismatch returns **403 Forbidden** — _not_ 401.

---

## 4. Admin Endpoints

All endpoints below require `Authorization: Bearer <accessToken>` unless noted.
The response envelope is always `{ success, data, error?, meta? }` — `data` is described per endpoint.

### 4.1 Authentication

| Method | Path                   | Auth | Roles | Description                           |
| ------ | ---------------------- | ---- | ----- | ------------------------------------- |
| POST   | `/v1/auth/admin/login` | None | —     | Login; returns tokens + admin profile |

### 4.2 Reports / Dashboard

| Method | Path                          | Roles                       | Description                                                                       |
| ------ | ----------------------------- | --------------------------- | --------------------------------------------------------------------------------- |
| GET    | `/v1/admin/reports/overview`  | super_admin, regional_admin | Platform KPIs (active drivers/artisans, live rides/jobs, open disputes, revenue)  |
| GET    | `/v1/admin/reports/revenue`   | super_admin                 | Revenue + commission over time. Query: `from`, `to`, `groupBy` (day\|week\|month) |
| GET    | `/v1/admin/reports/providers` | super_admin, regional_admin | Provider performance: supplement rate, ratings, cancellations, top earners        |
| GET    | `/v1/admin/reports/pilot`     | super_admin                 | 10 PRD Section 1.3 pilot targets with actual vs target. Cached 60 s               |

**GET /admin/reports/overview** — sample response `data`:

```json
{
  "activeDrivers": 42,
  "activeArtisans": 18,
  "liveRides": 7,
  "liveJobs": 3,
  "pendingVerifications": 12,
  "openDisputes": 4,
  "openSosAlerts": 0,
  "flaggedItems": 2,
  "totalRevenuePesewas": 184500,
  "totalUsersCount": 1203,
  "completedRidesToday": 94,
  "completedJobsToday": 31
}
```

**GET /admin/reports/revenue** — query params:

```
?from=2026-01-01&to=2026-04-15&groupBy=day
```

**GET /admin/reports/pilot** — sample `data` array item:

```json
{
  "label": "Registered Clients",
  "key": "registered_clients",
  "target": 5000,
  "actual": 1203,
  "unit": "users"
}
```

---

### 4.3 Live Map

| Method | Path                           | Roles                                  | Description                                |
| ------ | ------------------------------ | -------------------------------------- | ------------------------------------------ |
| GET    | `/v1/admin/live-map`           | super_admin, regional_admin, ops_admin | All active rides + jobs as map markers     |
| GET    | `/v1/admin/live-map/rides/:id` | super_admin, regional_admin, ops_admin | Full ride detail for a marker click        |
| GET    | `/v1/admin/live-map/jobs/:id`  | super_admin, regional_admin, ops_admin | Full artisan job detail for a marker click |

> `support_agent` (L4) is **explicitly blocked** from live map — returns 403.

**GET /admin/live-map** — sample `data` array item:

```json
{
  "type": "ride",
  "bookingId": "01950000-...",
  "providerName": "Kofi Mensah",
  "clientName": "Ama Owusu",
  "status": "driver_en_route",
  "lat": 6.6885,
  "lng": -1.6244,
  "markerColor": "blue"
}
```

Jobs have `markerColor: "orange"`.

**GET /admin/live-map/rides/:id** — sample `data`:

```json
{
  "rideId": "01950000-...",
  "status": "driver_en_route",
  "pickupAddress": "Adum, Kumasi",
  "dropoffAddress": "KNUST, Kumasi",
  "farePesewas": 3500,
  "driver": {
    "name": "Kofi Mensah",
    "phone": "+233201234567",
    "vehicle": "Toyota Corolla - GH-1234-22"
  },
  "client": { "name": "Ama Owusu", "phone": "+233501234567" }
}
```

---

### 4.4 Verification Queue

| Method | Path                                    | Roles                       | Description                                       |
| ------ | --------------------------------------- | --------------------------- | ------------------------------------------------- |
| GET    | `/v1/admin/verifications`               | super_admin, regional_admin | FIFO queue of providers awaiting verification     |
| PATCH  | `/v1/admin/verifications/:providerId`   | super_admin, regional_admin | Approve or reject a provider application          |
| PATCH  | `/v1/admin/verifications/documents/:id` | super_admin, regional_admin | Approve or reject an individual uploaded document |

**GET /admin/verifications** — sample `data` array item:

```json
{
  "provider_type": "driver",
  "provider_id": "01950000-...",
  "provider_name": "Kofi Mensah",
  "docs_pending": 2,
  "docs_approved": 1,
  "docs_rejected": 0,
  "total_docs": 3,
  "first_upload_at": "2026-04-10T09:15:00Z"
}
```

**PATCH /admin/verifications/:providerId** — request body:

```json
{
  "decision": "approved", // "approved" | "rejected"
  "reason": "All documents verified successfully" // required on rejection; min 10 chars
}
```

**PATCH /admin/verifications/documents/:id** — request body:

```json
{
  "decision": "rejected",
  "reason": "Ghana Card image is blurry"
}
```

Errors: `400 REASON_REQUIRED`, `404 PROVIDER_NOT_FOUND`, `404 DOCUMENT_NOT_FOUND`

---

### 4.5 Disputes

| Method | Path                             | Roles                                 | Description                              |
| ------ | -------------------------------- | ------------------------------------- | ---------------------------------------- |
| GET    | `/v1/admin/disputes`             | super_admin, ops_admin, support_agent | All open disputes                        |
| GET    | `/v1/admin/disputes/:id`         | super_admin, ops_admin, support_agent | Dispute detail with GPS route comparison |
| PATCH  | `/v1/admin/disputes/:id/resolve` | super_admin, ops_admin, support_agent | Approve or deny refund                   |

**GET /admin/disputes** — sample `data` array item:

```json
{
  "id": "01950000-...",
  "type": "fare",
  "status": "open",
  "clientName": "Ama Owusu",
  "providerName": "Kofi Mensah",
  "amountPesewas": 3500,
  "createdAt": "2026-04-14T14:22:00Z",
  "description": "Driver took a longer route"
}
```

**GET /admin/disputes/:id** — additionally includes route comparison data:

```json
{
  "actualRouteKm": 14.2,
  "optimalRouteKm": 9.8,
  "excessPercent": 44.9,
  "exceedsThreshold": true,
  "thresholdPercent": 30
}
```

**PATCH /admin/disputes/:id/resolve** — request body:

```json
{
  "decision": "approved", // "approved" | "denied"
  "reason": "Route deviation confirmed via GPS trail",
  "refundAmountPesewas": 1200 // required when decision = "approved"
}
```

Errors: `400 DISPUTE_ALREADY_RESOLVED`, `400 REFUND_AMOUNT_REQUIRED`, `400 REFUND_EXCEEDS_PAYMENT`, `404 DISPUTE_NOT_FOUND`

---

### 4.6 User Management

| Method | Path                          | Roles                                                 | Description                      |
| ------ | ----------------------------- | ----------------------------------------------------- | -------------------------------- |
| GET    | `/v1/admin/users`             | super_admin, regional_admin, ops_admin, support_agent | Paginated user list with filters |
| PATCH  | `/v1/admin/users/:id/suspend` | super_admin, regional_admin, ops_admin                | Suspend user (reversible)        |
| PATCH  | `/v1/admin/users/:id/ban`     | super_admin                                           | Permanently ban user             |

**GET /admin/users** — query params:

```
?role=driver          // client | driver | artisan | all (default: all)
&status=active        // active | suspended | banned | all (default: all)
&search=kofi          // searches name, phone, email
&page=1
&limit=50             // max 100
```

Sample `data`:

```json
{
  "items": [
    {
      "id": "01950000-...",
      "fullName": "Kofi Mensah",
      "phone": "+233201234567",
      "email": null,
      "status": "active",
      "createdAt": "2026-01-15T08:00:00Z",
      "roles": ["driver"],
      "client": null,
      "driver": { "id": "...", "verificationStatus": "approved", "onlineStatus": "online" },
      "artisan": null
    }
  ],
  "total": 248,
  "page": 1,
  "limit": 50,
  "totalPages": 5
}
```

**PATCH /admin/users/:id/suspend** — request body:

```json
{ "reason": "Multiple customer complaints about unsafe driving" }
```

**PATCH /admin/users/:id/ban** — request body (`super_admin` only):

```json
{ "reason": "Fraud confirmed via payment dispute investigation" }
```

---

### 4.7 Admin Account Management

All endpoints in this section are `super_admin` only.

| Method | Path                                  | Description                                      |
| ------ | ------------------------------------- | ------------------------------------------------ |
| GET    | `/v1/admin/admins`                    | List all admin accounts (excluding soft-deleted) |
| GET    | `/v1/admin/admins/:id`                | Get a single admin by ID                         |
| POST   | `/v1/admin/admins`                    | Create a new admin account                       |
| PATCH  | `/v1/admin/admins/:id/role`           | Reassign role (cannot change own role)           |
| PATCH  | `/v1/admin/admins/:id/deactivate`     | Block login immediately (reversible)             |
| PATCH  | `/v1/admin/admins/:id/reactivate`     | Restore login access                             |
| PATCH  | `/v1/admin/admins/:id/reset-password` | Set a new password for any admin                 |
| DELETE | `/v1/admin/admins/:id`                | Soft-delete (cannot delete own account)          |

**POST /admin/admins** — request body:

```json
{
  "email": "ops@gilmoretechnologies.com",
  "fullName": "Abena Asante",
  "role": "ops_admin",
  "password": "SecurePass123!",
  "regionScope": "ashanti" // optional; required for regional_admin
}
```

**PATCH /admin/admins/:id/role** — request body:

```json
{
  "role": "regional_admin",
  "regionScope": "ashanti" // optional
}
```

**PATCH /admin/admins/:id/reset-password** — request body:

```json
{ "newPassword": "NewSecurePass456!" }
```

Errors: `409 EMAIL_TAKEN`, `400 CANNOT_MODIFY_SELF`, `400 ALREADY_INACTIVE`, `400 ALREADY_ACTIVE`, `404 ADMIN_NOT_FOUND`

---

### 4.8 Announcements

| Method | Path                      | Roles                  | Description                                     |
| ------ | ------------------------- | ---------------------- | ----------------------------------------------- |
| POST   | `/v1/admin/announcements` | super_admin, ops_admin | Broadcast push notification to a Firebase topic |

**POST /admin/announcements** — request body:

```json
{
  "title": "System Maintenance",
  "body": "The platform will be unavailable 02:00–03:00 GMT on Saturday.",
  "topic": "all_users" // all_users | clients | drivers | artisans
}
```

Returns 200 on success. Action is audit-logged.

---

### 4.9 Service Categories

| Method | Path                       | Roles                  | Description                                     |
| ------ | -------------------------- | ---------------------- | ----------------------------------------------- |
| GET    | `/v1/admin/categories`     | super_admin, ops_admin | List all categories (including inactive)        |
| POST   | `/v1/admin/categories`     | super_admin            | Create a new service category                   |
| PATCH  | `/v1/admin/categories/:id` | super_admin            | Update name, slug, active status, or bid limits |

**POST /admin/categories** — request body:

```json
{
  "name": "Plumbing",
  "slug": "plumbing",
  "minBidPesewas": 5000,
  "maxBidPesewas": 100000 // optional; omit for no upper limit
}
```

**PATCH /admin/categories/:id** — partial update, any subset of:

```json
{
  "name": "Plumbing Services",
  "slug": "plumbing-services",
  "isActive": false,
  "minBidPesewas": 6000,
  "maxBidPesewas": 120000
}
```

Errors: `409 SLUG_ALREADY_EXISTS`, `404 CATEGORY_NOT_FOUND`

---

### 4.10 Platform Configuration

| Method | Path              | Roles       | Description                                                      |
| ------ | ----------------- | ----------- | ---------------------------------------------------------------- |
| GET    | `/v1/config`      | super_admin | List all runtime config key-value pairs                          |
| GET    | `/v1/config/:key` | **Public**  | Read a single config value (used by mobile apps)                 |
| PATCH  | `/v1/config/:key` | super_admin | Update a config value; invalidates Redis cache, writes audit log |

**GET /config** — sample `data`:

```json
[
  { "key": "surge_multiplier_max", "value": "2.5" },
  { "key": "driver_match_radius_km", "value": "5" },
  { "key": "bid_window_minutes", "value": "5" },
  { "key": "cancellation_window_seconds", "value": "180" }
]
```

**PATCH /config/:key** — request body:

```json
{ "value": "3.0" }
```

Errors: `404 CONFIG_KEY_NOT_FOUND`

---

### 4.11 Artisan Jobs — Manual Assignment

| Method | Path                                | Roles                  | Description                                      |
| ------ | ----------------------------------- | ---------------------- | ------------------------------------------------ |
| GET    | `/v1/admin/jobs/unassigned`         | super_admin, ops_admin | Jobs in `queued` or `pending_admin` status       |
| POST   | `/v1/admin/jobs/:id/lock`           | super_admin, ops_admin | Acquire a 120-second Redis lock before assigning |
| POST   | `/v1/admin/jobs/:id/assign`         | super_admin, ops_admin | Assign artisan; must hold lock first             |
| PATCH  | `/v1/admin/jobs/:id/force-complete` | super_admin, ops_admin | Force-complete escalated job; releases payment   |

**GET /admin/jobs/unassigned** — sample `data` array item:

```json
{
  "id": "01950000-...",
  "title": null,
  "description": "Fix leaking kitchen tap",
  "categoryName": "Plumbing",
  "clientName": "Ama Owusu",
  "address": "Adum, Kumasi",
  "status": "queued",
  "createdAt": "2026-04-15T10:00:00Z"
}
```

**POST /admin/jobs/:id/lock** — no body. Returns:

```json
{ "locked": true, "expiresAt": "2026-04-15T10:02:00Z" }
```

`409 JOB_LOCKED_BY_ANOTHER_ADMIN` if another admin already holds the lock.

**POST /admin/jobs/:id/assign** — request body:

```json
{
  "artisanId": "01950000-...",
  "reason": "Nearest available plumber in Adum area"
}
```

`403 LOCK_NOT_HELD` if the calling admin hasn't locked the job first.

**PATCH /admin/jobs/:id/force-complete** — request body:

```json
{ "reason": "Artisan confirmed service delivered; client unreachable for 2 hours" }
```

Errors: `400 JOB_NOT_PENDING_CONFIRMATION`, `400 REASON_TOO_SHORT`

---

### 4.12 Emergency Acknowledgment

| Method | Path                                  | Roles                                  | Description                                   |
| ------ | ------------------------------------- | -------------------------------------- | --------------------------------------------- |
| PATCH  | `/v1/admin/emergency/:id/acknowledge` | super_admin, regional_admin, ops_admin | Mark emergency as admin-reviewed (idempotent) |

**PATCH /admin/emergency/:id/acknowledge** — no body required. Returns 200 on success.

`404 EMERGENCY_NOT_FOUND`

---

### 4.13 High Bid Review

| Method | Path                        | Roles                  | Description                                       |
| ------ | --------------------------- | ---------------------- | ------------------------------------------------- |
| PATCH  | `/v1/admin/bids/:id/review` | super_admin, ops_admin | Approve or reject a bid flagged for manual review |

**PATCH /admin/bids/:id/review** — request body:

```json
{
  "decision": "approved", // "approved" | "rejected"
  "reason": "Bid is within acceptable range for this category and location"
}
```

Errors: `400 BID_NOT_UNDER_REVIEW`, `404 BID_NOT_FOUND`

---

## 5. Error Response Shape

All errors use NestJS `HttpException` and are formatted by the global `HttpExceptionFilter`:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password",
    "statusCode": 401
  }
}
```

| Status | When                                                  |
| ------ | ----------------------------------------------------- |
| 400    | Validation failure, business rule violation           |
| 401    | Missing token, expired token, invalid token signature |
| 403    | Valid token but role not permitted for this endpoint  |
| 404    | Resource not found                                    |
| 409    | Conflict (e.g. duplicate email, job already locked)   |
| 429    | Rate limit exceeded                                   |

---

## 6. Environment Variables

```bash
# Admin JWT (backend .env)
ADMIN_JWT_ACCESS_SECRET=<strong-random-secret>
ADMIN_JWT_REFRESH_SECRET=<different-strong-secret>
ADMIN_JWT_ACCESS_EXPIRY=8h      # default
ADMIN_JWT_REFRESH_EXPIRY=30d    # default

# Frontend proxy target (Next.js .env.local)
# Not set → defaults to https://myshop-api-2hy2.onrender.com/v1
NEXT_PUBLIC_API_URL=http://localhost:3000/v1
```

> The `ADMIN_JWT_ACCESS_SECRET` **must differ** from `JWT_ACCESS_SECRET`. If they share a secret, a regular user JWT could be replayed against admin endpoints.
