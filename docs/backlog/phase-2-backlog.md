# Phase 2 Backlog — Repair Module

> **Status:** Six open items — BACK-2-012 (Jobs date filter), BACK-2-013 (photo-note keyboard UX), BACK-2-014 (print job order at estimate), BACK-2-015 (mechanic dashboard cleanup + backup API gating), BACK-2-016 (Start Job mechanic-only), BACK-2-017 (ticket back-navigation). Everything else complete — core loop,
> asset detail/edit/soft-delete, lightweight bookings, photos + note threads, role-based Jobs views,
> Start Job + timing, cancel, discounts. Completed items live in [`phase-2-completed.md`](./phase-2-completed.md).
> **Scope:** Asset Management, Job Orders, Service History, Mechanic Views, Billing

---

## BACK-2-012 · Jobs Page — Date Filter (default: today)

**Priority:** 🟡 Medium
**Area:** `apps/desktop/src/pages/jobs.tsx` (+ optionally `list_orders` in `api_data.rs` for server-side filtering)
**Origin:** Owner request 2026-07-07.

**Description:**
The staff **Jobs** view (all jobs, all statuses) currently lists everything. Add a **date filter**:
a single-date picker **and** a from–to **date range**, and make the page **default to showing only
today's jobs**. Quick-select presets would make it fast in daily use (e.g. Today / This Week /
This Month / All / Custom range).

**Owner decisions already made:**
- Both a single date **and** a date range must be supported.
- **Default = today only.**

**Acceptance Criteria:**
- [ ] Staff Jobs view opens filtered to **today** by default (with a clear indicator + one-tap way
      to widen, e.g. an "All" chip)
- [ ] Single-date pick shows only jobs from that date
- [ ] Date-range pick (from–to, inclusive) shows jobs within the range
- [ ] Date filter composes with the existing **status filter chips** (e.g. "paid" + "this week")
- [ ] Mechanic **My Jobs** view is unaffected (it's the active work queue — approved/in_progress
      must never be hidden by a date)

**Open questions (decide at build time):**
- **Which date field?** `created_at` (intake date) is the natural default; consider whether
  done/paid jobs should instead match on `completed_at`/`updated_at` ("what did we finish today?").
- **Default-today vs. open work:** with a strict today-only default, yesterday's still-open jobs
  (triage/estimate/in-progress) disappear from the default view — decide whether open jobs should
  always show regardless of date, or keep the default strict (owner leaned strict "today").
- **Client vs. server filtering:** client-side over `scope=all` is simplest at shop scale;
  `?from=&to=` params on `GET /api/orders` scale better long-term.

---

## BACK-2-014 · Print Job Order at Estimate Stage (for customer signature)

**Priority:** 🟡 Medium (completes the paper-signature approval workflow shops already use)
**Area:** `apps/desktop/src/pages/job-ticket.tsx` (Estimate card), `apps/desktop/src/lib/invoice-pdf.ts`,
optionally `ApprovalDialog.tsx`
**Origin:** Owner request 2026-07-07.

**Description:**
While a ticket is at the **estimate** stage (the "Mark Approved" button is showing), add a
**print / download PDF** action so the advisor can hand the customer a printed Job Order to sign
(the existing layout already carries the **"Prepared by" / "Conformed"** signature lines and the
T&C block — it was designed for exactly this). Flow: print → customer signs the *Conformed* line →
advisor/admin taps **Mark Approved**.

**Current gap:** `generateInvoicePdf` works for any ticket, but the button only renders on the
Billing card (status `done`/`paid`). Nothing exposes it at the estimate stage.

**Build notes / considerations:**
- Reuse `generateInvoicePdf` as-is; the receipt line prints "(unbilled)" pre-billing, which is fine.
  Optionally annotate the printout at this stage (e.g. "FOR CUSTOMER APPROVAL" under the title) so a
  signed estimate copy isn't confused with the final billed document.
- Button placement: the Estimate card header (next to Create/Edit), shown when items exist and
  status is `triage`/`estimate` (perhaps also `approved`+ for reprints — decide at build).
- **ApprovalDialog:** consider adding a **"Signed job order"** method alongside In person / Phone /
  Message, so the approval record reflects the paper-signature flow.
- "Print" = the existing PDF download (D9 — no direct print dialog); the shop prints the PDF.

**Acceptance Criteria:**
- [ ] A ticket at `estimate` (with line items) offers a Job Order PDF download near "Mark Approved"
- [ ] The generated document includes line items, totals, T&C, and the Conformed signature line
      (already in the layout — regression-check)
- [ ] After printing/signing, Mark Approved works unchanged (record who + how)
- [ ] Optional: "Signed job order" approval method; optional stage annotation on the printout

---

## BACK-2-015 · Mechanic Dashboard — Hide Financial/Admin Elements (+ gate backup API)

**Priority:** 🟡 Medium (role hygiene; contains one real server-side gating gap)
**Area:** `apps/desktop/src/pages/dashboard.tsx`, `apps/desktop/src-tauri/src/api_data.rs` (backup handlers)
**Origin:** Owner request 2026-07-07 — hide from mechanics: the revenue tile, Repair Shop tile,
Settings tile, and Backup card.

**Assessment (agreed, per element):**
- **Month Revenue stat** — hide from mechanics. Financially sensitive; none of a mechanic's business.
  (Consider at build time whether "Pending Estimates" and "Low Stock" stay — both are harmless and
  Low Stock is arguably useful to a mechanic; "Active Jobs" definitely stays.)
- **Repair Shop tile** — hide. Asset search/create + intake is front-desk work; mechanics live in
  **My Jobs**. *Nuance:* a mechanic may legitimately want a vehicle's **service history** while
  working — consider (now or later) a link from the job ticket to the asset-detail page so that
  remains reachable without the Repair Shop entry point.
- **Settings tile** — hide. The page is already read-only for mechanics; zero value shown.
- **Backup ("Data") card** — hide, **and** fix the real gap found while logging this:
  `POST /api/backup`, `GET /api/backups`, `POST /api/restore`, `POST /api/backup-dir` are only
  **session-gated** — any logged-in mechanic could stage a database **restore** via the API.
  Gate server-side (restore/backup-dir at least `require_staff`, arguably admin-only; keep them
  exempt from the read-only license gate per D24). Hiding the card alone would be security theater.

**Resulting mechanic dashboard:** greeting/role, Active Jobs (± Low Stock), **My Jobs** tile,
theme switcher. Clean and focused on their work.

**Acceptance Criteria:**
- [ ] Mechanic dashboard shows no Month Revenue stat, no Repair Shop / Settings tiles, no Data
      (backup) card
- [ ] Admin/advisor dashboards unchanged
- [ ] Backup/restore endpoints role-gated server-side (mechanic → 403), still exempt from the
      read-only license gate (D24)
- [ ] Decide + implement: mechanic path to asset service history from the job ticket (or explicitly
      defer it)

---

## BACK-2-016 · "Start Job" Should Be a Mechanic-Only Action

**Priority:** 🟡 Medium (role correctness + protects the job-timing data)
**Area:** `apps/desktop/src/pages/job-ticket.tsx` (Work card), `start_order` in `api_data.rs`
**Origin:** Owner question 2026-07-07 — after approval the ticket shows "Start Job" to advisors and
admins too; owner believes it should be mechanic-only. **Confirmed correct:** the button has no role
gating today, and the server accepts any authenticated user.

**Why mechanic-only is right:**
- `started_at` exists to measure **mechanic work time** (BACK-2-C018's future report). A staff-pressed
  Start begins the clock with nobody working — corrupting the metric — and can put a job in
  `in_progress` with **no assignee** (auto-claim only fires for mechanics).
- Start is the mechanic's explicit "I'm working on this now" declaration.

**Proposed handling:**
- **UI:** render the "Start Job" button only for `role === "mechanic"`. For admin/advisor on an
  approved ticket, show a passive line instead — e.g. *"Waiting for {assigned mechanic || 'a
  mechanic'} to start"* — with the existing **Assign** action still available (that's the staff
  lever at this stage).
- **Server (authoritative):** `POST /api/orders/:id/start` → 403 unless the actor is a mechanic
  (auto-claim behavior unchanged).

**Open questions (decide at build time):**
- **On-behalf start:** in a shop where the mechanic has no phone, the advisor may genuinely need to
  start a job for them (e.g. a "Start as {mechanic}" action tied to the assignment, which would keep
  started_at meaningful by requiring an assignee). Owner's stated lean: strict mechanic-only.
- **Consistency of the execution card:** the work **checklist ticking** and **"Mark as Done"** are
  equally un-gated today. Same logic suggests mechanic-only — but staff may need to correct a
  mis-ticked item or close a job when the mechanic forgot. Decide: gate all execution actions, or
  Start only.

**Acceptance Criteria:**
- [ ] Advisor/admin no longer see "Start Job" on an approved ticket (see a waiting hint instead;
      Assign still available)
- [ ] Mechanic sees and can use Start Job unchanged (incl. auto-claim when unassigned)
- [ ] Server rejects non-mechanic `POST /:id/start` with 403 (can't be bypassed)
- [ ] Decision recorded for checklist/Mark-as-Done gating and for on-behalf start

---

## BACK-2-017 · Job Ticket Back Button Goes to Repair Shop Instead of Where You Came From

**Priority:** 🟡 Medium (navigation bug; extra-wrong for mechanics, who shouldn't land on Repair
Shop at all per BACK-2-015)
**Area:** `apps/desktop/src/pages/job-ticket.tsx` (header back button; `job-ticket.tsx:123`),
same treatment for `asset-detail.tsx`
**Origin:** Owner found while testing as a mechanic, 2026-07-07.

**Bug:**
The ticket header's back arrow is hardcoded to `navigate("/repair")`. A mechanic who goes
**My Jobs → job ticket → back** lands on the **Repair Shop** page instead of back on My Jobs.
The same wrongness hits every other entry path: staff **Jobs list → ticket → back** → Repair Shop;
**asset detail service history → ticket → back** → Repair Shop.

**Proposed fix:**
- Use **history back** (`navigate(-1)`) so "back" returns to wherever the user actually came from —
  fixes all entry paths at once.
- **Fallback for deep links / no history** (e.g. ticket opened directly after login): go somewhere
  role-appropriate — mechanic → `/jobs` (My Jobs), staff → `/jobs` or the dashboard. (React Router:
  `location.key === "default"` detects a fresh entry.)
- Apply the same pattern to **asset-detail**'s back button (currently also hardcoded `/repair` —
  usually correct today since assets are reached from the Repair search, but wrong once tickets
  link to asset history per BACK-2-015's nuance).

**Acceptance Criteria:**
- [ ] Mechanic: My Jobs → ticket → back returns to **My Jobs**
- [ ] Staff: Jobs → ticket → back returns to **Jobs** (filters ideally intact)
- [ ] Repair search → ticket → back returns to **Repair Shop** (current behavior preserved for that path)
- [ ] Asset detail → history → ticket → back returns to the **asset detail**
- [ ] Deep-linked ticket (no history) falls back sensibly by role (mechanic → My Jobs)

---

## BACK-2-013 · Photo Notes — Mobile Keyboard Covers the Input

**Priority:** 🟡 Medium (mobile UX bug — the phone flow is a core selling point)
**Area:** `apps/desktop/src/features/repair/components/TicketPhotos.tsx` (photo dialog + Notes thread)
**Origin:** Owner found while live-testing on a phone, 2026-07-07.

**Problem:**
In the photo detail dialog, when the **"Add a note…"** field gets focus on a phone, the on-screen
keyboard slides up **over the input** — the user can't see what they're typing. The dialog is
vertically packed (photo image + note thread + input + delete row), so the input sits near the
bottom of the viewport, exactly where the keyboard appears.

**Goal:** find a good mobile UX so the input (and ideally the newest notes) stay visible above the
keyboard while typing. Explore, prototype on a real phone, and pick — candidates:

1. **Keyboard-aware viewport handling** — use the `visualViewport` API (resize/scroll events) to
   add bottom padding / translate the dialog so the focused input stays above the keyboard; plus
   `scrollIntoView({block: "center"})` on focus. Also evaluate the
   `<meta name="viewport" content="... interactive-widget=resizes-content">` option (Chrome
   Android) so the layout viewport shrinks instead of the keyboard overlaying.
2. **Compact-on-focus layout** — when the note input is focused on a small screen, shrink the
   photo (thumbnail-height) and cap the thread's height so the input naturally sits high enough.
3. **Bottom-sheet compose mode** — tapping "Add a note" opens a minimal compose bar/sheet (input +
   send only, photo hidden) — the classic chat-app pattern; most work, best-feeling result.

**Acceptance Criteria:**
- [ ] On a real phone (LAN browser), focusing the note field keeps the field **fully visible**
      above the on-screen keyboard while typing
- [ ] The most recent note (or the thread's tail) remains visible where feasible
- [ ] No regression on desktop (dialog unchanged there)
- [ ] Verify on both Android Chrome and iOS Safari if available (their keyboard/viewport
      behaviors differ — `visualViewport` support/quirks vary)

---
