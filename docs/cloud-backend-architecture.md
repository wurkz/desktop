# Cloud Backend Architecture — v1 (INTERIM: shared-hosting / Laravel)

> **Status:** DRAFT for review. **Interim by design** — chosen to fit the current **Hostinger shared
> hosting** (PHP + MySQL). If we later move to a VPS, this could be revisited (e.g. a Node/Next
> service sharing the TS `packages/core`); for now Laravel is the pragmatic, lowest-friction fit.
> Implements the already-locked [`cloud-sync-protocol.md`](./cloud-sync-protocol.md) — that JSON
> contract is language-agnostic, so the finished desktop client is unchanged.

---

## 1. Why Laravel + MySQL (and the trade-offs)

- **Constraint:** Hostinger **shared hosting** runs PHP + MySQL; it can't host a persistent Node
  server. Laravel is the mature framework for that environment.
- **Auth fits perfectly:** **Laravel Sanctum** gives us API bearer tokens (for desktop devices) AND
  session/token auth for humans (owner + platform admin) in one system — directly answering "one
  auth for desktop + cloud users."
- **Trade-offs (accepted):**
  - **No TS code-sharing.** The backend is PHP, so it can't import `packages/core`. Impact is small —
    the cloud is a **sync mirror + read-only KPI dashboards**; it mostly stores rows and runs queries,
    not business math. Any shared rule (should it ever be needed) is re-stated in PHP.
  - **Separate repo/toolchain.** Laravel (Composer/PHP) does **not** live in the TS Turborepo. It's a
    **separate repository** (e.g. `zorviz-cloud`). The only shared artifact is the sync-protocol doc.
  - **Shared-hosting limits:** no long-running workers/websockets, PHP request timeouts, cron is
    limited. **Fine for our design** — everything is request/response (desktop POSTs sync; dashboards
    read). No background daemons required for v1.
  - **TLS:** Hostinger provides free SSL for a domain/subdomain → the desktop's `cloud_url` is e.g.
    `https://api.<shop-domain>` or `https://<domain>/api`.

## 2. Principals & auth (Sanctum)

| Principal | Auth mechanism | Scope | Purpose |
|---|---|---|---|
| **Desktop device** (Commander) | Sanctum **personal access token** (bearer), issued at device registration | one `tenant_id` | sync API (`/health`, `/sync/push`) |
| **Shop owner** (human) | Sanctum session/token via email + password login | their tenant(s) | KPI dashboard |
| **Platform admin** (vendor) | same human login, `role = platform_admin` | all tenants | manage suite, subscriptions, devices, kill-switch |

- **One `users` table** (cloud) with `role ∈ {platform_admin, owner}` + a `tenant_user` pivot (an
  owner may own several shops). Passwords hashed by Laravel (bcrypt/argon).
- **Devices** authenticate with a token, not a login; a middleware resolves either a device token or
  a human session into "who + which tenant(s)," and every query is tenant-scoped.
- **Desktop local auth stays separate.** The desktop's username+PIN users are local-first and are
  **not** federated to the cloud. Only the owner gets a cloud account; the device links via its token.

## 3. Data model (MySQL)

**Platform tables**
- `tenants` — `id (uuid)`, `name`, `status ∈ {active, suspended}`, timestamps. The `id` matches the
  desktop's `app_config.tenant_id` (the Shop ID shown in Settings › Cloud Link).
- `subscriptions` — `tenant_id`, `plan`, `status`, `current_period_end` (v1: status set manually by a
  platform admin; billing provider integration is reserved).
- `users` — cloud humans; `role`, `email`, `password`, timestamps.
- `tenant_user` — pivot (owner ↔ tenants).
- `devices` — `id`, `tenant_id`, `name`, `token` (via Sanctum `personal_access_tokens`), `last_seen_at`.

**Mirrored business tables** (per the sync spec §4 — tenant-scoped copies, upserted by `id`):
`customers, assets, asset_types, bookings, orders, order_items, inventory, inventory_adjustments,
payments`. Every row carries `tenant_id`; primary keys are the desktop's UUIDs (upsert by `id`).
Money stays integer centavos; timestamps integer epoch-ms (MySQL `BIGINT`).

## 4. API surface

**Sync (device-token auth) — implements the locked protocol:**
- `GET  /api/health` → `{ ok, server_time }`.
- `POST /api/sync/push` → upsert the batch (transaction, idempotent by `id`), return `{ ok, watermark, accepted }`.
- `POST /api/sync/pull` → **reserved** (not v1).

**Auth (humans):**
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` (Sanctum).
- Device registration: `POST /api/devices` (owner/admin creates a device → returns a one-time token to
  paste into the desktop's Cloud Link settings). `DELETE /api/devices/:id` (revoke = kill that device).

**Dashboard data (human session, tenant-scoped):**
- `GET /api/dashboard/kpis?tenant=…` — revenue, job counts, low-stock, etc. (read queries over the
  mirrored tables).
- Platform admin: `GET /api/admin/tenants`, `PATCH /api/admin/tenants/:id` (suspend/activate = kill-switch).

## 5. Dashboards

- **Owner dashboard** — KPIs for their shop(s): revenue over time, jobs by status, top services/parts,
  low stock, per-branch if multi-branch.
- **Platform admin** — list tenants, subscription status, devices/last-seen, suspend/activate.
- **Rendering (decision, §9):** leanest on shared hosting is **Blade + Livewire** (all-PHP, no JS build
  step, SSR-friendly). Alternative: Inertia + React (nicer SPA, adds a build step).

## 6. Subscription gating / kill-switch (ties to BACK-0-012)

- Middleware rejects **sync** + **dashboard** for a tenant whose `status != active` (→ `403`; desktop
  shows "cloud suspended", keeps running fully local — never blocks shop operation).
- A platform admin flips `tenants.status` to `suspended` = remote kill of cloud access (local app is
  unaffected; it's local-first).

## 7. Deployment (Hostinger shared)

- Point the (sub)domain docroot at Laravel's `public/`; upload via git/SSH or hPanel; `composer install
  --no-dev`, set `.env` (MySQL creds from hPanel), `php artisan migrate`, `key:generate`, cache config.
- Scheduled tasks (if any later, e.g. prune stale devices) via **hPanel cron** hitting `artisan schedule:run`.
- Free SSL via hPanel. Desktop `cloud_url` → the HTTPS (sub)domain.

## 8. Dev environment

- PHP 8.3 + Composer 2.6 available locally (verified). Scaffold + build here.
- **DB:** develop against **SQLite** locally (zero-setup); **MySQL** in prod (Laravel switches via
  `.env` `DB_CONNECTION`). Schema/migrations written dialect-portable.

## 9. Open decisions (please confirm)

1. **Dashboards:** Blade + Livewire (leanest, all-PHP) — *recommended* — vs Inertia + React?
2. **Repo:** new separate repo `zorviz-cloud` (Laravel) — *recommended* — vs a subfolder in this repo?
3. **DB:** SQLite for local dev + MySQL in prod — *recommended* — OK?
4. **Auth for humans:** Sanctum **session** (SPA/same-domain dashboards) — *recommended* — vs pure token API?
5. **v1 subscription:** manual `status` set by platform admin now; billing provider later — *recommended*?

## 10. Longevity & migration trigger

- **Use it while it serves the shops.** Shared hosting + Laravel is deliberately the cheap starting
  point. Our load is light (each shop's desktop POSTs a small diff periodically; owners open a
  dashboard occasionally), so it should comfortably carry the early network.
- **Migrate when we see real slowdown** — sync latency climbing, dashboard queries dragging, or
  hitting shared-hosting limits (PHP timeouts, connection/CPU caps). Then move to a VPS/managed host
  (Laravel Forge/Ploi on a VPS, or re-platform).
- **Why the switch stays low-risk:** the desktop only knows the **JSON sync contract** + its
  `cloud_url` — swapping the backend or host is transparent to every installed app (just repoint the
  URL; no reinstall). Data is tenant-scoped rows, straightforward to dump/restore into the new DB.
  So this interim choice doesn't lock us in.

## 11. Reserved / not v1

- `/sync/pull` + bidirectional/multi-device + conflict resolution.
- Media/file sync (ticket photos).
- App-layer encryption of the sync payload (BACK-4-008).
- Billing-provider integration; usage metering.
- Federating desktop local users to the cloud.
