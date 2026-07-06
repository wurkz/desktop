# Runbook: Running a Zorviz Demo

**Purpose:** the repeatable sequence to run a live demo from a fresh, realistic dataset —
reset, pre-flight checks, a suggested walkthrough that shows the product's strongest moments
in a sensible order, and fixes for the things that go wrong five minutes before a call.

**Companion reference:** [`../demo-credentials.md`](../demo-credentials.md) — logins, shop
profile, and the full list of what the seeder creates.

---

## Phase 1 — Reset to a fresh demo (before every demo)

From the **repo root**:

```powershell
npm run demo:reset
```

This stops the app, wipes the dev data (DB, media, license/trial — backups are kept),
relaunches `tauri dev`, waits for the server, and seeds **NP Car Aircon Repair** with jobs in
every status, bookings, a populated inventory, and 3 logins. Takes ~1–2 minutes (first run
compiles longer).

- [ ] The script ends with **"✅ Demo seeded."** and the app window is open.
- [ ] Log in as `admin / 123456` — the dashboard shows non-zero stats (active jobs, pending
      estimates, month revenue, **low stock: 1**).

> Seeding only (app already running and *unconfigured*): `npm run demo:seed`.
> Installed build instead of dev: wipe `%LOCALAPPDATA%\Zorviz\data`, launch the installed app,
> then `npm run demo:seed`.

## Phase 2 — Pre-flight (5 minutes before)

- [ ] **Logo** (optional but nice): Settings → Logo → upload — it appears on login, the header,
      and the Job Order PDF.
- [ ] **Phone on the same Wi-Fi** as the PC. Get the LAN URL from the dashboard's server status,
      or:

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -ne 'WellKnown' } | Select-Object IPAddress, InterfaceAlias
```

- [ ] Open `http://<pc-ip>:3030` on the phone → login screen loads. (If not, see
      Troubleshooting.)
- [ ] Log the phone in as the mechanic (`boy / 333333`) and leave it on **My Jobs**.
- [ ] On the PC, stay logged in as `admin / 123456`.

## Phase 3 — Suggested walkthrough (~15 min)

The seeded data is arranged so each stop has something to show:

1. **Dashboard (PC, admin)** — live stats; role-aware tiles.
2. **Jobs** — all jobs across every status; click the filter chips (show *paid*, *cancelled*…).
3. **Bookings** — two call-aheads. **Convert** Ramon's booking: customer is pre-filled → create
   his vehicle → intake opens with the complaint pre-filled → job ticket created. *"A phone call
   becomes a ticket in under a minute."*
4. **Estimate with real inventory** — on the new ticket, Create Estimate → Add Part → search
   "compressor" (picker shows stock + price) → add labor → show the **live totals**, the
   **₱/% discount toggle** (type an amount — it shows the % you're giving; exceed 15% — it
   blocks), and the **Senior/PWD** toggle (tax flips to VAT-exempt + 20% line).
5. **Approve** it → jump to **Inventory** and show the compressor's stock just **dropped by 1**.
   Flip the **Low stock** filter — the refrigerant is red. Open its neighbor's **stock log**
   (Receive +5 entry). Mention **CSV import** ("bring your existing parts list in one file").
6. **Phone (mechanic)** — the job appears in **My Jobs** → open it → **Start Job** → tick the
   checklist → **take a photo with the camera** → add a note to it → **Mark as Done**. *"The
   mechanic never touches the PC."*
7. **Back on the PC** — the done job shows **Time on job**. Optional: **Discounts** at billing.
   **Mark as Paid** → **Invoice PDF** → open it: their letterhead, TIN/VAT line, Job Order No.,
   UNIT column, T&C, signature lines — *"matches the paper pad you already use."*
8. **Closers as time allows** — Settings (asset types with the show-at-creation toggle, max
   discount, T&C), Backup & Restore (**Full Backup** = one zip with photos), the license story
   (offline, device-bound, read-only-never-destructive), and **Cancel** on an open job (requires
   a reason; restocks parts).

**Pre-seeded safety net:** if a live step stumbles, every state already exists in the seed —
there's a paid senior-discount order (INV receipt), an in-progress job, a pending estimate.
Navigate to one and keep talking.

## Phase 4 — After the demo

Nothing to clean up — just run `npm run demo:reset` before the next one. (Anything you created
live, including photos, is wiped by the reset.)

## Troubleshooting

| Symptom | Fix |
|---|---|
| `demo:reset` says it can't delete the DB | The app still holds it — close the Zorviz window, wait 2 s, rerun. Worst case: `taskkill /F /IM zorviz-desktop.exe` then rerun. |
| Reset hangs at "waiting for server" | First compile can take minutes — check `demo-dev.log` in the repo root. If it shows a compile error, don't demo from that commit. |
| Seed fails with "app already set up" | The wipe didn't happen (see DB-locked row above). Rerun `npm run demo:reset` — never `demo:seed` onto a configured app. |
| Phone can't reach `http://<pc-ip>:3030` | Same Wi-Fi? Guest/isolated SSIDs block LAN. Then check the firewall rule: `Get-NetFirewallRule -DisplayName "Zorviz LAN Server (Port 3030)"` — if missing, add it once as admin: `New-NetFirewallRule -DisplayName "Zorviz LAN Server (Port 3030)" -Direction Inbound -Protocol TCP -LocalPort 3030 -Action Allow`. |
| Port 3030 already in use | A previous instance is alive: `taskkill /F /IM zorviz-desktop.exe`, then rerun the reset. |
| Phone shows stale UI | Pull-to-refresh / reload the browser tab — the SPA is served by the PC. |

## Related
- [`../demo-credentials.md`](../demo-credentials.md) — logins + full seeded-data inventory
- [`pre-ship-checklist.md`](./pre-ship-checklist.md) — for demoing from an *installed* build
