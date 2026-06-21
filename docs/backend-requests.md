# Backend endpoints the admin panel needs

The frontend already calls these paths (proxy auto-prefixes `/v1`). Where a route
is missing, the page degrades gracefully (404 → "not yet available").

> Status (2026-06-12): Ride detail ✅ deployed. Batch payouts ✅ deployed.
> Clawbacks ⛔ 404 (not deployed). Transactions `from`/`to` ⛔ 400 (param rejected).
> Provider verification notifications ⛔ requested (see §3 — backend-only, no frontend change).

---

## 1. Clawbacks — `GET /v1/admin/clawbacks`  ⛔ 404 ("Cannot GET")

Powers **Payments → Clawbacks**. Route is not registered on the deployed API
(disputes/transactions return 401; this returns a raw "Cannot GET").

**`GET /v1/admin/clawbacks`** (permission `view_payments`) — returns:
```ts
{
  items: {
    id: string
    providerName: string | null
    providerId: string           // drivers/artisans row id
    userId: string               // ⬅ NEW — the provider's user-account id (see note below)
    outstandingPesewas: number
    originalDisputeId: string | null
    initiatedAt: string          // ISO
    daysOutstanding: number
    status: string               // e.g. outstanding | partial | written_off | settled | escalated
  }[]
  total: number
  totalOutstandingPesewas: number
}
```

Action endpoints the page also calls:
- **`PATCH /v1/admin/clawbacks/:id/write-off`** — body `{ reason: string }` (min 10 chars, audit-logged). Permission L1 (super_admin).
- **`PATCH /v1/admin/clawbacks/:id/escalate`** — no body. Permission L1/L2.

**Please add `userId` to each clawback item.** The "Remind" button sends an SMS
to the provider, and the SMS route resolves the phone via `GET /admin/users/:id`,
which only accepts a **user-account id**. The clawback's `providerId` is the
`drivers`/`artisans` row id (a different namespace), so passing it returns
`404 — Backend returned 404 while fetching user`. Resolve it the same way as the
verification notifications: `(providerId, providerType) → drivers/artisans row →
userId`. Until this field is present, the admin panel disables the reminder and
falls back to the **Contact** action.

---

## 2. Transactions date filter — `from`/`to` on `GET /v1/admin/payments/transactions`  ⛔ 400

Sending `?from=YYYY-MM-DD` (and `to`) returns 400 (param rejected by
class-validator `forbidNonWhitelisted`). Please whitelist `from`/`to` and filter
by `createdAt`. The admin date filter is currently disabled on this page because
of this; it'll be re-enabled once accepted. (The `/admin/reports/revenue`
endpoint already accepts `from`/`to`.)

---

## 3. Notify the provider when their verification is reviewed — backend-only

When an admin approves or rejects a provider's verification, the **driver/artisan
must receive an in-app notification** in their mobile app telling them the outcome
and what to do next. This is a backend change — the admin panel already calls the
review endpoints below, and it has **no transport to reach a provider's notification
feed**. The notification must be emitted **server-side, inside the existing review
handlers**, so it can never be missed (no extra admin call, no silent failure).

### Trigger points (both already deployed and called by the panel)

| Endpoint | Handler should also… |
| -------- | -------------------- |
| `PATCH /v1/admin/verifications/:id` (provider-level approve/reject) | emit one notification to the provider summarising the final decision |
| `PATCH /v1/admin/verifications/documents/:id` (per-document approve/reject) | emit one notification to the provider for that document |

Both carry `{ providerType: 'driver' \| 'artisan', action: 'approve' \| 'reject', reason }`.
The provider-level call is the **primary** one to wire up; the per-document one is
desirable so a provider learns immediately when a single doc is rejected and needs
re-upload. If you only do one first, do the **provider-level** decision.

### Recipient resolution

`(:id = providerId, providerType)` → the `drivers`/`artisans` row → its `userId`.
Send to that user. Phone numbers stay masked — this is an in-app feed item keyed to
the user, no PII added.

### Emit inside the existing `$transaction`

The review already updates the doc/provider rows and writes an audit log atomically
([admin-module.md §Provider Verification](admin-module.md)). Enqueue the notification
in the **same transaction / domain event** so a committed review always produces a
notification and a rolled-back one produces none. Reuse the existing
`NotificationService.send(userId, channels, eventType, data)`
([admin-module.md:519](admin-module.md#L519)).

```ts
// provider-level decision
await notifications.send(userId, ['in_app', 'push'], 'verification.reviewed', {
  providerType,                       // 'driver' | 'artisan'
  status: action === 'approve' ? 'approved' : 'rejected',
  reason,                             // admin's reason (required on reject, min 5 chars)
  reviewedAt,                         // ISO
})

// per-document decision
await notifications.send(userId, ['in_app'], 'verification.document_reviewed', {
  providerType,
  documentType,                       // e.g. 'drivers_license', 'vehicle_insurance'
  documentLabel,                      // human label, e.g. "Driver's License"
  status: action === 'approve' ? 'approved' : 'rejected',
  reason,
})
```

### Suggested copy (server renders title/body; bilingual via existing i18n)

| Event | Title | Body |
| ----- | ----- | ---- |
| `verification.reviewed` approved | "You're verified ✅" | "Your {driver/artisan} account has been approved. You can now go online and start accepting {rides/jobs}." |
| `verification.reviewed` rejected | "Verification needs attention" | "Your verification was not approved. Reason: {reason}. Please review and resubmit your documents." |
| `verification.document_reviewed` approved | "Document approved" | "Your {documentLabel} was approved." |
| `verification.document_reviewed` rejected | "Document rejected" | "Your {documentLabel} was rejected. Reason: {reason}. Please upload a new one." |

`documentType` values the panel surfaces: `national_id, ghana_card, passport,
drivers_license, vehicle_registration, vehicle_insurance, roadworthy, profile_photo,
certificate, trade_license, tin_certificate, business_registration`.

### Notes

- **In-app is required; push is a bonus.** The mobile notification feed (the
  persisted item) is the must-have. FCM push on top is nice but optional for v1.
- **Deep link:** set the notification's link/route to the provider's verification
  screen so tapping it opens the right place (mirrors how admin notifications carry
  `linkPath`).
- **No frontend change in `MyShop-admin`** — once this ships, approving/rejecting on
  the Verifications page automatically notifies the provider. Nothing to call.

---

## 4. Registration completion flag on `GET /v1/admin/users` (+ `/admin/users/:id`)

Powers the new **Registration** column on **User Management → All Users**, so admins
can see who finished onboarding and who dropped out mid-signup. The panel reads each
user object for:

```ts
registrationComplete: boolean          // true = finished the full registration/onboarding flow
registrationCompletedAt: string | null // ISO timestamp when it completed, else null
```

- `registrationComplete` is the **source of truth** the column renders. Define
  "complete" by the same rule the mobile apps use to let a user out of the signup
  flow (e.g. phone verified + profile fields set + role selected). The admin panel
  does **not** re-derive this from KYC/verification — those are separate concerns.
- `registrationCompletedAt` is optional polish (shown in the cell tooltip). Omit it
  if you don't track the timestamp.
- **Currently derived on the frontend.** Until this field ships, the column infers
  completion from the user payload (has name + ≥1 role + the profile row for each
  claimed role populated + status ≠ `pending`). The derivation is best-effort; an
  authoritative `registrationComplete` from the backend will override it
  automatically. camelCase or snake_case both accepted.
- **Nice-to-have filter:** accept `?registration=complete|incomplete` on
  `GET /v1/admin/users` so the column can be filtered server-side. Not required for
  v1 — the column works without it.

---

## 5. Active suspension detail on the provider object (`GET /v1/admin/users/:id`, ideally `/admin/users` too)

Powers the **suspension context** an admin sees before lifting an auto-suspension
on **User Management → Drivers/Artisans → profile sheet**. When a driver hits the
3-cancellations-in-30-days threshold (EDD §6.3) the cancellation engine flips
`driver.verificationStatus → 'suspended'` and writes a row to `provider_suspensions`.
The panel already exposes the **Lift verification suspension** action, but the admin
currently decides blind — they can't see *why* or *when* the provider was suspended.

Please include the currently-active (not-yet-reinstated) `provider_suspensions` row
on each provider sub-profile (`driver` and `artisan`) in the user payload:

```ts
driver: {
  // …existing fields…
  activeSuspension: {
    triggerType: string        // 'cancellation' | 'rating' | 'background_check' | 'manual'
    reason: string | null      // the reason logged at suspension time (EDD §6.3: "reason required and logged")
    suspendedAt: string        // ISO
    cancellationCount: number | null  // rolling count captured at trigger time, when triggerType = 'cancellation'
  } | null
}
```

- `activeSuspension` = the `provider_suspensions` row where `reinstatedAt IS NULL`
  (the open one). Return `null` when the provider isn't suspended.
- camelCase or snake_case both accepted; the panel also reads `suspension` /
  `active_suspension` and `trigger`/`trigger_type` as aliases.
- **Currently degrades gracefully.** Until this ships, the suspension block renders
  "Reason unavailable — pending backend support." and falls back to the live
  `cancellationCount30d` for the count line. The lift action already works without it.
- On **`/admin/users` (list)** it's nice-to-have (lets the list hint context without
  opening the sheet); the detail endpoint is the priority.

---

## 6. Provider cancellation-suspension management — `/v1/admin/providers/*`

Powers the new **Trust & Safety → Cancellation Suspensions** page, where admins view
who is auto-suspended for exceeding the cancellation limit and lift the suspension.
The data lives in `provider_suspensions` (trigger `cancellation_limit`, `isAutomatic`).
The panel already calls these paths; they 404 until deployed (the page shows the error
and an empty table). Direct-object responses (no envelope); errors as
`{ error, message }` with the HTTP status.

### 6.1 `GET /v1/admin/providers/suspensions` — permission `view_users`
Query: `providerType=driver|artisan`, `triggerType` (default filter `cancellation_limit`),
`activeOnly=true` (`reinstatedAt IS NULL`), `page`, `limit`. Join provider + user:
```ts
{
  items: {
    suspensionId: string
    providerType: 'driver' | 'artisan'
    providerId: string                 // drivers/artisans row id
    userId: string | null              // user-account id (for cross-links)
    fullName: string | null
    phone: string | null               // normalised/masked
    cancellationCount30d: number       // current rolling count
    verificationStatus: string         // 'suspended' while active
    reason: string | null
    triggerType: string                // 'cancellation_limit'
    isAutomatic: boolean
    suspendedAt: string                // ProviderSuspension.createdAt, ISO
    reinstatedAt: string | null
  }[]
  total: number; page: number; limit: number; totalPages: number
}
```
camelCase or snake_case both accepted; provider/user may be flattened or nested
(`item.user.fullName` etc.) — the panel normalises either.

### 6.2 `GET /v1/admin/providers/:providerId/suspensions` — permission `view_users`
Full suspension history for one provider (same item shape, all rows incl. lifted).

### 6.3 `PATCH /v1/admin/providers/:providerId/suspensions/:suspensionId/lift` — permission `lift_verification_suspension`
Body: `{ note?: string }`. Atomically, mirroring `reinstateUser`:
- set `ProviderSuspension.reinstatedAt = now()`, `reinstatedBy = <adminId>`
- set the driver/artisan `verificationStatus = 'approved'`
- **reset `cancellationCount30d = 0`** (so they aren't instantly re-suspended on the
  next cancellation — the panel's modal tells the admin this happens)
- write an `audit_log` entry (`action: 'lift_cancellation_suspension'`, include `note`)
- `404` if the suspension doesn't exist; `409` if already lifted (`reinstatedAt` set).

> Uses the **existing** `lift_verification_suspension` permission — do **not** add a
> cancellation-specific one. (This is distinct from §`/admin/verifications/:id/lift-suspension`,
> which the profile sheet uses; both may coexist, or consolidate server-side.)

### 6.4 Config plumbing for the policy editor
The page's **Cancellation Policy** editor reads/writes two `platform_config` keys via the
existing `GET /v1/config` + `PATCH /v1/config/:key`:
- **Reconcile the key name.** Runtime reads `cancellation_suspension_count` but the seed
  writes `cancellation_suspension_threshold`. **Standardise on `cancellation_suspension_count`**
  — migrate/rename the seeded row and drop the stale key. The admin frontend now writes
  `cancellation_suspension_count` (both this editor and the Marketplace Config page); until
  the seed is migrated, the old row is orphaned and edits land on the correct runtime key.
- **Guard the write.** `PATCH /v1/config/:key` currently requires only `view_config`. Add a
  new **`edit_config`** permission and require it for the PATCH (keep `view_config` for GET).
  Once it exists, add `edit_config` to `lib/roles.ts` and the panel will gate the editor on
  it; **until then the editor is gated on `view_config`** (interim — view implies edit).

---

## 7. Referral Management — `/v1/admin/referrals/*`  ⛔ requested (new)

Powers the new **Referrals** page (`/referrals`). Referrals and the loyalty wallet are
**user-level** (one per phone identity, shared across client/driver/artisan roles):
`users.referral_code` (`MYSHOP-{A-Z0-9}{6}`), `users.loyalty_points_balance`; tables
`referrals` (`referrer_id`/`referee_id` → `users`, `referee_id` UNIQUE) and
`loyalty_transactions`. The referrer's reward fires on the referee's **first completed
activity in any role** (a ride/job they booked OR delivered): reward = config
`referral_bonus_pesewas` (default 100 = GHS 1.00), credited as loyalty points at
`loyalty_ghs_per_point_pesewas` (default 10p/pt → 10 pts). All money is integer **pesewas**.

### 7.0 Permissions (seed via migration, mirror how `view_payments` / `write_off_clawback` were added)
- **`view_referrals`** — grant to L1–L4. Gates the three read endpoints below.
- **`manage_referrals`** — grant to L1 only. Gates void + manual-award.

The frontend already declares both in `lib/roles.ts` (group "Referrals & Loyalty") and
gates the page on `view_referrals`, with the row actions on `manage_referrals`.

### 7.1 `GET /v1/admin/referrals` — permission `view_referrals`
Paginated, newest-first ledger.
Query: `page`, `limit` (max 100), `status` (`pending|awarded|all`, default `all`),
`search` (matches referrer/referee name, phone, or code), `from`/`to` (created_at range).
```ts
{
  items: {
    id: string
    referralCode: string
    referrer: { userId: string; fullName: string | null; phone: string | null; roles: string[] }
    referee:  { userId: string; fullName: string | null; phone: string | null; roles: string[] }
    firstBookingCompleted: boolean
    bonusAwarded: boolean
    bonusPoints: number | null     // null until awarded (or after a void)
    createdAt: string              // ISO
  }[]
  total: number
  page: number
  limit: number
}
```
`roles` is every role the single user identity holds (e.g. `['client','driver']`). Phones
returned normalised/masked, consistent with the rest of the admin API.

### 7.2 `GET /v1/admin/referrals/metrics` — permission `view_referrals`
KPI cards + trend chart. `byDay` spans the requested `from`/`to` (default last 30 days).
```ts
{
  totalReferrals: number
  awardedCount: number
  pendingCount: number
  conversionRatePct: number          // awarded / total × 100
  totalBonusPointsAwarded: number
  totalBonusValuePesewas: number     // points × loyalty_ghs_per_point_pesewas
  byDay: { date: string; created: number; awarded: number }[]   // date = yyyy-mm-dd
}
```

### 7.3 `GET /v1/admin/users/:userId/referrals` — permission `view_referrals`
Per-user funnel for the drilldown panel. `referralsMade` / `referralReceived` reuse the
item shape from §7.1.
```ts
{
  referralCode: string | null
  referralsMade: ReferralItem[]            // referrals where :userId is the referrer
  referralReceived: ReferralItem | null    // the referral where :userId is the referee (or null)
  loyaltyPointsBalance: number
}
```

### 7.4 `PATCH /v1/admin/referrals/:id/void` — permission `manage_referrals`
Body `{ reason: string }` (**min 10 chars**, validated). Reverses an awarded bonus:
deduct `bonusPoints` from the referrer's `users.loyalty_points_balance` (**floor at 0**),
write a compensating `loyalty_transactions` row (`adjusted`, **negative** points,
`description` carries the reason), set `bonus_awarded=false`, `bonus_points=null`.
**Idempotent — `409` if not awarded.** Audit-log `referral.bonus_voided`. Returns the
updated referral item (§7.1 shape).

### 7.5 `POST /v1/admin/referrals/:id/award` — permission `manage_referrals`
Manually award a still-pending referral — same logic as
`ReferralService.awardReferralBonusIfApplicable`, **bypassing the first-activity check**.
**Idempotent — `409` if already awarded.** Audit-log `referral.bonus_awarded_manual`.
Returns the updated referral item.

### 7.6 Reward config — already tunable, just surface it
The page's reward card reads `referral_bonus_pesewas` + `loyalty_ghs_per_point_pesewas`
via the existing `GET /v1/config`, and edits the bonus via the existing
`PATCH /v1/config/referral_bonus_pesewas`. **No new endpoint needed** — just ensure both
keys are seeded. The edit control is gated on `view_config` (interim — see §6.4; switch to
`edit_config` once that permission ships).

### 7.7 Error codes the frontend maps
`409` on void → "not in an awarded state"; `409` on award → "already awarded";
`404` → "no longer exists / not found". Keep these as the failure modes for those routes.

---

## 8. Single root admin — lock admin creation to ONE account  ⛔ requested (new)

**Goal:** only **one** account may create admins and assign permissions. Today any
holder of `manage_admins` can create another admin *and grant them `manage_admins`*, so
the privilege propagates — there can be many "super admins". We want exactly one,
immutable, root account.

### 8.1 Schema (migration)
- Add **`admins.is_super_admin boolean NOT NULL DEFAULT false`**.
- Seed it **`true` for exactly one** existing account (the designated root), `false` for
  all others. Add a partial unique index (or a migration/runtime assertion) so **at most
  one** row can ever have `is_super_admin = true`.

### 8.2 JWT + responses
- Include `isSuperAdmin` in the **admin JWT claims**, in the `POST /auth/admin/login`
  response (`admin` object), and in `GET /v1/admin/admins` + `/admins/:id` items. The
  frontend already reads `AdminUser.isSuperAdmin` and gates the Admin Accounts page + nav
  on it (falling back to `manage_admins` only until this ships).

### 8.3 Enforcement — require **root**, not `manage_admins`
Change the guard on **every** `/v1/admin/admins/*` route (create, update permissions,
deactivate, reactivate, reset-password, delete) to require **`is_super_admin = true`**,
not the `manage_admins` permission. Return `403 NOT_ROOT_ADMIN` otherwise.

### 8.4 Stop the privilege from propagating
- **Reject any request that assigns `manage_admins`** (in `CreateAdminDto` /
  `UpdateAdminPermissionsDto`) — `400 CANNOT_GRANT_MANAGE_ADMINS`. Root is designated by
  the flag, so `manage_admins` should no longer be handed out at all (the frontend already
  hides it from the permission picker via `excludeKeys`). Optionally retire `manage_admins`
  from the catalogue once migrated.
- **Never expose an endpoint that sets `is_super_admin`.** It is set once by the seed
  migration and is not mutable through the API.

### 8.5 Protect the root account (anti-lockout)
The root admin cannot be **deactivated, deleted, or have `is_super_admin` cleared** by any
API call (including itself) — `400 CANNOT_MODIFY_ROOT`. Password reset for root stays
allowed.

### 8.6 Audit
Audit-log root-gated actions as today; add `admin.root_action_denied` for rejected
non-root attempts so escalation attempts are visible.

> Until this ships, the panel degrades gracefully: `isSuperAdmin` is absent, so the page
> falls back to the legacy `manage_admins` holder. Once the flag is present it takes over,
> and non-root admins lose access to the page, nav entry, and actions.

---

## Done
- Ride detail `GET /v1/admin/rides/:id` — deployed.
- Batch payouts `GET /v1/admin/payouts/batches` + `POST .../force` — deployed.
- Jobs payment fields on `/admin/jobs` (+ detail) — shipped.
- Category icons — see [category-icons.md](category-icons.md).
