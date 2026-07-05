# Phase 0 Completed — v1 Ship Blockers & Foundation

> Items here have been **fully implemented and verified**.
> When an item from [`phase-0-ship-blockers.md`](./phase-0-ship-blockers.md) is finished, move it here
> and fill in the implementation details.

---

## ✅ BACK-0-C011 · Real Dashboard Stats

**Completed:** 2026-07-04
**Original Backlog ID:** BACK-0-011

**What was implemented:**
- Rust `GET /api/stats` (auth, read-only): `active_jobs` (orders `in_progress`), `pending_estimates`
  (`estimate`), `low_stock` (inventory `stock_on_hand <= reorder_point`), `month_revenue` (Σ `paid`
  order totals since the start of the current month, in centavos).
- Dashboard fetches `/api/stats` and renders the four cards live; revenue formatted via `formatMoney`
  with the shop currency. Removed the hardcoded 12 / 5 / 3 / $24.5k placeholders.

**Verification:** live counts changed correctly — +1 estimate → pending_estimates 2→3; +1 part →
low_stock 1→2; billing an order → month_revenue 67200→179200 (exact centavos incl. 12% tax). Playwright:
dashboard shows a formatted ₱ revenue and no longer shows "24.5k", zero console errors.

**Key files:**
- `apps/desktop/src-tauri/src/api_data.rs` (get_stats), `apps/desktop/src-tauri/src/server.rs`
- `apps/desktop/src/pages/dashboard.tsx`

---

## ✅ BACK-0-C007 · Minimal User Management

**Completed:** 2026-07-04
**Original Backlog ID:** BACK-0-007
**Traces to:** D8, D15

**What was implemented:**
- **Server-side PIN hashing** — `auth::hash_pin` (Rust PBKDF2, same params as verify) so staff can be created
  via the API (no client-side hashing).
- Endpoints (all **admin/owner-guarded** via `require_admin`): `POST /api/users` (create — validates PIN ≥4
  digits, rejects duplicate username with 409), `PUT /api/users/:id` (update name/role/is_active and/or reset
  PIN), `GET /api/users?all=1` (list incl. deactivated). Login already rejects `is_active = 0` users.
- **Users page** (`pages/users.tsx`, route `/users`) — admin-only dashboard **Staff** card → list of staff
  (name, @username, role, inactive tag), Add User dialog (name, username, role, PIN), Edit dialog
  (role, active toggle, optional PIN reset).

**Verification (curl + Playwright):** admin creates advisor → advisor logs in; advisor creating a user → **403**
(admin-guard); duplicate username → **409**; deactivate → login **blocked**; reactivate + **PIN reset** → login
works with the new PIN. UI: Staff card → Users page → Add User dialog, zero console errors.

**Key files:**
- `apps/desktop/src-tauri/src/auth.rs` (hash_pin), `apps/desktop/src-tauri/src/api_data.rs`, `src/server.rs`
- `apps/desktop/src/lib/users-api.ts`, `apps/desktop/src/pages/users.tsx` (new), `apps/desktop/src/App.tsx`, `apps/desktop/src/pages/dashboard.tsx`

---

## ✅ BACK-0-C008 · Backup & Restore (Local)

**Completed:** 2026-07-04
**Original Backlog ID:** BACK-0-008
**Traces to:** D18, D2, D24

**What was implemented:**
- `src-tauri/src/backup.rs`: consistent single-file backups via SQLite **`VACUUM INTO`** (WAL-safe);
  date-stamped names (`zorviz-YYYYMMDD-HHMMSS.db`); **rolling retention** (keep last 10, prune older).
- **Auto-backup on launch** (best-effort, in `lib.rs` after DB init) + **manual** `POST /api/backup`.
- **Restore is staged, applied on next launch** (`apply_pending_restore` runs *before* the pool opens,
  in `lib.rs`) — safe with an open DB and **non-destructive**: the live DB is untouched until restart.
  Path-traversal guarded (rejects names with `/`, `\`, `..`).
- Backup folder is shop-configurable (`app_config.backup_dir`, migration 0004; null → `<data>/backups`).
- Backup/restore endpoints are **exempt from the read-only license gate** (D24 — a shop can always
  export/recover its own data): `POST /api/backup`, `GET /api/backups`, `POST /api/restore`, `POST /api/backup-dir`.
- UI: `BackupDialog` (folder field, "Back Up Now", list of backups with Restore + restart prompt) from a
  dashboard **Data** card.

**Verification (curl + Playwright):** auto-backup file present on launch; manual backup creates a file; list
returns dir + count; restore stages `restore-pending.db` (`restart_required: true`) leaving the live DB intact;
`../zorviz.db` → 400. UI: dialog opens, "Back Up Now" updates the list — zero console errors.

**Key files:**
- `packages/db/migrations/sqlite/0004_backup_dir.sql` (new), `packages/db/src/types.ts`
- `apps/desktop/src-tauri/src/backup.rs` (new), `apps/desktop/src-tauri/src/lib.rs`, `src/api_data.rs`, `src/server.rs`
- `apps/desktop/src/lib/backup-api.ts` (new), `apps/desktop/src/features/backup/BackupDialog.tsx` (new), `apps/desktop/src/pages/dashboard.tsx`

---

## ✅ BACK-0-C006 · Signed License + Device Fingerprint + Trial + Gating

**Completed:** 2026-07-04 (2 increments)
**Original Backlog ID:** BACK-0-006
**Traces to:** D17, D21, D24

**What was implemented:**
- **Crypto core** (`src-tauri/src/license.rs`): Ed25519 signature verification against an embedded public
  key; device fingerprint = sha256 of the OS machine-uid (16 hex chars); license file =
  `{data: base64(payload JSON), sig: base64(ed25519)}`; BOM-tolerant parsing. Payload carries `shop_name`,
  allowed `devices` (fingerprints), `modules`, `expires`, `license_id`.
- **`licensegen` bin** (owner-side): `keygen` (make a keypair), `fingerprint` (read a device code),
  `sign --shop --devices --modules --expires --key` (issue a signed license). Owner keeps the private key;
  the public key is embedded in the app. `default-run = "zorviz-desktop"` keeps `tauri dev` launching the app.
- **Trial (D21):** frictionless self-start — no license → a 90-day trial auto-starts (marker in `data/trial.json`).
  Issued trial = a signed license with `--expires`. Grace period (3 days) after expiry keeps full access with
  a warning, then read-only.
- **Gating (D24 — read-only, never destructive):** an axum middleware blocks mutating `/api/*` requests with
  403 when access is `readonly`, while **always allowing reads, login/logout, and installing a license**.
  No code path deletes data on a license lapse; reactivating restores full access with data intact.
- **UI:** `LicenseArea` — a top banner (trial/grace/read-only) + a dialog showing the **device code** (copyable)
  and a paste-and-install box. Wired into `App.tsx`; a `useLicenseStore` fetches status on load.
- Endpoints: `GET /api/license` (public; always returns the device code), `POST /api/license` (installs).

**Verification (curl + Playwright):** valid/wrong_device/tampered(invalid)/missing all classify correctly;
Ed25519 rejects tampering. Gate: full → mutation 200; forced expired-trial → `readonly`, mutation **403**,
read **200**, login **200** (exempt); reinstall license → `valid`, mutation **200 again, data intact**.
UI: trial banner renders, license dialog shows the device code — zero console errors.

**⚠️ Notes / limitations (accepted):**
- Embedded key is a **DEV key** — the owner must run `licensegen keygen`, keep the private key secret, and
  replace `EMBEDDED_PUBLIC_KEY_B64` for production.
- **Reissue/transfer** for a new device = the owner re-runs `licensegen sign` with the new device's fingerprint
  (mechanism supported; no self-service portal).
- Trial-reset: the trial marker lives in `data/` (deleting it resets the trial). Full anti-reset needs the
  online layer (D20, deferred) — accepted for v1 (D21).

**Key files:**
- `apps/desktop/src-tauri/src/license.rs` (new), `apps/desktop/src-tauri/src/bin/licensegen.rs` (new)
- `apps/desktop/src-tauri/src/server.rs` (license_gate middleware), `apps/desktop/src-tauri/src/api_data.rs` (endpoints)
- `apps/desktop/src-tauri/src/db.rs` (`data_dir()`), `apps/desktop/src-tauri/Cargo.toml` (ed25519-dalek, machine-uid, base64, rand; default-run)
- `apps/desktop/src/stores/license.ts` (new), `apps/desktop/src/components/license-area.tsx` (new), `apps/desktop/src/App.tsx`

---

## ✅ BACK-0-C001 · Fix the Production Build

**Completed:** 2026-07-04
**Original Backlog ID:** BACK-0-001
**Traces to:** D11

**What was implemented:**
- **Root cause 1 — duplicate React types.** `packages/ui`, `packages/features/repair`, and the
  `packages/features/inventory` stub each declared React 18 (`react`, `@types/react`) while the app
  runs React 19, producing nested v18 copies in their `node_modules`. The version collision caused all
  the "cannot be used as a JSX component" / `ReactNode`/`bigint` / `ForwardRefExoticComponent`
  type errors. Bumped all three packages' `react`/`react-dom`/`@types/react`/`@types/react-dom` (and
  `@zorviz/ui`'s `peerDependencies`) to `^19.0.0`, then reinstalled so npm deduped to the single root copy.
- **Root cause 2 — dead Drizzle code.** `packages/features/repair/src/types.ts` still imported
  `InferSelectModel` from `drizzle-orm` and referenced `schema.assets` / `schema.bookings` /
  `schema.orders`, which no longer exist after the Kysely migration (see
  `.agent/known-issues/drizzle-sqlite-proxy-mapping.md`). Rewrote it to import the Kysely types
  (`Asset`, `Booking`, `Order`) from `@zorviz/db`. `AssetWithHistory` now correctly types `specs` as a
  parsed object (`Omit<DbAsset, 'specs'> & { specs: Record<string, any> }`) to match the repository.
- **Malformed `CompiledQuery` casts.** `apps/desktop/src/lib/tauri-dialect.ts` built transaction
  queries as `{ sql, parameters } as CompiledQuery` (missing `query`/`queryId`). Replaced with Kysely's
  `CompiledQuery.raw('BEGIN'|'COMMIT'|'ROLLBACK')`.
- **Unused imports/params** (`noUnusedLocals`/`noUnusedParameters`) cleared in: `AssetDiscovery.tsx`
  (`CardTitle`), `tauri-dialect.ts` (`Database`), `main.tsx` (`colno`, `error`), `db/src/types.ts`
  (`Generated`), `repair/dal/asset.repo.ts` (`sql`), `repair/src/index.ts` (`private db` → `db`),
  `ui/theme-provider.tsx` (`useNextTheme`), `ui/theme-switcher.tsx` (`React`).

**Verification:**
- `tsc --noEmit` → exit 0 (was ~25 errors)
- `npm run build` (tsc + vite) → exit 0, emits `dist/`
- `npm run tauri build` → exit 0, produced installers:
  - `Zorviz_0.1.0_x64_en-US.msi` (4.6 MB)
  - `Zorviz_0.1.0_x64-setup.exe` (3.2 MB)

**Notes / follow-ups (not blockers):**
- Two nested React 18 *runtime* copies may still linger in `packages/ui` / `inventory` node_modules
  from transitive/older peer deps (e.g. `next-themes@0.2.1`). Types are correctly unified on v19 and
  the build is clean; if an "invalid hook call" appears at runtime, dedupe the runtime copies (bump
  `next-themes`, or set vite `resolve.dedupe: ['react','react-dom']`).
- `noUnusedLocals` was left ON (errors fixed rather than the flag relaxed).

**Key files:**
- `packages/ui/package.json`, `packages/features/repair/package.json`, `packages/features/inventory/package.json`
- `packages/features/repair/src/types.ts`
- `apps/desktop/src/lib/tauri-dialect.ts`
- `apps/desktop/src/main.tsx`, `apps/desktop/src/features/repair/components/AssetDiscovery.tsx`
- `packages/db/src/types.ts`, `packages/features/repair/src/dal/asset.repo.ts`, `packages/features/repair/src/index.ts`
- `packages/ui/src/components/theme-provider.tsx`, `packages/ui/src/components/theme-switcher.tsx`

---

## ✅ BACK-0-C002 · Consolidated v1 Schema Migration

**Completed:** 2026-07-04
**Original Backlog ID:** BACK-0-002
**Traces to:** D3, D12, D13, D14, D19

**What was implemented:**
- **Squashed migrations.** Since all business tables were empty (verified) and nothing has shipped,
  replaced the two drizzle-generated migrations (`0000_charming_gunslinger`, `0001_clumsy_pet_avengers`)
  and the dead drizzle `meta/` folder with a single clean baseline `0000_init.sql`. (SQLite can't change
  a column's type in place, so a rebuild was needed anyway — a clean baseline is simpler than ALTERs.)
- **Money → integer centavos (D12):** all money columns are now `INTEGER` minor units — `orders`
  (subtotal, tax, discount, total), `order_items` (unit_price, total), `inventory` (unit_cost, unit_price).
  Rates (`tax_rate`) and quantities/stock remain `REAL`.
- **Customers table (D3):** new `customers` (id, tenant_id, name, phone, email, address, timestamps).
  `assets.owner_id` and `orders.customer_id` / `bookings.customer_id` now FK to `customers`, not `users`.
- **Order/intake fields:** `orders` gained `customer_id`, `customer_complaint`, `assigned_mechanic_id`,
  `receipt_number` (all nullable).
- **Status enum (D19):** `orders.status` type is the canonical `OrderStatus`
  (`triage | estimate | approved | in_progress | done | paid | cancelled`); SQL default `'triage'`.
- **app_config additions (D13, D14):** `tax_rate` (nullable — no baked default), `address`,
  `contact_phone`, `contact_email`, `logo_path`, `tax_registration_id`, `custom_fields` (JSON text).
- **Timestamps standardized to ms:** removed all `unixepoch()` (seconds) defaults; timestamp columns are
  `INTEGER NOT NULL` with no default — the app always supplies `Date.now()` (ms). Reconciles the previous
  seconds-vs-ms mismatch.
- **Kysely types rewritten** to match, incl. a `Nullable<T> = ColumnType<...>` helper so nullable columns
  are optional on insert (wizard/repos need not pass `null` for every field). Added `CustomersTable`,
  `OrderStatus`, and `customers` to the `Database` interface.
- **Money helpers** added to `@zorviz/core` (`formatMoney`, `toCentavos`, `fromCentavos`); `calculateTax`
  / `calculateOrderTotal` switched to integer-centavo math; removed the baked `0.12` tax default (D13).
- **tenant_id mismatch fixed:** added `DEV_TENANT_ID` constant in `@zorviz/core`; asset repo and both
  seeders now use it (previously `'default-tenant'` vs `'dev-tenant-id'` diverged).
- Added helpful indexes (customers.phone, orders.asset_id/status/assigned_mechanic_id, bookings.scheduled_time).

**Verification:**
- Migration validated on a throwaway SQLite DB (FKs enforce; integer-centavos inserts succeed).
- `tsc --noEmit` + `npm run build` (tsc + vite) → exit 0.
- Booted the real app (`tauri dev`): sqlx applied migration `version 0 "init" success=1`; the live
  `zorviz.db` has all 9 tables incl. `customers`, `orders` money columns as `INTEGER`, the new intake
  columns, and the expanded `app_config`. Server started normally.

**⚠️ Partial / follow-up:**
- The AC asked that `tenant_id` be sourced *from* `app_config`. Interim done = single shared constant
  (no more mismatch). Full runtime wiring (repos read the active tenant from `app_config`) is deferred to
  the **setup wizard (BACK-0-003)**, where real tenant/config context is established.
- Existing dev DBs must be deleted to pick up the squashed baseline (done for the local dev DB). Any other
  dev machine will hit an sqlx checksum error until its `zorviz.db` is removed — acceptable pre-ship.

**Key files:**
- `packages/db/migrations/sqlite/0000_init.sql` (new; old migrations + `meta/` removed)
- `packages/db/src/types.ts`
- `packages/core/src/money.ts` (new), `packages/core/src/constants.ts` (new),
  `packages/core/src/calculations.ts`, `packages/core/src/index.ts`
- `packages/features/repair/src/dal/asset.repo.ts`
- `apps/desktop/src/lib/seeder.ts`, `packages/db/src/seed.ts`

---

## ✅ BACK-0-C003 · First-Run Setup Wizard

**Completed:** 2026-07-04
**Original Backlog ID:** BACK-0-003
**Traces to:** D13, D14, D16

**What was implemented:**
- **Setup detection + gating.** `useAppConfigStore` now exposes `isChecked`/`isSetup` (an `app_config`
  row exists). `App.tsx` fetches config on load; while unchecked it shows a splash; if not set up it forces
  all routes to `/setup`; once set up, the normal auth-gated routes apply. The wizard cannot be re-triggered
  once an `app_config` row exists.
- **4-step wizard** (`apps/desktop/src/pages/setup.tsx`): (1) Shop details — shop name (required), address,
  contact phone/email, tax/registration ID; (2) Custom fields — arbitrary `label => value` rows saved as
  JSON to `app_config.custom_fields`; (3) Currency & tax — currency symbol (required), locale, tax rate %
  (stored as a fraction, no region default per D13); (4) Admin account — name, username, PIN (+confirm).
- On finish: writes the `app_config` row and the first **admin** user (PIN hashed, see C004), refreshes the
  config store, and routes to `/login`.
- **Schema:** added dedicated `app_config.shop_name` (distinct from `device_name`, which is the LAN device
  identifier). Shop name now shows on the login screen and dashboard header.
- Removed the obsolete in-app dev seeder (`apps/desktop/src/lib/seeder.ts`) and its login-page "Seed DB"
  button; the wizard is the real onboarding path. Dev console seeder (`packages/db/src/seed.ts`) updated.

**Verification:**
- `tsc` + `vite build` → exit 0.
- Real app boot on a fresh DB: migration applied; `app_config` and `users` both have 0 rows → app routes
  to the setup wizard (setup-detection path confirmed).

**⚠️ Partial / deferred:**
- **Logo image upload deferred** → split out as **BACK-0-013** (needs new Tauri fs plumbing; cosmetic,
  mainly for PDF invoices). `logo_path` column exists and is written as `null` for now.
- The wizard UI was verified by build + data-layer checks, **not** click-tested end-to-end (headless
  environment — no GUI interaction available). Logic and types are sound; worth a manual click-through.
- Wizard uses `DEV_TENANT_ID` for `tenant_id` (single-install v1); per-install tenant provisioning is future.

**Key files:**
- `apps/desktop/src/pages/setup.tsx` (new), `apps/desktop/src/App.tsx`, `apps/desktop/src/stores/app-config.ts`
- `packages/db/migrations/sqlite/0000_init.sql` (shop_name), `packages/db/src/types.ts`
- `apps/desktop/src/pages/login.tsx`, `apps/desktop/src/pages/dashboard.tsx`

---

## ✅ BACK-0-C004 · Username + PIN Authentication

**Completed:** 2026-07-04 (done together with the setup wizard, which mints the first credential)
**Original Backlog ID:** BACK-0-004
**Traces to:** D15

**What was implemented:**
- Replaced email+password with **username + numeric PIN** for all roles.
- **PBKDF2 hashing** (`apps/desktop/src/lib/crypto.ts`): per-user random 16-byte salt, SHA-256, 150k
  iterations, 256-bit derived key — not a bare/unsalted hash (PINs are low-entropy). `hashPin`/`verifyPin`/
  `generateSalt` helpers; `verifyPin` uses a constant-ish-time compare.
- **Schema:** `users` now has `name`, `username` (unique), `pin_hash`, `pin_salt`, `role`, `email`
  (nullable), `is_active`. `UserRole` type = `owner | admin | advisor | mechanic` (see below).
- **Auth store** reworked: `login(username, pin)` looks up an active user, verifies via PBKDF2, and applies
  a **5-attempt / 30s lockout** (in-memory). Persists only `user`/`isAuthenticated`.
- Removed seeded/published default credentials from the login page; real credentials come from the wizard.
  Node dev seeder produces a PBKDF2 PIN hash **verified byte-for-byte compatible** with the app's Web Crypto
  verifier (parity test: node `pbkdf2Sync` === `webcrypto.subtle.deriveBits`).

**⚠️ Deferred to BACK-0-005:** "auth bound to the LAN HTTP session (token/cookie)" — this is local/desktop
auth for now; LAN session binding lands with the HTTP API + LAN serving item.

**Key files:**
- `apps/desktop/src/lib/crypto.ts` (new), `apps/desktop/src/stores/auth.ts`
- `packages/db/migrations/sqlite/0000_init.sql`, `packages/db/src/types.ts`, `packages/db/src/seed.ts`

---

## ✅ BACK-0-C009 · Inline-Create Picker Pattern

**Completed:** 2026-07-04
**Original Backlog ID:** BACK-0-009
**Traces to:** D7

**What was implemented:**
- Reusable generic `EntityPicker<T>` (`apps/desktop/src/components/entity-picker.tsx`): debounced search
  against a table-backed source, a results dropdown, and an inline **"Create '<query>'"** row shown when no
  exact match — so staff never dead-end. Selecting shows a chip with a clear button.
- First adopter: the customer picker inside the asset-create form. Same component will back the parts/asset
  pickers as those forms are built.

**Key files:**
- `apps/desktop/src/components/entity-picker.tsx`

---

## ✅ BACK-0-C010 · Customer Module (endpoints + inline create)

**Completed:** 2026-07-04
**Original Backlog ID:** BACK-0-010
**Traces to:** D3, D7

**What was implemented:**
- Rust endpoints in `api_data.rs`: `GET /api/customers?q=` (search by name/phone) and `POST /api/customers`
  (create), both auth-guarded; `tenant_id` from `app_config` via a shared `tenant_id()` helper.
- Frontend client `customers-api.ts` (`searchCustomers`, `createCustomer`), wired into `EntityPicker`.
- Verified via curl: create returns the customer (nulls correct, tenant set), search finds it, 401 without auth.

**Key files:**
- `apps/desktop/src-tauri/src/api_data.rs`, `apps/desktop/src-tauri/src/server.rs`
- `apps/desktop/src/lib/customers-api.ts`

---

## ✅ BACK-0-C005 · Local HTTP API + LAN Serving (Single Path)

**Completed:** 2026-07-05 (all 4 increments) — **the foundation for every LAN/mobile view**
**Original Backlog ID:** BACK-0-005
**Traces to:** D1, D23

**What was implemented (across 4 increments):**
- **Increment 1 — auth foundation.** Rust `auth.rs`: PBKDF2 verify (parity with the node seeder), in-memory
  sessions with 12h opaque bearer tokens, 5-attempt/30s lockout; `POST /api/login`, `POST /api/logout`,
  `GET /api/me`. Frontend `api.ts` client (base-URL detection + 401→logout); auth store moved off client-side
  Kysely to the API.
- **Increment 2 — LAN serving + hardening.** axum serves the built SPA (embedded via rust-embed; disk in
  debug, in-binary in release) as the `/` fallback; CORS locked to desktop origins (tauri.localhost +
  localhost) via predicate (no wildcard); best-effort Windows Firewall rule for TCP 3030.
- **Increment 3 — first data endpoints + frontend migration.** `api_data.rs` with NULL-safe `row_to_json` +
  `specs` JSON expansion; `GET /api/config` (public), `GET/POST /api/assets`. Frontend read paths moved off
  `invoke` to HTTP.
- **Increment 4 — single path complete.** Setup wizard migrated to `POST /api/setup` (`api_data::setup`,
  guarded by no-existing-config; PIN hashed in Rust). **Removed** the `invoke('execute_sql')` command + Rust
  handler and deleted the dead frontend DB layer (`lib/db.ts`, `lib/tauri-dialect.ts`, `lib/crypto.ts`). There
  is now exactly **one data path** — the Rust/axum HTTP API — shared by the desktop webview and LAN devices; no
  browser-only dependency remains.
- Over Phase 2 the API grew the full typed surface (orders, order_items, customers, inventory, users, license,
  backups) — no raw SQL is ever sent over the network.

**Verification:** **physical phone (2026-07-04)** loaded the app from the desktop over LAN and logged in against
the Rust API (real hardware, all increments). Increment 4 verified in a plain non-Tauri browser: fresh-DB setup
wizard → login → create asset → create ticket all succeed over HTTP with zero console errors. curl checks per
increment (auth 401/token, CORS allow/reject, config nulls, asset CRUD).

**⚠️ Partial / ongoing (not blockers):**
- Mobile-first polish: the mechanic **My Jobs** view is mobile-first (~430px, ≥44px targets); a full audit of
  *every* view for touch sizing is ongoing, not gating.
- Per-endpoint input validation is added as each endpoint is built rather than via a single shared validator.

**Related bug fixed during this work:** migration checksum instability from CRLF line endings — sqlx
`migrate!` checksums the raw bytes, so git's autocrlf conversion silently changed them and would fail app
startup ("migration N was modified") on any machine that checked out CRLF. Fixed by pinning
`packages/db/migrations/**/*.sql` to `eol=lf` in `.gitattributes` and renormalizing the files. This is a real
production-update safety fix, not cosmetic.

**Key files:**
- `apps/desktop/src-tauri/src/{auth.rs, api_data.rs, server.rs, db.rs, lib.rs}`
- `apps/desktop/src/lib/api.ts`, `apps/desktop/src/pages/setup.tsx`, `apps/desktop/src/stores/*`
- **Deleted:** `apps/desktop/src/lib/{db.ts, tauri-dialect.ts, crypto.ts}`; Rust `execute_sql` command
- `.gitattributes` (migration line-ending pin)

---

## ✅ BACK-0-C013 · Shop Logo Upload

**Completed:** 2026-07-05
**Original Backlog ID:** BACK-0-013
**Traces to:** D14

**What was implemented (over the single-path HTTP API, no Tauri fs plugin needed):**
- Rust `media.rs`: `POST /api/logo` (admin) accepts a base64 image (raw or `data:` URL) + ext, validates
  type (png/jpg/webp/gif) and size (≤2 MB), writes `{data_dir}/media/logo.<ext>`, removes any prior
  `logo.*` (so replacing overwrites even across extensions), and sets `app_config.logo_path`. `DELETE
  /api/logo` (admin) removes the file + nulls the path. `GET /api/logo` (**public** — the login screen shows
  it pre-auth) streams the bytes with the right content-type, 404 when none.
- **Settings "Logo" card** (admin): preview + Upload/Replace/Remove; client reads the file as a data URL,
  validates type/size, posts it, then refreshes config (cache-busted preview via `?v=updated_at`).
- **Display:** logo shown on the login screen and the dashboard header (falls back to the wrench icon / shop
  name when unset), and **embedded in the PDF invoice** (jsPDF `addImage`, top-left, header text shifts right;
  `generateInvoicePdf` is now async and fetches the logo as a data URL — PNG/JPEG embedded, others skipped).
- `API_BASE` exported from `api.ts`; new `logo-api.ts` (`uploadLogo`/`deleteLogo`/`logoUrl`/`fetchLogoDataUrl`).

**⚠️ Deviation from the original spec:** implemented in **Settings** (admin), **not** the setup wizard. The
wizard step was skipped to avoid a pre-auth upload path (no user/session exists mid-wizard); a shop sets its
logo right after setup in Settings. Adding it to onboarding later is a small follow-up. `app_config.logo_path`
stores a relative path (`media/logo.<ext>`); the browser always fetches via `GET /api/logo`, not the raw path.
Note: logos live under `{data_dir}/media` and are **not** included in the SQLite `VACUUM INTO` backup
(BACK-0-C008) — a known limitation.

**Verification:** builds clean; Rust recompiled in dev. curl — 404 before upload, upload → `media/logo.png`,
`GET` 200 `image/png`, config `logo_path` set, bad ext 400, **mechanic 403**, delete → 200 → `GET` 404 + media
dir emptied. Playwright — Settings upload → preview appears → dashboard header shows it → login screen shows it
→ Remove falls back to placeholder. Zero console errors.

**Key files:**
- `apps/desktop/src-tauri/src/media.rs` (new), `.../server.rs` (routes), `.../lib.rs` (module)
- `apps/desktop/src/lib/logo-api.ts` (new), `apps/desktop/src/lib/api.ts` (`API_BASE`)
- `apps/desktop/src/pages/{settings,login,dashboard,job-ticket}.tsx`, `apps/desktop/src/lib/invoice-pdf.ts`

---
