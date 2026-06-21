# Admin Module — MyShop Platform

> **Living Document** — Auto-updated after every admin-related change.
> Last updated: April 17, 2026 | Sprint: Post-Sprint 7

---

## Status Dashboard

### Backend

| Area                     | Status | Endpoints | Notes                                              |
| ------------------------ | ------ | --------- | -------------------------------------------------- |
| Provider Verification    | ✅     | 3         | Queue, provider review, document review            |
| High Bid Review          | ✅     | 1         | PRD edge case #44 — bids >GHS 5,000                |
| Manual Job Assignment    | ✅     | 4         | Redis lock, assign, force-complete                 |
| Live Map                 | ✅     | 3         | PostGIS markers, ride/job detail                   |
| User Management          | ⚠️     | 3         | List, suspend, ban — reinstate/update blocked (see Known Gaps) |
| Disputes                 | ✅     | 3         | List, detail, resolve with refund/clawback         |
| Reports                  | ✅     | 4         | Overview, revenue, providers, pilot metrics        |
| Announcements            | ✅     | 1         | Firebase topic broadcast                           |
| Emergency Acknowledgment | ✅     | 1         | Idempotent acknowledgment                          |
| Service Categories       | ✅     | 3         | CRUD via CategoryService delegation                |
| Admin Account Management | ✅     | 8         | Full CRUD, role update, deactivate, password reset |
| WebSocket Live Map       | ⬜     | 0         | HTTP polling only — no WS subscription yet         |
| Regional Data Scoping    | ⬜     | 0         | All admins see global data — no Ashanti filter     |
| Config Management        | N/A    | 0         | Handled by platform-config module                  |

**Backend total: 34 endpoints implemented | 3 features pending (incl. user reinstate)**

### Admin Panel Frontend (Next.js 14)

| Area                      | Status | Notes                                                              |
| ------------------------- | ------ | ------------------------------------------------------------------ |
| Auth (login / logout)     | ✅     | JWT stored in localStorage; `AuthGuard` on all dashboard routes    |
| Role Model & Access Gates | ✅     | 4-role permission system; `PageGuard` on 20 pages; `RoleGate` inline |
| Sidebar — Role-aware Nav  | ✅     | Real admin name/role from localStorage; items filtered by permission |
| Dashboard / KPIs          | ✅     | Overview KPIs, recent activity, live stats                         |
| Analytics                 | ✅     | Revenue charts, provider stats, ride/job/payment breakdowns        |
| Live Map                  | ✅     | Mapbox GL markers, HTTP polling, ride/job detail panels            |
| Verification Queue        | ✅     | Step-through document review; per-doc and provider-level actions   |
| Cancellation Suspensions  | ⚠️     | View/lift cancellation-suspended providers + policy editor; blocked on `/admin/providers/*` (see Known Gaps) |
| Disputes                  | ✅     | List, detail drawer, resolve with refund/reject                    |
| User Management           | ⚠️     | Clients/Drivers/Artisans tabs; profile sheet; suspend/ban implemented; reinstate + profile edit blocked on backend (see Known Gaps) |
| Service Categories        | ✅     | List, create, edit, toggle active; role-gated create/edit (L1 only)|
| Reports                   | ✅     | Live data: Overview KPIs, Revenue, Provider Performance, Pilot targets |
| Announcements             | ✅     | Firebase topic broadcast form + history                            |
| Admin Accounts            | ✅     | Full CRUD, role update, deactivate, reactivate, password reset     |
| Artisan Jobs              | ✅     | Job list, manual assignment, force-complete, lock flow             |
| Payments                  | ✅     | Transactions, Revenue, Batch Payouts, Clawbacks                    |
| USSD & SMS Logs           | ✅     | Session list, stats, zone management                               |
| Configuration             | ✅     | Platform config key-value editor                                   |
| High Bid Review           | ⬜     | API function exists (`reviewHighBid`); no list endpoint on backend; no UI page |
| WebSocket Live Map        | ⬜     | Polling every 30s — no real-time WS stream yet                     |

---

## Permission Model (Granular)

> **Changed:** the fixed 4-role model (`super_admin` / `regional_admin` / `ops_admin` /
> `support_agent`) has been **replaced** by per-admin granular permissions. There is no
> role concept anymore. A super admin (= any admin holding `manage_admins`) creates other
> admins and assigns each one an explicit set of permissions. `regionScope` remains as an
> orthogonal, optional data-scope field, independent of permissions.

Each admin holds an explicit `permissions: Permission[]`. The backend carries this set in
the JWT and enforces it server-side via `@RequirePermissions(...)`; the frontend uses it
only for nav/button visibility. The full catalogue (and its grouping for the picker UI) is
defined in `lib/roles.ts` (`PERMISSION_GROUPS`).

### Permission Catalogue (grouped)

| Group                | Permissions                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------- |
| Dashboard & Analytics| `view_dashboard`, `view_analytics`, `view_activity`, `view_reports`                          |
| Live Monitoring      | `view_live_map`, `view_emergency`, `resolve_welfare_check`                                   |
| Verification         | `view_verifications`, `review_verification`, `lift_verification_suspension`                   |
| Disputes & Recovery  | `view_disputes`, `resolve_dispute`, `view_session_recovery`, `resolve_session_recovery`      |
| Users                | `view_users`, `suspend_user`, `ban_user`, `delete_user`, `force_logout_user`, `unlock_payout_method` |
| Categories           | `view_categories`, `edit_categories`, `delete_category`                                      |
| Jobs & Rides         | `view_jobs`, `assign_job`, `delete_job`, `review_bid`, `view_rides`, `intervene_ride`        |
| Payments             | `view_payments`, `run_batch_payouts`                                                         |
| Config & USSD        | `view_config`, `view_ussd`                                                                   |
| Comms & Help         | `send_announcement`, `view_promotions`, `manage_promotions`, `view_help_articles`, `edit_help_articles`, `delete_help_articles` |
| Referrals & Loyalty  | `view_referrals`, `manage_referrals`                                                         |
| Admin & Audit        | `manage_admins`, `view_audit_logs`                                                           |

`intervene_ride` (cancel / force-complete a ride) and `run_batch_payouts` (force-run a payout
batch) replace the former role-name proxy checks. Page access is gated by `PageGuard`; inline
actions by `RoleGate`; the backend re-checks every mutating endpoint.

### Frontend Permission Files

| File                                     | Purpose                                                   |
| ---------------------------------------- | --------------------------------------------------------- |
| `lib/roles.ts`                           | `Permission` type, `PERMISSION_GROUPS`, `PERMISSION_LABELS`, `ALL_PERMISSIONS`, `can(permissions, permission)` |
| `hooks/use-role.ts`                      | `useRole()` — reads admin from localStorage, exposes `can()`, `permissions`, `adminName` |
| `components/admin/permission-picker.tsx` | Grouped-checkbox picker used by the Create / Edit Permissions dialogs |
| `components/common/access-denied.tsx`    | 403 screen with "Go to Dashboard" link                    |
| `components/common/role-gate.tsx`        | Inline conditional renderer: hides children when no permission |
| `components/common/page-guard.tsx`       | Full-page guard: renders `<AccessDenied>` when permission missing |

### Auth Architecture

| Concern              | Value                        |
| -------------------- | ---------------------------- |
| Login method         | Email + password (bcrypt 12) |
| JWT signing secret   | `ADMIN_JWT_ACCESS_SECRET`    |
| Refresh secret       | `ADMIN_JWT_REFRESH_SECRET`   |
| Access token expiry  | 8 hours                      |
| Refresh token expiry | 30 days                      |
| Passport strategy    | `admin-jwt`                  |
| JWT payload          | `sub`, `email`, `permissions` (was `role`) |
| Frontend storage     | `localStorage` — keys: `myshop_admin_token`, `myshop_admin_refresh`, `myshop_admin_user` |

---

## Endpoint Registry

### Provider Verification (`/v1/admin/verifications/`)

| Method | Path                                                    | Roles  | Description                          | Status |
| ------ | ------------------------------------------------------- | ------ | ------------------------------------ | ------ |
| GET    | `/v1/admin/verifications`                               | L1, L2 | FIFO queue of pending providers      | ✅     |
| PATCH  | `/v1/admin/verifications/:id`                           | L1, L2 | Approve/reject entire provider       | ✅     |
| PATCH  | `/v1/admin/verifications/documents/:id`                 | L1, L2 | Approve/reject individual document   | ✅     |
| GET    | `/v1/admin/drivers/:driverId/ride-categories`          | L1, L2 | A driver's per-tier review statuses  | ✅     |
| PATCH  | `/v1/admin/drivers/:driverId/ride-categories/:rideCategoryId` | L1, L2 | Approve/reject one ride tier for a driver | ✅ |

**DTOs:**

- `ReviewVerificationDto`: `providerType` (driver|artisan), `action` (approve|reject), `reason` (min 5 chars)
- `ReviewDocumentDto`: `providerType`, `action` (approve|reject), `reason` (optional on approval, required on reject)
- `ReviewRideCategoryDto`: `action` (approve|reject), `reason` (required, min 5 chars, on reject) — per-tier driver verification

**Business Rules:**

- Reason required on rejection (min 5 chars)
- All provider documents updated atomically in `$transaction`
- Audit log entry created for every review action

**Frontend Implementation Notes:**

- Queue response includes embedded `documents: ProviderDocument[]` — no separate GET per provider needed
- Document fields use snake_case from backend raw SQL: `file_url`, `uploaded_at`, `review_note`, `provider_type`
- UI flow: step-through each document → confirm each individually → final provider-level decision
- For drivers, the final-decision step also embeds the **ride-tier verification** surface
  (`<DriverRideCategoriesSection>`), so an admin approves/rejects each tier the driver requested
  at signup (confirming the vehicle qualifies) without leaving the drawer. The same component is
  reused in the driver profile sheet. Gated on `view_verifications` (read) / `review_verification` (act).
  See `docs/ride-categories-admin-integration.md` Surface B.
- `GET /v1/admin/verifications/:id` does **not** exist — do not call it

---

### High Bid Review (`/v1/admin/bids/`)

| Method | Path                        | Roles  | Description                | Status |
| ------ | --------------------------- | ------ | -------------------------- | ------ |
| PATCH  | `/v1/admin/bids/:id/review` | L1, L3 | Approve/reject flagged bid | ✅     |

**DTO:**

- `ReviewBidDto`: `decision` (approved|rejected), `reason` (optional, max 500 chars)

**Business Rules:**

- PRD edge case #44 — bids exceeding GHS 5,000 (`highBidFlagPesewas`) require admin approval
- Flagged bids hidden from client until approved

**Frontend Status:** API function `reviewHighBid()` implemented in `lib/api.ts`. No dedicated UI page exists because there is no backend GET endpoint to list flagged bids. Pending backend addition of `GET /v1/admin/bids/flagged`.

---

### Manual Job Assignment (`/v1/admin/jobs/`)

| Method | Path                                | Roles  | Description                     | Status |
| ------ | ----------------------------------- | ------ | ------------------------------- | ------ |
| GET    | `/v1/admin/jobs/unassigned`         | L1, L3 | Jobs with zero bids or artisans | ✅     |
| POST   | `/v1/admin/jobs/:id/lock`           | L1, L3 | Acquire Redis lock (120s TTL)   | ✅     |
| POST   | `/v1/admin/jobs/:id/assign`         | L1, L3 | Assign artisan to locked job    | ✅     |
| PATCH  | `/v1/admin/jobs/:id/force-complete` | L1, L3 | Force-complete stuck job        | ✅     |

**DTOs:**

- `AssignJobDto`: `artisanId` (required), `agreedPricePesewas` (optional integer)
- `ForceCompleteJobDto`: `reason` (min 5 chars, required)

**Business Rules:**

- PRD edge case #36 — Redis `SET NX EX 120` distributed lock prevents concurrent assignment
- Re-locking by same admin refreshes TTL
- Artisan must be approved; job must be in `queued` or `pending_admin` status
- Assignment triggers 3-channel notification (push + SMS + phone call)
- Force-complete requires job in `artisan_marked_complete` status; triggers payment release

---

### Live Map (`/v1/admin/live-map/`)

| Method | Path                           | Roles      | Description                      | Status |
| ------ | ------------------------------ | ---------- | -------------------------------- | ------ |
| GET    | `/v1/admin/live-map`           | L1, L2, L3 | All active rides/jobs as markers | ✅     |
| GET    | `/v1/admin/live-map/rides/:id` | L1, L2, L3 | Full ride detail for marker      | ✅     |
| GET    | `/v1/admin/live-map/jobs/:id`  | L1, L2, L3 | Full job detail for marker       | ✅     |

**Business Rules:**

- L4 (support_agent) explicitly blocked — returns 403
- Raw SQL with PostGIS `ST_Y()`/`ST_X()` to extract lat/lng
- Returns markers with lat/lng, status, provider/client names

---

### User Management (`/v1/admin/users/`)

| Method | Path                          | Roles          | Description                         | Status |
| ------ | ----------------------------- | -------------- | ----------------------------------- | ------ |
| GET    | `/v1/admin/users`             | L1, L2, L3, L4 | Paginated user list                 | ✅     |
| PATCH  | `/v1/admin/users/:id/suspend` | L1, L2, L3     | Suspend user with reason            | ✅     |
| PATCH  | `/v1/admin/users/:id/ban`     | L1             | Permanent ban (soft delete)         | ✅     |
| PATCH  | `/v1/admin/users/:id`         | L1, L2, L3     | Reinstate (status→active) / update name+email | ⬜ |

**DTOs:**

- `SuspendUserDto`: `reason` (5–1000 chars, required)
- `BanUserDto`: `reason` (5–1000 chars, required)
- `UpdateUserDto` *(pending)*: `status` (optional, e.g. `'active'`), `fullName` (optional), `email` (optional), `reason` (optional)

**Business Rules:**

- List supports filters: `role` (client/driver/artisan), `status` (active/suspended/banned), `search` (name/phone/email)
- Max 100 per page
- Suspend affects all provider profiles (driver + artisan)
- Ban validates no outstanding clawbacks (PRD edge case #51); sets `deletedAt=NOW()`
- Reinstate sets `status='active'`; should write an `audit_log` entry with `action: 'reinstate_user'`

**Backend Work Required for `PATCH /admin/users/:id`:**

```ts
// Controller
@Patch(':id')
@Roles('super_admin', 'regional_admin', 'ops_admin')
async updateUser(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @CurrentUser() admin: AdminJwtPayload) {
  return this.adminService.updateUser(id, dto, admin);
}

// DTO
export class UpdateUserDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

// Service
async updateUser(userId: string, dto: UpdateUserDto, admin: AdminJwtPayload) {
  const { reason, ...fields } = dto;
  const updated = await this.prisma.users.update({ where: { id: userId }, data: fields });
  await this.prisma.audit_log.create({ data: { adminId: admin.sub, action: 'update_user', targetType: 'user', targetId: userId, details: { changes: fields, reason: reason ?? null } } });
  return updated;
}
```

**Frontend Implementation Notes:**

- Three separate pages: `/users/clients`, `/users/drivers`, `/users/artisans` (tab navigation)
- Slide-in `UserProfileSheet` component for inline user detail + edit (name/email via `updateUser()`)
- `CreateUserDialog` component for admin-created accounts
- Reinstate: `reinstateUser(userId, reason?)` in `lib/api.ts` sends `PATCH /admin/users/:id` with `{ status: 'active', reason? }` — UI is fully implemented, blocked on backend only
- Profile edit: `updateUser(userId, { fullName, email })` sends `PATCH /admin/users/:id` — same backend endpoint as reinstate; both blocked until endpoint is live
- "Ban Permanently" action is hidden behind `<RoleGate permission="ban_user">` — only L1 sees it
- Reinstate button visible only when `user.status === 'suspended'`; reason field is optional; confirm dialog is emerald-coloured
- Drivers page: "Ride History" navigates to `/rides?search={name}`
- Artisans page: "Job History" navigates to `/artisan-jobs?search={name}`, "Trigger Re-verification" calls `POST /admin/users/:id/reverification`

---

### Provider Suspensions (`/v1/admin/providers/`)

Powers **Trust & Safety → Cancellation Suspensions** (`/suspensions`) — viewing and
lifting providers auto-suspended for exceeding the cancellation limit, plus a
**Cancellation Policy** editor for the two `platform_config` thresholds.

| Method | Path                                                              | Permission                     | Description                              | Status |
| ------ | ---------------------------------------------------------------- | ------------------------------ | ---------------------------------------- | ------ |
| GET    | `/v1/admin/providers/suspensions`                                | `view_users`                   | Active suspensions (filter by provider/trigger) | ⬜ |
| GET    | `/v1/admin/providers/:providerId/suspensions`                    | `view_users`                   | Full suspension history for one provider | ⬜     |
| PATCH  | `/v1/admin/providers/:providerId/suspensions/:suspensionId/lift` | `lift_verification_suspension` | Lift a suspension (resets status + count) | ⬜    |

- **Lift** uses the existing `lift_verification_suspension` permission — no new
  cancellation-specific permission was added. Body `{ note? }`; atomically sets
  `reinstatedAt`/`reinstatedBy`, `verificationStatus='approved'`, resets
  `cancellationCount30d=0`, writes an audit log; `404` if missing, `409` if already lifted.
- **Config editor** reuses `GET /v1/config` + `PATCH /v1/config/:key` for
  `cancellation_suspension_count` and `cancellation_rolling_period_days`. It is gated on
  `view_config` as an **interim** until a dedicated `edit_config` permission is added on the
  backend PATCH guard (today the PATCH only requires `view_config`).
- Frontend: `app/(dashboard)/suspensions/page.tsx`; API wrappers
  `listProviderSuspensions` / `getProviderSuspensions` / `liftProviderSuspension` in
  `lib/api.ts` (defensive camel/snake normaliser). Full backend contract +
  config-key reconciliation in [backend-requests.md §6](backend-requests.md).

---

### Disputes (`/v1/admin/disputes/`)

| Method | Path                             | Roles      | Description                | Status |
| ------ | -------------------------------- | ---------- | -------------------------- | ------ |
| GET    | `/v1/admin/disputes`             | L1, L3, L4 | Open disputes list         | ✅     |
| GET    | `/v1/admin/disputes/:id`         | L1, L3, L4 | Dispute detail             | ✅     |
| PATCH  | `/v1/admin/disputes/:id/resolve` | L1, L3, L4 | Resolve with refund/reject | ✅     |

**DTO:**

- `ResolveDisputeDto`: `resolution` (REFUND_FULL|REFUND_PARTIAL|REJECT), `refundAmountPesewas` (required for PARTIAL), `notes`

**Business Rules:**

- Raw SQL for booking type polymorphism (rides or jobs)
- Detail delegates to `RideDisputeService.getDisputeDetail()`
- Resolution delegates to `RefundService.resolveDispute()`
- Clawbacks created if provider already paid

---

### Reports (`/v1/admin/reports/`)

| Method | Path                          | Roles  | Description                 | Status |
| ------ | ----------------------------- | ------ | --------------------------- | ------ |
| GET    | `/v1/admin/reports/overview`  | L1, L2 | KPI dashboard metrics       | ✅     |
| GET    | `/v1/admin/reports/revenue`   | L1     | Revenue breakdown by period | ✅     |
| GET    | `/v1/admin/reports/providers` | L1, L2 | Provider performance report | ✅     |
| GET    | `/v1/admin/reports/pilot`     | L1     | 10 pilot target metrics     | ✅     |

**DTO:**

- `RevenueReportQueryDto`: `from` (ISO date), `to` (ISO date), `groupBy` (day|week|month, default: day)

**Caching:** All reports cached 60s in Redis (except provider report — no cache)

**Overview Report:**

- Active rides/jobs, pending verifications, open disputes
- Registered users (clients, drivers, artisans)
- Commission revenue (today/week/month), payment success rate %

**Revenue Report:**

- Periods with: collections, commission, payouts, tips, FX costs
- MoMo vs card breakdown, payment success rate %

**Provider Report:**

- **Artisans**: supplement rate %, completed jobs, cancellations (30d), avg rating, flagged status
  - Flagged if supplement rate > `supplement_flag_threshold_percent` (default 50%)
- **Drivers**: top earners, avg rating, cancellations (30d), verification status

**Pilot Report (10 PRD Section 1.3 targets):**

| #   | Metric                 | Target |
| --- | ---------------------- | ------ |
| 1   | Registered clients     | 5,000  |
| 2   | Approved drivers       | 200    |
| 3   | Approved artisans      | 300    |
| 4   | Completed rides        | 10,000 |
| 5   | Completed jobs         | 3,000  |
| 6   | Average rating         | 4.2    |
| 7   | Provider retention %   | 70%    |
| 8   | USSD sessions          | 500    |
| 9   | Payment success rate % | 98%    |
| 10  | Average pickup time    | 8 min  |

**Frontend Implementation Notes:**

- Reports page replaced the old static card list with a 4-tab live data view
- Tab 1 — Overview KPIs: stats grid from `/reports/overview`
- Tab 2 — Revenue: summary stats + date-grouped table, `groupBy` selector (day/week/month)
- Tab 3 — Provider Performance: top drivers + top artisans side-by-side from `/reports/providers`
- Tab 4 — Pilot Targets: progress bars for all 10 PRD §1.3 metrics from `/reports/pilot`

---

### Announcements (`/v1/admin/announcements/`)

| Method | Path                      | Roles  | Description              | Status |
| ------ | ------------------------- | ------ | ------------------------ | ------ |
| POST   | `/v1/admin/announcements` | L1, L3 | Firebase topic broadcast | ✅     |

**DTO:**

- `CreateAnnouncementDto`: `title` (max 100), `body` (max 500), `targetAudience` (all|clients|drivers|artisans)

**Business Rules:**

- Topic map: all→all_users, clients→clients, drivers→drivers, artisans→artisans
- Fire-and-forget push via `PushService.broadcastToTopic()`
- Audit log entry created regardless of Firebase outcome

---

### Emergency Acknowledgment (`/v1/admin/emergency/`)

| Method | Path                                  | Roles      | Description                | Status |
| ------ | ------------------------------------- | ---------- | -------------------------- | ------ |
| PATCH  | `/v1/admin/emergency/:id/acknowledge` | L1, L2, L3 | Mark emergency as reviewed | ✅     |

**Business Rules:**

- Idempotent — calling twice returns existing `acknowledgedAt`

---

### Service Categories (`/v1/admin/categories/`)

| Method | Path                       | Roles  | Description         | Status |
| ------ | -------------------------- | ------ | ------------------- | ------ |
| GET    | `/v1/admin/categories`     | L1, L3 | List all categories | ✅     |
| POST   | `/v1/admin/categories`     | L1     | Create category     | ✅     |
| PATCH  | `/v1/admin/categories/:id` | L1     | Update category     | ✅     |

**DTOs:**

- `CreateCategoryDto`: `name` (required), `slug` (kebab-case), `iconUrl`, `minBidPesewas` (default 3000), `highBidFlagPesewas` (default 500000), `parentId` (UUID), `sortOrder` (0–999)
- `UpdateCategoryDto`: All fields optional, same validation

**Business Rules:**

- Delegates to `CategoryService` from marketplace module

**Frontend Implementation Notes:**

- Create/Edit form currently exposes: `name`, `slug`, `minBidPesewas`, `highBidFlagPesewas`
- `parentId`, `iconUrl`, `sortOrder` are valid DTO fields but hidden from the form (can be added later)
- Frontend sends `highBidFlagPesewas` as `maxBidPesewas` to match backend field name discrepancy (EDD uses `maxBidPesewas`; Prisma/GET response returns `highBidFlagPesewas`)
- "Add Category" button and edit pencil are hidden for L3 (ops_admin) via `<RoleGate permission="edit_categories">`

---

### Admin Account Management (`/v1/admin/admins/`) — requires `manage_admins`

| Method | Path                                  | Permission     | Description                  | Status |
| ------ | ------------------------------------- | -------------- | ---------------------------- | ------ |
| GET    | `/v1/admin/admins`                    | `manage_admins`| List all admins              | ✅     |
| GET    | `/v1/admin/admins/:id`                | `manage_admins`| Get admin by ID              | ✅     |
| POST   | `/v1/admin/admins`                    | `manage_admins`| Create admin account         | ✅     |
| PATCH  | `/v1/admin/admins/:id/permissions`    | `manage_admins`| Replace admin permission set | ⬜     |
| PATCH  | `/v1/admin/admins/:id/deactivate`     | `manage_admins`| Block login immediately      | ✅     |
| PATCH  | `/v1/admin/admins/:id/reactivate`     | `manage_admins`| Restore login access         | ✅     |
| PATCH  | `/v1/admin/admins/:id/reset-password` | `manage_admins`| Reset admin password         | ✅     |
| DELETE | `/v1/admin/admins/:id`                | `manage_admins`| Soft-delete admin            | ✅     |

> `PATCH /:id/permissions` replaces the former `PATCH /:id/role`. Backend must reject editing
> your **own** permissions and removing `manage_admins` from the **last** holder (anti-lockout).

**DTOs:**

- `CreateAdminDto`: `email` (unique), `fullName`, `permissions` (`Permission[]`), `password` (min 8 chars), `regionScope?`
- `UpdateAdminPermissionsDto`: `permissions` (`Permission[]`)
- `ResetAdminPasswordDto`: `newPassword` (min 8 chars)

**Business Rules:**

- Password hashed with bcrypt cost 12
- Email must be unique (409 EMAIL_TAKEN)
- Cannot self-modify role, self-deactivate, or self-delete (400 CANNOT_MODIFY_SELF)
- Deactivation blocks JWT validation immediately via `isActive=false`
- Soft-delete sets `deletedAt` + `isActive=false`
- Every action writes `audit_log` entry

---

### Referrals (`/v1/admin/referrals/`) — ⛔ requested (see backend-requests.md §7)

User-level referrals + loyalty wallet. Reward fires on the referee's first completed
activity in any role; amount = config `referral_bonus_pesewas`, credited as points at
`loyalty_ghs_per_point_pesewas`. Money is integer pesewas.

| Method | Path                                  | Permission         | Description                                   | Status |
| ------ | ------------------------------------- | ------------------ | --------------------------------------------- | ------ |
| GET    | `/v1/admin/referrals`                 | `view_referrals`   | Paginated, newest-first ledger (status/search/date filters) | ⛔ |
| GET    | `/v1/admin/referrals/metrics`         | `view_referrals`   | KPI counts + conversion + `byDay` trend       | ⛔     |
| GET    | `/v1/admin/users/:userId/referrals`   | `view_referrals`   | Per-user funnel (made / received / points)    | ⛔     |
| PATCH  | `/v1/admin/referrals/:id/void`        | `manage_referrals` | Reverse an awarded bonus (`{ reason }`, min 10) — idempotent 409 | ⛔ |
| POST   | `/v1/admin/referrals/:id/award`       | `manage_referrals` | Manually award a pending referral — idempotent 409 | ⛔ |

Reward amount is tuned via the existing `PATCH /v1/config/referral_bonus_pesewas` (no new
endpoint). Audit actions: `referral.bonus_voided`, `referral.bonus_awarded_manual`.

**Frontend (shipped):** page `app/(dashboard)/referrals/page.tsx` (+ `_components/`), API
layer in `lib/api.ts` (`listReferrals`, `getReferralMetrics`, `getUserReferrals`,
`voidReferralBonus`, `awardReferral`), permissions in `lib/roles.ts`, nav item under
Engagement. Page degrades gracefully (404 → "not yet available") until the routes deploy.

---

## Frontend File Reference

### API Layer (`lib/`)

| File            | Purpose                                                                  |
| --------------- | ------------------------------------------------------------------------ |
| `lib/api-client.ts` | Base `apiFetch`, `ApiError`, token helpers, `getAdminUser()`, `AdminUser` type |
| `lib/api.ts`    | All typed API methods grouped by domain (auth, reports, users, categories, etc.) |
| `lib/roles.ts`  | Role model: `AdminRole`, `Permission`, `PERMISSIONS`, `can()`, `ROLE_LABELS` |

### Hooks (`hooks/`)

| File                | Purpose                                              |
| ------------------- | ---------------------------------------------------- |
| `hooks/use-role.ts` | `useRole()` — role, adminName, isSuper, can() helper |

### Shared Components (`components/common/`)

| File                    | Purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `page-header.tsx`       | Title + subtitle + optional actions slot             |
| `status-badge.tsx`      | Coloured pill for status values                      |
| `access-denied.tsx`     | 403 page with role label and back-to-dashboard link  |
| `role-gate.tsx`         | Inline permission guard (hides children if no perm)  |
| `page-guard.tsx`        | Full-page permission guard (renders AccessDenied)    |

### User Components (`components/users/`)

| File                    | Purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `user-profile-sheet.tsx`| Slide-in panel for user detail, inline edit, actions |
| `create-user-dialog.tsx`| Modal form to create a new platform user             |

### Proxy (`app/api/proxy/[...path]/route.ts`)

- Routes all client-side API calls through Next.js to avoid CORS in development
- `AbortSignal.timeout(30_000)` prevents hanging on Render.com cold-starts
- Returns `504 UPSTREAM_TIMEOUT` with a user-facing "server warming up" message on timeout

---

## Database Tables Accessed

| Table                | Operations                             |
| -------------------- | -------------------------------------- |
| `provider_documents` | Verification queue queries             |
| `drivers`            | Provider management, verification      |
| `artisans`           | Provider management, verification      |
| `users`              | User management (suspend, ban)         |
| `artisan_jobs`       | Job assignment, live map               |
| `bids`               | Bid review                             |
| `rides`              | Live map, reports                      |
| `ratings`            | Provider performance reports           |
| `payments`           | Revenue reports, dispute resolution    |
| `disputes`           | Dispute handling                       |
| `emergency_events`   | Emergency acknowledgment               |
| `admin_users`        | Admin account CRUD                     |
| `admin_job_locks`    | Distributed lock for job assignment    |
| `audit_log`          | All admin actions logged               |
| `service_categories` | Category management                    |
| `batch_payout_runs`  | Payout tracking in reports             |
| `platform_config`    | Config values for thresholds and rates |

---

## Redis Keys

| Key Pattern                             | TTL  | Purpose                             |
| --------------------------------------- | ---- | ----------------------------------- |
| `admin:job_lock:{jobId}`                | 120s | Distributed lock for job assignment |
| `reports:overview:{role}`               | 60s  | Overview report cache               |
| `reports:revenue:{from}:{to}:{groupBy}` | 60s  | Revenue report cache                |
| `reports:pilot`                         | 60s  | Pilot metrics cache                 |

---

## Service Dependencies

| Service               | From Module  | Methods Used                              |
| --------------------- | ------------ | ----------------------------------------- |
| `PrismaService`       | database     | CRUD, `$transaction`, `$queryRaw`         |
| `RedisService`        | redis        | `get`, `set`, `del`                       |
| `RideDisputeService`  | ride         | `getDisputeDetail()`                      |
| `NotificationService` | notification | `send(userId, channels, eventType, data)` |
| `PushService`         | notification | `broadcastToTopic(topic, title, body)`    |
| `RefundService`       | payment      | `resolveDispute()`                        |
| `CategoryService`     | marketplace  | `listAll()`, `create()`, `update()`       |

---

## Guards & Decorators

| Guard/Decorator     | Level      | Purpose                              |
| ------------------- | ---------- | ------------------------------------ |
| `AdminJwtAuthGuard` | Controller | Secondary JWT validation (admin-jwt) |
| `@Roles(...)`       | Method     | Role-based access control            |
| `@CurrentUser()`    | Parameter  | Extracts JWT payload                 |
| `@ApiTags('Admin')` | Controller | Swagger grouping                     |
| `@ApiBearerAuth()`  | Controller | Swagger auth requirement             |
| `@ApiOperation()`   | Method     | Swagger operation docs               |

---

## Audit Logging

Every admin action creates an `audit_log` entry with:

| Field        | Description                            |
| ------------ | -------------------------------------- |
| `adminId`    | The admin who performed the action     |
| `action`     | Action type (e.g., `verify_provider`)  |
| `targetType` | Entity type (e.g., `provider`, `user`) |
| `targetId`   | Entity ID                              |
| `details`    | JSON with action-specific metadata     |
| `createdAt`  | Timestamp                              |

---

## Known Gaps & Pending Work

| Item                           | Priority | Description                                                                                  |
| ------------------------------ | -------- | -------------------------------------------------------------------------------------------- |
| User reinstate + profile edit  | P1       | `PATCH /admin/users/:id` not implemented on backend. Frontend `reinstateUser()` sends `{ status: 'active' }` and `updateUser()` sends `{ fullName, email }` — both blocked. NestJS controller + DTO + service code documented above in User Management section. |
| High Bid Review UI             | P1       | No `GET /v1/admin/bids/flagged` endpoint exists — UI page blocked until backend adds it      |
| Cancellation suspensions API   | P1       | `/v1/admin/providers/suspensions` (list/history/lift) not yet deployed; Cancellation Suspensions page shows the error + empty table until live. Also: config key needs reconciling to `cancellation_suspension_count`, and PATCH `/v1/config/:key` should require a new `edit_config` permission. See [backend-requests.md §6](backend-requests.md). |
| Verification documents empty   | P1       | `GET /admin/verifications` returns `documents: []` despite `total_docs > 0`. Backend query needs `JSON_AGG` to populate document rows. Frontend normaliser (`normaliseDoc`) is ready — blocked on backend SQL fix. |
| WebSocket live map             | P2       | Live map polls every 30s via HTTP GET; no WS subscription stream                             |
| Regional admin scoping         | P2       | All admins see global data; L2 should see Ashanti-only data (backend filter not implemented) |
| Category form — hidden fields  | P3       | `parentId`, `iconUrl`, `sortOrder` are valid DTO fields but not exposed in the form yet      |
| Integration tests              | P2       | No controller-service integration tests; no multi-step E2E                                   |
| Clawback write-off cron        | P3       | Policy defined but background job not wired to admin alerts                                  |
| Referral management API        | P1       | `/v1/admin/referrals` (list/metrics/per-user funnel/void/award) + `view_referrals`/`manage_referrals` permissions not yet deployed. Referrals page + API layer + nav are shipped frontend-side and degrade gracefully (404 → "not yet available"). Spec in [backend-requests.md §7](backend-requests.md). Needs unit tests (happy/validation/auth/idempotency) on the backend. |
| Single root admin enforcement  | P1       | Admin creation/permission assignment should be locked to ONE immutable root account (`admins.is_super_admin`), not any `manage_admins` holder. Frontend is shipped: `AdminUser.isSuperAdmin` + `useRole().isSuperAdmin` gate the Admin Accounts page/nav/actions, and the picker excludes `manage_admins` (no propagation). Backend must add the column + JWT claim, require root on `/admin/admins/*`, reject granting `manage_admins`, and protect the root account. Until shipped, the panel falls back to `manage_admins`. Spec in [backend-requests.md §8](backend-requests.md). |

---

## Testing Status

| Type        | File                    | Count | Status |
| ----------- | ----------------------- | ----- | ------ |
| Unit tests  | `admin.service.spec.ts` | 30+   | ✅     |
| Integration | —                       | 0     | ⬜     |
| E2E         | —                       | 0     | ⬜     |

---

## Related Documents

| Document              | Location                          | Relevance                              |
| --------------------- | --------------------------------- | -------------------------------------- |
| Admin Auth Flow       | `docs/admin-auth-flow.md`         | Login flow, example requests/responses |
| PRD Section 8         | `docs/PRD_Ghana_Platform_v2_1.md` | Admin feature requirements             |
| EDD Section 8         | `docs/EDD_MyShop_v1_1.md`         | Admin technical specification          |
| Security Audit Report | `docs/security-audit-report.md`   | Security findings for admin            |
