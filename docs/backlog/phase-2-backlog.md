# Phase 2 Backlog — Repair Module

> **Status:** Fourteen open items — BACK-2-015 (mechanic dashboard cleanup + backup API gating — *implemented, pending verification*), BACK-2-016 (Start Job mechanic-only), BACK-2-017 (ticket back-navigation — *implemented, pending verification*), BACK-2-018 (Appearance -> Settings), BACK-2-019 (mobile one-row KPI strip), BACK-2-020 (billing actions staff-only), BACK-2-021 (case-insensitive usernames), BACK-2-022 (slide-to-confirm on actions), BACK-2-023 (assign staff-only), BACK-2-024 (responsive estimate dialog), BACK-2-025 (dyslexia-friendly mode), BACK-2-026 (de-emphasize trial banner), BACK-2-027 (QR-code login + printable QR), BACK-2-028 (mechanic checklist completion UX + confirmation). Everything else complete — core loop,
> asset detail/edit/soft-delete, lightweight bookings, photos + note threads, role-based Jobs views,
> Start Job + timing, cancel, discounts. Completed items live in [`phase-2-completed.md`](./phase-2-completed.md).
> **Scope:** Asset Management, Job Orders, Service History, Mechanic Views, Billing

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
- **Settings tile** — ~~hide~~ **REVISED by owner 2026-07-07: keep for ALL roles.** Every user can
  open Settings, but the page shows **role-filtered sections**: mechanics do NOT see shop/financial
  config (tax configuration, max discount, shop details/proprietor/VAT, printed document, asset
  types, data import, logo) — they see only the personal sections (Appearance/theme, and the
  dyslexia toggle once BACK-2-025 lands). Admin/owner see everything (editable); advisor keeps
  today's read-only view of shop config (or trim similarly — decide at build). This also resolves
  the interplay flagged in BACK-2-018/025 (theme + accessibility must reach mechanics).
- **Backup ("Data") card** — hide, **and** fix the real gap found while logging this:
  `POST /api/backup`, `GET /api/backups`, `POST /api/restore`, `POST /api/backup-dir` are only
  **session-gated** — any logged-in mechanic could stage a database **restore** via the API.
  Gate server-side (restore/backup-dir at least `require_staff`, arguably admin-only; keep them
  exempt from the read-only license gate per D24). Hiding the card alone would be security theater.

**Resulting mechanic dashboard:** greeting/role, Active Jobs (± Low Stock), **My Jobs** tile,
**Settings** tile (opens the trimmed, personal-sections-only view), theme switcher (until
BACK-2-018 moves it into Settings). Clean and focused on their work.

**Acceptance Criteria:**
- [ ] Mechanic dashboard shows no Month Revenue stat, no Repair Shop tile, no Data (backup) card
- [ ] Settings tile visible to **all roles**; for mechanics the page shows only personal sections
      (no tax config, no discounts/max discount, no shop identity/document/asset-types/import/logo)
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

## BACK-2-018 · Move the Appearance (Theme) Card from Dashboard into Settings

**Priority:** 🟢 Low (dashboard declutter)
**Area:** `apps/desktop/src/pages/dashboard.tsx` (Appearance card, ~line 193), `apps/desktop/src/pages/settings.tsx`
**Origin:** Owner request 2026-07-07.

**Description:**
Remove the **Appearance** card (ThemeSwitcher) from the dashboard and house it in the **Settings**
page instead (e.g. its own small "Appearance" card near the top). Declutters the dashboard, which
has grown tiles.

**Interplay to resolve at build time (flagged):**
- **Resolved by the owner's 2026-07-07 revision of BACK-2-015:** Settings stays visible to ALL
  roles with role-filtered sections — mechanics see the personal sections (Appearance incl. this
  theme switcher, plus BACK-2-025's dyslexia toggle) and none of the shop/financial config. So
  option (a): Appearance is visible + usable by every role.
- Settings' admin-only read-only gating (`ro`) must NOT disable the theme switcher — theme is
  local preference, not `app_config`.

**Acceptance Criteria:**
- [ ] Appearance card gone from the dashboard
- [ ] Theme switcher available in Settings, usable regardless of the page's admin read-only gating
- [ ] Every role (incl. mechanics) still has a way to change theme (per the BACK-2-015 decision)
- [ ] Theme choice persists as it does today

---

## BACK-2-019 · Mobile Dashboard — Compact One-Row KPI Strip

**Priority:** 🟡 Medium (mobile-first rule from Plan.txt; action tiles must be reachable fast)
**Area:** `apps/desktop/src/pages/dashboard.tsx` (Stats Cards grid, `grid-cols-1 md:grid-cols-4`)
**Origin:** Owner request 2026-07-07.

**Problem:**
On mobile the four KPI cards (**Active Jobs, Pending Estimates, Low Stock, This Month**) render as
`grid-cols-1` — four stacked full-height cards — pushing the **action tiles** (My Jobs / Jobs,
Bookings, …) below the fold. Users must scroll before they can act.

**Owner decision:** on mobile, keep the KPIs in **one full-width row** (all four side by side,
compact) so **at least the first 2–3 action tiles are visible immediately** without scrolling.

**Build notes:**
- `grid-cols-4` at all breakpoints, with a compact mobile cell: smaller padding, number-first
  layout, short/abbreviated labels on small screens (e.g. "Jobs / Estimates / Low Stock / Month"),
  and compact money formatting for the revenue figure if needed (e.g. ₱6.4k) so 4 cells fit ~360px.
- Desktop keeps the current comfortable 4-card look (`md:` styles unchanged).
- Interplay with **BACK-2-015**: mechanics will see fewer stats (no revenue) — the strip should lay
  out cleanly with 2–3 cells too.
- Verify on a real phone (~360–430px): KPI strip is one line; ≥2 action tiles visible on first paint.

**Acceptance Criteria:**
- [ ] Mobile: all four KPIs on one full-width row (no wrap, no horizontal scroll at 360px)
- [ ] Mobile: at least the first 2–3 action tiles visible without scrolling on first load
- [ ] Desktop layout unchanged
- [ ] Strip degrades cleanly when fewer stats are shown (BACK-2-015 mechanic view)

---

## BACK-2-020 · Billing Actions (Mark as Paid, Invoice PDF) — Staff Only

**Priority:** 🟡 Medium (role correctness; includes a server-side gating gap)
**Area:** `apps/desktop/src/pages/job-ticket.tsx` (Billing card), `bill_order` in `api_data.rs`
**Origin:** Owner found while testing as a mechanic, 2026-07-07 — Mark as Paid and Invoice PDF show
for mechanics; should be advisor/admin/owner only.

**Confirmed current state:**
- **Invoice PDF** button: no role gate (mechanics see it).
- **Mark as Paid**: gated only by `status === "done"` — mechanics see and can press it.
- (Discounts is already correctly `isStaff`-gated.)
- **Server:** `POST /api/orders/:id/bill` is only session-gated — a mechanic could mark an order
  paid via the API directly. Same class of gap as the backup endpoints (BACK-2-015).

**Proposed handling:**
- **UI:** gate the Invoice PDF and Mark as Paid buttons with the existing `isStaff`
  (owner/admin/advisor). Billing/collecting money is front-desk work; the mechanic's job ends at
  **Mark as Done**.
- **Server (authoritative):** `bill_order` → `require_staff` (mechanic → 403).
- **Decide at build:** whether mechanics should see the **Billing card at all** on a done/paid
  ticket (totals/receipt are revenue-adjacent info) — hiding the whole card for mechanics is
  consistent with BACK-2-015's revenue-hiding; alternatively keep the card visible with no actions.

**Acceptance Criteria:**
- [ ] Mechanic on a done/paid ticket sees no Mark as Paid and no Invoice PDF (card visibility per
      the build-time decision)
- [ ] Advisor/admin/owner unchanged
- [ ] Server rejects a mechanic `POST /:id/bill` with 403 (can't be bypassed)

---

## BACK-2-021 · Usernames — Case-Insensitive Login + Store Lowercase

**Priority:** 🟡 Medium (real login failures on phones — mobile keyboards auto-capitalize)
**Area:** `auth.rs` (login lookup + lockout map), `api_data.rs` (setup + create_user),
username inputs in `login.tsx` / `setup.tsx` / `users.tsx`, one data migration
**Origin:** Owner found on mobile 2026-07-07 — the phone capitalizes the first letter ("Boy"), and
login fails because the match is exact.

**Confirmed current state:**
- Login lookup is **case-sensitive** (`WHERE username = ?` in `auth.rs`).
- Usernames are stored **as typed** (only trimmed) at setup and staff creation.
- The duplicate-username check is also case-sensitive — so "Boy" and "boy" could coexist today.
- No username input sets `autoCapitalize="none"` — phones capitalize by default.

**Owner decisions:**
- Login matches **case-insensitively**.
- Usernames are **always saved lowercase**.

**Proposed handling:**
- **Normalize at the source:** setup + create_user lowercase the username before storing; the
  duplicate check compares `COLLATE NOCASE`.
- **Login:** lowercase the submitted username before lookup (with lowercase storage, exact match
  then suffices; belt-and-braces `COLLATE NOCASE` acceptable). Also normalize the **lockout map
  key** in `auth.rs` so "Boy"/"boy" share the same fail counter (otherwise the lockout is
  case-bypassable).
- **Data migration:** lowercase existing `users.username` values (collision guard: if two rows
  would collide, keep both untouched and log — realistically none exist yet).
- **Input UX (the immediate mobile fix):** add `autoCapitalize="none" autoCorrect="off"
  spellCheck={false}` to the username fields on login, setup, and staff creation so phones stop
  capitalizing in the first place.
- Demo seeder usernames are already lowercase (admin/ana/boy) — no change needed.

**Acceptance Criteria:**
- [ ] Typing "Boy" (or "BOY") on the login screen logs in the user stored as "boy"
- [ ] New usernames from the wizard/staff dialog are persisted lowercase regardless of input
- [ ] Duplicate check is case-insensitive ("Ana" rejected when "ana" exists)
- [ ] Failed-attempt lockout counts "Boy" and "boy" as the same account
- [ ] Existing usernames migrated to lowercase
- [ ] Username inputs no longer auto-capitalize on phones

---

## BACK-2-022 · Slide-to-Confirm on Action Buttons (anti pocket-press)

**Priority:** 🟡 Medium (mobile safety — one accidental tap can change a job's state)
**Area:** new shared component (e.g. `components/slide-confirm.tsx`), applied across action buttons
**Origin:** Owner request 2026-07-07.

**Description:**
State-changing **action buttons** should ask for confirmation before executing — with a **Cancel**
option — and the confirmation itself should be a **slide/swipe gesture** (like slide-to-unlock), so
a phone in a pocket or a stray touch can't falsely trigger it. **Navigation buttons/links are
explicitly excluded** (owner decision) — only mutations.

**Proposed shape:**
- A reusable **SlideToConfirm** control: tap the action button → a small sheet/dialog appears with
  the action named (e.g. *"Slide to mark as done →"*), a draggable handle that must travel the full
  track to fire, and a **Cancel** button / tap-outside to dismiss. Pointer-based drag (works with
  mouse on desktop too).
- **One-tap mutating actions get it first** (highest pocket-press risk):
  Start Job · Mark as Done · Mark as Paid · booking **Confirm**/**Cancel** · photo **Delete** ·
  inventory delete (replaces the current `window.confirm`) · backup **Restore**.
- **Actions already behind dialogs** (Mark Approved → ApprovalDialog, Cancel Job → reason dialog,
  Save Estimate, Discounts, Adjust Stock): decide at build whether their final button also becomes
  a slide, or whether the dialog itself is deemed sufficient friction — sliding *everything* may
  make desktop use tedious.

**Design considerations (decide at build time):**
- **Desktop ergonomics:** drag works with a mouse but feels slow — consider slide-on-touch devices
  / plain confirm-button on desktop (pointer-type detection), or keep slide everywhere for
  consistency.
- **Checklist item ticks:** frequent micro-actions — a slide per tick would be painful; likely
  exclude (mis-ticks are easily reversible), but confirm with owner.
- Tiering: destructive/irreversible (restore, deletes, paid) vs routine (start/done) — could use
  slide for the first tier only if full coverage feels heavy in practice. Owner's stated intent:
  all action buttons.
- Accessibility: provide a keyboard/AT fallback (e.g. hold-Enter or a double-confirm) since a drag
  gesture alone isn't accessible.

**Acceptance Criteria:**
- [ ] Reusable slide-to-confirm component (names the action, full-travel to fire, Cancel/dismiss)
- [ ] Applied to the agreed set of mutating actions; navigation untouched
- [ ] A straight tap on an action button never mutates state directly anymore (for covered actions)
- [ ] Works by touch on phones and by mouse on desktop; accessible fallback exists
- [ ] Verified on a real phone: a casual tap opens the sheet, dismissing is easy, sliding fires

---

## BACK-2-023 · Assign / Re-assign — Staff Only (admin/advisor)

**Priority:** 🟡 Medium (role correctness; completes the role-hardening set with 015/016/020)
**Area:** `apps/desktop/src/pages/job-ticket.tsx` (Assign button), `assign_order` in `api_data.rs`
**Origin:** Owner request 2026-07-07 — mechanics should not have the Assign feature; only
admin/advisor (and owner) can assign and re-assign jobs to mechanics.

**Confirmed current state:**
- The **Assign** button on the ticket is gated only by status (hidden on paid/cancelled) — **no
  role gate**; mechanics see it and can open the dialog.
- **Server:** `POST /api/orders/:id/assign` is only session-gated — a mechanic could assign or
  re-assign (or unassign!) any job via the API.

**Proposed handling:**
- **UI:** render the Assign button only for `isStaff` (owner/admin/advisor). Mechanics still see
  the assignee name (read-only).
- **Server (authoritative):** `assign_order` → `require_staff` (mechanic → 403).
- **Preserve the one intentional exception:** `start_order`'s **auto-claim** (a mechanic starting
  an unassigned job gets assigned to it) stays — that's self-assignment via Start (BACK-2-016 flow),
  not the Assign feature. The restriction here is on explicit assign/re-assign/unassign.

**Acceptance Criteria:**
- [ ] Mechanic sees the assignee on a ticket but no Assign button
- [ ] Admin/advisor/owner assign + re-assign unchanged
- [ ] Server rejects mechanic `POST /:id/assign` with 403
- [ ] Mechanic Start Job still auto-claims an unassigned job (regression-check with BACK-2-016)

---

## BACK-2-024 · Estimate Dialog — Responsive Layout on Mobile Portrait

**Priority:** 🟡 Medium (mobile-first rule; advisors quote from phones/tablets too)
**Area:** `apps/desktop/src/features/repair/components/EstimateBuilder.tsx` (line-item rows + dialog width)
**Origin:** Owner found on mobile 2026-07-07 — the estimate dialog doesn't fit portrait width; the
user must swipe left/right to see each side.

**Confirmed cause:**
Each line item is a single flex row: type icon + description + fixed-width **Qty (w-14) + Unit
(w-16) + Price (w-24) + line total (w-24)** + delete button ≈ 400px of fixed width before the
description gets any room — overflows a 360–430px portrait viewport (dialog is `max-w-2xl`).

**Proposed handling (make it as responsive as possible):**
- **Small screens: two-row line layout** — row 1: type icon + full-width Description + delete;
  row 2: Qty · Unit · Price side by side with the computed line total right-aligned. (Effectively a
  compact card per line.) Desktop keeps the current single-row table feel via `sm:`/`md:` classes.
- Consider rendering the whole dialog **full-screen (sheet-style) on small viewports** — estimates
  are the app's densest form and benefit from every pixel; totals/discount section stays pinned
  reachable.
- Discount row (₱/% toggle + input) and Senior/PWD row should wrap cleanly too.
- **Audit sibling dialogs** for the same fixed-width overflow while at it: DiscountsDialog rows,
  inventory Item dialog (`grid-cols-3`), Adjust Stock — fix any that fail at 360px.

**Acceptance Criteria:**
- [ ] At 360px portrait: no horizontal scrolling anywhere in the estimate dialog; all fields
      visible and usable (≥44px touch targets)
- [ ] Line totals + subtotal/discount/senior/tax/total all visible without sideways swiping
- [ ] Desktop layout keeps the current comfortable single-row style
- [ ] Sibling dialogs verified/fixed at 360px
- [ ] Verified on a real phone in portrait

---

## BACK-2-025 · Accessibility — Dyslexia-Friendly Mode Toggle

**Priority:** 🟢 Low-Medium (accessibility; cheap goodwill with real users)
**Area:** Settings (Appearance section — pairs with BACK-2-018), global styles/theme plumbing
**Origin:** Owner request 2026-07-07.

**Description:**
Add a user-facing toggle for a **dyslexia-friendly reading mode**. When enabled, the app switches
to a dyslexia-friendly presentation:
- A dyslexia-friendly **typeface** — candidates: **OpenDyslexic** (the classic, distinctive weighted
  bottoms), **Lexend** or **Atkinson Hyperlegible** (more conventional-looking, strong legibility
  research, small files). All are open-licensed (SIL OFL).
- Increased **letter/word spacing** and **line height**; avoid justified text.

**Implementation notes:**
- **Bundle the font locally** (strict local-first — no CDN/Google Fonts fetch); ship the woff2 in
  the app bundle. Mind installer size (Lexend/Atkinson ≈ tens of KB per weight; OpenDyslexic larger).
- Mechanism: a class on `<html>` (e.g. `.dyslexic`) that overrides `font-family` + spacing via CSS
  variables — same pattern as dark mode. Persist like the theme (localStorage per device).
- **Per-device vs per-user:** theme is per-device today; a shared front-desk PC means one person's
  toggle affects others. Per-device (simple, consistent with theme) vs per-user preference storage —
  decide at build; per-device is the pragmatic default.
- **Placement + roles:** lives in the **Appearance** section (moving to Settings per BACK-2-018).
  Per the owner's revised BACK-2-015, Settings is visible to all roles with role-filtered sections —
  Appearance (incl. this toggle) is one of the sections mechanics DO see, and it must not be caught
  by the admin read-only gating.
- Out of scope: the PDF printout keeps its current font (customer-facing document, unaffected).

**Acceptance Criteria:**
- [ ] Toggle in Settings/Appearance, available to every role, persisted across restarts
- [ ] Enabled: app-wide dyslexia-friendly font + adjusted letter/word spacing and line height
- [ ] Works fully offline (font bundled, no network fetch)
- [ ] Layout survives the metric change (spot-check dense views: estimate dialog, tables, PIN boxes)
- [ ] Off by default; toggling back restores the standard look exactly

---

## BACK-2-026 · De-emphasize & Relocate the Trial Banner

**Priority:** 🟢 Low (visual polish; the trial notice is currently too loud)
**Area:** `apps/desktop/src/components/license-area.tsx`, `apps/desktop/src/App.tsx` (banner placement)
**Origin:** Owner request 2026-07-07.

**Description:**
The **"Trial — N day(s) left"** notice currently renders as a full-width, high-contrast bar
(solid `bg-blue-600` white text) pinned at the very top of every screen (in `LicenseArea`, above
the router). It dominates the UI. Move it somewhere **less obtrusive** and soften it: a **lighter
font/among a muted tint** instead of the loud solid bar.

**Scope / considerations:**
- This is specifically the **trial** state (blue). The **grace** (amber) and **read-only**
  (destructive/red) states are genuine warnings — keep those prominent; only the trial notice gets
  toned down. Decide at build whether to key off `status.state === "trial"` for the softer treatment.
- Candidate relocations (decide at build): a small pill in the dashboard header next to the shop
  name / `ServerStatus`; a subtle footer line; or a muted chip near the user menu. Keep the
  **"Enter License"** affordance reachable (can move into the license dialog / a smaller link).
- Lighter styling: muted foreground (e.g. `text-muted-foreground`) on a transparent/subtle
  background rather than solid blue.

**Acceptance Criteria:**
- [ ] Trial notice no longer occupies the full-width top bar; it lives in a less prominent location
- [ ] Font/color is lightened (muted) vs today's solid high-contrast bar
- [ ] Grace / read-only license states remain prominent (unchanged)
- [ ] A path to "Enter License" is still reachable

---

## BACK-2-027 · QR-Code Login on Desktop (scan to connect) + Printable QR in Settings

**Priority:** 🟡 Medium (removes daily friction — the LAN IP changes, mechanics retype it)
**Area:** `apps/desktop/src/pages/login.tsx` (show QR), `apps/desktop/src/pages/settings.tsx`
(printable QR), server URL source (`get_server_url` / `GET /api/...`), bundled offline QR lib
**Origin:** Owner request 2026-07-07.

**Description:**
The desktop app is the Commander node serving on `http://<LAN-IP>:3030`; the IP **changes over
time** (DHCP), so mechanics ("Scout nodes") have to rediscover/retype it to connect from their
phones. Add a **scannable QR code** encoding the current server URL so a mechanic can **scan and go**.

**Scope:**
- **Login page:** render a QR of the live server URL (from the existing `get_server_url` command /
  server-status source) so a phone camera opens the right address. Include the plain URL as text too.
- **Settings:** add a **printable** QR (a print/download action, consistent with D9 PDF-style
  export) so the shop can tape it to the wall / hand it out.
- **Offline:** QR generation must be fully local (bundle a JS QR library — e.g. `qrcode` — no
  network/CDN), per the strict local-first rule.

**Considerations (decide at build):**
- What the QR encodes: the bare `http://<ip>:3030` (opens the scout web app) — confirm the scout
  entry URL/route. If a token/pairing is ever needed it's out of scope here (v1 is LAN-trusted).
- IP volatility: the QR must reflect the **current** IP at render time (re-generate on load), not a
  cached value. Consider a manual "refresh" affordance.
- Print path: reuse the PDF/download approach (or `window.print` of a QR-only view) — decide at build.

**Acceptance Criteria:**
- [ ] Desktop login page shows a QR encoding the current server URL + the URL as readable text
- [ ] Scanning it on a phone opens the correct LAN address
- [ ] Settings offers a printable/downloadable QR
- [ ] QR is generated fully offline (library bundled, no network fetch)
- [ ] QR reflects the current IP (regenerated on load, not stale)

---

## BACK-2-028 · Enhance Mechanic Checklist Completion UX (bigger target + confirmation)

**Priority:** 🟡 Medium (mobile ergonomics for the mechanic's core action)
**Area:** `apps/desktop/src/pages/job-ticket.tsx` (in_progress "Work Checklist" section)
**Origin:** Owner request 2026-07-07.

**Description:**
When a mechanic works a job, each task is ticked off via a **small (`h-5 w-5`) checkbox** in the
Work Checklist. On a phone this is a **tiny touch target** and easy to mis-tap. Improve the UX:
**enlarge the checkbox** or replace it with a **better, easier-to-hit element** (e.g. a full-width
tappable row / large toggle / "Done" pill per task), and **add a confirmation** before a task flips
state.

**Cross-reference — confirmation interplay with [BACK-2-022](#) (Slide-to-Confirm):**
BACK-2-022 currently *leans toward excluding* per-task checklist ticks from slide-to-confirm
("frequent micro-actions — a slide per tick would be painful; mis-ticks are easily reversible").
This item now explicitly asks for a confirmation on completion, so the two must be reconciled at
build. Options to decide:
- Confirm only the **final "Mark as Done"** button (the irreversible step) via BACK-2-022's
  SlideToConfirm, and make per-task ticks a big, easy, *un*-confirmed toggle (reversible).
- Or a lightweight per-tick confirmation (e.g. tap-again / brief undo) rather than a full slide.
Pick one and note it in BACK-2-022 so the two stay consistent.

**Considerations (decide at build):**
- Element choice: enlarged checkbox vs full-row tap-target vs large toggle/segmented "Done".
  Whatever is chosen must keep the "all tasks complete → enables Mark as Done" logic intact.
- Touch target ≥ 44px; clear done/undone visual state (the current line-through can stay).
- Keep it fast — a mechanic ticks many items; don't make each tick tedious (ties into the
  confirmation decision above).

**Acceptance Criteria:**
- [ ] Checklist completion uses a larger, easy-to-hit target on mobile (≥ ~44px), not the tiny box
- [ ] Some confirmation exists for marking work done (final step at minimum), reconciled with
      BACK-2-022 (and BACK-2-022 updated to match the decision)
- [ ] "Mark as Done" still only enables when every task is complete
- [ ] Clear visual done/undone state; no regression to the timing/completion flow

---
