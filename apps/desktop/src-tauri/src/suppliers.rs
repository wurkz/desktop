// Supplier master data: real records behind the payables flow. Receives link via
// supplier_id (the legacy free-text `supplier` column is kept in sync as a display name).
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::api_data::{now_ms, require_staff, row_to_json};
use crate::auth::ApiState;

/// Find-or-create a supplier by (trimmed, case-insensitive) name. Used by the receive flow
/// so typing a new name implicitly creates the record; details are filled in later.
pub async fn find_or_create_by_name(pool: &sqlx::SqlitePool, name: &str) -> Option<String> {
    let name = name.trim();
    if name.is_empty() {
        return None;
    }
    if let Ok(Some(id)) =
        sqlx::query_scalar::<_, String>("SELECT id FROM suppliers WHERE name = ? COLLATE NOCASE LIMIT 1")
            .bind(name)
            .fetch_optional(pool)
            .await
    {
        return Some(id);
    }
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_ms();
    sqlx::query("INSERT INTO suppliers (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
        .bind(&id)
        .bind(name)
        .bind(now)
        .bind(now)
        .execute(pool)
        .await
        .ok()?;
    Some(id)
}

/// GET /api/suppliers — directory with money aggregates: outstanding payable balance and
/// the last receive date. Staff only.
pub async fn list_suppliers(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> Result<Json<Vec<Value>>, StatusCode> {
    require_staff(&state, &headers)?;
    let rows = sqlx::query(
        "SELECT s.*, \
            COALESCE((SELECT SUM(a.total_cost - COALESCE((SELECT SUM(e.amount) FROM expenses e \
                WHERE e.receive_id = a.id AND e.voided = 0), 0)) \
                FROM inventory_adjustments a \
                WHERE a.supplier_id = s.id AND a.on_account = 1 AND a.expense_id IS NULL \
                AND a.total_cost > COALESCE((SELECT SUM(e.amount) FROM expenses e \
                    WHERE e.receive_id = a.id AND e.voided = 0), 0)), 0) AS owed, \
            (SELECT MAX(a.created_at) FROM inventory_adjustments a WHERE a.supplier_id = s.id) AS last_receive_at \
         FROM suppliers s ORDER BY s.name COLLATE NOCASE",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(rows.iter().map(|r| Value::Object(row_to_json(r))).collect()))
}

#[derive(Deserialize)]
pub struct SupplierReq {
    name: String,
    contact_person: Option<String>,
    phone: Option<String>,
    address: Option<String>,
    notes: Option<String>,
}

fn clean(v: &Option<String>) -> Option<String> {
    v.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

/// POST /api/suppliers — create (name unique, case-insensitive). Staff only.
pub async fn create_supplier(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(req): Json<SupplierReq>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_staff(&state, &headers).map_err(|s| (s, "staff only".to_string()))?;
    let name = req.name.trim().to_string();
    if name.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "the supplier needs a name".to_string()));
    }
    let dupe: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM suppliers WHERE name = ? COLLATE NOCASE")
        .bind(&name)
        .fetch_one(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?;
    if dupe > 0 {
        return Err((StatusCode::CONFLICT, "A supplier with that name already exists.".to_string()));
    }
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_ms();
    sqlx::query(
        "INSERT INTO suppliers (id, name, contact_person, phone, address, notes, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&name)
    .bind(clean(&req.contact_person))
    .bind(clean(&req.phone))
    .bind(clean(&req.address))
    .bind(clean(&req.notes))
    .bind(now)
    .bind(now)
    .execute(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "could not create the supplier".to_string()))?;
    fetch_one(&state, &id).await
}

#[derive(Deserialize)]
pub struct ImportSuppliersReq {
    suppliers: Vec<SupplierReq>,
}

/// POST /api/suppliers/import — bulk-create suppliers. Dedupe: skipped when the name already
/// exists (case-insensitive — same rule as create/find-or-create) in the DB or earlier in the
/// same file. Returns {imported, skipped, skipped_rows} — skipped_rows carry a reason
/// (duplicate/invalid) for the caller to display; nothing about them is persisted.
pub async fn import_suppliers(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(req): Json<ImportSuppliersReq>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_staff(&state, &headers).map_err(|s| (s, "staff only".to_string()))?;
    let mut imported = 0u32;
    let mut skipped_rows: Vec<Value> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    for s in &req.suppliers {
        let name = s.name.trim();
        let skip = |reason: &str, skipped_rows: &mut Vec<Value>| {
            skipped_rows.push(json!({
                "name": name,
                "contact_person": clean(&s.contact_person).unwrap_or_default(),
                "phone": clean(&s.phone).unwrap_or_default(),
                "address": clean(&s.address).unwrap_or_default(),
                "notes": clean(&s.notes).unwrap_or_default(),
                "reason": reason,
            }));
        };
        if name.is_empty() {
            skip("invalid (no name)", &mut skipped_rows);
            continue;
        }
        let key = name.to_lowercase();
        if seen.contains(&key) {
            skip("duplicate (in file)", &mut skipped_rows);
            continue;
        }
        let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM suppliers WHERE name = ? COLLATE NOCASE")
            .bind(name)
            .fetch_one(&state.pool)
            .await
            .unwrap_or(0);
        if exists > 0 {
            skip("duplicate", &mut skipped_rows);
            continue;
        }
        let now = now_ms();
        let ok = sqlx::query(
            "INSERT INTO suppliers (id, name, contact_person, phone, address, notes, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(name)
        .bind(clean(&s.contact_person))
        .bind(clean(&s.phone))
        .bind(clean(&s.address))
        .bind(clean(&s.notes))
        .bind(now)
        .bind(now)
        .execute(&state.pool)
        .await
        .is_ok();
        if ok {
            imported += 1;
            seen.insert(key);
        } else {
            skip("invalid (insert failed)", &mut skipped_rows);
        }
    }
    Ok(Json(json!({ "imported": imported, "skipped": skipped_rows.len(), "skipped_rows": skipped_rows })))
}

/// PUT /api/suppliers/:id — update contact details. Renames propagate to the denormalized
/// display name on past receives. Staff only.
pub async fn update_supplier(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<SupplierReq>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_staff(&state, &headers).map_err(|s| (s, "staff only".to_string()))?;
    let name = req.name.trim().to_string();
    if name.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "the supplier needs a name".to_string()));
    }
    let dupe: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM suppliers WHERE name = ? COLLATE NOCASE AND id != ?")
            .bind(&name)
            .bind(&id)
            .fetch_one(&state.pool)
            .await
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?;
    if dupe > 0 {
        return Err((StatusCode::CONFLICT, "A supplier with that name already exists.".to_string()));
    }
    let res = sqlx::query(
        "UPDATE suppliers SET name = ?, contact_person = ?, phone = ?, address = ?, notes = ?, updated_at = ? \
         WHERE id = ?",
    )
    .bind(&name)
    .bind(clean(&req.contact_person))
    .bind(clean(&req.phone))
    .bind(clean(&req.address))
    .bind(clean(&req.notes))
    .bind(now_ms())
    .bind(&id)
    .execute(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "could not update the supplier".to_string()))?;
    if res.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "supplier not found".to_string()));
    }
    let _ = sqlx::query("UPDATE inventory_adjustments SET supplier = ? WHERE supplier_id = ?")
        .bind(&name)
        .bind(&id)
        .execute(&state.pool)
        .await;
    fetch_one(&state, &id).await
}

/// GET /api/suppliers/:id — profile: the record, open payables (with running balance), and
/// the receive history (each row carries what's been paid against it). Staff only.
pub async fn supplier_detail(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_staff(&state, &headers).map_err(|s| (s, "staff only".to_string()))?;
    let supplier = sqlx::query("SELECT * FROM suppliers WHERE id = ? LIMIT 1")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "supplier not found".to_string()))?;

    let history = sqlx::query(
        "SELECT a.id, a.delta, a.total_cost, a.on_account, a.expense_id, a.note, a.created_at, \
                i.name AS item_name, i.sku, \
                COALESCE((SELECT SUM(e.amount) FROM expenses e \
                    WHERE e.receive_id = a.id AND e.voided = 0), 0) AS paid \
         FROM inventory_adjustments a JOIN inventory i ON i.id = a.item_id \
         WHERE a.supplier_id = ? ORDER BY a.created_at DESC LIMIT 200",
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?;

    let mut receives: Vec<Value> = Vec::new();
    let mut owed: i64 = 0;
    for r in &history {
        // Decide off the null-safe JSON map: sqlx's SQLite try_get can decode NULL as a
        // zero value (e.g. "" for String), which would misread an open payable as settled.
        let mut obj = row_to_json(r);
        let total = obj.get("total_cost").and_then(Value::as_i64).unwrap_or(0);
        let paid = obj.get("paid").and_then(Value::as_i64).unwrap_or(0);
        let on_account = obj.get("on_account").and_then(Value::as_i64).unwrap_or(0);
        let linked = obj.get("expense_id").map(|v| !v.is_null()).unwrap_or(false);
        let balance = if on_account == 1 && !linked { (total - paid).max(0) } else { 0 };
        owed += balance;
        obj.insert("balance".to_string(), Value::from(balance));
        receives.push(Value::Object(obj));
    }

    Ok(Json(json!({
        "supplier": Value::Object(row_to_json(&supplier)),
        "receives": receives,
        "owed": owed,
    })))
}

async fn fetch_one(state: &ApiState, id: &str) -> Result<Json<Value>, (StatusCode, String)> {
    let row = sqlx::query("SELECT * FROM suppliers WHERE id = ? LIMIT 1")
        .bind(id)
        .fetch_one(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "read failed".to_string()))?;
    Ok(Json(Value::Object(row_to_json(&row))))
}
