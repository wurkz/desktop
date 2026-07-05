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

## BACK-1-006 · Shop Asset-Type Configuration (data-driven types + fields)

**Priority:** 🟡 Medium (post-v1)
**Area:** new `asset_types` table + Rust endpoints, setup wizard (`pages/setup.tsx`), settings
(`pages/settings.tsx`), asset create/detail/edit forms
**Origin:** Owner insight (2026-07-05, while doing BACK-2-003); design chat finalized 2026-07-05
**Traces to:** the CLAUDE.md core rule (don't hardcode car/mechanic; keep the core domain-agnostic)

**Description:**
Asset **type** is a property of the *shop*, not each asset. Today `AssetCreateForm.tsx` hardcodes three types
(vehicle/gadget/appliance) and their spec fields (`SPEC_FIELDS`/`SPEC_LABELS`) — the only domain hardcoding in
the app (the DB is already agnostic: `assets.type` is free TEXT, `assets.specs` is free JSON). This item makes
asset types **data-driven**: each shop defines one or more asset types, each with its own ordered list of
fields. The three current types ship as **templates** (seed data) so the target market (cars/gadgets/
appliances) gets a zero-typing setup, while any shop can add/edit types and fields.

**Design (decided in chat):**
- **Engine = data-driven (Option B).** Types + fields are stored, not hardcoded.
- **Field definition:** `{ key, label, kind, required }` where `kind` ∈ `text | number`; `required` is
  optional. (Dropdowns/date kinds are a deliberate later extension — text is a clean superset, migrates
  forward with no data loss.)
- **Templates on install:** Vehicle / Gadget / Appliance, pre-loaded with today's standard fields. The shop
  ticks which to add during onboarding (or starts custom).
- **Multiple types per shop** are allowed.
- **Per-type "Show when creating a ticket" toggle** (settings): a type always continues to exist (its assets +
  history stay intact) but can be hidden from the new-asset/new-ticket picker to avoid clutter. This is the
  owner's chosen mechanism instead of hard delete/disable.
- **Create form** shows only types toggled on: exactly one → no picker (fields render directly); multiple →
  picker limited to the on types. Detail/edit forms render field labels from the type's field defs (retire the
  hardcoded `SPEC_LABELS` fallback map).
- **D24:** toggling a type off (or removing it) NEVER hides existing assets or their history — only new-asset
  creation is affected.

**Acceptance Criteria:**
- [ ] `asset_types` table: `id, tenant_id, name, icon, fields (JSON [{key,label,kind,required}]), show_on_create
      (INTEGER), sort_order, created_at, updated_at`. Migration seeds the 3 templates for new + existing installs.
- [ ] Rust CRUD endpoints for asset types (list + create/update; admin-only for writes, mirroring
      `update_config`/`require_admin`).
- [ ] Setup wizard step "What do you service?" — tick starter templates (or add a custom type) → seeds rows.
- [ ] Settings "Asset Types" section (admin/owner only): rename type, add/remove/reorder fields (label + kind +
      required), and the per-type **Show when creating a ticket** toggle.
- [ ] Asset create form is driven by the shop's on types (one → no picker; many → limited picker); fields come
      from the type's field defs. `number` fields use numeric input; `required` fields block save when empty.
- [ ] Asset detail + edit render labels/fields from the type definition (no hardcoded `SPEC_FIELDS`/
      `SPEC_LABELS`).
- [ ] Existing assets of a hidden/removed type still display + search correctly (D24).

**Deferred to a later extension (noted, not in this item):** dropdown/select and date field kinds; per-type
icon picker beyond a small preset.

---
