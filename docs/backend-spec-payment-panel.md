# Backend Spec — Payment Management Panel Endpoints

> **Status:** Draft, awaiting backend implementation
> **Owners:** Backend (admin module, payment module) + Frontend (admin panel)
> **Related docs:** [admin-frontend-spec-payment-panel.md](./admin-frontend-spec-payment-panel.md) §6, [admin-module.md](./admin-module.md)
> **Frontend caller:** `app/(dashboard)/payments/**`, `app/(dashboard)/disputes/**`, `app/(dashboard)/users/[id]/page.tsx`

---

## 1. Goal

The frontend payment-management spec (§6) lists 13 endpoints that don't exist yet. This doc consolidates them with concrete request/response shapes, validation, error codes, and audit-log entries so backend can implement against a single authoritative reference.

All endpoints follow existing admin module conventions:

- Mounted under `/v1/admin`
- `@Roles(...)` guards per the table below
- Response envelope `{ success: boolean, data: T, error?: { code, message }, meta?: {...} }`
- Audit log entry on every mutation
- Pagination uses `page` (1-indexed), `limit` (default 20, max 100), returns `{ items, total, page, limit, totalPages }`
- `from`/`to` are ISO-8601 dates inclusive of `from`, exclusive of `to`
- Money is integer pesewas everywhere

---

## 2. Endpoints

### 2.1 `GET /v1/admin/payments/:id`

**Roles:** L1 (super_admin), L2 (regional_admin)
**Purpose:** Full payment lifecycle for the payment-detail page.

**Response (`data`):**

```jsonc
{
  "id": "uuid",
  "status": "escrowed",                       // pending|processing|escrowed|completed|failed|refunded|disputed
  "method": "mobile_money_mtn",
  "msisdn": "+233200000001",
  "grossPesewas": 4700,
  "commissionPesewas": 940,
  "netPayoutPesewas": 3760,
  "paystackRef": "FLW-...",
  "internalRef": "myshop-pay-...",
  "createdAt": "2026-05-07T14:02:11Z",
  "completedAt": null,
  "client": { "id": "uuid", "fullName": "Ama K.", "phone": "+233200000001" },
  "provider": {
    "id": "uuid",
    "fullName": "Kofi M.",
    "type": "driver",                         // driver|artisan
    "providerId": "uuid"                      // drivers.id or artisans.id
  },
  "booking": { "id": "uuid", "type": "ride", "shortRef": "abc-12345" },
  "events": [                                 // ordered ASC by occurredAt
    { "kind": "initiated",         "occurredAt": "2026-05-07T14:02:11Z", "meta": { "internalRef": "..." } },
    { "kind": "otp_sent",          "occurredAt": "2026-05-07T14:02:14Z", "meta": { "chargeStatus": "send_otp" } },
    { "kind": "charge_succeeded",  "occurredAt": "2026-05-07T14:02:31Z", "meta": { "paystackRef": "FLW-..." } },
    { "kind": "escrowed",          "occurredAt": "2026-05-07T14:02:32Z", "meta": {} },
    { "kind": "transfer_attempt",  "occurredAt": "2026-05-07T14:02:34Z", "meta": { "transferId": "uuid", "attemptNumber": 2, "status": "retrying" } },
    { "kind": "payout",            "occurredAt": null,                     "meta": { "blockedBy": "transfer" } }
  ],
  "linked": {
    "tips":     [{ "id": "uuid", "amountPesewas": 500, "status": "complete" }],
    "payouts":  [{ "id": "uuid", "amountPesewas": 3760, "status": "completed", "createdAt": "..." }],
    "transfers":[{ "id": "uuid", "status": "retrying", "attemptNumber": 2, "nextAttemptAt": "2026-05-07T14:30:00Z" }],
    "clawbacks":[],
    "disputes": []
  }
}
```

**Event kinds (closed enum):**
`initiated | otp_sent | otp_resent | charge_succeeded | charge_failed | escrowed | released_to_provider | transfer_attempt | payout | refund | clawback | dispute_opened | dispute_resolved | force_failed`

Backend computes events from the payment row + linked tables (no separate `payment_events` table required for v1).

**Errors:**

- `404 PAYMENT_NOT_FOUND` if id doesn't exist
- `403 FORBIDDEN_REGION` if L2 admin requests a payment outside their region (existing pattern)

---

### 2.2 `POST /v1/admin/payments/:id/retry-transfer`

**Roles:** L1 (super_admin), L3 (ops_admin)
**Purpose:** Re-enqueue a failed `pending_transfers` row tied to this payment.

**Body:** none.

**Response:**

```jsonc
{ "transferId": "uuid", "status": "pending", "attemptNumber": 3, "nextAttemptAt": "2026-05-07T14:35:00Z" }
```

**Behaviour:**

- Idempotency: looks up the most-recent `pending_transfers` row for `paymentId = :id`. If its status is already `pending` or `succeeded`, error.
- Sets `status='pending'`, `attempt_number = attempt_number + 1`, `next_attempt_at = NOW()`.
- Audit log: `payment.transfer_retried`, payload `{ paymentId, transferId, previousAttempt }`.

**Errors:**

- `404 PAYMENT_NOT_FOUND`
- `409 NO_FAILED_TRANSFER` — payment has no failed/retrying transfer to retry
- `409 TRANSFER_ALREADY_PENDING` — most recent transfer is already pending
- `409 TRANSFER_ALREADY_SUCCEEDED` — most recent transfer succeeded; nothing to retry

---

### 2.3 `POST /v1/admin/payments/:id/force-fail`

**Roles:** L1 only
**Purpose:** Force-fail a stuck payment and release any escrow via refund clawback.

**Body (`ForceFailPaymentDto`):**

```jsonc
{ "reason": "string, min 10 chars, required" }
```

**Behaviour:**

1. Sets `payments.status = 'failed'`.
2. If escrow was held, creates a refund clawback against the provider (or no-op if no escrow).
3. Inserts an audit log entry `payment.force_failed` with `{ paymentId, reason, escrowReleasedPesewas }`.
4. Triggers the standard "payment failed" notification to the client.

**Response:**

```jsonc
{
  "id": "uuid",
  "status": "failed",
  "escrowReleasedPesewas": 4700,
  "clawbackId": "uuid"      // null if no escrow was held
}
```

**Errors:**

- `404 PAYMENT_NOT_FOUND`
- `409 PAYMENT_ALREADY_TERMINAL` — already `completed`, `failed`, or `refunded`
- `409 PAYMENT_DISPUTED` — open dispute on this payment; resolve dispute first
- `400 REASON_REQUIRED` — reason missing or < 10 chars

---

### 2.4 `GET /v1/admin/payouts`

**Roles:** L1, L2, L3
**Purpose:** Paginated list of payouts.

**Query:**

| Param        | Type              | Notes                                            |
| ------------ | ----------------- | ------------------------------------------------ |
| `status`     | string            | `pending`/`processing`/`completed`/`failed`      |
| `providerId` | uuid              | Either `drivers.id` or `artisans.id`              |
| `paymentId`  | uuid              | Filter to payouts for a specific payment         |
| `from`, `to` | ISO date          | Filters `payouts.createdAt`                       |
| `page`       | int               | Default 1                                        |
| `limit`      | int               | Default 20, max 100                              |

**Item shape:**

```jsonc
{
  "id": "uuid",
  "paymentId": "uuid",
  "providerId": "uuid",
  "providerName": "Kofi M.",
  "providerType": "driver",
  "amountPesewas": 3760,
  "method": "paystack_transfer",
  "status": "completed",
  "createdAt": "...",
  "completedAt": "...",
  "booking": { "id": "uuid", "type": "ride" }
}
```

---

### 2.5 `GET /v1/admin/payouts/:id`

**Roles:** L1, L2, L3
**Purpose:** Single payout + linked transfer attempts.

**Response (`data`):**

```jsonc
{
  "payout": { /* same as 2.4 item */ },
  "payment": {
    "id": "uuid",
    "grossPesewas": 4700,
    "commissionPesewas": 940,
    "status": "completed"
  },
  "transfers": [
    {
      "id": "uuid",
      "attemptNumber": 1,
      "status": "succeeded",
      "paystackRef": "TRF-...",
      "createdAt": "...",
      "completedAt": "..."
    }
  ]
}
```

**Errors:** `404 PAYOUT_NOT_FOUND`.

---

### 2.6 `GET /v1/admin/transfers/pending`

**Roles:** L1, L3
**Purpose:** `pending_transfers` queue.

**Query:**

| Param        | Notes                                                                |
| ------------ | -------------------------------------------------------------------- |
| `status`     | `pending`/`retrying`/`failed_retrying`. Default returns all three.    |
| `providerId` | uuid                                                                 |
| `page`/`limit` | as above                                                            |

**Default sort:** `next_attempt_at ASC, created_at ASC`.

**Item shape:**

```jsonc
{
  "id": "uuid",
  "paymentId": "uuid",
  "providerId": "uuid",
  "providerName": "Kofi M.",
  "providerType": "driver",
  "amountPesewas": 3760,
  "attemptNumber": 2,
  "maxAttempts": 3,
  "status": "retrying",
  "lastError": "Insufficient balance on Paystack subaccount",
  "createdAt": "...",
  "nextAttemptAt": "..."
}
```

---

### 2.7 `POST /v1/admin/transfers/:id/requeue`

**Roles:** L1, L3
**Purpose:** Move a failed transfer back to `pending` immediately.

**Body:** none.

**Behaviour:**

- Sets `pending_transfers.status='pending'`, `attempt_number=0`, `next_attempt_at=NOW()`, `last_error=NULL`.
- Audit log: `transfer.requeued`, payload `{ transferId, paymentId, previousStatus, previousAttempt }`.

**Response:**

```jsonc
{ "id": "uuid", "status": "pending", "attemptNumber": 0, "nextAttemptAt": "..." }
```

**Errors:**

- `404 TRANSFER_NOT_FOUND`
- `409 TRANSFER_ALREADY_SUCCEEDED`
- `409 TRANSFER_ALREADY_PENDING`

---

### 2.8 `GET /v1/admin/clawbacks`

**Roles:** L1, L3
**Purpose:** Paginated clawbacks + outstanding-balance summary.

**Query:**

| Param        | Notes                                                                 |
| ------------ | --------------------------------------------------------------------- |
| `source`     | `CASH_COMMISSION`/`DISPUTE`/`WRITE_OFF`/`MANUAL`. Default `CASH_COMMISSION`. |
| `status`     | `pending`/`settled`/`written_off`                                     |
| `providerId` | uuid                                                                  |
| `from`/`to`  | filters `created_at`                                                  |
| `page`/`limit` | default 20 / max 100                                                |

**Response (`data`):**

```jsonc
{
  "items": [
    {
      "id": "uuid",
      "source": "CASH_COMMISSION",
      "status": "pending",
      "amountPesewas": 1200,
      "providerId": "uuid",
      "providerName": "Kofi M.",
      "providerType": "driver",
      "linkedPaymentId": null,
      "linkedDisputeId": null,
      "reason": null,
      "createdAt": "...",
      "settledAt": null
    }
  ],
  "total": 142,
  "page": 1,
  "limit": 20,
  "totalPages": 8,
  "summary": {
    "totalOutstandingPesewas": 184500,
    "byProvider": [
      { "providerId": "uuid", "providerName": "Kofi M.", "providerType": "driver", "outstandingPesewas": 12000 }
    ]
  }
}
```

`summary` is computed against the **filtered** set, not the page. `byProvider` is capped at top 50 by outstanding balance.

---

### 2.9 `POST /v1/admin/clawbacks/:id/write-off`

**Roles:** L1 only
**Purpose:** Write off a clawback with reason.

**Body (`WriteOffClawbackDto`):**

```jsonc
{ "reason": "string, min 10 chars, required" }
```

**Query:**

- `force=true` — super_admin override of threshold rules.

**Behaviour:**

1. Validate against `clawback_writeoff_threshold_pesewas` and `clawback_writeoff_inactive_days` from `platform_config`. If amount > threshold OR provider was active within inactive_days, reject unless `force=true`.
2. Set `clawbacks.status='written_off'`, `written_off_at=NOW()`, `write_off_reason=<reason>`.
3. Audit log: `clawback.written_off`, payload `{ clawbackId, providerId, amountPesewas, reason, forced }`.

**Response:**

```jsonc
{ "id": "uuid", "status": "written_off", "writtenOffAt": "...", "amountPesewas": 1200 }
```

**Errors:**

- `404 CLAWBACK_NOT_FOUND`
- `409 CLAWBACK_ALREADY_SETTLED`
- `409 CLAWBACK_ALREADY_WRITTEN_OFF`
- `400 WRITEOFF_THRESHOLD_VIOLATION` — threshold exceeded; can be bypassed with `?force=true`
- `400 REASON_REQUIRED`

---

### 2.10 `GET /v1/admin/reconciliation/runs`

**Roles:** L1, L2
**Purpose:** Daily reconciliation run history.

**Query:** `page`, `limit`, `from`, `to` (filters `runAt`).

**Item shape:**

```jsonc
{
  "id": "uuid",
  "runAt": "2026-05-07T02:00:00Z",
  "periodStart": "2026-05-06T00:00:00Z",
  "periodEnd": "2026-05-07T00:00:00Z",
  "paystackCollectionsPesewas": 14233000,
  "dbCollectionsPesewas": 14233000,
  "paystackPayoutsPesewas": 11386400,
  "dbPayoutsPesewas": 11386400,
  "dbCashRemitsPesewas": 42000,
  "discrepancyPesewas": 0,
  "discrepancyCount": 0,
  "status": "clean"          // clean | discrepancies | failed
}
```

Sourced from `reconciliation_reports` (already exists per CHANGELOG).

---

### 2.11 `GET /v1/admin/reconciliation/runs/:id`

**Roles:** L1, L2
**Purpose:** Run detail + discrepancies.

**Response:**

```jsonc
{
  "run": { /* same as 2.10 item */ },
  "discrepancies": [
    {
      "source": "paystack",                    // paystack | db
      "type": "missing_in_db",                 // missing_in_db | missing_in_paystack | amount_mismatch | status_mismatch
      "paystackRef": "FLW-...",
      "paymentId": null,
      "payoutId": null,
      "expectedPesewas": 4700,
      "actualPesewas": null,
      "notes": "Paystack settlement entry has no matching payment row"
    }
  ]
}
```

---

### 2.12 `POST /v1/admin/reconciliation/run`

**Roles:** L1 only
**Purpose:** Manually trigger a reconciliation run.

**Body (optional):**

```jsonc
{ "periodStart": "2026-05-06T00:00:00Z", "periodEnd": "2026-05-07T00:00:00Z" }
```

If omitted, defaults to "yesterday's day in GMT".

**Behaviour:**

- Idempotent for the period: if a run already exists with `status != failed`, return that run with `meta: { reused: true }`.
- Otherwise, kick off the reconciliation job synchronously and return the new run.
- Audit log: `reconciliation.manually_triggered`, payload `{ runId, periodStart, periodEnd, status }`.

**Response:** `{ run: { /* 2.10 item */ } }`.

**Errors:**

- `400 INVALID_PERIOD` — `periodEnd` not after `periodStart`, or period > 7 days
- `409 RUN_IN_PROGRESS` — another manual run is already executing for this period

---

### 2.13 `GET /v1/admin/users/:id/earnings-summary`

**Roles:** L1, L2, L3
**Purpose:** Proxy `EarningsService.getSummary` for the impersonated user. Used on the user-detail Payments tab and on the dispute resolution page.

**Response:** mirrors the existing earnings summary shape returned to providers themselves:

```jsonc
{
  "providerId": "uuid",
  "providerType": "driver",
  "windowStart": "2026-04-07T00:00:00Z",
  "windowEnd": "2026-05-07T00:00:00Z",
  "totalEarningsPesewas": 154200,
  "completedJobs": 32,
  "averagePerJobPesewas": 4819,
  "cashCommissionOwedPesewas": 3600,
  "pendingPayoutsPesewas": 7500,
  "lastPayoutAt": "2026-05-06T18:00:00Z"
}
```

**Errors:**

- `404 USER_NOT_FOUND`
- `400 USER_NOT_PROVIDER` — user has no driver/artisan profile

---

## 3. Audit log entries (consolidated)

Add to whatever `auditLog.write(...)` enum the backend uses today:

| Action                            | Triggered by         | Severity |
| --------------------------------- | -------------------- | -------- |
| `payment.transfer_retried`        | 2.2                  | info     |
| `payment.force_failed`            | 2.3                  | warn     |
| `transfer.requeued`               | 2.7                  | info     |
| `clawback.written_off`            | 2.9                  | warn     |
| `reconciliation.manually_triggered` | 2.12               | info     |

---

## 4. DTOs

```ts
// ForceFailPaymentDto (2.3)
class ForceFailPaymentDto {
  @IsString() @MinLength(10) @MaxLength(1000) reason: string;
}

// WriteOffClawbackDto (2.9)
class WriteOffClawbackDto {
  @IsString() @MinLength(10) @MaxLength(1000) reason: string;
}

// TriggerReconciliationDto (2.12)
class TriggerReconciliationDto {
  @IsOptional() @IsISO8601() periodStart?: string;
  @IsOptional() @IsISO8601() periodEnd?: string;
}
```

No DTO required for the GET endpoints (query params validated via `@Query` pipes).

---

## 5. Acceptance criteria

- [ ] All endpoints return the documented response envelope.
- [ ] Roles match the table; 403 on mismatch.
- [ ] Mutations append audit log entries with the exact action names listed in §3.
- [ ] Pagination defaults: `page=1`, `limit=20`, `max=100`.
- [ ] Money fields are integer pesewas; nullable fields are typed as such.
- [ ] Error codes match §2; the frontend keys UX off `error.code`.
- [ ] Unit tests cover the 409 idempotency branches in 2.2, 2.3, 2.7, 2.9, 2.12.
- [ ] Integration test exists for 2.1 returning a payment with at least one event of every kind it can produce.

---

## 6. Frontend rollout (separate PRs)

Per [admin-frontend-spec-payment-panel.md](./admin-frontend-spec-payment-panel.md) §7 phasing — backend lands first, frontend per slice:

1. 2.1 → unblocks `/payments/:paymentId` (Phase 4)
2. 2.2 + 2.3 → unblocks payment-detail action buttons (Phase 4 cont.)
3. 2.4 + 2.5 + 2.6 + 2.7 → unblocks `/payouts` and `/payouts/pending` (Phase 5)
4. 2.8 + 2.9 → unblocks `/clawbacks` (Phase 6)
5. 2.10 + 2.11 + 2.12 → unblocks `/reconciliation` (Phase 7)
6. 2.13 → unblocks user-detail Payments tab (Phase 9)

Phases 1–3 (foundations, transactions feed, disputes) need **no** new endpoints and proceed in parallel with backend work on the above.

---

## 7. Out of scope

- WebSocket push for transactions/disputes/transfers — v1 polls.
- Bulk operations (mass write-off, bulk requeue) — single-id endpoints only.
- Refund composer outside disputes — flagged for sprint 2 in the frontend spec.
- Provider impersonation views beyond the earnings-summary proxy.
