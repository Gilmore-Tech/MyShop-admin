# Backend endpoints the admin panel needs

The frontend already calls these paths (proxy auto-prefixes `/v1`). Where a route
is missing, the page degrades gracefully (404 → "not yet available").

> Status (2026-06-07): Ride detail ✅ deployed. Batch payouts ✅ deployed.
> Clawbacks ⛔ 404 (not deployed). Transactions `from`/`to` ⛔ 400 (param rejected).

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
    providerId: string
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

---

## 2. Transactions date filter — `from`/`to` on `GET /v1/admin/payments/transactions`  ⛔ 400

Sending `?from=YYYY-MM-DD` (and `to`) returns 400 (param rejected by
class-validator `forbidNonWhitelisted`). Please whitelist `from`/`to` and filter
by `createdAt`. The admin date filter is currently disabled on this page because
of this; it'll be re-enabled once accepted. (The `/admin/reports/revenue`
endpoint already accepts `from`/`to`.)

---

## Done
- Ride detail `GET /v1/admin/rides/:id` — deployed.
- Batch payouts `GET /v1/admin/payouts/batches` + `POST .../force` — deployed.
- Jobs payment fields on `/admin/jobs` (+ detail) — shipped.
- Category icons — see [category-icons.md](category-icons.md).
