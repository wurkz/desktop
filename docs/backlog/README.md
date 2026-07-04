# Zorviz — Backlog Index

> **Last Updated:** 2026-06-14  
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
| Phase 0 — v1 Ship Blockers & Foundation | [backlog](./phase-0-ship-blockers.md) | [completed](./phase-0-completed.md) | ~50% (6 of 13 ✅ + BACK-0-005 LAN, phone-verified) |
| Phase 1 — Core Kernel | [backlog](./phase-1-backlog.md) | [completed](./phase-1-completed.md) | ~70% (5 items remaining) |
| Phase 2 — Repair Module | [backlog](./phase-2-backlog.md) | [completed](./phase-2-completed.md) | ~25% (Asset Create done; job tickets next) |
| Phase 3 — Commerce Module | [backlog](./phase-3-backlog.md) | [completed](./phase-3-completed.md) | 0% (8 items remaining) |
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
5. **BACK-0-005** — Local HTTP API + LAN serving *(← NEXT; largest item; foundation for all mobile views)*
6. **BACK-0-006** — Signed license + device fingerprint activation *(heavy; owner chose v1 over fast-follow — see D17 timeline note)*

### Tier P1 — The core money-making loop + safety
7. ~~**BACK-0-009** — Inline-create picker pattern~~ ✅ **Done** (2026-07-04 — reusable `EntityPicker`)
8. ~~**BACK-0-010** — Customer module (endpoints + inline create)~~ ✅ **Done** (2026-07-04)
9. ~~**BACK-2-001** — Asset create form~~ ✅ **Done** (2026-07-04 — `+` opens New Asset dialog w/ owner picker)
10. **BACK-2-002** — Asset detail / service history
11. **BACK-2-004** — Job ticket create (intake & triage) *(← NEXT)*
12. **BACK-2-011** — Photo capture on intake *(mod: kept in v1, natural via phone camera over LAN — D4)*
13. **BACK-2-005** — Estimate builder *(mod: parts via inventory picker with inline create — D6/D7)*
14. **BACK-3-001..004** — Basic inventory (scaffold, CRUD, list page, create/edit) *(needed for estimate part-picking — D6)*
15. **BACK-3-006** — Parts linking + stock deduction on approval
16. **BACK-2-006** — Customer approval *(mod: simple approval record — who + how — NOT signature/OTP — D5)*
17. **BACK-2-008** — Mechanic assignment
18. **BACK-2-007** — Mechanic "My Jobs" mobile view *(the CRITICAL mobile execution screen)*
19. **BACK-2-009** — Completion & invoice *(mod: PDF export, not direct print — D9)*
20. **BACK-2-010** — Bookings *(mod: unified with walk-ins; converges at the same Create Job Ticket screen — D10)*
21. **BACK-0-007** — Minimal user management
22. **BACK-0-008** — Backup & restore *(only safety net with cloud deferred)*

### Tier P2 — Ship polish
23. **BACK-0-011** — Real dashboard stats *(replace hardcoded numbers)*
24. **BACK-1-004** — App config settings page *(edit what the wizard set)*
25. **BACK-2-003** — Asset update & soft-delete

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
5. `BACK-0-005` — Local HTTP API + LAN serving *(← NEXT; start early — largest item)*

> Superseded the 2026-06-14 list (which started at `BACK-2-001`). Feature work now sits behind the
> Phase 0 foundation per the v1 audit and decisions D1–D19.
