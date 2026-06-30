# Deploying the Admin Panel to cPanel

The MyShop admin panel is a **Next.js 15 (SSR) app**, not a static site. It runs as
a Node.js application under cPanel's **Setup Node.js App** (Phusion Passenger).
Uploading files to `public_html` will **not** work.

The repo is already scaffolded for this:

| File | Role |
|------|------|
| [`server.js`](../server.js) | Passenger startup file — runs Next in production, listens on `process.env.PORT` |
| [`.cpanel.yml`](../.cpanel.yml) | Git deployment tasks — rsyncs source while preserving `node_modules`, `.next`, and `.env.production` |
| [`.env.production`](../.env.production) | Production env vars (gitignored; create/maintain on the server) |
| [`next.config.mjs`](../next.config.mjs) | Inlines `NEXT_PUBLIC_*` vars at **build time** |

---

## Prerequisites

- cPanel host with **Setup Node.js App** (CloudLinux + Passenger).
- **Node.js 20 or 22** in the Node selector (Next 15 + React 19 need Node ≥ 18.18).
- **Terminal / SSH access** — the build must run on the server.

---

## One-time setup

### 1. Create the Node.js app
cPanel → **Setup Node.js App** → **Create Application**:

| Field | Value |
|-------|-------|
| Node.js version | 20.x or 22.x (highest available) |
| Application mode | Production |
| Application root | `myshop-admin` (→ `/home/<user>/myshop-admin`, matches `.cpanel.yml`) |
| Application URL | your domain/subdomain, e.g. `admin.yourdomain.com` |
| Application startup file | `server.js` |

> If your cPanel username is not `gilmddye`, edit the `DEPLOYPATH` line in
> [`.cpanel.yml`](../.cpanel.yml) to match `/home/<user>/myshop-admin`.

### 2. Get the code onto the server
- **Git (recommended):** cPanel → **Git Version Control** → point at the repo and the
  same `myshop-admin` path. Deploying runs the `.cpanel.yml` tasks.
- **Manual:** upload everything **except** `node_modules`, `.next`, and `.git`.

### 3. Enter the app's virtual environment
cPanel → **Terminal**, then paste the `source /home/<user>/nodevenv/...` command shown
on the Node.js App page (puts the correct Node/npm on PATH). Then:

```bash
cd ~/myshop-admin
```

### 4. Install dependencies
```bash
npm install
```

### 5. Configure environment variables
`NEXT_PUBLIC_*` vars are **inlined at build time**, so they must exist *before* you build.
Set them in **both** places:

1. **Setup Node.js App → Environment variables** (runtime), and
2. `.env.production` in the app root (gitignored — does not arrive via deploy):

```
NEXT_PUBLIC_ENV=PROD
UPSTREAM_API_URL=https://myshop-api-test.onrender.com/v1
NEXT_PUBLIC_API_URL=https://myshop-api-test.onrender.com/v1
NEXT_PUBLIC_WS_URL=https://myshop-api-test.onrender.com
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=<your key>
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=<your map id>
```

> Swap the `onrender.com` URLs for the real production backend when ready.
> Make sure `UPSTREAM_API_URL` ends in `/v1` — a missing slash breaks the
> `/api/proxy` route.

### 6. Build (on the server)
`.next` is excluded from deploy, so build where it runs:

```bash
npm run build
```

### 7. Start
**Setup Node.js App → Restart**. Visit the Application URL.

---

## Updating after a code change

```bash
# git pull / deploy, then in the app's venv:
cd ~/myshop-admin
npm install        # only if package.json changed
npm run build      # always — regenerates .next
# then click Restart in Setup Node.js App
```

---

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Blank page / 503 | App didn't build or start. Check Passenger `stderr.log` in the app root; re-run `npm run build`. |
| Build "killed" / OOM | Shared-plan RAM cap. Try `NODE_OPTIONS=--max-old-space-size=512 npm run build`, or build locally and upload `.next` manually. |
| Maps don't render | `NEXT_PUBLIC_*` vars missing **at build time**. Set them, then `npm run build` again. |
| API calls fail | Verify `UPSTREAM_API_URL` ends in `/v1`; confirm backend CORS allows the admin domain. |
| Wrong Node errors | Select Node 20/22 in the selector. |
