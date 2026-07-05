# Runbook: Zorviz v1 Pre-Ship Checklist

**Purpose:** the repeatable sequence to take Zorviz from "feature-complete on master" to a
tested installer a real shop can run. Do the phases in order — each gates the next.

**Audience:** you (the maintainer), on the Windows build machine (PowerShell), plus one
**clean Windows machine** for the install test.

**Related:** license signing is its own runbook — [`license-keygen.md`](./license-keygen.md).
This checklist references it; it does not repeat the key-generation detail.

---

## Where app data lives (by build type)

`data_dir()` (in `src-tauri/src/db.rs`) is the single source of truth for the DB, `media/`,
backups, and the license file. It resolves differently by build:

- **Dev (debug):** `apps/desktop/data` (next to the app source; one level up from `src-tauri`).
- **Installed (release):** **`%LOCALAPPDATA%\Zorviz\data`** — a stable, always-writable per-user
  location (falls back to `%APPDATA%`, then the exe folder). This deliberately avoids using the
  install folder, because a Program-Files install is read-only for normal users.

Phase 4 verifies the installed app actually creates its DB at `%LOCALAPPDATA%\Zorviz\data` and
reuses it across restarts. (This was hardened specifically for the installed build — earlier it
keyed off the working directory, which is unreliable for a shortcut-launched app.)

---

## Prerequisites

- [ ] Rust toolchain + Node installed on the build machine (see `docs/RUST_SETUP.md`).
- [ ] `master` is green: `npm run build` (repo root) and `cd apps/desktop; npm run tauri build` both succeed.
- [ ] The **production signing keypair** exists and its **public** key is embedded (Phase 1).
- [ ] A **clean Windows machine** (or fresh VM) with no prior Zorviz install, on the same Wi-Fi/LAN as a phone.

---

## Phase 1 — Production license key (once, ever)

The shipped binary must embed a **production** public key, never the dev key.

- [ ] Follow [`license-keygen.md`](./license-keygen.md) **Steps 1–3**: generate the prod keypair,
      store the **private** key offline (password manager / offline media — **never** in the repo),
      and set `EMBEDDED_PUBLIC_KEY_B64` in `apps/desktop/src-tauri/src/license.rs`.
- [ ] **Confirm the dev key is gone.** It must NOT still be the dev value:

```powershell
Select-String -Path apps\desktop\src-tauri\src\license.rs -Pattern 'EMBEDDED_PUBLIC_KEY_B64'
```

  If it still shows `znwE5huw4Ns+DjRgdBPVG/oJYhWl13T7g2TRzwD2kOE=` (the dev key), **stop** — you'd
  ship a build anyone with the dev private key could license.

---

## Phase 2 — Version & config sanity

- [ ] Set the release version in `apps/desktop/src-tauri/tauri.conf.json` (`"version"`) and keep
      `package.json` in step if you track it there. (Currently `0.1.0`.)
- [ ] Confirm `"identifier": "com.zorviz.app"` and `"productName": "Zorviz"` are what you want on the
      installer / Start Menu.
- [ ] **No dev data ships.** The installer bundles the built frontend + Rust binary only; the DB is
      created on first run. Double-check there's no stray `apps/desktop/data/` being packaged (it
      isn't referenced by the bundle, but confirm the working tree is clean):

```powershell
git status --short
```

---

## Phase 3 — Build the installer

```powershell
cd apps\desktop; npm run tauri build
```

- [ ] Build completes without error. Artifacts land under
      `apps\desktop\src-tauri\target\release\bundle\`:
  - MSI:  `msi\Zorviz_<version>_x64_en-US.msi`
  - NSIS: `nsis\Zorviz_<version>_x64-setup.exe`
- [ ] Note the exact file names/paths for the next phase:

```powershell
Get-ChildItem apps\desktop\src-tauri\target\release\bundle -Recurse -Include *.msi,*.exe | Select-Object FullName, Length
```

---

## Phase 4 — Clean-machine install test (the important one)

Copy the MSI (or setup.exe) to the **clean machine** and install it.

- [ ] Installer runs and completes; Zorviz launches from the Start Menu.
- [ ] **Setup wizard appears** on first run (Shop Details → Custom Fields → Currency & Tax →
      What You Service → Admin Account) and completes; you land on the login screen and can log in.
- [ ] **Confirm the data folder** is the expected per-user location:

```powershell
Get-ChildItem "$env:LOCALAPPDATA\Zorviz\data" | Select-Object Name, Length
```

  - **Expected:** `zorviz.db` (plus `media\`, `backups\` once used) under `%LOCALAPPDATA%\Zorviz\data`.
  - If it's empty, sanity-check nothing landed elsewhere:
    `Get-ChildItem -Path C:\ -Recurse -Filter zorviz.db -ErrorAction SilentlyContinue -Force | Select-Object FullName`.
    A DB in `System32` / a read-only path would mean the release `data_dir()` branch regressed — revisit
    `db.rs`, rebuild (Phase 3), retest.
- [ ] Restart the app once — confirm it **reuses** the same DB (your shop name persists, no second
      setup wizard). This proves the data path is stable across launches.

---

## Phase 5 — Firewall rule for LAN (TCP 3030)

Phones reach the app at `http://<pc-lan-ip>:3030`. The app *attempts* to add the inbound rule at
startup, but that **only succeeds if the process is elevated**. Make it deterministic:

- [ ] On the shop PC, in an **Administrator** PowerShell, add the rule once:

```powershell
New-NetFirewallRule -DisplayName "Zorviz LAN Server (Port 3030)" -Direction Inbound -Protocol TCP -LocalPort 3030 -Action Allow
```

- [ ] Verify it exists:

```powershell
Get-NetFirewallRule -DisplayName "Zorviz LAN Server (Port 3030)"
```

  > Consider baking this into the installer (NSIS hook) as a fast-follow so shops don't need an admin
  > step. For v1, this manual command (or running the app once as admin) is acceptable.

---

## Phase 6 — LAN smoke test from a phone

- [ ] On the shop PC, get the LAN URL — the app shows it (Server status on the dashboard), or:

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -ne 'WellKnown' } | Select-Object IPAddress, InterfaceAlias
```

- [ ] On a phone on the **same** Wi-Fi, open `http://<pc-lan-ip>:3030`. The login screen loads.
- [ ] Log in as a staff/mechanic user; run a mini end-to-end:
  - [ ] Search/create an asset → New Ticket (intake).
  - [ ] Open the ticket → **Add Photo** → the phone **camera** opens → capture → thumbnail appears.
  - [ ] Open the photo → add a **Note** → it shows with author + time.
  - [ ] (Advisor/admin) confirm Delete Photo is present; (mechanic) confirm it is not.

---

## Phase 7 — Issue & install the production license

- [ ] In the installed app, open **Enter License** — copy **"This device's code"** (the device
      fingerprint). It's shown in the license banner/dialog.
- [ ] On your **secure** machine, sign a license for that device code using the **private** key —
      [`license-keygen.md`](./license-keygen.md) **Step 5** (`licensegen sign --shop … --devices <code> …`).
- [ ] Paste the issued license JSON into **Enter License** in the app.
- [ ] Confirm license state becomes **valid** (banner clears; no read-only warning). Verify a mutating
      action works (e.g. create a ticket) — a `403 read-only` would mean the license didn't take.

> If you're shipping on a **trial** first, issue a time-limited license instead (keygen runbook Step 7),
> or rely on the built-in self-start trial — confirm the trial banner shows the expected days.

---

## Phase 8 — Backup sanity

- [ ] Dashboard → **Data** → **Backup & Restore**: set the backup folder to an external/second drive.
- [ ] **Back Up Now** (DB-only) creates a `zorviz-<ts>.db` entry.
- [ ] **Full Backup** creates a `zorviz-full-<ts>.zip` (tagged "full") — this one includes the logo +
      ticket photos. Copy one off-site.
- [ ] (Optional but recommended once) **Restore** the full zip → restart the app → confirm data + a
      photo come back intact. Restore is staged and applied on the next launch (non-destructive until then).

---

## Final go/no-go checklist

- [ ] Production public key embedded; dev key gone (Phase 1).
- [ ] Installer builds; artifacts located (Phase 3).
- [ ] Clean-machine install: wizard → login → **DB lands in `%LOCALAPPDATA%\Zorviz\data`** and persists
      across restarts (Phase 4).
- [ ] Firewall rule present; phone reaches the app over LAN and can shoot a photo (Phases 5–6).
- [ ] Production license installs and reads **valid** (Phase 7).
- [ ] DB-only + Full backups work; a full restore round-trips (Phase 8).

---

## Rollback

- Bad build / regression: reinstall the previous MSI (keep the last known-good installer). The DB in
  the data folder is untouched by reinstalling the app binary.
- Bad license embedded: re-embed the correct public key, rebuild (Phase 3), redistribute. Existing
  signed licenses remain valid only against the matching public key.

## Deferred (not a ship blocker)

- **BACK-0-012** — online enforcement / remote kill-switch (needs the first hosted backend). The
  offline signed license (BACK-0-006) is what ships in v1.
- Installer-managed firewall rule (NSIS hook) — nice-to-have to remove the manual admin step.
