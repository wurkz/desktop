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

_(BACK-1-006 · Shop Asset-Type Configuration — ✅ completed 2026-07-05, see `phase-1-completed.md`.)_

---

## BACK-1-007 · Demo Seeder + Reset Script

**Priority:** 🟡 Medium (dev/demo tooling — not a shipped feature)
**Area:** `packages/db/` (or a new script), `apps/desktop/data/`, root `package.json` scripts
**Origin:** Owner request 2026-07-05 — wants to start every demo from a fresh, realistic dataset with one command.

**Goal:**
A one-command way to (re)load a **realistic demo dataset** and to **reset back to fresh** between demos, so the
owner can run repeated live demos without leftover/edited data. Distinct from the existing minimal
`BACK-1-C008` seed (which only creates app_config + admin/mechanic).

**What the demo data should include (make the app look "alive"):**
- Shop config (e.g. "Aling Nena Auto Repair") with currency ₱, a tax rate, proprietor/VAT/TIN, a logo, and a
  Terms & Conditions block; a **max discount %** set.
- Users across roles: **admin, advisor, mechanic** (known PINs, documented).
- **Asset types** seeded (Vehicle + Gadget) with their fields.
- A handful of **customers** and **assets** (plates/serials).
- **Orders spanning every status** — triage, estimate, approved, in_progress, done, **paid** (with receipt) —
  so the dashboard stats, job board, and service history are all populated.
- At least one **booking** (pending/confirmed), one **senior/PWD-discounted** paid order, and one order with a
  couple of **photos + notes**.

**Reset/restart behavior:**
- A script (e.g. `npm run demo:reset` and/or a `demo-reset.ps1`) that: stops the app if running, **deletes the
  DB + WAL/SHM, `media/`, and `license.json`/`trial.json`** from the data dir, then relaunches so migrations
  recreate a clean DB, then seeds the demo dataset.
- Must target the correct data dir (dev = `apps/desktop/data`, installed = `%LOCALAPPDATA%\Zorviz\data`).
- **Guardrail:** obviously-demo data + a confirmation/flag so it can't nuke a real shop's data by accident.

**Open questions (decide at build time):**
- **Seeding approach:** (a) drive the **HTTP API** (`/api/setup` + create endpoints) — reuses Rust validation
  + PBKDF2 PIN hashing, but needs the app running; or (b) write **SQL/rows directly** to the SQLite file (fast,
  no server, but must replicate PIN hashing + tax/senior math). Leaning (a) for correctness.
- Where photos come from (bundled sample images in the repo vs generated placeholders).
- One fixed dataset vs a small `--size` option.

**Acceptance Criteria:**
- [ ] `npm run demo:seed` loads the full demo dataset into a set-up app.
- [ ] `npm run demo:reset` wipes to fresh **and** re-seeds in one command (idempotent, repeatable).
- [ ] Works against the dev data dir; documented how to point at an installed instance.
- [ ] Demo PINs/logins documented (e.g. in the script output or a `docs/demo-credentials.md`).
- [ ] Guardrail prevents accidental wipe of non-demo data.
- [ ] Seeded orders cover all statuses so every dashboard number is non-zero.

---
