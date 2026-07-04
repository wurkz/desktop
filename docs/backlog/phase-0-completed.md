# Phase 0 Completed — v1 Ship Blockers & Foundation

> Items here have been **fully implemented and verified**.
> When an item from [`phase-0-ship-blockers.md`](./phase-0-ship-blockers.md) is finished, move it here
> and fill in the implementation details.

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
