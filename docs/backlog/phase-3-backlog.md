# Phase 3 Backlog — Commerce Module

> **Status:** 0% Complete  
> **Scope:** Inventory Management, Parts Catalog, Billing, Invoicing, Tax, Payments  
> **Completed items live in:** [`phase-3-completed.md`](./phase-3-completed.md)

---

## BACK-3-001 · `@zorviz/feature-inventory` Package Scaffold

**Priority:** 🔴 High (prerequisite for everything else in Phase 3)  
**Area:** `packages/features/inventory/`  
**Description:**  
The inventory package exists as a stub with only a `package.json`. It needs to be fully scaffolded with TypeScript config, source structure, and a compiled build before any features can be built.

**Acceptance Criteria:**
- [ ] `packages/features/inventory/tsconfig.json` created (extending `tsconfig.base.json`)
- [ ] `packages/features/inventory/src/index.ts` created with placeholder exports
- [ ] `packages/features/inventory/src/types.ts` — mirrors `InventoryTable` from `@zorviz/db`
- [ ] `packages/features/inventory/src/dal/inventory.repo.ts` — `InventoryRepository` class stub
- [ ] `InventoryModule` class created (mirrors `RepairModule` pattern)
- [ ] Package added to `apps/desktop/src/lib/db.ts` as `inventoryModule`
- [ ] `packages/ui` and `packages/db` listed as dependencies in `package.json`

---

## BACK-3-002 · Inventory Repository — Full CRUD

**Priority:** 🔴 High  
**Area:** `packages/features/inventory/src/dal/inventory.repo.ts`  
**Description:**  
Build all data-access methods for the `inventory` table.

**Acceptance Criteria:**
- [ ] `list(filters?: { lowStock?: boolean }): Promise<InventoryItem[]>`
  - Optional filter: `stock_on_hand <= reorder_point`
- [ ] `search(query: string): Promise<InventoryItem[]>` — by SKU or name
- [ ] `getById(id: string): Promise<InventoryItem | undefined>`
- [ ] `create(input: CreateInventoryInput): Promise<InventoryItem>`
- [ ] `update(id: string, input: Partial<CreateInventoryInput>): Promise<InventoryItem>`
- [ ] `adjustStock(id: string, delta: number): Promise<void>` — atomic increment/decrement
- [ ] `delete(id: string): Promise<void>` — hard delete (no soft-delete for inventory)

---

## BACK-3-003 · Inventory List Page (Advisor PC)

**Priority:** 🔴 High  
**Area:** `apps/desktop/src/pages/inventory.tsx`  
**Description:**  
Main inventory management page accessible from the Dashboard.

**Acceptance Criteria:**
- [ ] Route `/inventory` created and guarded by auth
- [ ] Dashboard "Inventory" module card no longer shows "Coming Soon"
- [ ] Table view: SKU, Name, Stock on Hand, Reorder Point, Unit Cost, Unit Price, Margin %
- [ ] "Low Stock" filter toggle highlights items at or below reorder point in red
- [ ] Search bar filters by SKU or name in real-time
- [ ] "Add Item" button opens creation form (BACK-3-004)
- [ ] Row click opens edit form

---

## BACK-3-004 · Inventory Create / Edit Form

**Priority:** 🔴 High  
**Area:** `apps/desktop/src/features/inventory/`  
**Description:**  
Form for creating and editing inventory items.

**Acceptance Criteria:**
- [ ] Fields: SKU (auto-generated or manual), Name, Description, Unit Cost, Unit Price, Reorder Point, Initial Stock
- [ ] SKU auto-generation: slug from name + random suffix
- [ ] Margin % calculated and displayed live from (Unit Price - Unit Cost) / Unit Cost
- [ ] On submit: calls `inventoryModule.items.create()` or `update()`
- [ ] Form accessible from Inventory List as Sheet/Dialog

---

## BACK-3-005 · Stock Adjustment UI

**Priority:** 🟡 Medium  
**Area:** `apps/desktop/src/features/inventory/`  
**Description:**  
Manual stock adjustments (receiving new stock, corrections) distinct from automated deductions by job orders.

**Acceptance Criteria:**
- [ ] "Adjust Stock" action on an inventory item
- [ ] Form: Adjustment Type (Receive / Correction / Write-Off), Quantity, Note
- [ ] Calls `inventoryModule.items.adjustStock(id, delta)`
- [ ] Adjustment logged to an `inventory_adjustments` table (new migration needed) with: `item_id`, `type`, `delta`, `note`, `user_id`, `created_at`

---

_(BACK-3-006 · Parts Linking to Job Tickets — ✅ completed 2026-07-06. The picker +
`order_items.inventory_item_id` link shipped in BACK-2-C005; **stock deduction on approval +
restock on cancel-after-approval** landed in the 2026-07-06 gap sweep (see `phase-3-completed.md`).
Stock may go negative — an oversell surfaces via the dashboard low-stock count rather than blocking
approval, per the "do not hard block" criterion; a proactive UI warning remains a nice-to-have for
the inventory-page work.)_

---

## BACK-3-007 · Billing & Payment Processing

**Priority:** 🟡 Medium  
**Area:** `apps/desktop/src/features/repair/` (extends Job Ticket billing)  
**Description:**  
After a job is done, the cashier processes payment. This is an extension of BACK-2-009 with proper payment tracking.

**Acceptance Criteria:**
- [ ] Payment form: Amount Tendered, Change Calculation
- [ ] Payment method: Cash / GCash / Card (selectable)
- [ ] `payments` table created (new migration): `id`, `order_id`, `method`, `amount`, `tendered`, `change`, `processed_by`, `created_at`
- [ ] `PaymentRepository.create(input)` method
- [ ] Receipt includes payment method and change returned
- [ ] `orders.status` → `billed` after payment recorded

---

## BACK-3-008 · Tax Configuration

**Priority:** 🟢 Low  
**Area:** `apps/desktop/src/stores/app-config.ts`, `packages/db/`  
**Description:**  
Tax rate should be configurable per tenant and applied consistently to all estimates.

**Acceptance Criteria:**
- [ ] `app_config` table gets `tax_rate` column (default `0.12` for PH VAT)
- [ ] Migration created for the new column
- [ ] Settings page (BACK-1-004) includes a Tax Rate input field
- [ ] Estimation UI reads `config.tax_rate` when computing tax amount
- [ ] Invoice clearly labels "VAT (12%)" line item

---
