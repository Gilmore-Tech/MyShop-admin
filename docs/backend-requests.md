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

## Done
- Ride detail `GET /v1/admin/rides/:id` — deployed.
- Batch payouts `GET /v1/admin/payouts/batches` + `POST .../force` — deployed.
- Jobs payment fields on `/admin/jobs` (+ detail) — shipped.
- Category icons — see [category-icons.md](category-icons.md).
