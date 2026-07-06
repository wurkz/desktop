# Phase 3 Backlog — Commerce Module

> **Status:** ~75% — inventory management (page + CRUD + stock adjustments + CSV import), parts linking, and stock deduction all done; 001 superseded by D23. Remaining: billing/payment methods (007), tax config UI (008) — both deferred past v1.  
> **Scope:** Inventory Management, Parts Catalog, Billing, Invoicing, Tax, Payments  
> **Completed items live in:** [`phase-3-completed.md`](./phase-3-completed.md)

---

_(BACK-3-001 · `@zorviz/feature-inventory` package scaffold — ❌ SUPERSEDED by D23 (2026-07-06).
The single-path architecture put all inventory logic in the Rust HTTP API; there is no TS repository
package to scaffold. Kysely-facing types live in `packages/db/src/types.ts` per convention.)_

---

_(BACK-3-002/003/004/005 — ✅ completed 2026-07-06 as one increment (inventory management page +
stock adjustments + CSV import), see `phase-3-completed.md` BACK-3-C002. Implemented via the HTTP API
(D23), not a TS repository.)_

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
