# Admin Frontend Spec — Document Expiry Backfill

> **Status:** Backend shipped, awaiting admin-dashboard implementation
> **Owners:** Frontend (admin) + Backend (admin module)
> **Related docs:** [admin-module.md](./admin-module.md) §Verifications, [admin-frontend-spec-payment-panel.md](./admin-frontend-spec-payment-panel.md) §foundations
> **Sibling action:** the existing "Approve / Reject document" control on the verification/document detail view — the expiry control lives right next to it.

---

## 1. Why

Provider verification documents (driver's licence, roadworthiness certificate, Ghana Card, business registration) carry a real-world expiry date. The mobile apps now:

- **capture** that expiry from the provider at upload time, and
- **act** on it — once `expiresAt` passes, the provider's document flips to an **Expired** state (tappable to re-upload) and stops counting toward "go online"; 30 days before, it shows an **Expiring soon** nudge.

The provider app reads `expiresAt` straight from `GET /verification/status` and does not care who set it. **Existing** providers uploaded their documents _before_ expiry capture existed, so their rows have `expiresAt = null` (treated as "never expires" — they are not disrupted). To bring those legacy documents under expiry tracking, an admin needs to set the expiry date on the provider's behalf.

This spec covers the admin-panel UI for that backfill. The backend endpoint already exists.

---

## 2. Backend contract (already implemented)

### Endpoint

```
PATCH /admin/verifications/documents/:id/expiry
```

- **Auth:** admin JWT (same as all `/admin/*` routes)
- **Permission:** `verify_documents` (the same permission that gates document approve/reject — any admin who can review documents can set expiry; no new permission to provision)
- **Path param:** `:id` — the `ProviderDocument.id` (UUID)

### Request body

```jsonc
{
  "expiresAt": "2028-12-31", // ISO date, YYYY-MM-DD. Required.
}
```

- `expiresAt` is validated as an ISO date string (`class-validator @IsDateString`).
- A **past** date is allowed and intentional — it flags an already-lapsed document so the provider is prompted to re-upload immediately.
- Only the **current version** of a **confirmed** document can be patched (mirrors the approve/reject freshness guard). Superseded/`uploaded`-only rows return 404.
- This endpoint writes **only** `expiresAt` (and `updatedBy`). It never changes the document's review status — an approved document stays approved.

### Success response (200)

Responses are wrapped by the global transform interceptor:

```jsonc
{
  "success": true,
  "data": {
    "documentId": "b1f2...",
    "expiresAt": "2028-12-31T00:00:00.000Z",
  },
}
```

### Errors

| Status  | Body `error`         | When                                                   |
| ------- | -------------------- | ------------------------------------------------------ |
| 400     | validation error     | `expiresAt` missing or not a valid ISO date            |
| 401/403 | —                    | not an admin / lacks `verify_documents`                |
| 404     | `DOCUMENT_NOT_FOUND` | id unknown, `uploaded`-only, or a newer version exists |

Every successful call writes an audit-log entry: `action: "document.expiry_updated"`, `targetType: "provider_document"`, `targetId: <documentId>`, with `documentType`, `providerType`, and the new `expiresAt` in `details`.

---

## 3. Where it goes in the UI

On the **document detail / review** surface (the same place approve/reject lives — reached from the verification queue, or from a provider's document list `GET /admin/users/:id/documents`).

Each document already renders `status`, `fileUrl`, `rejectionReason`, etc. Add an **Expiry** field/row.

### Which documents show the control

Show the expiry control for document types that expire:

- `drivers_licence`
- `roadworthiness_certificate`
- `ghana_card`
- `business_registration`

For other document types (`profile_photo`, `trade_certificate`, `national_id`, `portfolio_photo`, `vehicle_registration`) do **not** show an expiry control — they don't expire. (The endpoint itself doesn't restrict type; this is a UI-hygiene choice to match the mobile app's `DocumentType.requiresExpiry` set.)

### States to render

| Document state                         | Show                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Expiring type, `expiresAt == null`     | An **"Add expiry date"** call-to-action (this is the legacy-backfill case — make it prominent, e.g. an amber hint) |
| Expiring type, `expiresAt` set, future | The date, formatted (e.g. "Expires 31 Dec 2028"), with an **"Edit"** affordance                                    |
| Expiring type, `expiresAt` set, past   | The date with an **"Expired"** badge + Edit affordance                                                             |

---

## 4. Interaction flow

1. Admin clicks **Add expiry date** / **Edit** on a document row.
2. A date picker opens (a plain date input is fine — value format `YYYY-MM-DD`).
   - No hard min/max: past dates are valid (flag-as-expired), and expiries can be years out (Ghana Card ~10y).
   - Prefill with the current `expiresAt` when editing.
3. On save → `PATCH /admin/verifications/documents/:id/expiry` with `{ expiresAt }`.
4. On 200 → optimistic/refetch update of the row; toast "Expiry date saved."
5. On 404 → toast "This document is no longer the current version — refresh and try again," then refetch the list.
6. On 400 → inline "Enter a valid date."

No confirmation modal is needed for setting a future date. Consider a light confirm when the chosen date is **in the past** ("This will mark the document as expired and prompt the provider to re-upload. Continue?"), since that has a provider-facing consequence.

---

## 5. Data source for reading current expiry

The document objects returned by the verification queue / `GET /admin/users/:id/documents` already include `expiresAt` (nullable ISO string) from the `ProviderDocument` model. No new read endpoint is required. If the current document detail query doesn't yet select `expiresAt`, ensure it's included in the projection.

---

## 6. Permissions / gating

Gate the control behind the same permission the approve/reject control uses: `verify_documents`. Reuse the existing `<RoleGate permission="verify_documents">` (or equivalent) wrapper. Admins without it should not see the Add/Edit affordance.

---

## 7. Out of scope

- **Clearing** an expiry (setting back to null) — the endpoint requires a date. Not needed for backfill; raise a follow-up if corrections-to-null become necessary.
- **Bulk backfill** across many providers — v1 is one document at a time. A "documents missing expiry" filter on the queue would be a nice follow-up to work through the legacy backlog efficiently, but is not required.
- **Notifying the provider** when an admin sets/changes an expiry — the backend deliberately does not send a notification (silent backfill). The provider sees the new state on their next status fetch. If a push is wanted later, it's a backend change, not admin-frontend.

---

## 8. QA checklist

- [ ] Expiry control appears only for the four expiring document types.
- [ ] Legacy document (`expiresAt == null`) shows the prominent "Add expiry date" CTA.
- [ ] Saving a future date persists and re-renders as "Expires <date>".
- [ ] Saving a past date persists and shows the "Expired" badge (confirm prompt shown first).
- [ ] Editing prefills the existing date.
- [ ] Admin lacking `verify_documents` cannot see or use the control.
- [ ] 404 path (stale/superseded document) shows the refresh toast and reloads.
- [ ] Audit log records `document.expiry_updated` (verify via the audit log panel).
