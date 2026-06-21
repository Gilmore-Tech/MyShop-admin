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

## Done
- Ride detail `GET /v1/admin/rides/:id` — deployed.
- Batch payouts `GET /v1/admin/payouts/batches` + `POST .../force` — deployed.
- Jobs payment fields on `/admin/jobs` (+ detail) — shipped.
- Category icons — see [category-icons.md](category-icons.md).
