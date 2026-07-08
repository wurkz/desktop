# Phase 1 Backlog — Core Kernel

> **Status:** ~70% Complete  
> **Scope:** Foundation — Monorepo, Tauri, SQLite, Auth, UI System  
> **Completed items live in:** [`phase-1-completed.md`](./phase-1-completed.md)

---

## ~~BACK-1-002 · Module Loader / Registry~~ · ❌ OBSOLETE (superseded by D23)

> **Obsolete 2026-07-08.** This ticket targeted the pre-D23 architecture where the frontend
> instantiated `RepairModule` (Kysely) directly in `apps/desktop/src/lib/db.ts`. That design was
> replaced by the **local HTTP API** (BACK-0-005 / D23): there is no `lib/db.ts`, no frontend Kysely
> instance, and `RepairModule` is never instantiated in the app (it's used for types only). The data
> path is now `lib/*-api.ts` → axum server, and the real module seam lives in the Rust backend
> (`server.rs` route registration). A frontend `ModuleRegistry` would serve an architecture that no
> longer exists. If a module registry is ever wanted, file a fresh **backend** ticket (config-driven
> enable/disable + route registration in Rust). Original scope kept below for reference.

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

_(BACK-1-007 · Demo Seeder + Reset Script — ✅ completed 2026-07-06, see `phase-1-completed.md`.)_
