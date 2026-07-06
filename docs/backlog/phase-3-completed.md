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

<!-- TEMPLATE — copy this block when completing an item

## ✅ BACK-3-C00X · [Item Title]

**Completed:** YYYY-MM-DD  
**PR / Commit:** #xxx or commit hash

**What was implemented:**
- ...

**Key files:**
- `path/to/file.ts`

-->
