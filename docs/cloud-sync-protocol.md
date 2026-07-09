# Cloud Sync Protocol (v1.1 — LOCKED; v1 2026-07-08, v1.1 2026-07-09)

> **Status:** LOCKED v1 (decisions in §9 confirmed) — implementation in progress, backend parked.
> This is the single contract both sides build
> against: the **desktop (Commander)** implements the client; the **cloud backend** implements the
> receiver to match. Client-first / contract-first — the local SQLite is the source of truth; the
> cloud is an optional mirror/backup (Plan §Sync-is-a-Feature).
>
> Defaults below are **recommendations** — override any before we implement.

---

## 1. Principles

- **Local-first, fail-safe.** The app runs fully offline. Sync is opt-in (`app_config.sync_enabled`)
  and any sync failure is caught + backed off — it never blocks or corrupts local operation.
- **One Commander per shop (v1).** A shop = one desktop install = one `tenant_id`. No multi-writer
  conflicts in v1, so **push-only** (backup) is the MVP. Pull / multi-device is reserved (§8).
- **The client owns the contract.** The backend conforms to this document.

## 2. Identity & auth

- `tenant_id` — unique UUID per install (in `app_config`, generated at setup). Identifies the shop.
- `device_token` — opaque bearer token issued by the cloud when the owner registers the device
  (BACK-4-005). Stored in `app_config.device_token`.
- Every request: `Authorization: Bearer <device_token>`. The backend resolves **token → tenant_id**
  server-side and scopes all data to that tenant. **The server never trusts a client-supplied
  `tenant_id`** for authorization (it's sent only for sanity/logging).
- Rejected/absent token → `401`; token valid but revoked/mismatched tenant → `403`.

## 3. Transport

- HTTPS (TLS) only. Base URL from `app_config.cloud_url` (no trailing slash).
- `Content-Type: application/json`. Bodies are UTF-8 JSON.
- **Encryption at rest / app-layer diff encryption (BACK-4-008): RESERVED.** v1 relies on TLS in
  transit; a future version may wrap `changes` in an owner-held-key envelope. Versioned via §7.

## 4. Endpoints

### `GET /health`
Liveness + auth probe. Used by the desktop's status pill.
- `200 {"ok": true, "server_time": <epoch_ms>}` → status "Connected".
- `401`/`403` → "Device token rejected". Any other/unreachable → "Can't reach cloud backend".

### `POST /sync/push`  (v1 core)
Uploads local changes since the last watermark. **Idempotent** — safe to resend the same batch
(backend upserts by primary key).

Request:
```jsonc
{
  "protocol_version": 1,
  "tenant_id": "a20b7cf1-…",       // sanity only; auth is the token
  "device_name": "Main PC",
  "since": 0,                        // client's last_synced_at (epoch ms); 0 = full initial push
  "sent_at": 1751990000000,
  "changes": {                       // only tables with rows changed since `since`
    "customers":   [ { …row… }, … ],
    "assets":      [ … ],
    "asset_types": [ … ],
    "bookings":    [ … ],
    "orders":      [ … ],
    "order_items": [ … ],
    "inventory":   [ … ],
    "inventory_adjustments": [ … ],
    "payments":    [ … ],
    "expenses":        [ … ],
    "drawer_sessions": [ … ],
    "order_status_history": [ … ],
    "drawer_movements": [ … ]
  }
}
```
- Rows are the **full row** as stored locally (snake_case columns, money in centavos, timestamps in
  epoch ms), each carrying its primary key `id`. Backend **upserts by `id`** into the tenant's rows.
- Soft-deletes propagate via the existing `deleted_at` column (e.g. assets); no hard deletes in v1.
- Tables **excluded from v1 sync:** `users` (local auth; synced later with care), `app_config`
  (device-local settings incl. the cloud-link config + watermark itself), and **media** (photos are
  files under `media/`; `order_photos`/`photo_notes` metadata + file blobs are deferred to §8).
- `asset_types` **is** synced (small, shop-defined config; already has `updated_at`).

Response:
```jsonc
{
  "ok": true,
  "watermark": 1751990000000,   // new last_synced_at the client should store (backend's sent_at)
  "accepted": { "customers": 3, "orders": 1, … },  // counts, for status/telemetry
  "protocol_version": 1
}
```
- On `200` the client stores `watermark` in `app_config.last_synced_at`.
- Partial failure is **all-or-nothing per request** (backend applies the batch in a transaction);
  on any error the client keeps its old watermark and retries the same window later.

### `POST /sync/pull`  (RESERVED — not v1)
Reserved for multi-device / portal write-back. Shape TBD when we build bidirectional sync (§8).

## 5. Watermark & change tracking

- Client keeps `app_config.last_synced_at` (epoch ms; 0 initially).
- A push sends every synced-table row with `updated_at > since` (append-only tables use `created_at`).
- On success, `last_synced_at := response.watermark` (the backend's `sent_at`, so clock skew is the
  backend's single clock, not the device's).
- **Schema prerequisite (migration lands first — audited 2026-07-08):** every synced table needs a
  monotonic change marker.
  - `inventory` — **no timestamps**; add `created_at` + `updated_at`, touched on every write
    (create/edit, stock adjustment, and auto deduct/restock on approval/cancel).
  - `order_items` — **no timestamps**; add `created_at` + `updated_at`, set on insert (estimate save
    re-creates them) and bumped on the `completed` toggle.
  - Append-only, `created_at` is the marker (no change needed): `payments`, `inventory_adjustments`.
  - **Added 2026-07-08 (BACK-3-010..013, still protocol v1 — additive):** `expenses` and
    `drawer_sessions` sync with `updated_at` markers (soft-void / close bump them);
    `order_items` gains `cost_at_sale`; `orders` gains `created_by`/`cancelled_by`/`discounted_by`;
    `payments.amount` is now the **per-payment** amount (multiple payments per order — partials);
    upsert-by-id semantics unchanged. `order_status_history` (0022) also syncs — append-only
    movement log, `created_at` marker. **0023 (BACK-3-016/017, additive):** `inventory_adjustments`
    gains `expense_id`/`total_cost`/`on_account`; new `drawer_movements` table syncs append-only
    (`created_at` marker).
  - Already have `updated_at` (no change): `orders`, `customers`, `assets`, `asset_types`, `bookings`.
  - `app_config` gains `last_synced_at` (the client watermark).
  - **v1.1 (2026-07-09, additive — desktop 0024/0025/0026 master data + partial settlement):**
    - `expenses` gains `receive_id` — a payment against an on-account receive (partials allowed).
      **Breaking semantics note:** settlement no longer writes `inventory_adjustments.expense_id`;
      the outstanding payable balance is `total_cost − SUM(unvoided expenses with receive_id = a.id)`
      (a voided payment reopens the payable). Cloud consumers computing payables MUST use the
      balance formula, not `expense_id IS NULL` alone.
    - `inventory_adjustments` gains `supplier` (denormalized display name) + `supplier_id`.
    - `customers` gains `notes` (staff-facing).
    - New table 14: **`suppliers`** (`id`, `name`, `contact_person`, `phone`, `address`, `notes`,
      `created_at`, `updated_at`) — `updated_at` marker, upsert by (tenant_id, id). Desktop ids
      may be 32-char hex (migration backfill) rather than strict UUID.

## 6. Trigger cadence (client)

- On `/health` → Connected: run one push.
- Then periodic push (default **every 60s** while connected) + a **debounced push ~5s after any
  local mutation**.
- All within the existing fail-safe lifecycle (backoff on error; never blocks the UI).
- A manual **"Sync now"** action in Settings.

## 7. Versioning & errors

- `protocol_version` in every request/response. Backend rejects unknown major versions with `409`
  and a `{ "min_supported": N }` hint so the desktop can prompt an update.
- Error envelope: `{ "ok": false, "error": "<machine_code>", "message": "<human>" }`.
- Standard codes: `401` no/invalid token · `403` revoked/tenant mismatch · `409` protocol mismatch ·
  `422` malformed batch · `5xx` server → client backs off and retries.

## 8. Reserved for later (explicitly not v1)

- **Pull / bidirectional sync** and conflict resolution (the `resolver` in `packages/sync-engine`).
- **Media/file sync** (ticket photos, logo) — likely presigned-URL uploads, separate from row sync.
- **App-layer encryption** of `changes` (BACK-4-008), key management, owner-held keys.
- **Users/app_config sync** — sensitive; deferred with an explicit policy.

## 9. Decisions (confirmed 2026-07-08)

1. **Direction:** ✅ push-only backup for v1 (pull/bidirectional reserved, §8).
2. **Change tracking:** ✅ watermark via `updated_at`/`created_at` (schema migration per §5 lands first).
3. **Encryption:** ✅ TLS-only for v1; app-layer diff encryption reserved (BACK-4-008).
4. **`asset_types`:** ✅ included in sync.
5. **`users` sync:** ✅ deferred for v1.
