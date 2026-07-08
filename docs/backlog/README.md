# Zorviz — Backlog Index

> **Last Updated:** 2026-07-05  
> This directory tracks all remaining work and completed implementation details for the Zorviz platform.

---

## How to Use This System

### When starting a task
1. Find the item in the relevant `phase-X-backlog.md`
2. Note the item ID (e.g., `BACK-2-004`)
3. Work on it

### When completing a task
1. **Cut** the item from the backlog file
2. **Paste** it into the corresponding `phase-X-completed.md`
3. Change the heading prefix from `##` to `## ✅`
4. **Fill in** the "What was implemented" section with:
   - Exact description of what was built
   - Any design decisions or trade-offs made
   - List of all key files created or modified

---

## Phase Overview

| Phase | Backlog | Completed | Progress |
|---|---|---|---|
| Phase 0 — v1 Ship Blockers & Foundation | [backlog](./phase-0-ship-blockers.md) | [completed](./phase-0-completed.md) | ~99% (12 of 13 ✅ — only online-enforcement remains, deferred fast-follow) |
| Phase 1 — Core Kernel | [backlog](./phase-1-backlog.md) | [completed](./phase-1-completed.md) | ~85% (settings, **data-driven asset types**, **demo seeder/reset** done; remaining all deferred: schema split, module registry, user-mgmt UI, hardware IO) |
| Phase 2 — Repair Module | [backlog](./phase-2-backlog.md) | [completed](./phase-2-completed.md) | ~98% (everything shipped; 14 items **implemented, all pending the batched final-QA verify**: **BACK-2-015** mechanic dashboard cleanup + backup API gating, **BACK-2-016** Start Job role logic + on-behalf start, **BACK-2-017** ticket back-navigation *(implemented, pending verify)*, **BACK-2-018** Appearance → Settings *(implemented, pending verify)*, **BACK-2-019** mobile one-row KPI strip *(implemented, pending verify)*, **BACK-2-020** billing actions staff-only *(implemented, pending verify)*, **BACK-2-021** case-insensitive usernames *(implemented, pending verify)*, **BACK-2-022** slide-to-confirm on actions *(implemented, pending verify)*, **BACK-2-023** assign staff-only *(implemented, pending verify)*, **BACK-2-024** responsive estimate dialog *(implemented, pending verify)*, **BACK-2-025** dyslexia-friendly mode *(implemented, pending verify)*, **BACK-2-026** de-emphasize trial banner *(implemented, pending verify)*, **BACK-2-027** QR-code login + printable QR *(implemented, pending verify)*, **BACK-2-028** mechanic checklist completion UX *(implemented, pending verify)*) |
| Phase 3 — Commerce Module | [backlog](./phase-3-backlog.md) | [completed](./phase-3-completed.md) | ~75% (**inventory management page + stock adjustments + CSV imports (parts & customers) + stock deduction** done; 001 superseded by D23; remaining: payment methods 007 (deferred) + **BACK-3-009 VAT-inclusive pricing option**; 008 mostly done) |
| Phase 4 — Cloud Link | [backlog](./phase-4-backlog.md) | [completed](./phase-4-completed.md) | ~10% (8 items remaining) |

> **Phase numbering ≠ work order.** For shipping v1, follow the **Critical Path** below, which
> sequences items across phases by priority. Phases 3–4 are mostly deferred past v1.

---

## 🚀 Critical Path to v1

The ordered plan to ship a **usable, offline/LAN repair-shop app**. Scope and cuts are governed by
[`v1-decisions.md`](./v1-decisions.md) (decisions D1–D19). Work strictly top-down: finish a tier before
starting the next. Items marked *(mod)* have changed scope vs their original backlog entry — see the note.

### Tier P0 — Foundation (must precede all feature work)
1. ~~**BACK-0-001** — Fix the production build~~ ✅ **Done** (2026-07-04 — installer builds clean)
2. ~~**BACK-0-002** — Consolidated v1 schema migration~~ ✅ **Done** (2026-07-04 — money→centavos, customers, status enum, app_config fields, ms timestamps; verified on fresh DB boot)
3. ~~**BACK-0-003** — First-run setup wizard~~ ✅ **Done** (2026-07-04 — 4-step wizard + setup gating; logo upload split to BACK-0-013)
4. ~~**BACK-0-004** — Username + PIN authentication~~ ✅ **Done** (2026-07-04 — PBKDF2 PINs + lockout; LAN session binding lands with BACK-0-005)
5. ~~**BACK-0-005** — Local HTTP API + LAN serving~~ ✅ **Done** (2026-07-05 — single path complete through Increment 4: wizard→`/api/setup`, `execute_sql`/invoke retired; phone-verified LAN)
6. ~~**BACK-0-006** — Signed license + device fingerprint activation~~ ✅ **Done** (2026-07-04 — Ed25519 licenses + fingerprint + trial + read-only gating; licensegen tool)

### Tier P1 — The core money-making loop + safety
7. ~~**BACK-0-009** — Inline-create picker pattern~~ ✅ **Done** (2026-07-04 — reusable `EntityPicker`)
8. ~~**BACK-0-010** — Customer module (endpoints + inline create)~~ ✅ **Done** (2026-07-04)
9. ~~**BACK-2-001** — Asset create form~~ ✅ **Done** (2026-07-04 — `+` opens New Asset dialog w/ owner picker)
10. ~~**BACK-2-002** — Asset detail / service history~~ ✅ **Done** (2026-07-05 — tappable asset cards → detail page w/ specs + owner + full service history via `GET /api/assets/:id`)
11. ~~**BACK-2-004** — Job ticket create (intake & triage)~~ ✅ **Done** (2026-07-04 — intake form + ticket detail, phone-ready)
12. ~~**BACK-2-011** — Photo capture~~ ✅ **Done** (2026-07-05 — ticket photos via phone camera over LAN + append-only note threads; delete = advisor/admin)
13. ~~**BACK-2-005** — Estimate builder~~ ✅ **Done** (2026-07-04 — live centavo totals, parts via inline-create picker)
14. ~~**BACK-3-001..004** — Basic inventory~~ ✅ **Done** (2026-07-06 — full management page: table w/ margin, low-stock filter, add/edit/delete, stock adjustments w/ audit log, **CSV imports for parts & customers**; 001 superseded by D23)
15. ~~**BACK-3-006** — Parts linking + stock deduction on approval~~ ✅ **Done** (2026-07-06 — stock deducted for inventory-linked items on approval; restocked if an approved job is cancelled; may go negative = oversell surfaces on low-stock)
16. ~~**BACK-2-006** — Customer approval~~ ✅ **Done** (2026-07-04 — simple who/how record, estimate→approved)
17. ~~**BACK-2-008** — Mechanic assignment~~ ✅ **Done** (2026-07-04)
18. ~~**BACK-2-007** — Mechanic "My Jobs" mobile view~~ ✅ **Done** (2026-07-04 — job board + checklist execution → done)
19. ~~**BACK-2-009** — Completion & invoice~~ ✅ **Done** (2026-07-04 — PDF invoice + receipt + mark paid; **core loop complete**)
20. ~~**BACK-2-010** — Bookings~~ ✅ **Done** (2026-07-05 — lightweight call-aheads; admin/advisor Convert → normal asset+ticket flow pre-filled — D10)
21. ~~**BACK-0-007** — Minimal user management~~ ✅ **Done** (2026-07-04 — admin add/edit/deactivate staff, PIN reset, server-side hashing)
22. ~~**BACK-0-008** — Backup & restore~~ ✅ **Done** (2026-07-04 — VACUUM INTO backups, auto+manual, staged restore, retention)

### Tier P2 — Ship polish
23. ~~**BACK-0-011** — Real dashboard stats~~ ✅ **Done** (2026-07-04 — live /api/stats; no more fake numbers)
24. ~~**BACK-1-004** — App config settings page~~ ✅ **Done** (2026-07-05 — full shop profile editable via `PUT /api/config`, admin-only; edits invoice header + tax rate live)
25. ~~**BACK-2-003** — Asset update & soft-delete~~ ✅ **Done** (2026-07-05 — edit specs/owner (type fixed) + soft-delete via `PUT`/`DELETE /api/assets/:id`; delete blocked when open tickets exist)
26. ~~**BACK-0-013** — Shop logo upload~~ ✅ **Done** (2026-07-05 — upload in Settings; shows on login/header + PDF invoice; over the HTTP API, no fs plugin)

### Deferred past v1 (explicitly cut — see v1-decisions.md)
- **BACK-0-012** — Online enforcement layer / remote kill-switch *(fast-follow; needs the first backend — D20. Offline license BACK-0-006 ships in v1.)*
- **All of Phase 4** — cloud sync, Next.js dashboard, customer portal, encrypted sync *(D2)*
- **BACK-1-001** schema file split, **BACK-1-002** module registry, **BACK-1-005** hardware IO
- **BACK-3-005** stock adjustment log, **BACK-3-007** payment methods, **BACK-3-008** tax config UI *(basic tax rate is in the wizard)*

---

## Item ID Convention

```
BACK-{phase}-{sequence}       → backlog item
BACK-{phase}-C{sequence}      → completed item
BACK-{phase}-S{sequence}      → scaffolded / partial (not complete)
```

**Examples:**
- `BACK-2-004` — Phase 2, backlog item 4 (Job Ticket Create)
- `BACK-2-C001` — Phase 2, completed item 1 (Asset Search)
- `BACK-4-S001` — Phase 4, scaffolded (Sync Engine types, not integrated)

---

## Priority Legend

| Symbol | Meaning |
|---|---|
| 🔴 High | Blocks other items or is core to the MVP |
| 🟡 Medium | Important but not blocking |
| 🟢 Low | Nice to have, future phase consideration |

---

## Suggested Next Actions (as of 2026-07-04)

Follow the **Critical Path to v1** above, top-down. The immediate next actions:

1. ~~`BACK-0-001` — Fix the production build~~ ✅ **Done** (2026-07-04)
2. ~~`BACK-0-002` — Consolidated v1 schema migration~~ ✅ **Done** (2026-07-04)
3. ~~`BACK-0-003` — First-run setup wizard~~ ✅ **Done** (2026-07-04)
4. ~~`BACK-0-004` — Username + PIN authentication~~ ✅ **Done** (2026-07-04)
5. ~~`BACK-0-005` — Local HTTP API + LAN serving~~ ✅ **Done** (2026-07-05 — single path complete)

> With the P0 foundation + the full core repair loop (through invoice→paid) + asset detail done, the
> **All v1 features are complete** (2026-07-05: **BACK-1-006** data-driven asset types, **BACK-2-010**
> lightweight bookings, **BACK-0-013** shop logo upload, **BACK-2-011** ticket photos + note threads). What
> remains is the **pre-ship checklist**: swap the dev license key for a production key, test the installer on a
> clean machine, add the installer firewall rule. Deferred fast-follow: **BACK-0-012** online kill-switch.
> Superseded the 2026-06-14 list (which started at `BACK-2-001`). Feature work now sits behind the
> Phase 0 foundation per the v1 audit and decisions D1–D19.
