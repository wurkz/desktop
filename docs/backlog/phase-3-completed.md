# Phase 3 Completed — Commerce Module

> Items here have been **fully implemented and verified**.  
> When an item from [`phase-3-backlog.md`](./phase-3-backlog.md) is finished, move it here and fill in the implementation details.

---

## ✅ BACK-3-C006 · Parts Linking + Stock Deduction on Approval

**Completed:** 2026-07-06 (final piece landed in the pre-ship gap sweep)
**Original Backlog ID:** BACK-3-006

**What was implemented:**
- Picker + link (done earlier in BACK-2-C005): "Add Part" in the estimate uses the searchable inventory
  `EntityPicker` (with inline create); selection auto-fills description/price and links
  `order_items.inventory_item_id` (migration 0002).
- **Stock deduction on approval (D6):** `approve_order` now calls `adjust_stock_for_order(sign=-1)` —
  each inventory-linked line item's quantity is subtracted from `inventory.stock_on_hand`. Deducted
  **exactly once**: the new transition guard only allows `estimate → approved`, so re-approval is impossible.
- **Restock on cancel:** cancelling a job that was already approved/in_progress/done adds the linked
  quantities back (`sign=+1`), so inventory doesn't drift when work is called off.
- Stock **may go negative** (oversell) — it surfaces via the dashboard low-stock count instead of blocking
  the shop mid-approval, per the "warn, do not hard block" criterion.

**⚠️ Deviation:** implemented in the Rust HTTP API (D23), not a TS `adjustStock()`; the proactive "stock
would go negative" warning in the estimate UI is deferred to the inventory-page work (BACK-3-003/004).

**Verification:** curl — fresh part → estimate with 2 pcs linked → approve → stock −2 (deducted; also
demonstrates the allowed-negative/oversell path, since `create_inventory` starts parts at 0) → **re-approve
blocked (409, no double-deduct)** → cancel → stock back to 0 (restocked). Note: `POST /api/inventory`
currently ignores an initial `stock_on_hand` (parts start at 0) — stock intake belongs to the inventory
management page (BACK-3-003/005).

**Key files:**
- `apps/desktop/src-tauri/src/api_data.rs` (`approve_order`, `adjust_stock_for_order`, `cancel_order`)

---

## ✅ BACK-3-C002 · Inventory Management + CSV Import (covers BACK-3-002/003/004/005)

**Completed:** 2026-07-06 — built as one increment, plus **CSV import for inventory AND customers**
(owner request: shops onboarding existing parts catalogs / customer lists).

**What was implemented (migration 0014):**
- **Endpoints** (`inventory.rs`; search/create stay in `api_data.rs`): `GET /api/inventory/all` (full list,
  `?low=1` = at/below reorder point), `PUT /api/inventory/:id` (edit; stock changes only via adjust),
  `DELETE /api/inventory/:id` (hard delete per spec, but **409 when referenced by job lines** so history
  survives), `POST /api/inventory/:id/adjust` (**Receive / Correction / Write-Off** + signed delta + note,
  applied atomically and **logged to `inventory_adjustments`** with the acting user),
  `GET /api/inventory/:id/adjustments`. `create_inventory` now honors description / **initial stock** /
  reorder point (closes the sweep-noted gap). All writes **staff-only** (owner/admin/advisor; mechanic 403).
- **Bulk imports:** `POST /api/inventory/import` (dedupe by SKU or case-insensitive name) and
  `POST /api/customers/import` (dedupe by name+phone) — both return `{imported, skipped}` counts.
- **`/inventory` page** (staff; dashboard tile enabled — "Coming Soon" finally gone): table with SKU, Name,
  Stock, Reorder, Cost, Price, **Margin %**; **Low stock** toggle + red row highlight; live SKU/name search;
  **Add/Edit dialog** with live margin, initial stock, and guarded Delete; **Adjust Stock dialog**
  (type + qty + note, shows the resulting level); **Import CSV** button with a result report and a column
  hint. Customers CSV import lives in **Settings → Data Import** (admin).
- **CSV parsing is client-side** (`lib/csv.ts`: quoted fields, `""` escapes, CRLF; forgiving header aliases
  like `qty`/`stock`, `price`/`unit_price`, `mobile`/`phone`) — the server receives clean JSON and dedupes.
  Money columns are entered in major units and converted to centavos.
- BACK-3-001 (TS package scaffold) marked **superseded by D23** — logic lives in the Rust API by design.

**Verification:** builds clean; migration 0014 applied. curl — create honors initial stock; update; receive
+5/write-off −2 with a correct author-stamped log; delete of a referenced part → 409 with message, clean
delete → 200; mechanic write → 403; inventory import → `{imported:3, skipped:1}` (duplicate name skipped);
customers import → `{imported:2, skipped:1}` (duplicate name+phone skipped); `?low=1` filters. Playwright —
tile (admin yes / mechanic no), table renders imported parts with margin, low-stock toggle hides healthy
items, Add Item shows live 50% margin and lands in the table, Adjust Stock 6→10, **real file-input CSV
imports** for both parts (report "2 added") and customers ("1 added"). Zero console errors.

**Key files:**
- `packages/db/migrations/sqlite/0014_inventory_adjustments.sql`, `packages/db/src/types.ts`
- `apps/desktop/src-tauri/src/inventory.rs` (new), `.../api_data.rs` (create_inventory), `.../server.rs`, `.../lib.rs`
- `apps/desktop/src/pages/inventory.tsx` (new), `apps/desktop/src/lib/{csv.ts (new), inventory-api.ts, customers-api.ts}`
- `apps/desktop/src/pages/{dashboard,settings}.tsx`, `apps/desktop/src/App.tsx`

---

<!-- TEMPLATE — copy this block when completing an item

## ✅ BACK-3-C00X · [Item Title]

**Completed:** YYYY-MM-DD  
**PR / Commit:** #xxx or commit hash

**What was implemented:**
- ...

**Key files:**
- `path/to/file.ts`

-->
