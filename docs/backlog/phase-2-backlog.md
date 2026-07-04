# Phase 2 Backlog — Repair Module

> **Status:** ~25% Complete (Asset Create done via single-path API)  
> **Scope:** Asset Management, Job Orders, Service History, Mechanic Views, Billing  
> **Completed items live in:** [`phase-2-completed.md`](./phase-2-completed.md)

---

## BACK-2-002 · Asset Detail / History View

**Priority:** 🔴 High  
**Area:** `apps/desktop/src/features/repair/components/`  
**Description:**  
Clicking an asset card in `AssetDiscovery` should open an Asset Detail view showing full specs and the complete service history (past job orders).

**Acceptance Criteria:**
- [ ] Tapping an asset card navigates to or opens an Asset Detail panel
- [ ] Displays: all specs, owner info (if any), asset type icon
- [ ] Service history section lists all past `orders` linked to this asset
  - Columns: Date, Status, Total, Technician
- [ ] `AssetRepository` gets a `getById(id)` method
- [ ] `AssetRepository` gets a `getServiceHistory(assetId)` method querying `orders` table
- [ ] `lastVisit` field in `AssetWithHistory` is populated from the most recent order

---

## BACK-2-003 · Asset Update & Soft-Delete

**Priority:** Medium  
**Area:** `packages/features/repair/src/dal/asset.repo.ts`  
**Description:**  
No update or delete operations exist in `AssetRepository`. Required for correcting data entry mistakes.

**Acceptance Criteria:**
- [ ] `AssetRepository.update(id, input)` method added
- [ ] `AssetRepository.softDelete(id)` sets `deleted_at` timestamp
- [ ] Soft-deleted assets are excluded from `search()` results by default
- [ ] Edit button on Asset Detail view opens a pre-filled form
- [ ] Delete requires confirmation dialog

---

## BACK-2-004 · Job Ticket — Create (Intake & Triage)

**Priority:** 🔴 High  
**Area:** `packages/features/repair/src/dal/`, `apps/desktop/src/features/repair/`  
**Description:**  
Core of the repair module. After selecting an asset, the advisor/mechanic creates a Job Ticket capturing the intake information.

**Acceptance Criteria:**
- [ ] `OrderRepository` created in `packages/features/repair/src/dal/order.repo.ts`
  - `create(input: CreateOrderInput): Promise<Order>` — inserts into `orders` with status `triage`
- [ ] `RepairModule` exposes `orders: OrderRepository`
- [ ] Intake form UI:
  - Customer complaint (free text)
  - Initial inspection checklist (at minimum 5 preset items with pass/fail/note)
  - Photo upload (stored as local file paths, not blobs)
- [ ] On submit: new `Order` row created, user navigated to Job Ticket detail
- [ ] Job Ticket status badge shows `TRIAGE`

---

## BACK-2-005 · Job Ticket — Estimation (Advisor)

**Priority:** 🔴 High  
**Area:** `apps/desktop/src/features/repair/`  
**Description:**  
From a Triage ticket, the Service Advisor builds an estimate by adding service line items and parts.

**Acceptance Criteria:**
- [ ] "Create Estimate" button on a TRIAGE ticket
- [ ] Line item builder:
  - Add Service row: description, quantity, unit price, total (auto-calculated)
  - Add Part row: select from Inventory (search by SKU/name), quantity, unit price, total
  - Support multiple rows
- [ ] Subtotal, Tax (configurable %), Discount, Grand Total calculated and displayed live
- [ ] "Save Estimate" writes all rows to `order_items` table and updates `orders.status = 'estimate'`
- [ ] `OrderRepository.addItems(orderId, items[])` method added

---

## BACK-2-006 · Job Ticket — Customer Approval

**Priority:** 🟡 Medium  
**Area:** `apps/desktop/src/features/repair/`  
**Description:**  
Customer must approve the estimate before work begins.

**Acceptance Criteria:**
- [ ] "Request Approval" button on an ESTIMATE ticket
- [ ] **Local approval:** On-screen signature pad component (canvas-based)
- [ ] Signature saved as base64 PNG stored in `orders.approval_proof`
- [ ] `orders.status` updated to `approved`
- [ ] Optional: 4-digit OTP approval flow (generated locally, customer reads it back verbally)
- [ ] Inventory allocation: reserved qty deducted from `stock_on_hand` for all Part line items

---

## BACK-2-007 · Mechanic Mobile — "My Jobs" View

**Priority:** 🔴 High (marked CRITICAL in plan)  
**Area:** `apps/desktop/src/features/repair/` or new mobile route  
**Description:**  
Mechanics use their phone to view and execute assigned jobs. This view must be touch-optimized with large tap targets.

**Acceptance Criteria:**
- [ ] Route `/jobs` accessible from the app
- [ ] Card-based list of jobs filtered to `assigned_mechanic_id = current_user.id` (or all jobs for now)
- [ ] Card shows: Asset name/plate, customer complaint summary, status badge, time elapsed
- [ ] Tapping a card opens the Job Execution view
- [ ] Job Execution view:
  - Lists all `order_items` as checklist rows
  - Each row has a checkbox — checking it marks as `completed`
  - Once all items checked, "Mark as Done" button appears
  - Confirms status → `in_progress` → `completed`
- [ ] Full mobile-first layout (max-width ~430px, large touch targets ≥44px)

---

## BACK-2-008 · Mechanic Assignment

**Priority:** 🟡 Medium  
**Area:** `packages/db/src/`, `packages/features/repair/`  
**Description:**  
Job tickets need to be assignable to a specific mechanic.

**Acceptance Criteria:**
- [ ] `orders` table gets `assigned_mechanic_id` column (migration required)
- [ ] Advisor can assign/reassign a mechanic from the ticket detail view
- [ ] "My Jobs" view filters by `assigned_mechanic_id = current_user.id`
- [ ] Unassigned jobs visible to admin/advisor with an "Assign" button

---

## BACK-2-009 · Job Ticket — Completion & Invoice

**Priority:** 🟡 Medium  
**Area:** `apps/desktop/src/features/repair/`  
**Description:**  
After work is done, the advisor generates an invoice and marks the ticket as paid.

**Acceptance Criteria:**
- [ ] "Generate Invoice" button on a DONE ticket
- [ ] Invoice preview shows: shop name (from app_config), asset info, customer, line items, subtotal, tax, total
- [ ] "Mark as Paid" button sets `orders.status = 'billed'`
- [ ] Invoice printable (Tauri print dialog or PDF export)
- [ ] Receipt number auto-generated (sequential or UUID-based)

---

## BACK-2-010 · Booking CRUD

**Priority:** 🟢 Low  
**Area:** `packages/features/repair/src/dal/`, `apps/desktop/src/features/repair/`  
**Description:**  
`BookingsTable` schema exists but has no repository or UI.

**Acceptance Criteria:**
- [ ] `BookingRepository` created with `create`, `list`, `updateStatus` methods
- [ ] "Today's Schedule" view on dashboard or repair page showing pending bookings
- [ ] "Convert to Job Ticket" action on a booking skips the Asset Recognition step
- [ ] Booking status transitions: `pending` → `confirmed` → `in_progress` → `completed`

---

## BACK-2-011 · Photo Capture & Local File Store

**Priority:** 🟡 Medium  
**Area:** `apps/desktop/src-tauri/`, `apps/desktop/src/features/repair/`  
**Description:**  
The intake form requires photo uploads. Photos should be saved to the local filesystem (not SQLite blobs) and referenced by path.

**Acceptance Criteria:**
- [ ] Tauri `fs` plugin used to save uploaded images to `{app_data_dir}/media/{order_id}/`
- [ ] File paths stored as JSON array string in `orders` table (or separate `order_photos` table)
- [ ] Photo thumbnail grid displayed in Intake form and Job Ticket detail
- [ ] Delete photo removes file from disk and updates record

---
