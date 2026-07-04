# Phase 0 Backlog — v1 Ship Blockers & Foundation

> **Status:** In progress — 10 of 13 complete (BACK-0-001, 002, 003, 004, 006, 007, 008, 009, 010, 011 ✅) + BACK-0-005 increments 1–3 (LAN, phone-verified). Remaining: BACK-0-013 (logo upload), BACK-0-012 (online enforcement — deferred fast-follow).
> **Scope:** Foundation fixes and new cross-cutting infrastructure required before Zorviz can ship a
> usable v1 to a real shop. Derived from the plan/design audit (2026-07-04) and owner decisions in
> [`v1-decisions.md`](./v1-decisions.md).
> **Completed items live in:** [`phase-0-completed.md`](./phase-0-completed.md)

Every item traces to one or more decisions (D1–D19) in `v1-decisions.md`. Work top-down: **P0 → P1 → P2.**
See the **Critical Path to v1** in [`README.md`](./README.md) for the full cross-phase ordering.

---

## BACK-0-005 · Local HTTP API + LAN Serving

**Priority:** 🔴 P0 — largest single v1 item; foundation for all mobile mechanic views
**Area:** `apps/desktop/src-tauri/src/server.rs`, `apps/desktop/src/lib/`
**Traces to:** D1
**Description:**
Mechanics work from phones over LAN, which browsers cannot do via `invoke('execute_sql')`. Build a real
HTTP API on the existing axum server (typed CRUD endpoints — NOT raw SQL over HTTP) and serve a
mobile-friendly frontend over LAN. **Architecture RESOLVED (D23): single path** — one Rust/axum HTTP API
for desktop + all LAN devices; business logic in Rust; no Node. Access model: desktop = admin/advisor;
mobile = admin/advisor/mechanic. Built in the 4 increments listed in D23.

**Progress:**
- ✅ **Increment 1 (auth foundation) — done 2026-07-04.** Rust `auth.rs`: PBKDF2 verify (matches
  `crypto.ts`), in-memory sessions w/ 12h opaque bearer tokens, 5-attempt/30s lockout; `POST /api/login`,
  `POST /api/logout`, `GET /api/me`. Frontend `api.ts` client (base-URL detection + 401→logout); auth store
  rewired from client-side Kysely/`verifyPin` to the API. Verified live: login `admin/1234` → token, `/api/me`
  resolves, wrong-PIN + no-token → 401. Cross-runtime PBKDF2 parity (node seeder ↔ Rust) confirmed.
- ✅ **Increment 2 (LAN serving + hardening) — done 2026-07-04.** axum serves the built SPA (embedded via
  rust-embed; disk in debug, in-binary in release) as a fallback under `/`; CORS locked to desktop origins
  (tauri.localhost + localhost) via predicate — foreign origins rejected, no wildcard; best-effort Windows
  Firewall rule for TCP 3030 (needs elevation / installer). Verified via curl: `/` serves index.html, JS
  asset 200, CORS allows tauri origin + rejects evil.example, LAN IP `:3030` serves 200. **Physical-phone
  end-to-end deferred to after Increment 3** (the phone loads but config/data still use `invoke`; it becomes
  fully functional once reads move to HTTP).
- ✅ **Physical phone test PASSED (2026-07-04)** — a phone on the same Wi-Fi loaded the app from the
  desktop over LAN (`http://<lan-ip>:3030`) and logged in against the Rust API. Increments 1–3 verified on
  real hardware. (Required a one-time Windows Firewall rule for TCP 3030, added manually as admin.)
  NOTE: fixing a React blank-screen (react/react-dom 19.2.7 match + UI peer-dep bumps) was needed first —
  see the `fix:` commit. Lesson: verify RENDER (headless browser), not just compile.
- ✅ **Increment 3 (first data endpoints + frontend migration) — done 2026-07-04.** Rust `api_data.rs`:
  `GET /api/config` (public — needed pre-login), `GET /api/assets?q=` + `POST /api/assets` (auth-guarded);
  generic `row_to_json` (NULL-safe) + `specs` JSON expansion; `tenant_id` sourced from `app_config` on create.
  Frontend migrated off `invoke`: app-config store + `repair-api.ts` + `AssetDiscovery` use the HTTP API;
  `ServerStatus` guarded for non-Tauri; `lib/db.ts` trimmed (Kysely now only for the desktop wizard).
  Verified via curl: config returns nullable fields as null, asset create/search work with auth, 401 without.
- ⏳ Increment 4 — migrate the setup wizard writes to the API + retire `execute_sql`/`invoke` data path.

**Acceptance Criteria:**
- [x] Architecture decision recorded: **single path** (D23)
- [~] LAN session auth: token sessions + role data done (Increment 1); login *from a phone browser* pending Increment 2 *(D15)*
- [~] axum exposes authenticated REST endpoints — pattern established with config + assets (Increment 3);
      orders/order_items/customers endpoints added as those features are built. No raw-SQL over the network.
- [x] Built frontend served over LAN from the axum server *(Increment 2 — embedded SPA)*
- [ ] All mechanic-facing views mobile-first: ≥44px touch targets, ~430px layout *(Plan.txt)*
- [x] Server binds to LAN IP; reachable from the network interface *(Increment 2; physical-phone test pending Increment 3)*
- [~] Basic hardening: CORS locked to app origins (no wildcard) done *(Increment 2)*; per-endpoint input validation ongoing as endpoints are added *(Increment 3)*

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

## BACK-0-013 · Shop Logo Upload

**Priority:** 🟢 P2 — cosmetic; split out of BACK-0-003 (setup wizard)
**Area:** `apps/desktop/src-tauri/` (fs command), `apps/desktop/src/pages/setup.tsx` + settings
**Traces to:** D14
**Description:**
The setup wizard collects all branding EXCEPT the logo image, which needs new Tauri filesystem plumbing
to write the uploaded file to disk. Deferred from BACK-0-003 because it's cosmetic and mainly surfaces on
PDF invoices (BACK-2-009). `app_config.logo_path` column already exists (currently written as `null`).

**Acceptance Criteria:**
- [ ] Rust command (or fs plugin) to save an uploaded image to `{data_dir}/media/` and return its path
- [ ] Logo file picker in the setup wizard (and later the settings page) → saves path to `app_config.logo_path`
- [ ] Logo displayed in the app header / login and on PDF invoices (when BACK-2-009 lands)
- [ ] Replacing the logo removes/overwrites the old file

---
