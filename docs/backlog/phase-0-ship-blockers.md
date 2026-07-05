# Phase 0 Backlog — v1 Ship Blockers & Foundation

> **Status:** In progress — 12 of 13 complete (BACK-0-001, 002, 003, 004, 005, 006, 007, 008, 009, 010, 011, 013 ✅). Only remaining item is BACK-0-012 (online enforcement — deferred fast-follow, not a v1 blocker).
> **Scope:** Foundation fixes and new cross-cutting infrastructure required before Zorviz can ship a
> usable v1 to a real shop. Derived from the plan/design audit (2026-07-04) and owner decisions in
> [`v1-decisions.md`](./v1-decisions.md).
> **Completed items live in:** [`phase-0-completed.md`](./phase-0-completed.md)

Every item traces to one or more decisions (D1–D19) in `v1-decisions.md`. Work top-down: **P0 → P1 → P2.**
See the **Critical Path to v1** in [`README.md`](./README.md) for the full cross-phase ordering.

---

## BACK-0-012 · Online Enforcement Layer (Remote Kill-Switch) — DEFERRED

**Priority:** ⏸️ Deferred — fast-follow after v1 (NOT on the critical path)
**Area:** new hosted licensing backend + `apps/desktop/src-tauri/` check-in client
**Traces to:** D20
**Description:**
Optional online layer on top of the offline license (BACK-0-006). When a machine has internet, the app
checks in with a hosted licensing server that can remotely change the device's enforcement state. When
offline, this layer does nothing and the app runs normally on its offline license. Deferred because it
requires the project's first backend; owner chose to keep it off the v1 critical path.

**Acceptance Criteria (for when built):**
- [ ] **Fail-open:** app changes state ONLY on an explicit signed server instruction; NEVER on failure to
      connect (no internet / blocked domain / server down must leave the app fully working)
- [ ] Default flagged action = **warn only** (banner, app still works)
- [ ] Server admin view: per-device control to **normal / warn / lock**; can escalate to lock or clear back to normal
- [ ] **Manual revoke only** — no automatic piracy detection; owner flags devices manually
- [ ] Periodic check-in when online; server tracks devices/check-ins
- [ ] Check-in responses signed (anti-spoof / anti-MITM)
- [ ] Hosted backend: minimal API + license/device DB (managed platform to minimize ops)
- [ ] Does NOT gate first-run activation — offline license (BACK-0-006) remains the primary path

---

_(BACK-0-013 · Shop Logo Upload — ✅ completed 2026-07-05, see `phase-0-completed.md`.)_
