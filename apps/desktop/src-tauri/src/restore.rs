// Cloud Restore (protocol v2 §10, BACK-4-016 Part 1): write a cloud snapshot into an EMPTY
// local database, transactionally. The wizard (frontend) fetches the snapshot from the cloud
// (same CORS path the sync push uses) and posts it here; this handler never talks to the
// network. Guarded like /api/setup: refuses once any app_config row exists — never a merge.
use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Map, Value};
use sqlx::Row;

use crate::api_data::now_ms;
use crate::auth::ApiState;

// Insert order is parent-before-child per protocol §10.4. Columns mirror the cloud sync
// whitelists (protocol §5 / cloud SyncController::TABLES) — the fixed lists are a defense:
// snapshot keys never reach SQL directly. `tenant_id: true` = local schema requires it.
const TABLES: &[(&str, bool, &[&str])] = &[
    ("customers", true, &["id", "name", "phone", "email", "address", "notes", "created_at", "updated_at", "deleted_at"]),
    ("asset_types", true, &["id", "key", "name", "icon", "fields", "show_on_create", "sort_order", "created_at", "updated_at"]),
    ("assets", true, &["id", "owner_id", "type", "specs", "created_at", "updated_at", "deleted_at"]),
    ("bookings", false, &["id", "customer_name", "customer_phone", "note", "scheduled_time", "status", "asset_id", "customer_id", "request_id", "created_at", "updated_at"]),
    ("orders", false, &["id", "booking_id", "asset_id", "customer_id", "status", "customer_complaint", "assigned_mechanic_id", "receipt_number", "approval_proof", "inspection", "job_order_no", "terms", "senior_pwd_type", "senior_pwd_id", "senior_pwd_name", "subtotal", "tax", "discount", "senior_discount", "total", "started_at", "completed_at", "cancel_reason", "created_by", "cancelled_by", "discounted_by", "created_at", "updated_at"]),
    ("order_items", false, &["id", "order_id", "type", "description", "quantity", "unit", "unit_price", "total", "inventory_item_id", "completed", "cost_at_sale", "created_at", "updated_at"]),
    ("order_status_history", false, &["id", "order_id", "from_status", "to_status", "actor", "created_at"]),
    ("payments", false, &["id", "order_id", "method", "amount", "tendered", "change_due", "processed_by", "created_at"]),
    ("suppliers", false, &["id", "name", "contact_person", "phone", "address", "notes", "created_at", "updated_at"]),
    ("inventory", false, &["id", "sku", "name", "description", "stock_on_hand", "reorder_point", "unit_cost", "unit_price", "created_at", "updated_at"]),
    ("inventory_adjustments", false, &["id", "item_id", "type", "delta", "note", "author", "expense_id", "total_cost", "on_account", "supplier", "supplier_id", "created_at"]),
    ("expenses", false, &["id", "category", "amount", "note", "paid_from_drawer", "author", "voided", "voided_by", "receive_id", "created_at", "updated_at"]),
    ("drawer_sessions", false, &["id", "opening_float", "expected_cash", "counted_cash", "over_short", "opened_by", "closed_by", "opened_at", "closed_at", "created_at", "updated_at"]),
    ("drawer_movements", false, &["id", "type", "amount", "note", "author", "created_at"]),
];

#[derive(Deserialize)]
pub struct RestoreReq {
    cloud_url: String,
    device_token: String,
    tenant_id: String,
    shop_name: Option<String>,
    snapshot_at: i64,
    tables: Map<String, Value>,
}

fn bind_json<'q>(
    mut q: sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>>,
    v: &'q Value,
) -> sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>> {
    match v {
        Value::Null => q = q.bind(None::<String>),
        Value::Bool(b) => q = q.bind(if *b { 1_i64 } else { 0_i64 }),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                q = q.bind(i);
            } else {
                q = q.bind(n.as_f64().unwrap_or(0.0));
            }
        }
        Value::String(s) => q = q.bind(s.as_str()),
        other => q = q.bind(other.to_string()),
    }
    q
}

/// POST /api/setup/restore — protocol v2 recovery write. Unauthenticated by necessity
/// (pre-setup, no users usable yet) but hard-guarded: only runs while app_config is empty.
pub async fn restore_from_snapshot(
    State(state): State<ApiState>,
    Json(req): Json<RestoreReq>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let existing: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM app_config")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(1);
    if existing > 0 {
        return Err((StatusCode::CONFLICT, "This installation is already set up — restore only works on a fresh install.".to_string()));
    }
    let tenant = req.tenant_id.trim().to_string();
    if tenant.is_empty() || req.device_token.trim().is_empty() || req.cloud_url.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "tenant, cloud URL and device token are required".to_string()));
    }

    let rows_of = |name: &str| -> Vec<Map<String, Value>> {
        req.tables
            .get(name)
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(Value::as_object).cloned().collect())
            .unwrap_or_default()
    };

    let mut tx = state
        .pool
        .begin()
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "could not start the restore".to_string()))?;
    let now = now_ms();

    // 1. app_config — identity first: the ORIGINAL tenant_id keeps future pushes on the same
    // cloud tenant. Shop settings come from the snapshot's shop_settings row when present.
    let ss = rows_of("shop_settings").into_iter().next().unwrap_or_default();
    let sget = |k: &str| ss.get(k).cloned().unwrap_or(Value::Null);
    let shop_name = sget("shop_name")
        .as_str()
        .map(str::to_string)
        .or(req.shop_name.clone())
        .unwrap_or_else(|| "Wurkz Shop".to_string());
    sqlx::query(
        "INSERT INTO app_config (id, tenant_id, branch_id, shop_name, device_name, currency_symbol, locale, \
         tax_rate, vat_status, tax_inclusive, max_discount_pct, cloud_url, device_token, sync_enabled, last_synced_at, \
         created_at, updated_at) \
         VALUES ('default', ?, 'main', ?, 'Restored PC', ?, 'en-US', ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)",
    )
    .bind(&tenant)
    .bind(&shop_name)
    .bind(sget("currency_symbol").as_str().unwrap_or("₱"))
    .bind(sget("tax_rate").as_f64().unwrap_or(12.0))
    .bind(sget("vat_status").as_str())
    .bind(sget("tax_inclusive").as_i64().unwrap_or(0))
    .bind(sget("max_discount_pct").as_f64())
    .bind(req.cloud_url.trim().trim_end_matches('/'))
    .bind(req.device_token.trim())
    .bind(req.snapshot_at)
    .bind(now)
    .bind(now)
    .execute(&mut *tx)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("config restore failed: {e}")))?;

    // 2. Staff — complete accounts, unusable credentials ('' never matches a PIN hash).
    // The wizard's claim step re-keys the recovering admin/owner.
    let mut admins: Vec<Value> = Vec::new();
    for u in rows_of("staff_directory") {
        let get = |k: &str| u.get(k).cloned().unwrap_or(Value::Null);
        let role = get("role").as_str().unwrap_or("mechanic").to_string();
        sqlx::query(
            "INSERT INTO users (id, name, username, pin_hash, pin_salt, role, email, is_active, created_at, updated_at) \
             VALUES (?, ?, ?, '', '', ?, ?, ?, ?, ?)",
        )
        .bind(get("id").as_str().unwrap_or_default())
        .bind(get("name").as_str().unwrap_or("Staff"))
        .bind(get("username").as_str().unwrap_or_default())
        .bind(&role)
        .bind(get("email").as_str())
        .bind(get("is_active").as_i64().unwrap_or(1))
        .bind(get("updated_at").as_i64().unwrap_or(now))
        .bind(get("updated_at").as_i64().unwrap_or(now))
        .execute(&mut *tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("staff restore failed: {e}")))?;
        if matches!(role.as_str(), "owner" | "admin") && get("is_active").as_i64().unwrap_or(1) == 1 {
            admins.push(json!({
                "id": get("id"), "name": get("name"), "username": get("username"), "role": role,
            }));
        }
    }
    if admins.is_empty() {
        return Err((StatusCode::UNPROCESSABLE_ENTITY, "The snapshot has no active admin/owner account to re-key.".to_string()));
    }

    // 3. Business data, parents before children, fixed column lists.
    let mut counts = Map::new();
    for (table, needs_tenant, cols) in TABLES {
        let rows = rows_of(table);
        let mut n = 0u64;
        for row in &rows {
            let mut col_names: Vec<&str> = cols.to_vec();
            if *needs_tenant {
                col_names.insert(1, "tenant_id");
            }
            let placeholders = vec!["?"; col_names.len()].join(", ");
            let sql = format!(
                "INSERT INTO {table} ({}) VALUES ({placeholders})",
                col_names.join(", ")
            );
            let mut q = sqlx::query(&sql);
            let tenant_v = Value::String(tenant.clone());
            let null = Value::Null;
            for c in &col_names {
                let v = if *c == "tenant_id" { &tenant_v } else { row.get(*c).unwrap_or(&null) };
                q = bind_json(q, v);
            }
            q.execute(&mut *tx)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{table} restore failed: {e}")))?;
            n += 1;
        }
        counts.insert(table.to_string(), Value::from(n));
    }

    tx.commit()
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "could not finish the restore".to_string()))?;

    Ok(Json(json!({ "ok": true, "shop_name": shop_name, "counts": counts, "admins": admins })))
}

#[derive(Deserialize)]
pub struct ClaimReq {
    user_id: String,
    pin: String,
}

/// POST /api/setup/restore-claim — the wizard's "pick your account, set a new PIN" step.
/// Unauthenticated by necessity, but self-sealing: allowed ONLY while no admin/owner has a
/// usable PIN (i.e. immediately after a restore). The first claim closes the door; everyone
/// else is re-keyed from the Staff page by that admin.
pub async fn restore_claim(
    State(state): State<ApiState>,
    Json(req): Json<ClaimReq>,
) -> Result<Json<Value>, (StatusCode, String)> {
    if req.pin.len() != 6 || !req.pin.chars().all(|c| c.is_ascii_digit()) {
        return Err((StatusCode::BAD_REQUEST, "PIN must be exactly 6 digits".to_string()));
    }
    let claimable: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM users WHERE role IN ('owner','admin') AND is_active = 1 AND pin_hash != ''",
    )
    .fetch_one(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?;
    if claimable > 0 {
        return Err((StatusCode::FORBIDDEN, "An admin already has a PIN — sign in and use the Staff page instead.".to_string()));
    }
    let target = sqlx::query(
        "SELECT id, name, username FROM users WHERE id = ? AND role IN ('owner','admin') AND is_active = 1 LIMIT 1",
    )
    .bind(req.user_id.trim())
    .fetch_optional(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?
    .ok_or((StatusCode::NOT_FOUND, "account not found".to_string()))?;

    let (hash, salt) = crate::auth::hash_pin(&req.pin);
    sqlx::query("UPDATE users SET pin_hash = ?, pin_salt = ?, updated_at = ? WHERE id = ?")
        .bind(&hash)
        .bind(&salt)
        .bind(now_ms())
        .bind(req.user_id.trim())
        .execute(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "could not set the PIN".to_string()))?;
    let username: String = target.try_get("username").unwrap_or_default();
    Ok(Json(json!({ "ok": true, "username": username })))
}
