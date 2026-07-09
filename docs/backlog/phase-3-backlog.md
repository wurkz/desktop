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

## BACK-3-007 · Billing & Payment Processing · *implemented, pending verification*

**Priority:** 🟡 Medium  
**Area:** `apps/desktop/src/features/repair/` (extends Job Ticket billing)  
**Description:**  
After a job is done, the cashier processes payment. This is an extension of BACK-2-009 with proper payment tracking.

**Build notes / deviations (2026-07-08):**
- **Kept status `paid`, did NOT add a `billed` status.** The canonical flow (D19) uses `paid`; a new
  `billed` state would break the `OrderStatus` enum, badges, and gating. "Billed" = the existing
  `paid` state. Deviates from the AC's "status → billed" wording deliberately.
- **No JS `PaymentRepository`** (that's the pre-D23 Kysely-module pattern) — the equivalent is the
  Rust `bill_order` handler recording the payment server-side. Data path stays HTTP API.
- **Column `change_due`** (not `change`) to avoid SQL-keyword ambiguity.
- Methods **Cash / GCash / Card**; tendered/change apply to Cash, GCash/Card are exact. Change clamped
  ≥ 0; the dialog blocks a short cash tender. Payment recorded once (re-billing idempotent).

**Acceptance Criteria:**
- [ ] Payment form: Amount Tendered, Change Calculation
- [ ] Payment method: Cash / GCash / Card (selectable)
- [ ] `payments` table created (new migration): `id`, `order_id`, `method`, `amount`, `tendered`, `change`, `processed_by`, `created_at`
- [ ] `PaymentRepository.create(input)` method
- [ ] Receipt includes payment method and change returned
- [ ] `orders.status` → `billed` after payment recorded

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

## BACK-3-010 · Expenses Log · *implemented, pending verification*

**Priority:** 🔴 High (unlocks the profit picture — key cloud-subscription driver)
**Origin:** Owner-approved financial audit, 2026-07-08.
Money-out tracking: amount, category (parts/salary/utilities/rent/misc), note, paid-from-drawer
flag, author. Staff can record; immutable log with soft **void** (admin) instead of delete (sync
has no hard deletes). Feeds cloud P&L (revenue − expenses) and the drawer reconciliation.

---

## BACK-3-011 · Cash Drawer Sessions (Open/Close Day) · *implemented, pending verification*

**Priority:** 🔴 High (leakage/theft visibility — THE absentee-owner feature)
**Origin:** Owner-approved financial audit, 2026-07-08.
Manual drawer card on the staff dashboard (no nagging prompts): **Open day** records the float;
**Close day** computes expected cash = float + cash payments − drawer-paid expenses (session-based,
opened_at→close), staff enters counted cash, system records **over/short**. One open session at a
time; skipped days simply show unreconciled.

---

## BACK-3-012 · Partial Payments & Receivables · *implemented, pending verification*

**Priority:** 🔴 High ("who owes me?" — utang/balance tracking)
**Origin:** Owner-approved financial audit, 2026-07-08.
Multiple payments per order: PaymentDialog gains Full/Partial; `payments.amount` becomes the
per-payment amount; change = tendered − amount. Receipt number assigned at first payment; status
flips to `paid` only when the balance reaches zero (a `done` ticket shows "Balance due"). Billing
card lists payment history + Record payment; overpaying the balance is rejected. Invoice PDF shows
paid-to-date + balance when partially paid.

---

## BACK-3-013 · COGS Snapshot + Action Attribution · *implemented, pending verification*

**Priority:** 🟡 Medium (true margins + leakage attribution)
**Origin:** Owner-approved financial audit, 2026-07-08.
`order_items.cost_at_sale` snapshots the linked part's `unit_cost` when the estimate is saved
(true gross margin, immune to later cost edits). Attribution stamps (actor name, matching the
photos/payments pattern): `orders.created_by` (intake), `orders.cancelled_by`, `orders.discounted_by`.
All invisible — no UI input added. (Comeback/warranty flag deliberately deferred.)

---

## BACK-3-014 · Cloud — Gross-Margin Tile (pro-rata COGS) · *implemented, pending verification*

**Priority:** 🟡 Medium · **Origin:** owner-approved inventory/cash-flow audit, 2026-07-09.
Money section gains **Gross margin {period}**: revenue − pro-rata COGS, where each payment carries
its share of the order's COGS (`Σ cost_at_sale × qty`, services = 0) × amount/total — same basis
as the VAT tile (decision B). Data already exists (BACK-3-013 snapshots).

---

## BACK-3-015 · Cloud — Inventory Valuation Stat · *implemented, pending verification*

**Priority:** 🟢 Low · **Origin:** same audit.
Ops-visible stat: **Inventory value** = Σ max(stock_on_hand, 0) × unit_cost — the capital sitting
on shelves. Ops per the owner's "inventory = operations" ruling (admins see it).

---

## BACK-3-016 · Receive ↔ Expense Linking + Supplier Payables (on account) · *implemented, pending verification*

**Priority:** 🔴 High (kills the buy-side double entry; adds the Payables number)
**Origin:** owner-designed 2026-07-09 (all money fields soft/optional — skip = today's behavior).
Receive in Adjust Stock gains a money section with four soft modes:
**Record payment** (total paid + from-drawer → auto-creates a linked `parts` expense),
**Link existing expense** (picker of recent unlinked parts expenses — cash was logged earlier),
**Charged to account** (amount owed captured, NO expense — supplier credit → payables),
**Skip** (blank, unchanged behavior). Optional "update item cost" checkbox when the implied unit
cost differs. Settlement: Add-Expense (parts) gains an optional "pays for a stock receive" picker
of outstanding on-account receives → links + clears the payable on the day cash actually moves.
Schema: `inventory_adjustments` + `expense_id`, `total_cost`, `on_account`. Outstanding payables =
`on_account=1 AND expense_id IS NULL`. Cloud money tile: **Owed to suppliers**. Supplier identity =
note text for v1 (suppliers table reserved). Voiding a linked expense never un-receives stock.

---

## BACK-3-017 · Drawer Cash In / Cash Drop (mid-day movements) · *implemented, pending verification*

**Priority:** 🔴 High (without it, top-ups/safe-drops falsely show over/short at close)
**Origin:** owner question 2026-07-09 — no way to add/remove drawer cash mid-session today.
POS-style paid-in/paid-out: `drawer_movements` (type `cash_in` | `cash_drop`, amount, note, author,
created_at; append-only, synced). **Not expenses** — location change, not spending; profit untouched.
Drawer card (open session) gains **Cash In** / **Cash Drop** buttons (amount + note, confirmed).
Close formula becomes: expected = float + cash payments − drawer expenses **+ cash ins − cash drops**
(session window). Safe-drop trail doubles as anti-theft visibility for the owner.

---

## BACK-3-018 · Printable Documents & Reports Suite (PDF-first) · *Tier 1+2 implemented, pending verification*

**Priority:** 🔴 High (high-conversion feature set; **foundation/dependency of BACK-1-005 Hardware IO**)
**Origin:** Owner request 2026-07-09 — catalog every printable document/report worth generating;
PDF download first (the jsPDF + embedded-₱-font + saved-to-Downloads infra already exists), and
the same renderers later re-target 58/80mm thermal width when BACK-1-005 adds device printing.

**Already shipped (for reference):** Invoice/Job Order PDF, estimate-stage Job Order
("FOR CUSTOMER APPROVAL"), Connect-QR PDF.

**Tier 1 — the deliverable of this item (data fully captured today):**
1. **End-of-Day (Z-reading) report** — per drawer session: float, cash sales, drawer expenses,
   cash-ins/drops, expected vs counted, over/short, payments by method, jobs completed.
   *Placement:* drawer card — offered right at Close Day (+ reprint from last closed session).
2. **Payment receipt / acknowledgment** — per payment row (esp. partials: amount received,
   method, balance remaining). *Placement:* Billing card, per payment-history line.
3. **Statement of Account (SOA)** — per customer: unpaid balances across jobs (the utang
   collector). *Placement:* customer/receivables context (decide exact entry point at build).
4. **Reorder list** — low-stock items with suggested quantities + last cost (the supplier
   shopping list). *Placement:* Inventory page, low-stock filter.

**Tier 2 — follow-up items when Tier 1 lands:** P&L summary (period), Senior/PWD discount report
(BIR compliance — OSCA IDs + amounts are captured), VAT summary (pro-rata breakdown), mechanic
productivity (jobs + wrench time; commission/payroll input), payables report.
*Tier 2 built 2026-07-09:* `/reports` page (staff-only dashboard tile) with period presets
(Today/Week/Month/All/Custom) driving all five reports; Rust endpoints `financial_summary`
(pro-rata VAT/COGS/discounts per decision B), `senior_pwd_report`, `mechanic_report`; payables
reuses `listPayables`. All five E2E-verified via Playwright download capture — P&L, VAT set-aside
(₱107.14 pro-rata on ₱1,000 partial), Senior/PWD empty-state, mechanic wrench time, ₱450 payable.

**Tier 3 — later:** vehicle service-history printout, sales-by-period detail, stock-movement log,
gate pass / release slip.

**Build notes:**
- Shared report-PDF helper (header w/ shop identity + logo, period line, table renderer, totals
  row, generated-by/at footer) so each document is a thin layout on common infrastructure.
- All documents follow D9: PDF download + saved-to-Downloads toast; no direct print dialog.
- Local-first: reports render from local data on the desktop (work fully offline). Cloud-side
  equivalents can come later for the owner's remote view.
- **BACK-1-005 relationship:** this suite is the content foundation — the hardware item then only
  adds transport (thermal/ESC-POS rendering + device discovery), not new documents.

**Acceptance Criteria (Tier 1):**
- [ ] Shared report-PDF infrastructure (shop header, period, tables, ₱ rendering)
- [ ] EOD/Z report generable at close (and reprintable for the last session), numbers matching the
      drawer session exactly
- [ ] Per-payment receipt with balance remaining; partial-payment acknowledgment covered
- [ ] Customer SOA listing open balances across jobs
- [ ] Reorder list from the low-stock filter
- [ ] All render offline, download as PDF with the standard toast

---
