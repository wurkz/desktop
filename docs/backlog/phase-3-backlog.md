# Phase 3 Backlog — Commerce Module

> **Status:** ~75% — inventory management (page + CRUD + stock adjustments + CSV import), parts linking, and stock deduction all done; 001 superseded by D23; 008 mostly done. Remaining: billing/payment methods (007, deferred), **VAT-inclusive pricing option (009)**.  
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

**Priority:** 🟢 Low — **mostly done already** (2026-07-07 note): `tax_rate` exists in `app_config`
(0000_init), Settings has the Tax Rate (%) field (BACK-1-C004), estimates compute from it
server-side, and the printout shows a Tax line (labeled "Tax"/"Tax (VAT-exempt)", not "VAT (12%)").
Remaining polish folds into **BACK-3-009** below.

**Original Acceptance Criteria:**
- [x] `app_config` table gets `tax_rate` column (default `0.12` for PH VAT)
- [x] Migration created for the new column *(part of 0000_init)*
- [x] Settings page (BACK-1-004) includes a Tax Rate input field
- [x] Estimation UI reads `config.tax_rate` when computing tax amount
- [ ] Invoice clearly labels "VAT (12%)" line item *(shows "Tax" — relabel with BACK-3-009)*

---

## BACK-3-009 · VAT-Inclusive Pricing Option (include vs. exclude — current) · *implemented, pending verification*

**Priority:** 🟡 Medium (PH market: BIR retail price tags are VAT-inclusive, so many shops quote
"all-in" prices)
**Area:** Settings (Currency & Tax card), `compute_totals` in `api_data.rs`,
`EstimateBuilder`/`DiscountsDialog` live math, `invoice-pdf.ts`, `app_config`
**Origin:** Owner request 2026-07-07.

**Description:**
Add a Settings toggle for how the tax rate is applied to line prices:

- **Excluded (current behavior, stays the default):** line prices are *net*; tax is **added on
  top** — `tax = subtotal × rate`, `total = subtotal + tax − discounts`.
- **Included (new):** line prices already **contain** the VAT; the tax shown is **back-computed**
  (the reverse): `embedded tax = gross × rate / (1 + rate)` (e.g. 12/112 of the price),
  `net = gross / (1 + rate)`, and the customer-facing total equals the sum of the line prices
  (minus discounts). The printout shows something like "Total ₱2,800 (VAT included: ₱300)".

**Key design considerations (decide at build time — money math, tread carefully):**
- **Storage semantics:** keep the DB canonical (`subtotal` = net, `tax`, `total`) in BOTH modes and
  only change how entered line prices are *interpreted* and how the breakdown is *displayed* — this
  keeps dashboard revenue/stats and existing orders consistent. An order should snapshot the mode
  it was computed under (or be immune to later toggles) so historical totals never shift.
- **Senior/PWD interaction (statutory):** the 20% is computed on the VAT-**exclusive** amount and
  the sale becomes VAT-exempt — in inclusive mode that means `price / (1+rate) × 0.80`, not 20% off
  the gross. `compute_totals` must handle this per mode.
- **Manual discount + max-discount cap:** define whether the discount and the cap % apply to the
  gross or the net in inclusive mode (customer-facing gross is the intuitive base).
- **Inventory prices & margin %:** in inclusive mode `unit_price` is gross — margin % on cost
  should compare net price vs cost, or be clearly labeled.
- **Rounding:** back-computed VAT on integer centavos needs a consistent rounding rule so
  net + tax always reconciles to the gross total.
- Relabel the printout tax line "VAT (12%)" / "VAT included (12%)" per mode (closes the last
  BACK-3-008 criterion).

**Decisions (2026-07-08, via interactive prototype):**
- **Discount base in inclusive mode = GROSS** (the customer-facing all-in price). Conveniently this
  equals today's exclusive behavior (% off the entered line-sum), so exclusive mode is byte-for-byte
  unchanged and the discount-cap check needs no change.
- **Rounding:** inclusive derives `net = round(entered/(1+rate))` and `tax = entered − net`, so
  `net + tax` reconciles exactly to the entered gross at the estimate stage. `set_discounts` (billing
  tweak) recomputes tax as `round(net·rate)` from the stored net — may differ by ≤1 centavo in rare
  edge cases; acceptable for a discount adjustment.
- **Storage stays canonical** (`subtotal`=net, `tax`, `total`) in both modes; the mode only changes
  how entered prices convert to net, the displayed subtotal (gross in inclusive), and labels. Historical
  orders keep their stored values (only recomputed on an explicit re-save). No per-order mode column.
- **Single source of math:** `@zorviz/core` `computeTotals()` mirrors the Rust `compute_totals` exactly;
  both client dialogs use it so previews match the server.

**Acceptance Criteria:**
- [ ] Settings → Currency & Tax gains a "Prices include tax" toggle (default **off** = current
      exclusive behavior; existing installs unchanged)
- [ ] Inclusive mode: estimate/discounts dialogs and the printout show the back-computed VAT and a
      customer total equal to the entered prices (minus discounts)
- [ ] Exclusive mode: unchanged (regression-verified)
- [ ] Senior/PWD discount is correct in both modes (20% on the net; VAT-exempt)
- [ ] Existing/historical orders are not re-computed when the setting changes
- [ ] Server (`compute_totals`) is the single source of the math; client previews match it exactly

---
