# Phase 1 Backlog — Core Kernel

> **Status:** ~70% Complete  
> **Scope:** Foundation — Monorepo, Tauri, SQLite, Auth, UI System  
> **Completed items live in:** [`phase-1-completed.md`](./phase-1-completed.md)

---

## BACK-1-001 · Schema Domain Split

**Priority:** Medium  
**Area:** `packages/db`  
**Description:**  
Currently all table definitions (Core + all Module tables) live in a single `packages/db/src/types.ts` file. The plan calls for splitting these into domain-scoped files:

```
packages/db/src/
  core/
    users.ts
    sync-metadata.ts
    app-config.ts
  modules/
    repair/
      assets.ts
      bookings.ts
    commerce/
      orders.ts
      order-items.ts
      inventory.ts
```

**Acceptance Criteria:**
- [ ] Core tables extracted to `packages/db/src/core/`
- [ ] Module tables extracted per domain under `packages/db/src/modules/`
- [ ] Root `index.ts` re-exports everything so downstream consumers are not broken
- [ ] Drizzle schema files updated in parallel if applicable
- [ ] All existing types still resolve without errors (`tsc --noEmit` passes)

---

## BACK-1-002 · Module Loader / Registry

**Priority:** Low (hardcoded acceptable for now per plan)  
**Area:** `apps/desktop/src/lib/`  
**Description:**  
The `RepairModule` is instantiated directly in `lib/db.ts`. As more modules are added, this pattern won't scale. A proper module registry should:
- Accept a list of enabled modules from `app_config`
- Lazily instantiate only the modules that are enabled for this tenant
- Expose a typed `useModule('repair')` hook or similar accessor

**Acceptance Criteria:**
- [ ] `ModuleRegistry` class created in `apps/desktop/src/lib/module-registry.ts`
- [ ] Registry reads enabled modules from `AppConfig` store on startup
- [ ] Each module registers itself (e.g., `registry.register('repair', RepairModule)`)
- [ ] `lib/db.ts` uses the registry instead of direct instantiation
- [ ] Adding a new module requires zero changes to `lib/db.ts`

---

## BACK-1-003 · User Management UI

**Priority:** Medium  
**Area:** `apps/desktop/src/pages/` or settings module  
**Description:**  
Seed script creates admin and mechanic users, but there is no in-app UI to manage users (create, update role, deactivate). Required for real shop deployments.

**Acceptance Criteria:**
- [ ] User list page accessible from Settings
- [ ] Create user form (email, role, temporary password)
- [ ] Edit role / deactivate user
- [ ] Only `admin` role can access this page
- [ ] Uses `UsersTable` via Kysely (no raw SQL)

---

## BACK-1-005 · Hardware IO Foundation

**Priority:** Low  
**Area:** `packages/core/` or new `packages/hardware/`  
**Description:**  
Plan mentions Hardware IO (Printers, Scanners) as a Core Kernel responsibility. A foundation layer should be created before individual modules start calling print/scan APIs.

**Acceptance Criteria:**
- [ ] `packages/hardware` package scaffolded with `package.json` and `tsconfig.json`
- [ ] `PrinterService` interface defined with `print(payload: PrintPayload): Promise<void>`
- [ ] `ScannerService` interface defined with `onScan(cb: (result: string) => void): void`
- [ ] Tauri plugin for serial/USB communication identified and documented (even if not implemented)

---

## BACK-1-006 · Shop Asset-Type Configuration

**Priority:** 🟡 Medium
**Area:** setup wizard (`pages/setup.tsx`), settings (`pages/settings.tsx`), asset create form, `app_config`
**Origin:** Owner insight (2026-07-05, while doing BACK-2-003)

**Description:**
Asset **type** should not be a per-asset choice — it is a property of the *shop*. A car-aircon repair shop
deals with vehicles for the app's entire lifetime; a phone-repair shop deals with gadgets. Today the asset
create form always offers all three types (vehicle/gadget/appliance), which is noise for a single-domain shop
and lets staff mis-file assets. The shop's asset type(s) should be chosen **once during onboarding** (and
adjustable in **Settings**), then the asset create form should default to / be constrained to the shop's
configured type(s). Per-asset type remains immutable (already enforced in BACK-2-C011).

**Acceptance Criteria:**
- [ ] `app_config` stores the shop's enabled asset type(s) (e.g. an `asset_types` JSON/text column; likely a
      single primary type for most shops, but allow multiple)
- [ ] Setup wizard step: choose the shop's asset type(s) on first run (default sensible if skipped)
- [ ] Settings page: edit the enabled asset type(s) (admin/owner only, consistent with BACK-1-C004)
- [ ] Asset create form only offers the shop's enabled type(s); if exactly one, the type selector is hidden and
      that type is pre-selected
- [ ] Existing assets of a now-disabled type still display/search correctly (don't hide historical data — D24)

**Open questions (discuss before build):**
- Single primary type vs. multi-select? (Owner leaned "usually fixed to one" — a car shop is cars for life.)
- Should disabling a type that has existing assets be blocked or just hidden from new-asset creation?

---
