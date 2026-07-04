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
