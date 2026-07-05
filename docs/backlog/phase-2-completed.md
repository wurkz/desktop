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

## ✅ BACK-2-C008 · Mechanic Assignment  &  ✅ BACK-2-C007 · Mechanic "My Jobs" + Execution

**Completed:** 2026-07-04 (built together as the mechanic view)
**Original Backlog IDs:** BACK-2-008, BACK-2-007

**What was implemented:**
- **Migration 0003** — `order_items.completed INTEGER DEFAULT 0` (mechanics check off work).
- Rust: `GET /api/users?role=` (active staff, never returns pin fields); `POST /api/orders/:id/assign`
  (set/clear mechanic); `GET /api/orders?assigned=me` (active job board — approved + in_progress, optionally
  filtered to the current user, each with a light nested asset); `PUT /api/order_items/:id/complete`
  (check/uncheck; auto-bumps `approved → in_progress` on first check); `POST /api/orders/:id/done`
  (`→ done`). `order_detail` now embeds the assigned `mechanic`.
- **Assignment** (`AssignDialog`) on the job ticket detail: shows the assignee + an Assign button listing
  staff; assign/unassign.
- **"My Jobs" mobile view** (`pages/jobs.tsx`, route `/jobs`, dashboard card): touch-friendly card list of
  the current user's active jobs (asset label, complaint, status badge, elapsed time); tap → ticket.
- **Execution** on the ticket detail (shown when approved/in_progress): a Work Checklist of line items with
  large checkboxes; checking updates completion (and starts the job); **Mark as Done** enables once all items
  are checked → status `done`.

**Verification:** cargo check + vite build clean; curl — mechanics list, assign (nested mechanic), complete
item (→ in_progress), mark done (→ done), job board count; Playwright full-loop UI (login → ticket → estimate
→ approve → **assign → check item → Mark as Done → Done** + My Jobs renders), zero console errors.

**Note:** assignment lists all active staff (any can be assigned); mobile-first layout (~430px, ≥44px targets)
per Plan.txt. Data access via HTTP API (D23).

**Key files:**
- `packages/db/migrations/sqlite/0003_order_item_completed.sql` (new), `packages/db/src/types.ts`
- `apps/desktop/src-tauri/src/api_data.rs`, `apps/desktop/src-tauri/src/server.rs`
- `apps/desktop/src/lib/users-api.ts` (new), `apps/desktop/src/lib/orders-api.ts`
- `apps/desktop/src/features/repair/components/AssignDialog.tsx` (new), `apps/desktop/src/pages/jobs.tsx` (new)
- `apps/desktop/src/pages/job-ticket.tsx`, `apps/desktop/src/App.tsx`, `apps/desktop/src/pages/dashboard.tsx`

---

## ✅ BACK-2-C009 · Job Ticket — Completion & Invoice

**Completed:** 2026-07-04 — **completes the core repair loop**
**Original Backlog ID:** BACK-2-009

**What was implemented:**
- Rust `POST /api/orders/:id/bill` — assigns a sequential receipt number (`INV-00001`, …) once (idempotent —
  re-billing keeps the same number) and sets status `paid`.
- **PDF invoice** (`lib/invoice-pdf.ts`, jsPDF): shop header from `app_config` (name, address, contact, tax
  ID, custom fields), invoice #/date, bill-to customer, asset, line-item table, subtotal/discount/tax/total
  (all formatted from centavos). Downloads as `invoice-<receipt|id>.pdf`.
- Job ticket **Billing card** (shown when done/paid): total, receipt number, "Invoice PDF" download, and
  "Mark as Paid" (done → paid).

**Verification:** cargo check + vite build clean; curl — bill → `paid` + `INV-00001`, total 33600 (30000 +12%),
re-bill idempotent; Playwright **full end-to-end loop** (login → ticket → estimate → approve → assign → check
→ Mark as Done → **download invoice PDF** → **Mark as Paid** → receipt shown), zero console errors.

**⚠️ Per D9 (intentional):** PDF export (jsPDF file), not the system print dialog. Status is `paid` (the
canonical D19 flow), not the original spec's `billed`.

**Key files:**
- `apps/desktop/src-tauri/src/api_data.rs`, `apps/desktop/src-tauri/src/server.rs`
- `apps/desktop/src/lib/invoice-pdf.ts` (new), `apps/desktop/src/lib/orders-api.ts`, `apps/desktop/src/pages/job-ticket.tsx`
- `apps/desktop/package.json` (jspdf)

---

## ✅ BACK-2-C010 · Asset Detail & Service History

**Completed:** 2026-07-05
**Original Backlog ID:** BACK-2-002

**What was implemented:**
- Rust `GET /api/assets/:id` (`api_data::get_asset`) — returns the asset with `specs` parsed to an object,
  the `owner` (customer, if any), and a `history[]` of every `order` linked to the asset (newest first),
  each row carrying status, customer complaint, total (centavos), created date, and assigned technician name.
- **Asset Detail page** (`pages/asset-detail.tsx`, route `/repair/asset/:id`): asset type icon + label, a
  spec grid (all `specs` key/values, human-cased labels), owner block, and a **Service History** list of past
  tickets (date, status badge, complaint, formatted total) — each row taps through to the ticket detail.
- **AssetDiscovery** cards are now tappable → navigate to the detail page; the "New Ticket" button on a card
  calls `e.stopPropagation()` so it doesn't also trigger the card navigation.
- `repair-api.ts`: `getAsset(id)` + `AssetDetail` / `ServiceHistoryItem` types.

**Verification:** cargo check + vite build clean; curl `GET /api/assets/:id` returned the vehicle with parsed
specs (plate ABC-1234) + `history` containing the triage ticket ("history test complaint"); Playwright browser
flow (search → tap asset card → URL becomes `/#/repair/asset/:id` → page shows Plate Number + Service History +
the ticket row with date/total/Triage status) passed with zero console errors.

**⚠️ Deviation from original spec:** data access is the HTTP API (`get_asset`), **not** TS
`AssetRepository.getById` / `getServiceHistory` methods (those repo methods were not added) — per the
single-path architecture (D23). `lastVisit` is expressed implicitly via the newest history row rather than a
dedicated `AssetWithHistory.lastVisit` field.

**Key files:**
- `apps/desktop/src-tauri/src/api_data.rs` (`get_asset`), `apps/desktop/src-tauri/src/server.rs` (route)
- `apps/desktop/src/pages/asset-detail.tsx` (new), `apps/desktop/src/App.tsx` (route)
- `apps/desktop/src/features/repair/components/AssetDiscovery.tsx`, `apps/desktop/src/lib/repair-api.ts`

---

## ✅ BACK-2-C011 · Asset Update & Soft-Delete

**Completed:** 2026-07-05
**Original Backlog ID:** BACK-2-003

**What was implemented:**
- Rust `PUT /api/assets/:id` (`update_asset`) — edits `specs` + `owner_id` (and bumps `updated_at`); 404 if the
  asset is missing or already soft-deleted. **Asset type is intentionally immutable** (see owner decision +
  BACK-1-006).
- Rust `DELETE /api/assets/:id` (`soft_delete_asset`) — sets `deleted_at` (never destroys data, D24). **Blocked
  with 409** and a clear message if the asset still has open job tickets (any status except `paid`/`cancelled`),
  so active work is never hidden. `search_assets` already excluded `deleted_at IS NULL`, so soft-deleted assets
  drop out of search automatically. No migration needed (`deleted_at` already existed).
- **Edit form** (`AssetEditForm.tsx`): pre-filled dialog reached from an **Edit** button on the Asset Detail
  header. Type is shown as a fixed, non-editable label ("Type can't be changed"); edits spec fields + owner
  (via the same `EntityPicker` inline-create). Shares `SPEC_FIELDS`/`AssetType` (now exported) with the create
  form; the verified create path was left untouched.
- **Delete** button + confirmation dialog on Asset Detail; on the 409 block it surfaces the server message in
  the dialog and keeps the asset. On success it navigates back to `/repair`.
- `api.del()` helper added; `repair-api.ts` gained `updateAsset()` + `deleteAsset()`.

**Verification:** tsc + vite build clean; Rust recompiled in dev. curl — edit persists (make/model added), 401
(no token), 409 with message deleting ABC-1234 (open triage ticket), 200 deleting a ticket-free asset, and it
then drops out of search. Playwright — Edit prefilled → add Color=Red → save → shown on page; delete-blocked
asset shows the "open job ticket" message and stays; ticket-free asset deletes via UI → lands on `/repair` and
is gone from search. Only console noise is the expected 409 network log (not a JS error).

**⚠️ Deviation from original spec:** implemented as HTTP endpoints, **not** `AssetRepository.update/softDelete`
TS methods (D23 single path). Added a **delete guard** (409 on open tickets) beyond the original spec, per the
owner decision.

**Key files:**
- `apps/desktop/src-tauri/src/api_data.rs` (`update_asset`, `soft_delete_asset`), `apps/desktop/src-tauri/src/server.rs`
- `apps/desktop/src/features/repair/components/AssetEditForm.tsx` (new), `.../AssetCreateForm.tsx` (exports)
- `apps/desktop/src/pages/asset-detail.tsx`, `apps/desktop/src/lib/repair-api.ts`, `apps/desktop/src/lib/api.ts`

---

## ✅ BACK-2-C012 · Lightweight Bookings + Convert-to-Ticket

**Completed:** 2026-07-05
**Original Backlog ID:** BACK-2-010
**Traces to:** D10 (unified booking/walk-in flow)

**What was implemented (owner decision: lightweight):**
A booking is a quick **call-ahead note** — customer name/phone + free-text note + time, *no asset yet*. When
the customer arrives, an **admin/advisor converts** it into the normal asset → job-ticket flow, pre-filled.

- **Migration 0006** rebuilds `bookings` (the original NOT NULL asset/customer FK table was never used):
  `customer_name, customer_phone, note, scheduled_time, status, asset_id (nullable), customer_id (nullable)`.
  Nullable links leave room to attach a known asset at booking time later, with no migration.
- **Rust** (`bookings.rs`): `GET /api/bookings` (active pending/confirmed by time; `?scope=all`),
  `POST /api/bookings` (create pending; requires a name or a note), `POST /api/bookings/:id/status`
  (`{status, asset_id?, customer_id?}` — advances status and links on convert). All **front-desk only**
  (owner/admin/advisor) via a new `require_staff` helper — mechanics get 403.
- **Bookings page** (`pages/bookings.tsx`, route `/bookings`, staff-gated dashboard card): upcoming list with
  **Confirm / Cancel / Convert** actions and a **New Booking** dialog (name, phone, note, datetime).
- **Convert** (the D10 convergence): creates a customer from the booking's name/phone, then opens the shared
  `AssetCreateForm` (owner pre-filled + a "From booking: …" note hint) → on asset create, opens the shared
  `IntakeForm` (complaint pre-filled from the note) → on ticket create, marks the booking `completed` and links
  the new asset + customer, then navigates to the ticket. Both dialogs gained small optional prefill props
  (`initialOwner`/`hint`, `initialComplaint`/`onCreated`).

**⚠️ Deviations from the original spec (intentional):** implemented via HTTP endpoints, not a
`BookingRepository` (D23). Because bookings are lightweight (no asset until convert), "Convert skips Asset
Recognition" became "Convert *is* the asset step, pre-filled" — the asset is picked/created at convert. Status
flow used: `pending → confirmed → completed` (+ `cancelled`); `in_progress` is available but the convert marks
`completed` once a ticket exists. Schedule lists active (pending/confirmed) bookings, not strictly "today".

**Verification:** builds clean; Rust recompiled in dev. curl — create/list/confirm, **mechanic 403** on
list+create, empty booking 400. Playwright — dashboard → Bookings → New Booking → **Convert** → New Asset opens
with owner pre-filled + note hint → pick Vehicle → create → Intake opens with the **complaint pre-filled** →
create ticket. API confirmed the converted booking is `completed` with asset+customer linked and gone from the
active schedule. Zero console errors.

**Key files:**
- `packages/db/migrations/sqlite/0006_bookings_lightweight.sql`, `packages/db/src/types.ts`
- `apps/desktop/src-tauri/src/bookings.rs` (new), `.../api_data.rs` (`require_staff`), `.../server.rs`, `.../lib.rs`
- `apps/desktop/src/lib/bookings-api.ts` (new), `apps/desktop/src/pages/bookings.tsx` (new)
- `apps/desktop/src/features/repair/components/{AssetCreateForm,IntakeForm}.tsx` (prefill props)
- `apps/desktop/src/App.tsx` (route), `apps/desktop/src/pages/dashboard.tsx` (card)

---

## ✅ BACK-2-C013 · Job-Ticket Photos + Note Threads

**Completed:** 2026-07-05 — **the last v1 feature**
**Original Backlog ID:** BACK-2-011
**Traces to:** D4 (phone camera over LAN)

**What was implemented (design finalized in a chat with the owner):**
Photos attach to a job ticket, captured straight from a mechanic's phone camera over LAN, each with an
append-only **note thread**. Reuses the logo `media/` upload+serve pattern (BACK-0-C013).

- **Migration 0007:** `order_photos (id, order_id, path, created_by, created_at)` + `photo_notes
  (id, photo_id, author, note, created_at)` (append-only log). Files at `media/orders/{order_id}/{uuid}.jpg`.
- **Rust** (added to `media.rs`): `POST /api/orders/:id/photos` (any authenticated staff, incl. mechanics;
  8 MB cap), `GET /api/orders/:id/photos` (photos newest-first, each with its notes oldest→newest),
  `GET /api/photos/:id` (**public** — streams bytes so same-origin `<img>` works), `POST /api/photos/:id/notes`
  (append a note; author from the session), `DELETE /api/photos/:id` (**advisor/admin only** via `require_staff`
  — removes file + row + notes; idempotent on disk).
- **Photos card on the Job Ticket** (`TicketPhotos.tsx`): thumbnail grid with a note-count badge; **Add Photo**
  opens the **camera on phones** (`accept=image/* capture=environment`); tapping a thumbnail opens the photo
  enlarged with a **Notes** thread (each note = author + timestamp, chronological) and an add-note field
  (Enter to send). Delete button shown to advisor/admin only. Lives in the shared ticket detail, so it's in the
  mobile My Jobs execution flow too.
- **Client-side downscale** before upload (`downscaleImage`: canvas → longest edge ≤1600px, 0.82 JPEG) to keep
  the shop PC lean and LAN fast; falls back to the original if canvas fails.
- `photos-api.ts` client; reuses the exported `API_BASE` for `photoUrl`.

**Permissions:** add photo + add note = any staff (admin/advisor/**mechanic**); delete photo = advisor/admin.
Notes are append-only (never edited/deleted) so they read as an audit trail. Labeled **"Notes"** in the UI.

**Verification:** builds clean; Rust recompiled in dev. curl — upload → `GET` 200 image → add note (author from
session) → list shows note; **mechanic add photo 200 + add note 200 + delete 403**; admin delete → `GET` 404.
Playwright — open ticket → Photos section → add photo (thumbnail count rises) → open photo → **Notes** thread →
add a note → it appears with author; delete button visible to admin. Zero console errors.

**⚠️ Notes / deviations:** implemented over the HTTP API (no Tauri fs plugin needed — works on phones too).
`GET /api/photos/:id` is public (same-origin `<img>`, unguessable UUID). Photos live under `media/`; the rolling
DB-only backups don't include them, but the **Full Backup** (BACK-0-C008 update, 2026-07-05) captures `media/`
— so photos are now covered. Intake-form-embedded capture was not added — photos are added on the ticket
(available immediately after intake), per the finalized design.

**Key files:**
- `packages/db/migrations/sqlite/0007_order_photos.sql`, `packages/db/src/types.ts`
- `apps/desktop/src-tauri/src/media.rs` (photo handlers), `.../server.rs` (routes)
- `apps/desktop/src/lib/photos-api.ts` (new), `apps/desktop/src/features/repair/components/TicketPhotos.tsx` (new)
- `apps/desktop/src/pages/job-ticket.tsx` (Photos card)

---
