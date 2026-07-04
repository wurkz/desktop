# Runbook: Zorviz Production License Signing Key

**Applies to:** BACK-0-006 (licensing) · **Audience:** Zorviz owner/operator · **Platform:** Windows / PowerShell

## What this is

Zorviz licenses are **offline, Ed25519-signed files bound to a device fingerprint**. You hold a private
signing key; the app ships with the matching **public** key embedded. This runbook covers generating your
real production keypair, embedding the public key, rebuilding, and issuing/reissuing licenses and trials.

> ⚠️ **The shipped app currently embeds a DEV key.** Until you complete Steps 1–4 below, anyone with that
> dev private key could forge licenses. Do this **before distributing any installer**.

## 🔐 Security — read first

- **The private key is the crown jewel.** Anyone who has it can forge unlimited valid licenses for any shop.
  Store it in a password manager (1Password/Bitwarden) or an encrypted vault. **Never** commit it to the repo,
  put it in a build, paste it in chat/email, or store it on a shared drive.
- **If the private key leaks:** you must *rotate* — generate a new keypair, re-embed the new public key
  (Step 3), rebuild + redistribute the app (Step 4), and **re-issue every active shop's license** with the
  new key. Old licenses stop validating once the public key changes.
- **If you lose the private key:** you can no longer issue or reissue licenses. Recovery = same rotation
  procedure (new keypair, rebuild, reissue everyone). So **back it up** in at least two secure places.
- The public key embedded in `license.rs` is *not* secret — it's fine in the repo and the shipped binary.

## Prerequisites

- Rust toolchain installed (you already build the app), repo at `D:\Projects\Zorviz`.
- A secure place to store the private key (password manager).
- Run all commands from the Tauri crate directory:

```powershell
cd D:\Projects\Zorviz\apps\desktop\src-tauri
```

---

## Step 1 — Generate the production keypair (one time, ever)

```powershell
cargo run --quiet --bin licensegen -- keygen
```

**Expected output:** two lines —
```
PRIVATE_KEY (keep secret, never ship): <base64…>
PUBLIC_KEY  (embed in license.rs):     <base64…>
```

**Immediately:** copy the `PRIVATE_KEY` value into your password manager (entry name e.g. "Zorviz License
Signing Key — PRIVATE"). Copy the `PUBLIC_KEY` for the next step. Do **not** save the private key to any file
in the repo.

---

## Step 2 — Store the private key securely

- Save `PRIVATE_KEY` in your password manager **and** a second secure backup (offline/encrypted).
- Clear it from your clipboard/terminal scrollback when done.
- **On failure / doubt:** if you're unsure the key was saved correctly, re-run Step 1 to make a fresh keypair
  and use that one — but only *before* you've embedded/shipped a public key. Never ship with a key you can't
  reproduce.

---

## Step 3 — Embed the public key in the app

Edit `apps/desktop/src-tauri/src/license.rs`. Find:

```rust
pub const EMBEDDED_PUBLIC_KEY_B64: &str = "znwE5huw4Ns+DjRgdBPVG/oJYhWl13T7g2TRzwD2kOE=";
```

Replace the value with **your new `PUBLIC_KEY`** from Step 1 (keep the quotes and semicolon).

Verify it's the only occurrence and it compiles:

```powershell
Get-ChildItem -Path D:\Projects\Zorviz\apps\desktop\src-tauri\src -Recurse -Filter *.rs | Select-String -Pattern "EMBEDDED_PUBLIC_KEY_B64"
```

```powershell
cargo check
```

**Expected:** one match (the const), `cargo check` finishes with no errors.

---

## Step 4 — Rebuild and redistribute

```powershell
cd D:\Projects\Zorviz\apps\desktop
npm run tauri build
```

**Expected:** installers at
`apps\desktop\src-tauri\target\release\bundle\msi\Zorviz_0.1.0_x64_en-US.msi` and
`...\bundle\nsis\Zorviz_0.1.0_x64-setup.exe`.

- Only builds carrying the **new** public key can validate licenses you sign with the new private key.
- Any shop already running an older build must be updated to the new installer before their new license works.

**Commit** the `license.rs` public-key change (public key only — the private key is never in the repo):

```powershell
git add apps/desktop/src-tauri/src/license.rs; if ($?) { git commit -m "chore: embed production license public key" }
```

---

## Step 5 — Issue a license to a shop

1. On the shop's PC, open Zorviz → the license banner → **Enter License** dialog → copy **"This device's code"**
   (16-hex fingerprint). Have the shop send you that code (+ proof of purchase).
   - *Alternatively, on that machine:* `cargo run --quiet --bin licensegen -- fingerprint`
2. Sign a license (perpetual example) — paste the device code and your **private key**:

```powershell
cargo run --quiet --bin licensegen -- sign --shop "Aling Nena Auto Repair" --devices <device-code> --modules repair,inventory --expires none --key "<PRIVATE_KEY>"
```

**Expected output:** a JSON block:
```json
{ "data": "…", "sig": "…" }
```

3. Send that JSON to the shop. They paste it into **Enter License → Install License**. The banner clears and
   the app shows `valid`.

- Multiple devices: pass a comma list — `--devices code1,code2,code3`.
- `--modules` controls what's unlocked (e.g. `repair` or `repair,inventory`).

---

## Step 6 — Reissue / transfer (hardware change)

When a shop replaces a PC or reinstalls (the device code changes):

1. Get the **new** device code from the app on the new machine (Step 5.1).
2. Re-sign a fresh license bound to the new code (same command as Step 5, new `--devices`).
3. Send the new license file; they install it.

The old license simply won't validate on the new hardware — no other action needed. **Always keep a record**
(shop name → device code(s) → license issued) so reissues are quick.

---

## Step 7 — Issue a trial (time-limited license)

A trial is just a signed license with an expiry. Compute the expiry in Unix **milliseconds** (e.g. 3 months):

```powershell
[DateTimeOffset]::UtcNow.AddMonths(3).ToUnixTimeMilliseconds()
```

Then sign with `--expires <that-number>`:

```powershell
cargo run --quiet --bin licensegen -- sign --shop "Trial Shop" --devices <device-code> --modules repair --expires <ms-number> --key "<PRIVATE_KEY>"
```

- The app enters a short **grace period** at expiry (still usable, with a warning), then goes **read-only** —
  it never deletes data (D24); installing a paid license restores full access with everything intact.
- Note: a fresh install with **no** license already self-starts a 90-day trial, so an issued trial is only
  needed to grant a specific length or bind it to a device.

## Verification

- [ ] `EMBEDDED_PUBLIC_KEY_B64` in `license.rs` is your new public key; `cargo check` clean.
- [ ] `npm run tauri build` produced both installers.
- [ ] A license signed with the new private key installs and shows `valid` on a device running the **new** build.
- [ ] A license signed with the **old dev** key no longer validates on the new build (proves rotation worked).
- [ ] Private key stored in the password manager + a second secure backup; not present anywhere in the repo.

## Rollback

- Embedding is reversible: restore the previous `EMBEDDED_PUBLIC_KEY_B64` value and rebuild. But any licenses
  you signed with the new private key stop working until the new key is embedded again — prefer *forward* fixes
  (re-embed correct key + rebuild) over reverting once you've issued real licenses.

## Related
- `apps/desktop/src-tauri/src/license.rs` — verification + embedded public key
- `apps/desktop/src-tauri/src/bin/licensegen.rs` — the generator tool
- `docs/backlog/v1-decisions.md` — D17 (license model), D21 (trial), D24 (read-only, never destructive)
