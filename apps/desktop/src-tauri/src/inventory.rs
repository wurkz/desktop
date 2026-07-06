// Inventory management (BACK-3-002/003/005) + CSV bulk import for inventory and
// customers. Reads need auth; writes are front-desk staff only (owner/admin/advisor).
// search/create stay in api_data.rs (pre-existing); this module adds the rest.

use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;

use crate::api_data::{now_ms, require_staff, row_to_json};
use crate::auth::{session_from_headers, ApiState};

/// GET /api/inventory/all?low=1 — full inventory list (optionally only at/below reorder
/// point), newest-name-ordered. Auth required.
pub async fn list_inventory(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Vec<Value>>, StatusCode> {
    if session_from_headers(&state, &headers).is_none() {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let low_only = params.get("low").map(|s| s == "1").unwrap_or(false);
    let sql = if low_only {
        "SELECT * FROM inventory WHERE stock_on_hand <= reorder_point ORDER BY name LIMIT 1000"
    } else {
        "SELECT * FROM inventory ORDER BY name LIMIT 1000"
    };
    let rows = sqlx::query(sql)
        .fetch_all(&state.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(rows.iter().map(|r| Value::Object(row_to_json(r))).collect()))
}

#[derive(Deserialize)]
pub struct UpdateInventoryReq {
    name: String,
    sku: String,
    description: Option<String>,
    reorder_point: f64,
    unit_cost: i64,  // centavos
    unit_price: i64, // centavos
}

/// PUT /api/inventory/:id — edit an item (stock changes go through /adjust, not here).
pub async fn update_inventory(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<UpdateInventoryReq>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_staff(&state, &headers).map_err(|s| (s, "staff only".to_string()))?;
    if req.name.trim().is_empty() || req.sku.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "name and SKU are required".to_string()));
    }
    let desc = req.description.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let result = sqlx::query(
        "UPDATE inventory SET name = ?, sku = ?, description = ?, reorder_point = ?, unit_cost = ?, unit_price = ? WHERE id = ?",
    )
    .bind(req.name.trim())
    .bind(req.sku.trim())
    .bind(&desc)
    .bind(req.reorder_point)
    .bind(req.unit_cost)
    .bind(req.unit_price)
    .bind(&id)
    .execute(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "update failed".to_string()))?;
    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "item not found".to_string()));
    }
    fetch_item(&state, &id).await
}

/// DELETE /api/inventory/:id — hard delete (BACK-3-002), but blocked when the part is
/// referenced by any job line item so history stays intact.
pub async fn delete_inventory(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_staff(&state, &headers).map_err(|s| (s, "staff only".to_string()))?;
    let refs: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM order_items WHERE inventory_item_id = ?")
        .bind(&id)
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);
    if refs > 0 {
        return Err((
            StatusCode::CONFLICT,
            format!("This part is used on {} job line(s) — it can't be deleted.", refs),
        ));
    }
    let _ = sqlx::query("DELETE FROM inventory_adjustments WHERE item_id = ?").bind(&id).execute(&state.pool).await;
    let result = sqlx::query("DELETE FROM inventory WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "delete failed".to_string()))?;
    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "item not found".to_string()));
    }
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
pub struct AdjustReq {
    #[serde(rename = "type")]
    kind: String, // 'receive' | 'correction' | 'writeoff'
    delta: f64,   // signed change (UI derives sign from the type)
    note: Option<String>,
}

/// POST /api/inventory/:id/adjust — manual stock adjustment, applied atomically and
/// logged to inventory_adjustments with the acting user.
pub async fn adjust_inventory(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<AdjustReq>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_staff(&state, &headers).map_err(|s| (s, "staff only".to_string()))?;
    let session = session_from_headers(&state, &headers)
        .ok_or((StatusCode::UNAUTHORIZED, "unauthorized".to_string()))?;
    if !matches!(req.kind.as_str(), "receive" | "correction" | "writeoff") {
        return Err((StatusCode::BAD_REQUEST, "invalid adjustment type".to_string()));
    }
    if req.delta == 0.0 {
        return Err((StatusCode::BAD_REQUEST, "quantity can't be zero".to_string()));
    }
    let result = sqlx::query("UPDATE inventory SET stock_on_hand = stock_on_hand + ? WHERE id = ?")
        .bind(req.delta)
        .bind(&id)
        .execute(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "adjust failed".to_string()))?;
    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "item not found".to_string()));
    }
    let note = req.note.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let _ = sqlx::query(
        "INSERT INTO inventory_adjustments (id, item_id, type, delta, note, author, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&id)
    .bind(&req.kind)
    .bind(req.delta)
    .bind(&note)
    .bind(&session.name)
    .bind(now_ms())
    .execute(&state.pool)
    .await;
    fetch_item(&state, &id).await
}

/// GET /api/inventory/:id/adjustments — the item's adjustment log, newest first.
pub async fn list_adjustments(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Vec<Value>>, StatusCode> {
    if session_from_headers(&state, &headers).is_none() {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let rows = sqlx::query("SELECT * FROM inventory_adjustments WHERE item_id = ? ORDER BY created_at DESC LIMIT 100")
        .bind(&id)
        .fetch_all(&state.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(rows.iter().map(|r| Value::Object(row_to_json(r))).collect()))
}

// ---- CSV bulk imports (client parses the CSV; the server gets clean JSON rows) ----

#[derive(Deserialize)]
pub struct ImportItem {
    name: String,
    sku: Option<String>,
    description: Option<String>,
    stock: Option<f64>,
    reorder_point: Option<f64>,
    unit_cost: Option<i64>,  // centavos
    unit_price: Option<i64>, // centavos
}

#[derive(Deserialize)]
pub struct ImportInventoryReq {
    items: Vec<ImportItem>,
}

/// POST /api/inventory/import — bulk-create parts. Dedupe: an incoming row is skipped if
/// its SKU (when given) or exact name already exists. Returns {imported, skipped}.
pub async fn import_inventory(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(req): Json<ImportInventoryReq>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_staff(&state, &headers).map_err(|s| (s, "staff only".to_string()))?;
    let mut imported = 0u32;
    let mut skipped = 0u32;
    for item in &req.items {
        let name = item.name.trim();
        if name.is_empty() {
            skipped += 1;
            continue;
        }
        let sku_given = item.sku.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        let exists: i64 = if let Some(sku) = &sku_given {
            sqlx::query_scalar("SELECT COUNT(*) FROM inventory WHERE sku = ? OR name = ? COLLATE NOCASE")
                .bind(sku)
                .bind(name)
                .fetch_one(&state.pool)
                .await
                .unwrap_or(0)
        } else {
            sqlx::query_scalar("SELECT COUNT(*) FROM inventory WHERE name = ? COLLATE NOCASE")
                .bind(name)
                .fetch_one(&state.pool)
                .await
                .unwrap_or(0)
        };
        if exists > 0 {
            skipped += 1;
            continue;
        }
        let id = uuid::Uuid::new_v4().to_string();
        let sku = sku_given.unwrap_or_else(|| {
            let slug: String = name.to_lowercase().chars().map(|c| if c.is_alphanumeric() { c } else { '-' }).collect();
            format!("{}-{}", slug.trim_matches('-'), &id[..4])
        });
        let desc = item.description.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        let ok = sqlx::query(
            "INSERT INTO inventory (id, sku, name, description, stock_on_hand, reorder_point, unit_cost, unit_price) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(&sku)
        .bind(name)
        .bind(&desc)
        .bind(item.stock.unwrap_or(0.0))
        .bind(item.reorder_point.unwrap_or(5.0))
        .bind(item.unit_cost.unwrap_or(0))
        .bind(item.unit_price.unwrap_or(0))
        .execute(&state.pool)
        .await
        .is_ok();
        if ok { imported += 1 } else { skipped += 1 }
    }
    Ok(Json(json!({ "imported": imported, "skipped": skipped })))
}

#[derive(Deserialize)]
pub struct ImportCustomer {
    name: String,
    phone: Option<String>,
    email: Option<String>,
    address: Option<String>,
}

#[derive(Deserialize)]
pub struct ImportCustomersReq {
    customers: Vec<ImportCustomer>,
}

/// POST /api/customers/import — bulk-create customers. Dedupe: skipped when the same
/// name (case-insensitive) + phone combination already exists. Returns {imported, skipped}.
pub async fn import_customers(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(req): Json<ImportCustomersReq>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_staff(&state, &headers).map_err(|s| (s, "staff only".to_string()))?;
    let tenant = crate::api_data::tenant_id(&state).await;
    let mut imported = 0u32;
    let mut skipped = 0u32;
    for c in &req.customers {
        let name = c.name.trim();
        if name.is_empty() {
            skipped += 1;
            continue;
        }
        let clean = |o: &Option<String>| o.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        let phone = clean(&c.phone);
        let exists: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM customers WHERE name = ? COLLATE NOCASE AND COALESCE(phone,'') = COALESCE(?, '')",
        )
        .bind(name)
        .bind(&phone)
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);
        if exists > 0 {
            skipped += 1;
            continue;
        }
        let now = now_ms();
        let ok = sqlx::query(
            "INSERT INTO customers (id, tenant_id, name, phone, email, address, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(&tenant)
        .bind(name)
        .bind(&phone)
        .bind(clean(&c.email))
        .bind(clean(&c.address))
        .bind(now)
        .bind(now)
        .execute(&state.pool)
        .await
        .is_ok();
        if ok { imported += 1 } else { skipped += 1 }
    }
    Ok(Json(json!({ "imported": imported, "skipped": skipped })))
}

async fn fetch_item(state: &ApiState, id: &str) -> Result<Json<Value>, (StatusCode, String)> {
    let row = sqlx::query("SELECT * FROM inventory WHERE id = ? LIMIT 1")
        .bind(id)
        .fetch_one(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "reload failed".to_string()))?;
    Ok(Json(Value::Object(row_to_json(&row))))
}
