# Phase 1 Completed — Core Kernel

> Items here have been **fully implemented and verified**.  
> When an item from [`phase-1-backlog.md`](./phase-1-backlog.md) is finished, move it here and fill in the implementation details.

---

## ✅ BACK-1-C001 · Monorepo Setup (Turbo)

**Completed:** (initial setup)  
**PR / Commit:** *(initial commit)*

**What was implemented:**
- Turborepo configured at the root with `turbo.json`
- Root `package.json` defines workspaces: `apps/*`, `packages/*`
- `tsconfig.base.json` shared across all packages
- Packages: `@zorviz/core`, `@zorviz/db`, `@zorviz/ui`, `@zorviz/feature-repair`, `@zorviz/sync-engine`

**Key files:**
- `turbo.json`
- `package.json` (root)
- `tsconfig.base.json`

---

## ✅ BACK-1-C002 · Tauri Base App

**Completed:** (initial setup)  
**PR / Commit:** *(initial commit)*

**What was implemented:**
- Tauri v2 app scaffolded inside `apps/desktop/`
- Vite + React frontend wired to Tauri shell
- `src-tauri/` contains Rust backend with Tauri configuration
- `vite.config.ts` configured for Tauri dev mode
- PostCSS + Tailwind integrated

**Key files:**
- `apps/desktop/src-tauri/`
- `apps/desktop/vite.config.ts`
- `apps/desktop/package.json`

---

## ✅ BACK-1-C003 · Local SQLite Setup

**Completed:** (initial setup)  
**PR / Commit:** *(initial commit)*

**What was implemented:**
- `TauriSqliteDialect` custom Kysely dialect created in `apps/desktop/src/lib/tauri-dialect.ts`
- Bridges Kysely's query builder to Tauri's `@tauri-apps/plugin-sql` API
- `db` singleton exported from `apps/desktop/src/lib/db.ts`
- Database file stored at `apps/desktop/data/zorviz.db` (outside `src-tauri/` to avoid watch loop)
- Two SQLite migrations applied via `packages/db/migrations/sqlite/`
  - `0000_charming_gunslinger.sql` — initial schema
  - `0001_clumsy_pet_avengers.sql` — incremental update

**Key files:**
- `apps/desktop/src/lib/tauri-dialect.ts`
- `apps/desktop/src/lib/db.ts`
- `packages/db/migrations/sqlite/0000_charming_gunslinger.sql`
- `packages/db/migrations/sqlite/0001_clumsy_pet_avengers.sql`
- `packages/db/src/types.ts` — Kysely table interfaces & Database type

---

## ✅ BACK-1-C004 · Authentication (Local)

**Completed:** (initial setup)  
**PR / Commit:** *(initial commit)*

**What was implemented:**
- Zustand store `useAuthStore` in `apps/desktop/src/stores/auth.ts`
  - State: `user`, `isAuthenticated`
  - Actions: `login(email, password)`, `logout()`
  - Login verifies SHA-256 password hash against `users` table via Kysely
- Login page at `/login` (`apps/desktop/src/pages/login.tsx`)
  - Email + password form with validation
  - Error state on invalid credentials
- Route guards in `App.tsx` using `useAuthStore`
  - Unauthenticated users redirected to `/login`
  - Authenticated users redirected away from `/login`
- Seed script creates two default users:
  - `admin@zorviz.com` / `admin123` → role: `admin`
  - `mechanic@zorviz.com` / `admin123` → role: `mechanic`

**Key files:**
- `apps/desktop/src/stores/auth.ts`
- `apps/desktop/src/pages/login.tsx`
- `apps/desktop/src/App.tsx`
- `packages/db/src/seed.ts`

---

## ✅ BACK-1-C005 · App Config Store

**Completed:** (initial setup)  
**PR / Commit:** *(initial setup)*

**What was implemented:**
- Zustand store `useAppConfigStore` in `apps/desktop/src/stores/app-config.ts`
  - `fetchConfig()` reads the single row from `app_config` table
  - Exposes `config` (currency symbol, locale, branch info)
- Dashboard consumes `config.currency_symbol` for revenue display
- Seed script inserts default config: `tenant_id: 'dev-tenant-id'`, `currency_symbol: '₱'`, `locale: 'en-PH'`

**Key files:**
- `apps/desktop/src/stores/app-config.ts`
- `packages/db/src/seed.ts`

---

## ✅ BACK-1-C006 · UI Design System (`@zorviz/ui`)

**Completed:** (initial setup)  
**PR / Commit:** *(initial setup)*

**What was implemented:**
- `packages/ui` package built on shadcn/ui component primitives
- `components.json` configures shadcn registry
- Shared `styles.css` with CSS variables for light/dark theming
- Exported components: `Button`, `Input`, `Card`, `CardHeader`, `CardContent`, `CardTitle`, `ThemeSwitcher`
- `ThemeProvider` wraps the app and reads `system` preference by default
- `ThemeSwitcher` allows toggling Light / Dark / System

**Key files:**
- `packages/ui/src/index.ts`
- `packages/ui/src/styles.css`
- `packages/ui/src/components/`
- `packages/ui/tailwind.config.ts`

---

## ✅ BACK-1-C007 · Dashboard Page

**Completed:** (initial setup)  
**PR / Commit:** *(initial setup)*

**What was implemented:**
- Dashboard page at route `/` (`apps/desktop/src/pages/dashboard.tsx`)
- Header with Zorviz branding, ServerStatus indicator, user email/role, and Logout button
- Stats cards: Active Jobs (hardcoded), Pending Estimates (hardcoded), Low Stock (hardcoded), This Month Revenue (from config currency)
- Module navigation cards: Repair Shop (active), Inventory (Coming Soon), Settings (Coming Soon)
- `ThemeSwitcher` UI section
- `ServerStatus` component in `apps/desktop/src/components/server-status.tsx`

**Key files:**
- `apps/desktop/src/pages/dashboard.tsx`
- `apps/desktop/src/components/server-status.tsx`

---

## ✅ BACK-1-C008 · Seed Script

**Completed:** (initial setup)  
**PR / Commit:** *(initial setup)*

**What was implemented:**
- Node.js seed script at `packages/db/src/seed.ts`
- Uses `better-sqlite3` to write directly to the SQLite file
- Idempotent — skips records that already exist
- Seeds: `app_config` (1 row), `users` (admin + mechanic)
- DB path resolves to `apps/desktop/data/zorviz.db` relative to `packages/db`
- Password hashing: SHA-256 of `admin123` stored as hex string

**Key files:**
- `packages/db/src/seed.ts`

---

## ✅ BACK-1-C004 · App Config Settings Page

**Completed:** 2026-07-05
**Original Backlog ID:** BACK-1-004

**What was implemented:**
- Rust `PUT /api/config` (`api_data::update_config`) — **admin/owner only** (`require_admin`, 403 for other
  roles, 401 without a session). Updates the `app_config` `default` row and returns the reloaded config. Never
  touches identity columns (`id`/`tenant_id`/`branch_id`), the logo, or auth. Validates that shop name,
  currency, and device name are non-empty (400 otherwise); 404 if the app isn't set up yet.
- `/settings` page (`pages/settings.tsx`) — grouped cards: **Shop Details** (name, address, phone, email, tax
  reg ID), **Currency & Tax** (symbol, locale, tax rate entered as a %, stored as a fraction), **This Device**
  (device name), and **Custom Fields** (dynamic label/value rows, same JSON `{label:value}` shape the invoice
  reads). Hydrates from the app-config store; shows a "Settings saved." confirmation.
- **Access model (owner decision):** admin/owner can edit; other roles see a read-only notice with all inputs
  disabled and no Save button.
- `app-config` store gained an `updateConfig(input)` action that PUTs and refreshes the global config, so the
  dashboard header shop name and invoice data update live after a save.
- Dashboard Settings card **un-disabled** ("Coming Soon" removed) → routes to `/settings`.

**Scope note (expanded beyond the original ticket, per owner decision):** the ticket asked only for Device
Name / Currency / Locale; we made the **full shop profile** editable (everything the setup wizard captures
except admin credentials and logo) because those fields print on invoices and the README intent was "edit what
the wizard set." Logo upload remains BACK-0-013.

**Verification:** tsc + vite build clean; Rust recompiled in dev. curl — 401 (no token), 403 (mechanic),
admin round-trip persisted (shop/device/tax 0.08/custom fields), 400 (empty shop name). Playwright — admin:
open Settings → form hydrated → edit device → Save → "Settings saved." → persisted via `/api/config`;
mechanic: notice shown, Save absent, inputs disabled. Zero console errors.

**⚠️ Not implemented (intentional):** logo upload (BACK-0-013, needs Tauri fs); `tenant_id`/`branch_id` are
not editable (identity columns).

**Key files:**
- `apps/desktop/src-tauri/src/api_data.rs` (`update_config`), `apps/desktop/src-tauri/src/server.rs` (route)
- `apps/desktop/src/pages/settings.tsx` (new), `apps/desktop/src/stores/app-config.ts` (`updateConfig`)
- `apps/desktop/src/App.tsx` (route), `apps/desktop/src/pages/dashboard.tsx` (card enabled)

---

## ✅ BACK-1-C009 · Shop Asset-Type Configuration (data-driven types + fields)

**Completed:** 2026-07-05
**Original Backlog ID:** BACK-1-006
**Traces to:** the CLAUDE.md core rule (keep the core domain-agnostic — no hardcoded car/mechanic)

**What was implemented:**
Made asset types **data-driven** — removed the last domain hardcoding (the `SPEC_FIELDS`/`SPEC_LABELS`/`TYPES`
maps in the UI). A shop now defines its own asset types and fields; the former built-ins ship as templates.

- **DB:** migration `0005_asset_types.sql` — `asset_types(id, tenant_id, key, name, icon, fields JSON,
  show_on_create, sort_order, timestamps)` + unique `(tenant_id, key)`. `assets.type` stores the type's stable
  `key` (existing rows' `vehicle/gadget/appliance` reuse the seeded template keys, so nothing breaks). The
  migration back-compat-seeds the 3 templates for installs that already have an `app_config` (INSERT…SELECT →
  no-op on a fresh DB).
- **Rust** (`asset_types.rs`): `builtin_templates()` (single source of truth), `GET /api/asset-type-templates`
  (public — used by the wizard pre-login), `GET /api/asset-types` (auth), `POST/PUT/DELETE /api/asset-types`
  (admin-only). Field defs are `{key,label,kind:'text'|'number',required}`; `key` is slugified from the label
  and kept unique per tenant; type `key` is immutable on update (it links assets). `setup` accepts the wizard's
  selected types (defaults to all 3 templates); `lib.rs` also seeds built-ins for pre-feature installs missing
  types.
- **Onboarding:** new wizard step "What You Service" — tick starter templates (all pre-checked) → seeds the
  shop's `asset_types`.
- **Settings:** admin-only "Asset Types" editor — add/rename type, pick an icon, add/remove/reorder fields
  (label + kind + required), and a per-type **"Show when creating a ticket"** toggle. Read-only for non-admins.
- **Create form** is now data-driven: offers only types with `show_on_create=1` (one → no picker; many →
  limited picker); renders fields from the type def (`number` → numeric input, `required` → blocks save).
- **Detail + edit** render labels/order from the matched type def; fall back to raw spec keys for a removed
  type. Asset type is immutable on edit (BACK-2-C011).
- Widened `assets.type` and `CreateAssetInput.type` to `string`; added the `asset_types` interface to the
  Kysely `Database` type (kept in sync per convention).

**Access / D24:** type writes are admin-only (401/403 verified). Toggling a type off or deleting it never
hides existing assets or their history — only new-asset creation is affected.

**Verification:** tsc + vite build clean; Rust recompiled in dev. curl — templates, migration back-compat seed
(3 types on the pre-existing DB), 401/403 guards, create (slugified keys), toggle, delete. Playwright on a
**fresh DB**: onboarding unchecks Appliance → only Vehicle+Gadget seeded → create picker excludes Appliance →
create Vehicle (fields from def) → detail shows "Plate Number"/"Vehicle" → edit → Settings adds a custom
**Bicycle** type with a **required** "Frame Size" field → toggles **Gadget off** → create picker then shows
Vehicle+Bicycle (no Gadget), enforces the required field, and the Bicycle asset's detail renders the custom
"Frame Size" label. Zero console errors throughout.

**⚠️ Deferred (noted in the spec):** dropdown/select and date field kinds; richer icon set. Data access is the
HTTP API (D23), not Kysely.

**Key files:**
- `packages/db/migrations/sqlite/0005_asset_types.sql`, `packages/db/src/types.ts`,
  `packages/features/repair/src/types.ts`
- `apps/desktop/src-tauri/src/asset_types.rs` (new), `.../api_data.rs` (setup seeding + pub helpers),
  `.../server.rs` (routes), `.../lib.rs` (module + back-compat seed)
- `apps/desktop/src/lib/asset-types-api.ts` (new), `apps/desktop/src/lib/asset-icons.ts` (new)
- `apps/desktop/src/features/repair/components/{AssetCreateForm,AssetEditForm,AssetTypesSettings}.tsx`
- `apps/desktop/src/pages/{setup,settings,asset-detail}.tsx`

---

## ✅ BACK-1-C010 · Demo Seeder + Reset Script

**Completed:** 2026-07-06
**Original Backlog ID:** BACK-1-007
**Origin:** owner request — start every demo from a fresh, realistic dataset with one command.

**What was implemented (seeds via the HTTP API — chosen approach):**
- **`scripts/demo/seed.mjs`** (`npm run demo:seed`) — drives the **real endpoints** (so demo data goes through
  the exact code paths as normal use; no schema duplication). Seeds **NP Car Aircon Repair**: full config
  (₱, 12% VAT, TIN, proprietor, business style, "Job Order" title, T&C, 15% max discount); users **admin/1234,
  advisor `ana`/2222, mechanic `boy`/3333**; a single **Vehicle** asset type; 5 customers (incl. a senior) + 5
  vehicles; **orders spanning every status** — triage, estimate, approved, in-progress (assigned, partly done),
  done, paid, and a **paid Senior/PWD** order (20% + VAT-exempt, OSCA ID + name); and 2 bookings (pending +
  confirmed). Guards that the app is fresh (refuses if already set up).
- **`scripts/demo/reset.mjs`** (`npm run demo:reset`) — one command: stop the app (taskkill + free ports
  3030/1420), **wipe** the dev data dir (`zorviz.db`+WAL/SHM, `media/`, `license.json`/`trial.json`; backups
  left intact; clear error if the DB is locked), relaunch `tauri dev` (detached), wait for the server, then
  seed. Targets `apps/desktop/data`; installed builds use `%LOCALAPPDATA%\Zorviz\data` (documented).
- Root `package.json` scripts + **`docs/demo-credentials.md`** (logins + what's seeded).

**Verification:** ran `npm run demo:reset` end-to-end — set up, config, users, customers, assets, orders,
bookings all seeded. API confirmed: dashboard stats populated (active_jobs 1, pending_estimates 1, month
revenue ₱6,384), all 3 logins work, and the senior order is paid (INV-00002) with **tax ₱0 (VAT-exempt) + ₱560
senior discount (20% of ₱2,800), total ₱2,240** — math exact.

**⚠️ Not seeded (intentional):** **photos** (no sample images bundled — snap one live during the demo) and the
**logo** (upload in Settings). Reset relaunch is dev-oriented (`tauri dev`); Windows-focused (taskkill/netstat).

**Key files:**
- `scripts/demo/seed.mjs` (new), `scripts/demo/reset.mjs` (new)
- `package.json` (demo:seed / demo:reset), `docs/demo-credentials.md` (new)

---

## ✅ BACK-1-C011 · Schema Domain Split

**Completed:** 2026-07-08
**Original Backlog ID:** BACK-1-001

**What was implemented:**
- Split the single `packages/db/src/types.ts` (all table interfaces + the `Database` map) into
  domain-scoped files, exactly per the plan's layout:
  - `core/` — `column-types.ts` (the shared `Nullable` helper + money/timestamp conventions),
    `users.ts`, `customers.ts`, `sync-metadata.ts`, `app-config.ts`
  - `modules/repair/` — `assets.ts`, `asset-types.ts`, `bookings.ts`, `orders.ts`,
    `order-photos.ts` (order_photos + photo_notes)
  - `modules/commerce/` — `order-items.ts`, `inventory.ts`, `inventory-adjustments.ts`
- `database.ts` assembles the Kysely `Database` interface from the domain table types.
- `index.ts` re-exports every domain file + `database.ts`, so all downstream consumers keep
  importing from `@zorviz/db` unchanged (verified: only `index.ts` ever referenced `./types`).
- Deleted the old `types.ts`.

**Design decisions:**
- Domain grouping follows the existing file's own section comments: `customers` sits in **core**
  (a shared entity referenced across modules); `orders`/`asset-types`/`order-photos` go under
  **repair**; `order-items`/`inventory`/`inventory-adjustments` under **commerce**.
- The `Nullable` helper is now exported from `core/column-types.ts` (was module-private) so each
  domain file can share it — purely additive to the public surface.

**⚠️ Spec criterion dropped as obsolete:** "Drizzle schema files updated in parallel" — Drizzle was
abandoned for Kysely (see CLAUDE.md / `.agent/known-issues`), so there are no Drizzle schema files.

**Verification:** pure type-only refactor, no runtime/migration change. `tsc --noEmit` passes for the
desktop app (the AC's gate) and the Vite production build succeeds — all workspace packages resolve
the split.

**Key files:**
- `packages/db/src/core/*.ts`, `packages/db/src/modules/repair/*.ts`,
  `packages/db/src/modules/commerce/*.ts`, `packages/db/src/database.ts` (all new)
- `packages/db/src/index.ts` (re-exports), `packages/db/src/types.ts` (deleted)

## ✅ BACK-1-C012 · User Management UI — (superseded / delivered by BACK-0-007)

**Completed:** 2026-07-08
**Original Backlog ID:** BACK-1-003

**Resolution:** No new work — this kernel-era ticket was already satisfied by **BACK-0-007**
(minimal user management), which shipped the in-app staff-management UI. Verified against this
ticket's acceptance criteria:
- ✅ User list page (admin-gated) — `apps/desktop/src/pages/users.tsx`, reachable via the dashboard
  **Staff** tile (admin/owner only); shows each user with an "(inactive)" marker.
- ✅ Create user — name, username, role, PIN (`createUser`).
- ✅ Edit role / deactivate — `updateUser` sets `role` and `is_active` (0 = deactivated).
- ✅ Admin-only — `isAdmin` gate; non-admins see "Only an admin can manage staff."

**Deviations from the original (stale) ACs — intentional:**
- "Create user form with **email + temporary password**" → the app uses **username + 6-digit PIN**
  (PBKDF2, server-side hashing) per the auth model (BACK-0-004). No email/password path exists.
- "Uses `UsersTable` via **Kysely** (no raw SQL)" → superseded by the **HTTP API** (D23): the UI calls
  `lib/users-api.ts` → the Rust `create_user`/`update_user` handlers. No frontend Kysely.

**Key files (already shipped under BACK-0-007):**
- `apps/desktop/src/pages/users.tsx`, `apps/desktop/src/lib/users-api.ts`,
  `apps/desktop/src-tauri/src/api_data.rs` (`create_user` / `update_user`)
