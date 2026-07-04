# Phase 2 Completed — Repair Module

> Items here have been **fully implemented and verified**.  
> When an item from [`phase-2-backlog.md`](./phase-2-backlog.md) is finished, move it here and fill in the implementation details.

---

## ✅ BACK-2-C001 · Asset Search (AssetDiscovery Component)

**Completed:** (initial setup)  
**PR / Commit:** *(initial setup)*

**What was implemented:**
- `AssetRepository.search(query: string)` in `packages/features/repair/src/dal/asset.repo.ts`
  - Queries `assets` table using `LIKE` on `id` and `specs` (JSON string) columns
  - For each result, joins `bookings` to check for pending/confirmed bookings
  - Returns `AssetWithHistory[]` array (max 10 results)
- `AssetDiscovery` component in `apps/desktop/src/features/repair/components/AssetDiscovery.tsx`
  - Debounced search with 300ms delay via `useEffect`
  - Displays results as shadcn `Card` components
  - Shows asset type icon (Car / Smartphone / Watch)
  - Shows "Booked" badge if pending booking exists
  - Shows "No assets found. Tap '+' to create." when query returns nothing
  - `+` button present but **not yet wired** (tracked in BACK-2-001)
- `RepairPage` at route `/repair` wraps `AssetDiscovery` with a back-navigation header
- `RepairModule` class in `packages/features/repair/src/index.ts` exposes `assets: AssetRepository`
- `db.ts` instantiates `repairModule` using the Kysely `db` singleton

**Key files:**
- `packages/features/repair/src/dal/asset.repo.ts`
- `packages/features/repair/src/index.ts`
- `packages/features/repair/src/types.ts`
- `apps/desktop/src/features/repair/components/AssetDiscovery.tsx`
- `apps/desktop/src/pages/repair.tsx`
- `apps/desktop/src/lib/db.ts`

---

## ✅ BACK-2-C002 · Asset Create (Repository Layer Only)

**Completed:** (initial setup)  
**PR / Commit:** *(initial setup)*

**What was implemented:**
- `AssetRepository.create(input: CreateAssetInput)` added to `asset.repo.ts`
  - Generates UUID via `crypto.randomUUID()`
  - Inserts into `assets` table with `tenant_id`, `owner_id`, `type`, `specs` (JSON serialized), timestamps
  - Returns the newly created `AssetWithHistory` object
- `CreateAssetInput` type defined in `packages/features/repair/src/types.ts`:
  ```ts
  type CreateAssetInput = {
    ownerId?: string;
    tenantId?: string;
    type: 'vehicle' | 'gadget' | 'appliance';
    specs: Record<string, any>;
  }
  ```
- **Note:** UI form to invoke this is not yet built (tracked in BACK-2-001)

**Key files:**
- `packages/features/repair/src/dal/asset.repo.ts` — `create()` method
- `packages/features/repair/src/types.ts` — `CreateAssetInput`, `JobTicketInput`

---

## ✅ BACK-2-C003 · Asset Create Form / Dialog

**Completed:** 2026-07-04
**Original Backlog ID:** BACK-2-001

**What was implemented:**
- The `+` button in `AssetDiscovery` now opens a **New Asset** dialog (`AssetCreateForm.tsx`).
- Asset type selector (vehicle / gadget / appliance) with **dynamic spec fields** per type (vehicle: plate,
  VIN, make, model, year, color, mileage; gadget: brand, model, serial, IMEI, color; appliance: brand,
  model, serial).
- Optional **Owner** via the reusable `EntityPicker` (BACK-0-C009) with inline customer create (BACK-0-C010).
- Submits to `POST /api/assets` (single-path; not the old Kysely repo) with `owner_id`; validates at least
  one detail is filled; on success the new asset is prepended to the results list.
- Added a shadcn-style **Dialog** to `@zorviz/ui` (Radix) since none existed.

**Verification:** frontend build clean; Playwright browser flow (login → Repair Shop → open New Asset dialog
→ customer picker visible) passed with zero console errors; owner picker create verified against live API.

**⚠️ Deviation from original spec:** submits via the HTTP API (`createAsset`) rather than
`repairModule.assets.create` — per the single-path architecture (D23).

**Key files:**
- `apps/desktop/src/features/repair/components/AssetCreateForm.tsx` (new)
- `apps/desktop/src/features/repair/components/AssetDiscovery.tsx`, `apps/desktop/src/components/entity-picker.tsx` (new)
- `apps/desktop/src/lib/repair-api.ts`, `apps/desktop/src/lib/customers-api.ts` (new)
- `packages/ui/src/components/ui/dialog.tsx` (new)

---

## ✅ BACK-2-C004 · Job Ticket — Create (Intake & Triage)

**Completed:** 2026-07-04
**Original Backlog ID:** BACK-2-004

**What was implemented:**
- **Migration 0001** (`0001_orders_intake.sql`) — `ALTER TABLE orders ADD COLUMN inspection TEXT`. First
  *incremental* migration (the DB now holds real setup/test data; no more squashing 0000_init).
- Rust `POST /api/orders` — creates a ticket at status `triage`; derives `customer_id` from the asset's
  owner; stores the inspection checklist as JSON. `GET /api/orders/:id` — returns the ticket with the
  nested `asset` (specs parsed) and `customer`, and `inspection` parsed to an array.
- **Intake form** (`IntakeForm.tsx`): launched from a "New Ticket" button on each asset card. Customer
  complaint (textarea) + a 5-item inspection checklist (OK / Issue / N/A + note on issues). On submit →
  creates the order → navigates to the ticket detail.
- **Job ticket detail page** (`pages/job-ticket.tsx`, route `/repair/ticket/:id`): status badge, asset,
  customer, complaint, inspection results.
- Reusable `StatusBadge` for the canonical `OrderStatus` flow.

**Verification:** cargo check + vite build clean; migration 0001 applied on existing data on boot (no
wipe); curl create/detail return `triage` + nested asset/customer + parsed inspection; Playwright UI flow
(login → search → New Ticket → complaint → Create → ticket detail shows Triage + complaint) passed, zero
console errors.

**⚠️ Deviations from original spec:** data access is the HTTP API (not a TS `OrderRepository`) per D23;
**photo upload deferred** (kept as BACK-2-011 — needs Tauri fs, same as the logo BACK-0-013).

**Key files:**
- `packages/db/migrations/sqlite/0001_orders_intake.sql` (new), `packages/db/src/types.ts`
- `apps/desktop/src-tauri/src/api_data.rs`, `apps/desktop/src-tauri/src/server.rs`
- `apps/desktop/src/lib/orders-api.ts` (new), `apps/desktop/src/features/repair/components/IntakeForm.tsx` (new)
- `apps/desktop/src/pages/job-ticket.tsx` (new), `apps/desktop/src/components/status-badge.tsx` (new)
- `apps/desktop/src/App.tsx`, `apps/desktop/src/features/repair/components/AssetDiscovery.tsx`

---

## ✅ BACK-2-C005 · Job Ticket — Estimation (Advisor)

**Completed:** 2026-07-04
**Original Backlog ID:** BACK-2-005 (also delivers basic inventory search/create — partial BACK-3-001/002 — and part linking column — partial BACK-3-006)

**What was implemented:**
- **Migration 0002** — `order_items.inventory_item_id TEXT` (nullable) to link a part line to inventory.
- Rust `PUT /api/orders/:id/estimate` — replaces line items, recomputes **subtotal/tax/total server-side**
  (tax rate from `app_config`, all integer centavos), sets status `estimate`. `GET /api/orders/:id` now
  returns `items`. Minimal inventory endpoints: `GET /api/inventory?q=` and `POST /api/inventory`
  (auto-generates a SKU from the name).
- **EstimateBuilder** dialog: add Service rows and add Part via the `EntityPicker` (search inventory or
  **inline-create** a part, D6/D7); per-line + subtotal/tax/discount/**total update live**; money entered in
  major units, stored/computed in centavos via `@zorviz/core` helpers (`toCentavos`/`fromCentavos`/`formatMoney`).
- Job ticket detail shows the estimate (line items + totals) and a Create/Edit Estimate button (shown while
  status is triage/estimate). Added `api.put`.

**Verification:** cargo check + vite build clean; curl — created a part, saved an estimate (service ₱500×1 +
part ₱450×2) → **subtotal 140000, tax 16800 @12%, total 156800, status estimate** (exact centavo math);
Playwright UI flow (new ticket → Create estimate → add service → Save → ticket shows Estimate + line + total),
zero console errors.

**⚠️ Remaining (tracked in Phase 3):** full inventory management page (BACK-3-003/004) and **stock deduction
on approval** (BACK-3-006 — the link column exists but stock isn't decremented yet). Data access via HTTP API (D23).

**Key files:**
- `packages/db/migrations/sqlite/0002_order_item_inventory.sql` (new), `packages/db/src/types.ts`
- `apps/desktop/src-tauri/src/api_data.rs`, `apps/desktop/src-tauri/src/server.rs`
- `apps/desktop/src/lib/inventory-api.ts` (new), `apps/desktop/src/lib/orders-api.ts`, `apps/desktop/src/lib/api.ts`
- `apps/desktop/src/features/repair/components/EstimateBuilder.tsx` (new), `apps/desktop/src/pages/job-ticket.tsx`

---

## ✅ BACK-2-C006 · Job Ticket — Customer Approval

**Completed:** 2026-07-04
**Original Backlog ID:** BACK-2-006

**What was implemented:**
- Rust `POST /api/orders/:id/approve` — records `approval_proof` as JSON `{approved_by, method, at}` and
  moves status `estimate → approved`. `order_detail` parses `approval_proof` to an object.
- `ApprovalDialog`: "Mark Approved" on an estimate → capture approver name + method (In person / Phone /
  Message) → approve. Ticket then shows "Approved by <name> · <method>" and the Approved status badge.

**Verification:** cargo check + vite build clean; curl approve → `approved` + parsed `approval_proof`;
Playwright UI flow (new ticket → estimate → Mark Approved → Approve → Approved record shown), zero console errors.

**⚠️ Per D5 deviations (intentional):** simple approval record only — **no signature pad, no OTP**.
**Inventory stock deduction on approval NOT done** — tracked in BACK-3-006.

**Key files:**
- `apps/desktop/src-tauri/src/api_data.rs`, `apps/desktop/src-tauri/src/server.rs`
- `apps/desktop/src/lib/orders-api.ts`, `apps/desktop/src/features/repair/components/ApprovalDialog.tsx` (new)
- `apps/desktop/src/pages/job-ticket.tsx`

---
