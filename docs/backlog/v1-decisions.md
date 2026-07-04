# V1 Ship Decisions

> Decisions made with the owner on 2026-07-04 to scope the shippable v1.
> These drive the priorities in `phase-0-ship-blockers.md` and the critical path ordering.

## D1 — Mechanic mobile / LAN "Scout nodes"

**Decision:** ✅ **Full LAN mobile in v1.**
Mechanics work from their phones over LAN. This requires:
- HTTP API layer on the local axum server (CRUD for jobs/assets/orders — not raw SQL over HTTP)
- Serving the built frontend (or a mobile view) over LAN from the axum server
- LAN session auth (login from phone browser, token/cookie sessions, role-scoped access)
- Mobile-first layouts for all mechanic-facing views (per Plan.txt: ≥44px touch targets, ~430px width)

**Implication:** This is the largest v1 work item. Architecture note: consider having the desktop
webview use the same HTTP API as LAN clients (single data path) instead of `invoke('execute_sql')` —
to be evaluated in the backlog item design.

## D2 — Cloud sync (Phase 4)

**Decision:** ✅ **Defer all of Phase 4** (Postgres mirror, Next.js dashboard, customer portal, sync engine).
V1 is fully offline/LAN. Keep `updated_at` discipline and the `sync_metadata` table so sync can be
added later without schema surgery.

## D3 — Customer records

**Decision:** ✅ **New dedicated `customers` table** (name, phone, optional email/address).
Assets and orders link to it. Keeps staff logins (`users`) separate from customer contact records.
Walk-in customers often have no email, so email is optional; phone is the primary contact field.

## D4 — Photo capture on intake

**Decision:** ✅ **Keep in v1.** Photos of the asset at intake, saved to local disk (not DB blobs),
referenced by path. With LAN mobile in v1, phone-camera upload via the HTTP API is the natural capture
path. Needs a media storage location + upload endpoint.

## D5 — Customer approval of estimates

**Decision:** ✅ **Simple approval record.** Advisor taps "Mark Approved"; record who approved and how
(verbal / phone / in-person) plus timestamp. No signature pad or OTP in v1.

## D6 — Parts / Inventory

**Decision:** ✅ **Basic inventory + linking, WITH inline create.**
Ship inventory CRUD and let estimates pick parts from it. If a part isn't found in the search box,
an inline "create" option appears so the advisor can add it on the spot without leaving the flow.
Stock deduction on approval included.

## D7 — GLOBAL UX PRINCIPLE — inline create everywhere

**Decision:** ✅ **Any search box that reads from a table must offer an inline "create new" option
when no match is found.** Applies to: customers, inventory parts, assets, and any future table-backed
picker. Staff must never hit a dead end mid-workflow. This is a cross-cutting requirement, not a
single feature — every picker component should follow the same pattern.

## D8 — User management

**Decision:** ✅ **Minimal admin-only user management.** Add user (name, role, PIN/password),
deactivate. Required because mechanics log in from phones over LAN. First-run setup wizard creates
the initial admin account.

## D9 — Invoice / receipt output

**Decision:** ✅ **PDF export only.** Generate a PDF the shop can print or send. No direct OS print
integration in v1.

## D10 — Bookings + walk-in: UNIFIED flow

**Decision:** ✅ **Include bookings in v1, but converge both paths at a single Create Job Ticket screen.**
- **Walk-in:** search/create asset → Create Job Ticket (directly).
- **Booking (call-ahead):** record a lightweight booking (asset + customer + intended date/time) →
  later "Convert to Job Ticket" → lands on the SAME Create Job Ticket screen, pre-filled.
- A booking is a "saved-for-later intake" — no separate execution logic. Both paths share one code path.
- V1 booking scope: minimal create-booking form, a "Today's Schedule" list, and a Convert action.
  No parallel booking workflow beyond that.
**Rationale:** Cheaper than two parallel flows and cleaner than the original plan, which implied a
separate booking system.

## D11 — Build fix

**Decision:** ✅ **Fix first, before any feature work.** The production build currently fails (~25 tsc
errors). Root cause: duplicate `@types/react` (v18) in `packages/ui` and `packages/features/repair`
while the app is on React 19, plus a broken `@zorviz/db` import in repair `types.ts` and several
unused-var errors under `noUnusedLocals`. Fix = dedupe React types to v19, fix the import, clear
unused vars, confirm a clean `npm run build` / `tauri build`. This is the #1 work item.

## D12 — Money storage

**Decision:** ✅ **Integer minor units (centavos).** Store all money as whole integers (₱123.45 → 12345),
format for display only. Applies to: `orders` (subtotal, tax, discount, total), `order_items`
(unit_price, total), `inventory` (unit_cost, unit_price), and any future money column. Migration to
change column types done now while all money tables are empty (verified 0 rows). Eliminates float
rounding errors on invoices/tax.

## D13 — Region / currency

**Decision:** ✅ **Region-agnostic.** No hardcoded tax rate or currency defaults. The first-run setup
wizard collects currency symbol, locale, and tax rate from the shop. `app_config` gets a `tax_rate`
column (nullable / no baked-in 0.12). Invoice tax label is generic (driven by config), not hardcoded
"VAT (12%)". NOTE: existing seed data uses ₱ / en-PH — that's fine as a *sample* but must not be
assumed in code.

## D14 — First-run setup wizard & shop branding

**Decision:** ✅ **On first launch (empty DB), run a one-time setup wizard before any login.**
Creates the `app_config` row + first admin account, and collects currency/locale/tax (D13).

Branding fields collected (shown on login, page headers, and PDF invoices):
- **Shop name** (required) — app header, login screen, invoice heading
- **Address + contact** (phone, email) — invoice/receipt header
- **Logo image** — stored on local disk (not DB blob), shown in-app and on PDF invoices
- **Tax / registration ID** (e.g. TIN) — printed on invoices
- **Custom fields** — a JSON `label => value` map so the shop can add arbitrary invoice/header
  fields without a schema change (e.g. "Permit No.", "Facebook page"). Stored as JSON in `app_config`.

Migration: `app_config` gains columns for address, contact_phone, contact_email, logo_path,
tax_registration_id, and a `custom_fields` JSON column.

## D15 — Login credentials

**Decision:** ✅ **Username + PIN for all users in v1.** Short username (or pick from a name list) +
numeric PIN. Fast to enter on a phone (mechanics log in over LAN, D1). Admin sets/resets PINs via
user management (D8). Replaces the current email+password auth.
NOTE: PIN must still be hashed + salted server-side; short PINs are low-entropy, so bind auth to the
LAN session and rate-limit attempts.

## D16 — First admin account

**Decision:** ✅ **Name + credential only.** Wizard collects the owner's name and sets their
username + PIN. Additional staff added later via user management (D8). Keeps first-run short.

## D17 — App protection / licensing — UNDER DISCUSSION

Owner wants to prevent one purchase being reused across a business's multiple branches, and asked to
discuss protection approaches. Owner's initial idea: hardcode the shop name per build. Owner noted the
flaw themselves: two branches with the same shop name would not be blocked, and a build is copyable.

**Decision:** ✅ **Signed license file + device binding (Option B), INCLUDED IN v1.**
- You hold a private signing key; the app ships with the matching public key embedded.
- A purchased license is a signed file encoding: shop name, allowed device/branch slot count, optional
  expiry, and **enabled modules** (doubles as the unlock mechanism for the commercial model in Plan.txt).
- Verified **offline** — no server, fits the strict local-first philosophy.
- **Issue-time fingerprint binding (offline-correct model):** because v1 has no server, device count
  cannot be self-enforced across isolated installs. Instead, allowed device fingerprints are embedded
  INTO the signed license at issue time. Activation flow: (1) shop installs, app shows its device code
  (fingerprint); (2) shop sends the code + proof of purchase to the owner; (3) owner's tool generates a
  signed license containing that fingerprint; (4) shop loads the license; app activates only if its own
  fingerprint matches one listed AND the signature verifies. Copying the app+license to an unlisted
  machine fails the fingerprint check. This blocks branch-to-branch reuse fully offline.
- Fingerprint = hash of stable machine identifiers (Windows MachineGuid + CPU/disk), derived in Rust.
- Requires a **reissue path** for legitimate customers whose hardware changes / who reinstall (a dead
  disk changes the fingerprint and would otherwise lock out an honest customer — this is the #1 DRM
  backfire risk and MUST be handled).
- Accepted limitation: a determined attacker who reverse-engineers the app can patch out the check;
  this scheme deters casual copying (the actual threat), not skilled piracy. Documented and accepted.

## D20 — Online enforcement layer (remote kill-switch) — DEFERRED to fast-follow

**Decision:** ✅ **Hybrid protection: offline license (v1) + optional online layer (post-v1 fast-follow).**
The two mechanisms are independent:
1. **Offline** (v1, BACK-0-006): signed license file + device fingerprint. Baseline; works with no internet.
2. **Online** (deferred): when the machine HAS internet, the app checks in with a hosted licensing server
   that can remotely change the device's enforcement state. When offline, this layer simply does nothing —
   the app keeps working on the offline license (preserves strict local-first).

**Online layer design (as decided, for when it's built):**
- **Fail-open, always:** the app may change state ONLY on an explicit server instruction. It must NEVER
  degrade just because the server was unreachable (no internet, blocked domain, server down). Distinguish
  "couldn't connect" from "connected + told to act."
- **Default action = warn only.** A flagged device shows a warning banner but keeps working normally.
- **Server-side per-device control:** from an admin view the owner can, per device, escalate to **lock**,
  or **clear the warning** and return it to **normal**. Enforcement state lives server-side: normal / warn / lock.
- **Detection = manual revoke only.** The server does NOT auto-decide piracy. The owner manually flags a
  device/license. (No automatic over-limit detection in scope.)
- Check-in responses should be signed to prevent spoofing/MITM.

**Why deferred:** requires a hosted licensing server — the first backend in the project (Phase 4 cloud is
otherwise deferred, D2). Owner chose to keep it OFF the v1 critical path and build it as a fast-follow once
the usable app is shipping. Tracked as BACK-0-012 (deferred), not in the P0–P2 tiers.

## D21 — Trial period (time-limited license)

**Decision:** ✅ **Support trial licenses in v1.** A trial reuses the signed-license machinery — it is
just a license with `expires = now + N months` (N set by the owner at generation). Part of BACK-0-006.

**Two ways a trial can start (owner chose BOTH):**
1. **Frictionless self-start:** on first run with NO license present, the app auto-starts an N-month
   trial (default N baked into the app) — no file exchange, prospect installs and uses immediately.
2. **Issued trial license:** owner generates a signed trial license (expiry = N months), optionally
   fingerprint-bound, via the same flow as a paid license — for specific prospects, more control.

**Expiry behavior (owner chose "grace period, then lock"):**
- On expiry, enter a short **grace period** (a few days) showing "trial expired / purchase to continue"
  warnings but still fully functional.
- After grace, drop to **read-only** (existing data viewable + exportable + backup-able; creating/editing
  blocked) with a purchase prompt. Read-only chosen over hard-lock so the shop is never locked out of its
  own records. *(Confirm exact end-state during build; default = read-only, not hard lock.)*
- Same expiry/grace/read-only behavior applies to any time-limited paid license too.

**Known limitation (frictionless trial abuse):** offline, a user can delete app data + reinstall to reset
a self-start trial. Partial mitigation: persist trial-start keyed to the device fingerprint in a sticky
location that survives reinstall (registry / OS app-data outside the app folder). Full prevention needs
the online layer (D20, deferred). Accepted for v1 — trial abuse is low-stakes vs. paid-license piracy.

## D22 — 'owner' user role

**Decision:** ✅ **Add an `owner` role** to `UserRole` (now `owner | admin | advisor | mechanic`).
The owner is the business owner and highest-privilege role, intended as the primary user of the future
online/remote dashboard (Phase 4, e.g. BACK-4-006). `admin` remains the on-site shop administrator.
- Added to the type now so data/roles are forward-compatible; no DB constraint change (role is TEXT).
- **Resolved:** the setup wizard's first account stays `admin` (full local control). The `owner` role is
  assigned later via user management (BACK-0-007) and is primarily meaningful for the future online phase.
- Requires a **license-generation tool on the owner's side** to create + sign licenses per sale.

**⚠️ Timeline note:** Owner chose "include in v1" over "fast-follow" (my recommendation was fast-follow).
This is genuine crypto + tooling work that does NOT increase app usability, and it risks locking out
legitimate customers if rushed. It measurably extends the v1 timeline. Recorded per owner's explicit
choice. Online activation (Option C) can be added later if remote revocation is ever needed.

**Clarification (shop name is NOT a protection mechanism):** With this decision, the shop name and all
branding details are plain data in the `app_config` table, entered via the setup wizard (D14) — NOT
hardcoded, and NOT used for licensing. Protection is handled entirely by the signed license file +
device binding. The name is purely cosmetic/branding.

## D18 — Backup & restore

**Decision:** ✅ **Auto + manual local backup.** Since cloud sync is deferred (D2), local backup is the
only safety net and is non-negotiable for v1.
- "Backup now" button (manual)
- Automatic date-stamped copies of the SQLite DB **and** logo/media files on app launch
- Backup target is a shop-chosen folder (e.g. USB drive, second disk, network folder)
- "Restore from backup" flow
- Uses Tauri fs; keep a rolling number of backups (don't fill the disk).

## D19 — Canonical job ticket status flow

**Decision:** ✅ **Triage → Estimate → Approved → In Progress → Done → Paid.**
This is the single source of truth (matches Plan.txt). Resolves the current conflict where `types.ts`
uses `estimate→approved→in_progress→completed→billed` and BACK-2-004 inserts `'triage'`.
**Action:** standardize the DB `orders.status` values, the `OrdersTable` type union, and all UI badges
to exactly these six stages. (May also want `cancelled` as a terminal side-state — to confirm during build.)
