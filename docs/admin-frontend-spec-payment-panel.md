# Admin Frontend Spec — Payment Management Panel

> **Status:** Draft, awaiting frontend implementation
> **Owners:** Frontend (admin) + Backend (admin module, payment module)
> **Related docs:** [admin-module.md](./admin-module.md) §Payment Transactions / Disputes / Reports, [EDD_MyShop_v1_1.md](./EDD_MyShop_v1_1.md) §Payment Split, [CHANGELOG.md](./CHANGELOG.md) `[Unreleased]` payment entries
> **Sister spec:** [admin-frontend-spec-support-panel.md](./admin-frontend-spec-support-panel.md) — help center CMS + support ticket triage. Shares the foundations layer (`lib/api.ts`, `<StatusBadge>`, `<RoleGate>`) defined in §5 of this doc.
> **App:** `apps/admin/` (React 19 + Vite, TanStack Query, JWT in `localStorage.admin_token`)

---

## 1. Goal

Give ops + finance admins a single place to investigate, audit, and intervene in the payment lifecycle — collections, escrow, payouts, tips, clawbacks, refunds, disputes, cash-commission settlement, pending Paystack transfers, and daily reconciliation. The admin panel is currently greenfield apart from `VerificationsPage`; this spec defines the next slab of pages.

The panel is **not** a payment processor. Money movement stays on the backend. The panel surfaces state and exposes a small set of operational levers (resolve dispute, unlock payout method, retry a stuck transfer, write off a clawback).

---

## 2. Scope

### In scope (v1)

- Transactions feed (collections, tips, payouts, refunds, clawbacks) with filters + drill-down
- Payment detail view (full lifecycle: charge → escrow → payout → clawback → dispute)
- Disputes list + detail + resolution flow
- Payouts list + per-provider history + manual retry of stuck instant transfers
- Pending transfers queue (failed/retrying inline) + admin re-queue
- Cash-commission balances per provider + write-off action
- Reconciliation dashboard (daily run summary + discrepancy drill-down)
- Reports: revenue, payment-method share, dispute rate, success/failure rate
- Payout method override (already has backend endpoint — surface in user detail)

### Out of scope (v1)

- Initiating new charges from the admin panel
- Bulk dispute resolution
- Refund composer outside of dispute resolution flow
- Editing audit log entries
- WebSocket-driven live updates (poll-on-fetch is fine; pattern matches existing pages)
- Provider-side payout method binding — providers do that themselves

---

## 3. Information architecture

Routes registered in [apps/admin/src/App.tsx](../apps/admin/src/App.tsx). Today only `/verifications` is real.

```
/dashboard                                  ← KPI tiles (existing stub)
/payments                                   ← NEW: transactions feed (default tab)
  /payments/transactions                    ← (alias for /payments)
  /payments/:paymentId                      ← NEW: payment detail
/payouts                                    ← NEW: payouts list
  /payouts/pending                          ← NEW: pending_transfers queue
  /payouts/:payoutId                        ← NEW: payout detail (drawer or page)
/disputes                                   ← stub today; build out
  /disputes/:disputeId                      ← NEW: detail + resolve flow
/clawbacks                                  ← NEW: clawback list (filtered to source=CASH_COMMISSION by default)
/reconciliation                             ← NEW: daily run dashboard
  /reconciliation/:runId                    ← NEW: discrepancy drill-down
/reports                                    ← stub today
  /reports/revenue                          ← NEW (chart)
  /reports/payments                         ← NEW (method share + success/failure)
  /reports/disputes                         ← NEW (rate trend)
/users/:id                                  ← stub today; existing endpoint already returns provider profile — add a "Payments" tab here for per-provider transactions, cash-commission balance, payout method override
```

**Navigation:** left sidebar with sections (Verifications · Payments · Disputes · Reconciliation · Reports · Users · Live map · Config). Active section highlighted. Role-aware — a section hides when no contained page is permitted.

**Role gates** mirror backend `@Roles(...)`:

| Page                        | Roles                                                       |
| --------------------------- | ----------------------------------------------------------- |
| Transactions / Payment detail | super_admin (L1), regional_admin (L2)                     |
| Disputes (read + resolve)   | super_admin, ops_admin (L3), support_agent (L4)             |
| Payouts / Pending transfers | super_admin, ops_admin                                      |
| Clawbacks (incl. write-off) | super_admin, ops_admin                                      |
| Reconciliation              | super_admin (write-off triggers), regional_admin (read-only) |
| Reports                     | super_admin (revenue), regional_admin (payments, disputes)  |
| Payout method unlock        | super_admin, ops_admin                                      |

The frontend hides controls the user can't action and falls back to a 403 toast if the API rejects.

---

## 4. Per-page specs

### 4.1 Transactions feed — `/payments`

**Purpose:** investigate any movement of money. The single highest-value page in the panel.

**Backend (already exists):** `GET /v1/admin/payments/transactions` ([admin.controller.ts:577](../apps/api/src/modules/admin/admin.controller.ts#L577), service [admin.service.ts:2120-…](../apps/api/src/modules/admin/admin.service.ts#L2120))
- Query: `type? (collection|payout|refund|clawback|tip)`, `status?`, `search?` (UUID or name or tx ref), `page`, `limit`
- Returns `{ items: TransactionItem[], total, page, limit }` where each item is `{ id, type, amountPesewas, method, status, bookingId, bookingType, party, createdAt }`

**UI layout:**

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Transactions                                                  [Refresh] [⤓]│
├────────────────────────────────────────────────────────────────────────────┤
│ Type: [All ▼]  Status: [All ▼]  Search: [_____________]  Date: [Last 30d▼] │
├──────┬────────────┬──────┬──────────┬─────────┬───────────┬────────────────┤
│ Type │ Created    │ Amt  │ Method   │ Status  │ Party     │ Booking        │
├──────┼────────────┼──────┼──────────┼─────────┼───────────┼────────────────┤
│ COL  │ 14:02 today│  +47 │ MoMo MTN │ escrow. │ Ama K.    │ ride/abc-123 → │
│ PAY  │ 14:03 today│  -38 │ MoMo MTN │ complete│ Kofi M.   │ ride/abc-123 → │
│ TIP  │ 14:04 today│   +5 │ MoMo MTN │ complete│ Ama K.    │ ride/abc-123 → │
│ CLW  │ 13:55 today│  -10 │ —        │ pending │ Kofi M.   │ —              │
│ REF  │ 12:10 today│  -20 │ MoMo MTN │ complete│ Yaa B.    │ job/def-456 →  │
└──────┴────────────┴──────┴──────────┴─────────┴───────────┴────────────────┘
[< Prev]  Page 1 of 47  [Next >]
```

**Notes:**
- Money column: amount in GHS with leading sign. `collection`/`tip`/`refund-positive` shown as `+`; `payout`/`clawback`/`refund-to-client` as `−`. Right-aligned, monospace, two decimals.
- Method column maps `payment.method` enum (`mobile_money_mtn`, `card`, `cash`, `paystack_wallet`, etc.) to a short label.
- Status badge colours per existing palette: pending=amber, escrowed=blue, complete=green, failed=red, disputed=purple. Centralise in `apps/admin/src/lib/status.ts` (new file).
- Booking column links to `/rides/:id` or `/jobs/:id`. If those don't exist yet, link to the existing live-map detail endpoint.
- Row click → `/payments/:paymentId` (only for `collection` type) or opens a side drawer for non-payment rows.
- Filters debounce 300ms, write to URL (`?type=&status=&search=&page=`) so links can be shared.
- Empty state: "No transactions match these filters."
- 30s background refetch from existing TanStack defaults.

**Acceptance:**
- All five `type` filters return type-narrowed results.
- Status filter passes through to backend (existing pass-through behaviour).
- Search by UUID matches `bookingId` exact; otherwise substring against name + tx ref (current backend behaviour).
- Pagination preserves filters via URL.

---

### 4.2 Payment detail — `/payments/:paymentId`

**Purpose:** the single source of truth for one payment. Show the entire lifecycle as a vertical timeline, plus actions.

**Backend gap (NEW):** `GET /v1/admin/payments/:id` — full Payment row joined with `payouts` (per-payment singleton), `tips`, `disputes`, `pending_transfers`, `clawbacks` linked via `paymentId`, plus client + provider identity. Roles L1, L2.

**UI layout:**

```
← Transactions
┌─────────────────────────────────────────────────────────────────────────────┐
│ Payment #abc-123                              Status: ESCROWED              │
│ GHS 47.00 gross · 9.40 commission · 37.60 net      MoMo MTN · +233200000001 │
│                                                                             │
│ Client: Ama K. (uuid)         Provider: Kofi M. (driver)                    │
│ Booking: ride/uuid-… (Kumasi → KNUST)                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│ ● 14:02:11  Charge initiated      reference: myshop-pay-… · status=pending  │
│ ● 14:02:14  OTP sent              chargeStatus=send_otp                     │
│ ● 14:02:31  Charge succeeded      paystackRef=FLW-…   status=processing     │
│ ● 14:02:32  Escrowed              status=escrowed                           │
│ ◐ 14:02:34  Instant transfer      pending_transfer:#… · attempt 2/3 retrying│
│ ○           Payout                (waiting on transfer)                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ Linked: 1 tip (GHS 5.00, complete) · 0 clawbacks · 0 disputes               │
├─────────────────────────────────────────────────────────────────────────────┤
│ [Retry transfer]  [Force-fail payment]  [Open dispute on behalf]            │
│  L1+L3 only       super_admin only      L1+L3 only — disabled if disputed   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Backend gaps (NEW):**
1. `POST /v1/admin/payments/:id/retry-transfer` (L1, L3) — re-enqueues the row in `pending_transfers` with `attempt_number+1`. Idempotent: 409 if no failed transfer exists. Audit log `payment.transfer_retried`.
2. `POST /v1/admin/payments/:id/force-fail` (L1) — sets status to `failed`, releases any held escrow with refund clawback. Audit log `payment.force_failed`. Body: `reason` (min 10 chars).

**Notes:**
- Timeline is built client-side from the joined data. Each row icon: `●` complete, `◐` in-flight, `○` pending, `✗` failed.
- Money summary uses backend-derived `commissionPesewas` and `netPayoutPesewas` (already on Payment row).
- Action buttons hidden if user lacks role; disabled with tooltip if business rule prevents (e.g. "Already disputed — resolve dispute first").

**Acceptance:**
- Timeline renders with at minimum the canonical events: initiated, OTP, succeeded, escrowed, transfer (per-payment), payout, completed/failed.
- Linked entities (tips, clawbacks, disputes) link to their respective detail pages.
- Retry + force-fail trigger audit log entries visible at `/audit-logs`.

---

### 4.3 Disputes — `/disputes`, `/disputes/:id`

**Purpose:** ops queue for client-raised disputes within the 2hr window.

**Backend (already exists):**
- `GET /v1/admin/disputes` — open disputes list ([admin.controller.ts:515](../apps/api/src/modules/admin/admin.controller.ts#L515))
- `GET /v1/admin/disputes/:id` — detail with GPS trail vs optimal route comparison (PRD 4.8.1)
- `PATCH /v1/admin/disputes/:id/resolve` — body `ResolveDisputeDto`: `resolution` (`REFUND_FULL` | `REFUND_PARTIAL` | `REJECT`), `refundAmountPesewas?` (required iff PARTIAL), `notes?`

**List page UI:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Disputes (open)                                              [Filters ▼]    │
├─────────────────────────────────────────────────────────────────────────────┤
│ #1234 · ride · Ama K. vs Kofi M. · 2h 04m old · "Driver took long route"   │
│ #1235 · job  · Kweku · vs Abena   · 0h 38m old · "Service incomplete"      │
└─────────────────────────────────────────────────────────────────────────────┘
```

Sort by oldest-first. Badge if approaching 24h SLA.

**Detail page UI:**

Map at top showing GPS trail (red) vs optimal Google Maps route (blue). Below: client/provider snapshot, payment summary, raised reason, evidence (photos/notes from booking). Bottom: resolution form.

```
Resolution: ( ) Full refund   ( ) Partial refund: [GHS ___]   ( ) Reject
Notes (required if partial or reject):
[__________________________________________________________________________]
                                                          [Cancel] [Resolve]
```

**Behaviour:**
- Submitting `REFUND_FULL` or `REFUND_PARTIAL` triggers backend refund + clawback if provider already paid. Frontend just calls the endpoint and reads the success envelope.
- After resolve, navigate back to list with a toast `"Dispute resolved · GHS X refunded"`.
- Surface the route excess percent prominently if computed (PRD 4.8.1 — 30% threshold).

**Acceptance:**
- All three resolution modes submit successfully and reflect on the transactions feed within the next refetch.
- 400 `REFUND_AMOUNT_REQUIRED` when PARTIAL submitted without amount.
- 409 `DISPUTE_ALREADY_RESOLVED` when same dispute submitted twice.

---

### 4.4 Payouts — `/payouts`, `/payouts/pending`, `/payouts/:id`

**Purpose:** monitor settlement-time transfers + react to failures.

**Backend gaps (NEW):**
1. `GET /v1/admin/payouts` (L1, L2, L3) — paginated payout list with filters `status?`, `providerId?`, `paymentId?`, `from`, `to`, `page`, `limit`. Returns row + provider name + linked `payment.bookingId`/`bookingType`. Mirrors `listTransactions` plumbing but for one source.
2. `GET /v1/admin/payouts/:id` (L1, L2, L3) — full payout row + linked payment + transfer attempts (`pending_transfers` rows for the same `paymentId`).
3. `GET /v1/admin/transfers/pending` (L1, L3) — `pending_transfers` rows with status `pending`/`retrying`/`failed_retrying`. Filters: `status?`, `providerId?`. Default sort: `next_attempt_at ASC`.
4. `POST /v1/admin/transfers/:id/requeue` (L1, L3) — set `pending_transfers` row to status=pending, `attempt_number=0`, `next_attempt_at=now()`. Audit log `transfer.requeued`. 409 if already `succeeded`.

**Pending transfers UI (`/payouts/pending`):**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Pending transfers                                  [Refresh]                │
├──────────┬──────────┬─────────────┬──────────┬──────────┬───────────────────┤
│ Created  │ Provider │ Payment     │ Amount   │ Attempts │ Status / next     │
├──────────┼──────────┼─────────────┼──────────┼──────────┼───────────────────┤
│ 13:45    │ Kofi M.  │ pay-…→ride  │ GHS 38.00│ 2 / 3    │ retrying · 14:30  │
│ 12:20    │ Yaa B.   │ pay-…→job   │ GHS 75.50│ 3 / 3    │ failed_retrying ⚠ │
└──────────┴──────────┴─────────────┴──────────┴──────────┴───────────────────┘
                                                       [Re-queue selected (1)]│
```

`failed_retrying` rows surface in a red-bordered card group at the top, with the explicit `[Re-queue]` action. The 18:00/19:30/20:00/06:00 GMT batch sweep handles them automatically; this UI is for ops to nudge sooner.

**Acceptance:**
- Re-queue moves a `failed_retrying` row back to `pending` with `next_attempt_at=now`.
- Re-queueing a `succeeded` row returns 409 `TRANSFER_ALREADY_SUCCEEDED`.

---

### 4.5 Clawbacks — `/clawbacks`

**Purpose:** track platform debt. Default filter `source=CASH_COMMISSION`. Other sources (`DISPUTE`, `WRITE_OFF`, `MANUAL`) accessible via filter.

**Backend gaps (NEW):**
1. `GET /v1/admin/clawbacks` (L1, L3) — paginated clawback list. Filters: `source?`, `status?` (`pending`/`settled`/`written_off`), `providerId?`, `from`, `to`. Returns row + provider name + outstanding-balance summary at the top: `{ totalOutstandingPesewas, byProvider: [{ providerId, name, outstandingPesewas }] }` for the current filter.
2. `POST /v1/admin/clawbacks/:id/write-off` (L1) — sets clawback to `written_off`. Body: `reason` (min 10 chars). Audit log `clawback.written_off`. 409 if already settled or written off. Validates against `clawback_writeoff_threshold_pesewas` and `clawback_writeoff_inactive_days` config (already in `platform_config`); returns 400 `WRITEOFF_THRESHOLD_VIOLATION` if rules fail (admin can override with `?force=true` — super_admin only).

**Cash-commission balance per provider** (sub-view filtered to source=CASH_COMMISSION grouped by provider): top-line totals + drill-down list. Useful when investigating a complaint or reviewing high-debt providers. The existing `EarningsService.getSummary` already returns `cashCommissionOwedPesewas` per provider, so this view stays a pure read.

---

### 4.6 Reconciliation — `/reconciliation`, `/reconciliation/:runId`

**Purpose:** daily ops trust check. The 02:00 GMT cron compares Paystack settlement reports vs DB; admins should see the result.

**Backend gaps (NEW — none of these exist today):**
1. `GET /v1/admin/reconciliation/runs` (L1, L2) — paginated list of recent reconciliation runs. Returns `{ id, runAt, periodStart, periodEnd, paystackCollectionsPesewas, dbCollectionsPesewas, paystackPayoutsPesewas, dbPayoutsPesewas, dbCashRemitsPesewas, discrepancyPesewas, discrepancyCount, status }` (`status` = `clean` | `discrepancies` | `failed`).
2. `GET /v1/admin/reconciliation/runs/:id` (L1, L2) — full run detail + discrepancies array `[{ source, paystackRef?, paymentId?, payoutId?, type (missing_in_db|missing_in_paystack|amount_mismatch|status_mismatch), expectedPesewas, actualPesewas, notes }]`.
3. `POST /v1/admin/reconciliation/run` (L1) — manually trigger a reconciliation run (idempotent for the period). Audit log `reconciliation.manually_triggered`.

The data already lives in `reconciliation_reports` per [CHANGELOG.md](./CHANGELOG.md) `[Unreleased]` Changed entry — these endpoints just expose it.

**Dashboard UI:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Reconciliation                                           [Run now] (L1 only)│
├─────────────────────────────────────────────────────────────────────────────┤
│ Last run: 2026-05-07 02:00 GMT · ✅ CLEAN  (period 2026-05-06 00:00→24:00)  │
│                                                                             │
│ Paystack collections: GHS 142,330.00     DB collections: GHS 142,330.00     │
│ Paystack payouts:     GHS 113,864.00     DB payouts:     GHS 113,864.00     │
│ DB cash remits:       GHS    420.00      Discrepancy:    GHS 0.00 (0 rows) │
├─────────────────────────────────────────────────────────────────────────────┤
│ Recent runs                                                                 │
│ 2026-05-06 02:00  ✅ CLEAN          GHS 0.00 over 0 rows                   │
│ 2026-05-05 02:00  ⚠ DISCREPANCIES   GHS 24.50 over 3 rows  [Investigate →] │
│ 2026-05-04 02:00  ✅ CLEAN                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Run detail page** lists discrepancies with type badge, expected vs actual, links to the underlying payment/payout. This is read-only — fixing discrepancies is done through the relevant detail page (e.g. `/payments/:id`'s retry-transfer button).

---

### 4.7 Reports — `/reports/revenue`, `/reports/payments`, `/reports/disputes`

**Backend (already exists):**
- `GET /v1/admin/reports/revenue` ([admin.controller.ts:601](../apps/api/src/modules/admin/admin.controller.ts#L601)) — commission grouped by `day|week|month`, optional `from/to`. 60s cache.
- `GET /v1/admin/reports/payments` ([admin.controller.ts:687](../apps/api/src/modules/admin/admin.controller.ts#L687)) — method share % + daily success/failure rates.
- `GET /v1/admin/reports/disputes/rate` ([admin.controller.ts:704](../apps/api/src/modules/admin/admin.controller.ts#L704)) — daily dispute rate trend.

**UI:** charts in a grid. Use the existing inline-style approach + a small charting lib (Recharts, already in CLAUDE.md §4 stack table). Each report:

- Revenue: stacked area chart (commission vs net to providers), date-range picker, granularity toggle.
- Payments: donut for method share + line chart for daily success rate.
- Disputes: line chart for daily dispute rate, with a horizontal threshold line at the platform target.

All three pages reuse a `<KpiCard>` component (top KPIs above the chart) and a `<DateRangeFilter>` component. Build these once, share across reports.

**Acceptance:**
- Date filter writes to URL.
- Empty period → empty-state card "No data for this range."
- 60s server cache visible: charts re-render without flicker on the 30s background poll.

---

### 4.8 User detail — `/users/:id` (Payments tab)

The existing `GET /v1/admin/users/:id` ([admin.controller.ts:408](../apps/api/src/modules/admin/admin.controller.ts#L408)) already returns the full profile. Add a **Payments tab** showing:
- Recent transactions for this user (filter the existing transactions endpoint by their party identity)
- Active escrow + cash-commission owed (from the existing earnings summary endpoint, callable as the admin via a small backend addition: `GET /v1/admin/users/:id/earnings-summary`)
- Payout method binding + the `[Unlock payout method]` button → `POST /v1/admin/users/:id/unlock-payout-method` (already exists, [admin.controller.ts:485](../apps/api/src/modules/admin/admin.controller.ts#L485)). Body: `reason` string. Confirmation dialog with required reason text.

**Backend gap (NEW):** `GET /v1/admin/users/:id/earnings-summary` (L1, L2, L3) — proxies the existing `EarningsService.getSummary` for the impersonated provider. Useful here and on the dispute resolution page.

---

## 5. Cross-cutting concerns

### 5.1 Money formatting
All amounts arrive as pesewas (integer). Frontend converts via a single helper:

```ts
// apps/admin/src/lib/money.ts
export const pesewasToGhs = (p: number) =>
  `GHS ${(p / 100).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
```

Never use floats for arithmetic — only for presentation.

### 5.2 Status badges
Centralise mapping in `apps/admin/src/lib/status.ts`. Colours per [CLAUDE.md §5 design system](../CLAUDE.md). Each status renders as `<StatusBadge status={x} />` — a shared component.

### 5.3 API wrapper
Create `apps/admin/src/lib/api.ts`:

```ts
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
export async function apiGet<T>(path: string): Promise<T> { ... }
export async function apiPost<T>(path: string, body: unknown): Promise<T> { ... }
export async function apiPatch<T>(path: string, body: unknown): Promise<T> { ... }
```

All methods read `localStorage.admin_token`, set `Authorization: Bearer`, parse the standard envelope `{ success, data, error, meta }`, and throw a typed `ApiError` on `success=false` or non-2xx. Refactor `VerificationsPage`'s inline fetch to use this in the same PR — kills duplication.

### 5.4 Role guards
A `<RoleGate roles={['super_admin','ops_admin']}><Button…/></RoleGate>` HOC reading the JWT payload (`role` claim). Falls back to nothing rendered if denied. Backend remains the source of truth — frontend gating is UX only.

### 5.5 Audit-friendly actions
Every action that mutates state must:
1. Open a confirmation dialog with a `reason` input where the backend requires it.
2. Show a toast on success referencing the audit log.
3. Disable while in flight; re-enable on response (TanStack mutation).

### 5.6 Real-time (deferred)
v1 polls. Background refetch interval already 30s. WebSocket subscriptions for transactions/disputes/pending-transfers are deferred — see [admin-module.md](./admin-module.md) "WebSocket Live Map" known gap.

### 5.7 Errors
Use `ApiError.code` (the backend's `error` field, e.g. `JOB_LOCKED_BY_ANOTHER_ADMIN`) to drive UI messages. Show a generic toast for unknown codes; log to the console.

---

## 6. Backend additions consolidated

| Method | Path                                          | Roles      | Purpose                                                               |
| ------ | --------------------------------------------- | ---------- | --------------------------------------------------------------------- |
| GET    | `/v1/admin/payments/:id`                      | L1, L2     | Full payment lifecycle + linked payout/tip/dispute/clawback/transfers |
| POST   | `/v1/admin/payments/:id/retry-transfer`       | L1, L3     | Re-enqueue a failed pending_transfer                                  |
| POST   | `/v1/admin/payments/:id/force-fail`           | L1         | Force-fail a stuck payment with refund clawback                       |
| GET    | `/v1/admin/payouts`                           | L1, L2, L3 | Paginated payouts list with filters                                   |
| GET    | `/v1/admin/payouts/:id`                       | L1, L2, L3 | Payout detail + transfer attempts                                     |
| GET    | `/v1/admin/transfers/pending`                 | L1, L3     | Pending Paystack transfers queue                                      |
| POST   | `/v1/admin/transfers/:id/requeue`             | L1, L3     | Requeue a failed transfer immediately                                 |
| GET    | `/v1/admin/clawbacks`                         | L1, L3     | Paginated clawbacks + outstanding-balance summary                     |
| POST   | `/v1/admin/clawbacks/:id/write-off`           | L1         | Write off a clawback with reason                                      |
| GET    | `/v1/admin/reconciliation/runs`               | L1, L2     | List recent reconciliation runs                                       |
| GET    | `/v1/admin/reconciliation/runs/:id`           | L1, L2     | Run detail + discrepancies                                            |
| POST   | `/v1/admin/reconciliation/run`                | L1         | Manually trigger a run                                                |
| GET    | `/v1/admin/users/:id/earnings-summary`        | L1, L2, L3 | Proxy EarningsService for a specific provider                         |

All additions follow existing conventions: `@Roles(...)` guards, DTO with class-validator, audit log entry on any mutation, response envelope `{ success, data, error, meta }`. Each gets its own backend PR keyed off this section.

---

## 7. Phasing

PRs sized to land independently. Each ships behind no feature flag — these are admin-only screens, blast radius is bounded to staff users.

1. **Foundations (1 PR)** — `lib/api.ts`, `lib/money.ts`, `lib/status.ts`, `<StatusBadge>`, `<RoleGate>`, `<DateRangeFilter>`, sidebar layout. Refactor `VerificationsPage` to use the new API wrapper.
2. **Transactions feed (1 PR)** — `/payments` list. No backend additions.
3. **Disputes (1 PR)** — `/disputes` list + detail + resolve. No backend additions.
4. **Payment detail (2 PRs)** — backend `GET /v1/admin/payments/:id` first, then frontend `/payments/:id`.
5. **Payouts + pending transfers (2 PRs)** — backend additions first (4 endpoints), then frontend pages.
6. **Clawbacks + write-off (2 PRs)** — backend, then frontend.
7. **Reconciliation (2 PRs)** — backend (3 endpoints + reading `reconciliation_reports`), then frontend dashboard.
8. **Reports (1 PR)** — three chart pages, all on existing endpoints.
9. **User detail Payments tab (1 PR)** — backend `earnings-summary` proxy + frontend tab.

Total: ~12 PRs. Order chosen so the most operationally valuable (transactions + disputes) lands first. Reconciliation last because the `reconciliation_reports` table needs a closer look before exposing.

---

## 8. Open questions

1. **Live-map link-out from a payment row** — should a payment that's still `escrowed` and in-progress link directly to the live-map marker for the linked ride/job? Useful for ops trust ("is the trip even still happening?") but requires plumbing.
2. **Refund composer outside disputes** — sometimes ops need to refund without a formal dispute (e.g. duplicate charge from a Paystack glitch). This spec leaves it out of v1; flag for sprint 2.
3. **Bulk write-off of clawbacks below the threshold** — the cron-based write-off flow runs automatically, but ops occasionally need to bulk-clear a backlog. Skipping for v1.
4. **Provider impersonation** — a "view as this provider" mode for the earnings summary is convenient but introduces audit complexity. Out of scope.

These don't block v1 — file them in `docs/projectstatus.md` as P2 follow-ups.
