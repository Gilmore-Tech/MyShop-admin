# Admin Dashboard — Frontend Handoff

> **Audience:** Frontend engineer (employee or contractor) picking up the React admin dashboard for MyShop.
> **Goal:** Ship a usable web console for Gilmore Technologies ops staff to run the 3-month Ashanti pilot.
> **Time budget:** ~3–4 weeks for a single mid/senior frontend engineer to reach pilot-ready.

---

## 1. What you're building

A web-only admin console for MyShop, a ride-hailing + artisan marketplace platform operating in Ghana.

It is consumed by 4 roles of Gilmore Technologies staff:

| Role             | Level | What they do all day                                                      |
| ---------------- | ----- | ------------------------------------------------------------------------- |
| `super_admin`    | L1    | Full access — everything, including managing other admin accounts         |
| `regional_admin` | L2    | Verification queue, live map, KPIs, provider performance reports          |
| `ops_admin`      | L3    | Live map, manual job assignment, disputes, suspensions, announcements     |
| `support_agent`  | L4    | Disputes (read + resolve), user list (read-only). **No live map access.** |

Mobile clients (Flutter Client/Provider apps) are out of scope for this engagement. You only build the web admin.

---

## 2. State of play (April 2026)

### Backend — done
- 36 admin endpoints live, documented, and tested. Full inventory in [admin-module.md](admin-module.md) and [admin-auth-flow.md](admin-auth-flow.md).
- Admin auth is separate from regular user auth (different JWT secrets, 8 h access token, 30 d refresh).
- API runs at `http://localhost:3000/v1` locally, `https://staging-api.myshop.com.gh/v1` on staging.
- Swagger UI: `http://localhost:3000/docs`.

### Frontend — scaffolded only
- [apps/admin/](../apps/admin/) — React 19 + Vite + TS scaffold exists.
- [App.tsx](../apps/admin/src/App.tsx) — routes wired but pages are mostly inline placeholders (`<div>Disputes</div>`).
- [pages/VerificationsPage.tsx](../apps/admin/src/pages/VerificationsPage.tsx) — only fully implemented page.
- [components/DocumentViewer.tsx](../apps/admin/src/components/DocumentViewer.tsx) — only component built.
- TanStack Query is configured globally (30 s refetch, 15 s stale) — keep it.
- No layout shell, no navigation, no auth wiring, no API client — all yours to build.

### Brand
- Logo, final colours, and typography are deferred to Phase 6. Use the placeholders in [CLAUDE.md §5](../CLAUDE.md). Build the system so swapping the palette is one CSS-variable change.

---

## 3. Tech stack — locked in

Do not swap these without a written reason. They're already declared in [package.json](../apps/admin/package.json) and align with the rest of the monorepo.

| Concern             | Choice                                  |
| ------------------- | --------------------------------------- |
| Framework           | React 19                                |
| Language            | TypeScript 5.7 (strict mode)            |
| Build               | Vite 6                                  |
| Routing             | React Router 7                          |
| Server state        | TanStack Query 5                        |
| Client state        | Zustand 5                               |
| Charts              | Recharts 2                              |
| PDF (docs viewer)   | react-pdf 10                            |
| Maps                | **Choose & install** — Mapbox GL JS recommended (matches Flutter artisan flow); fallback to Leaflet if budget-sensitive |
| Styling             | **Choose & install** — Tailwind CSS recommended (already used by Flutter team's design tokens) |
| Forms + validation  | **Choose & install** — react-hook-form + zod recommended |
| Icons               | **Choose & install** — lucide-react recommended |
| Date handling       | **Choose & install** — date-fns recommended |
| Toasts/notifications| **Choose & install** — sonner recommended |
| Component primitives| **Choose & install** — shadcn/ui (Radix) recommended for accessibility out of the box |

> Anything marked **Choose & install** is your call — pick once, document the choice in [architecture.md](architecture.md), then stick to it.

---

## 4. Required reading order

1. [docs/admin-auth-flow.md](admin-auth-flow.md) — login flow + every endpoint with sample request/response/error bodies. **This is your API contract.**
2. [docs/admin-module.md](admin-module.md) — feature-level status, role matrix, business rules, known gaps.
3. [CLAUDE.md §5](../CLAUDE.md) — design system placeholders (colours, typography, spacing, accessibility).
4. [docs/PRD_Ghana_Platform_v2_1.md §8](PRD_Ghana_Platform_v2_1.md) — product requirements + user flows + edge cases.
5. [docs/EDD_MyShop_v1_1.md §8](EDD_MyShop_v1_1.md) — technical spec; reconciles to PRD where they conflict.

When the PRD and EDD disagree, **PRD wins** (e.g., batch payout = 18:00 GMT per PRD).

---

## 5. Setup

```bash
# from monorepo root
nvm install 20 && corepack enable && corepack prepare pnpm@9.15.4 --activate
pnpm install
cp .env.example .env                         # fill in <REPLACE> values
pnpm docker:up                               # PostgreSQL, Redis, RabbitMQ
pnpm db:migrate:dev && pnpm db:seed          # schema + seed admin user
pnpm dev:api                                 # API on :3000
pnpm dev:admin                               # admin on :5173
```

The admin Vite dev server proxies `/v1` to `http://localhost:3000`, so `fetch('/v1/admin/...')` works without CORS in dev.

Seed creates a default `super_admin` account — see [docs/001_initial_schema.sql](001_initial_schema.sql) seed section for credentials.

---

## 6. Pages to build — backlog by priority

Each row maps to one or more endpoints already documented in [admin-auth-flow.md](admin-auth-flow.md).

### P0 — must ship for pilot

| Route                  | Endpoints                                  | Roles                | Notes                                                    |
| ---------------------- | ------------------------------------------ | -------------------- | -------------------------------------------------------- |
| `/login`               | `POST /v1/auth/admin/login`                | public               | Email + password. Stores tokens in localStorage.          |
| `/dashboard`           | `GET /v1/admin/reports/overview`           | L1, L2               | KPI cards: live rides/jobs, pending verifications, open disputes, today's revenue. 30 s polling. |
| `/verifications`       | 3 verification endpoints                   | L1, L2               | **Already partly built.** FIFO queue → provider review → per-document approve/reject with PDF preview. |
| `/live-map`            | 3 live-map endpoints                       | L1, L2, L3 (block L4)| Map of Ashanti with ride/job markers. HTTP polling 10–15 s. Click → side panel with detail. |
| `/disputes`            | 3 dispute endpoints                        | L1, L3, L4           | List → detail (with GPS route comparison) → resolve modal (refund full/partial/reject). |
| `/users`               | 3 user endpoints                           | L1, L2, L3, L4 (RO L4)| Filter by role/status, search, suspend, ban (L1 only).   |
| `/jobs/unassigned`     | 4 job-assignment endpoints                 | L1, L3               | Lock → assign → optional force-complete. **Critical: surface the 120 s lock timer.** |
| `/announcements`       | `POST /v1/admin/announcements`             | L1, L3               | Single form. Pick topic, write title + body, send.        |
| `/emergency`           | Emergency ack endpoint                     | L1, L2, L3           | List of recent emergencies; idempotent acknowledge button. |

### P1 — needed shortly after pilot start

| Route                  | Endpoints                          | Roles      | Notes                                                                  |
| ---------------------- | ---------------------------------- | ---------- | ---------------------------------------------------------------------- |
| `/reports/revenue`     | `GET /v1/admin/reports/revenue`    | L1         | Date range + groupBy (day/week/month). Recharts line + bar.            |
| `/reports/providers`   | `GET /v1/admin/reports/providers`  | L1, L2     | Two tables: top drivers, flagged artisans. Sortable.                   |
| `/reports/pilot`       | `GET /v1/admin/reports/pilot`      | L1         | 10 KPI tiles vs target (5,000 clients, 200 drivers, etc).              |
| `/bids/review`         | `PATCH /v1/admin/bids/:id/review`  | L1, L3     | List of high-bid-flagged bids (>GHS 5,000) with approve/reject actions. |
| `/categories`          | 3 category endpoints               | L1 (POST/PATCH), L1+L3 (GET) | CRUD for service categories, slug + bid limits.            |
| `/admins`              | 8 admin-account endpoints          | L1 only    | Full CRUD for admin accounts. Cannot self-modify.                      |

### P2 — nice to have / post-pilot

| Route                  | Endpoints                          | Notes                                                                  |
| ---------------------- | ---------------------------------- | ---------------------------------------------------------------------- |
| `/config`              | 3 platform-config endpoints        | Key-value editor for runtime business rules. Flag dangerous keys with confirm modal. |
| `/audit-log`           | none yet — backend gap             | Read-only audit trail. **Note: backend endpoint does not exist yet** — request before building. |
| `/activity-feed`       | Activity feed endpoint             | Recent cross-domain events stream.                                      |

---

## 7. Auth wiring

The contract is fully spelled out in [admin-auth-flow.md §1–§3](admin-auth-flow.md). Build it like this:

### 7.1 API client

Create `apps/admin/src/lib/api-client.ts`:

- One `apiFetch(path, options)` helper.
- Reads `myshop_admin_token` from `localStorage`, sets `Authorization: Bearer <token>`.
- On 401 response → `clearTokens()` + `window.dispatchEvent(new Event('auth:unauthorized'))`.
- Returns parsed JSON, throws on `success: false` with `error.code` + `error.message` exposed.
- All endpoints return the envelope `{ success, data, error?, meta? }` — unwrap `data` for callers.

### 7.2 AuthGuard

Create `apps/admin/src/components/AuthGuard.tsx`:

- Wraps every authenticated route.
- If no `myshop_admin_token` → `<Navigate to="/login" replace />`.
- Listens for `auth:unauthorized` window event → clear localStorage → navigate to `/login`.

### 7.3 Role gating

Add a `<RoleGuard roles={['super_admin','ops_admin']}>` wrapper. Read role from the cached `myshop_admin_user` object (already in localStorage). On mismatch render a 403 fallback — don't trust the client; the backend will 403 anyway, but the UI should hide what's inaccessible.

### 7.4 LocalStorage keys (canonical)

```
myshop_admin_token    — accessToken
myshop_admin_refresh  — refreshToken
myshop_admin_user     — JSON-stringified { id, email, fullName, role }
```

> **No refresh-token endpoint exists yet.** When the 8 h access token expires, the user re-logs in. Surface a "Session expired" toast on 401 before redirect, not a silent kick.

---

## 8. Layout shell — build this once

Every authenticated page renders inside one shell:

```
┌─────────────────────────────────────────────────────────┐
│ TopBar: logo · environment badge (DEV/STAGING/PROD) ·   │
│         admin name · role · logout                       │
├──────────┬──────────────────────────────────────────────┤
│ Sidebar  │  <Outlet /> — page content                   │
│ ────────  │                                              │
│ Dashboard │                                              │
│ Live Map  │                                              │
│ Verif…    │                                              │
│ Disputes  │  Page-level loading: skeleton, not spinner   │
│ Users     │  Empty states: card with illustration + CTA  │
│ Jobs      │  Errors: red banner with retry button        │
│ Reports ▾ │                                              │
│ Admins*   │                                              │
└──────────┴──────────────────────────────────────────────┘
```

- Sidebar items conditionally rendered by role.
- Environment badge derived from `import.meta.env.VITE_API_BASE` (LOCAL/STAGING/PROD). Production gets a red ribbon — irreversible actions only happen on prod.
- All destructive actions (ban, force-complete, delete admin) require a confirm modal that re-types the target's name or a "Type CONFIRM" gate.

---

## 9. Conventions to follow

These supplement [CLAUDE.md §6](../CLAUDE.md):

| Concern              | Rule                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------- |
| Money                | Always store as pesewas (integer). Format on render: `formatGhs(4730) → "GHS 47.30"`.    |
| Phone                | Use `normalizeGhanaPhone()` from [`@myshop/utils`](../packages/utils/) before any compare. |
| Types                | Import enums + interfaces from [`@myshop/shared-types`](../packages/shared-types/). **Don't redeclare.** |
| Routing              | Lazy-load every route via `React.lazy()` + `<Suspense>`. Don't ship one giant bundle.   |
| Server state         | TanStack Query for everything. Cache key: `['admin', resource, ...filters]`.             |
| Client state         | Zustand for auth + UI prefs only. Don't put server data in Zustand.                     |
| Loading              | Skeleton screens (per shape), not spinners. Reuse a `<Skeleton variant=…>` component.    |
| Empty states         | Card with icon + 1-line headline + CTA. Never an empty table.                            |
| Errors               | Toast for transient errors (retry possible); inline banner for persistent (validation). |
| Forms                | react-hook-form + zod resolver. Mirror DTO validation rules from the backend.            |
| Dates                | Always render in Africa/Accra. Use `format(date, 'd MMM yyyy, HH:mm')`.                  |
| Maps                 | Center on Kumasi (6.6885, -1.6244). Pilot bounds: Ashanti Region GeoJSON in [config/](../config/). |
| Polling intervals    | Live map: 10–15 s. Dashboard KPIs: 30 s. Lists: 60 s. Pause when tab hidden.             |
| Accessibility        | WCAG AA. Keyboard nav on every modal + table row. Focus traps on dialogs.               |

---

## 10. Definition of done — per page

A page ships when:

- [ ] All happy-path flows reachable via keyboard alone
- [ ] Loading + empty + error states designed and tested
- [ ] All DTO fields validated client-side; error codes from `admin-auth-flow.md §5` mapped to user-facing messages
- [ ] Role guard hides actions the role can't perform
- [ ] Mobile/tablet breakpoints tested (admin is desktop-first but ops use iPads — see [CLAUDE.md §5](../CLAUDE.md) target devices)
- [ ] No `console.log`, no `any` types, no commented-out code
- [ ] [architecture.md](architecture.md) endpoint map updated
- [ ] [CHANGELOG.md](CHANGELOG.md) entry added
- [ ] [admin-module.md](admin-module.md) Status Dashboard updated (move ⬜ → ✅ if applicable)

Per [CLAUDE.md §13](../CLAUDE.md), updating living docs is mandatory after every task. Reviewers will reject PRs that skip it.

---

## 11. Definition of done — overall

- [ ] All P0 pages shipped, role-gated, and exercised against staging API
- [ ] Login + logout + 401-redirect flow works end-to-end
- [ ] Layout shell + sidebar + topbar built and consistent across pages
- [ ] Lighthouse: ≥ 90 Performance, ≥ 95 Accessibility, ≥ 90 Best Practices on every P0 page
- [ ] Tested on Chrome, Firefox, Safari (latest), and iPad Safari
- [ ] One smoke E2E test per P0 page (Playwright preferred)
- [ ] Sentry (or equivalent) wired for prod error reporting
- [ ] Production env var documented in [.env.example](../.env.example) and ECS task definition

---

## 12. Known gaps you'll hit

From [admin-module.md §Known Gaps](admin-module.md):

| Gap                            | What it means for you                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| No WebSocket live map          | Polls every 10–15 s. Build the UI to gracefully accept WS later (single hook swap). |
| No regional scoping            | L2 admins see global data right now. Don't bake assumptions about Ashanti-only data. |
| No token refresh               | 8 h hard expiry. Add a "session expires in N min" warning at the 7 h mark.           |
| No audit-log endpoint          | Don't build `/audit-log` page yet — request the endpoint first.                      |
| Clawback write-off cron alerts | Not surfaced anywhere yet. Future feature.                                           |

---

## 13. Open product decisions (not your call, but blockers)

These three are pending sign-off before pilot — see [CLAUDE.md Appendix](../CLAUDE.md):

1. Client identity verification for artisan home visits
2. Physical altercation protocol
3. Disqualifying offences list for background checks

None block frontend work directly, but #3 may add fields to the verification review screen — confirm before finalising that page.

---

## 14. Hand-back checklist

When wrapping up the engagement, ensure:

- [ ] Every P0 + P1 page is in `main` and deployed to staging
- [ ] [architecture.md](architecture.md), [CHANGELOG.md](CHANGELOG.md), [projectstatus.md](projectstatus.md), [admin-module.md](admin-module.md) reflect final state
- [ ] One Loom (≤ 10 min) walking through the codebase for the next maintainer
- [ ] All "Choose & install" decisions from §3 documented in [architecture.md](architecture.md)
- [ ] Outstanding bugs filed as GitHub issues with `MSP-` prefix and clear repro steps

---

## 15. Contacts

| Role                  | Owner                                |
| --------------------- | ------------------------------------ |
| Product (PRD)         | _Fill in_                            |
| Backend lead          | _Fill in_                            |
| Design (Phase 6)      | _Fill in_                            |
| Ops sign-off          | _Fill in_                            |
| You (frontend lead)   | _Fill in on day 1_                   |

---

> **Tip:** before writing a single line of UI code, log into staging via curl using the credentials in the seed file and hit `/v1/admin/reports/overview` — see the real shape of the data. The whole dashboard is a UI on top of those JSON envelopes; everything else is presentation.
