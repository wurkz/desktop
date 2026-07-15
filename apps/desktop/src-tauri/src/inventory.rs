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
use sqlx::Row;
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
        "UPDATE inventory SET name = ?, sku = ?, description = ?, reorder_point = ?, unit_cost = ?, unit_price = ?, updated_at = ? WHERE id = ?",
    )
    .bind(req.name.trim())
    .bind(req.sku.trim())
    .bind(&desc)
    .bind(req.reorder_point)
    .bind(req.unit_cost)
    .bind(req.unit_price)
    .bind(now_ms())
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
    // BACK-3-016 — receive money section (all optional; blank = old behavior):
    total_cost: Option<i64>,       // centavos paid (or owed when on_account)
    paid_from_drawer: Option<bool>, // for the auto-created expense
    on_account: Option<bool>,      // supplier credit — record the payable, no expense yet
    link_expense_id: Option<String>, // attach a previously-recorded parts expense instead
    update_unit_cost: Option<bool>, // refresh the item's unit_cost from total_cost/qty
    supplier: Option<String>,       // who the stock came from (free text; payables group by it)
}

/// POST /api/inventory/:id/adjust — manual stock adjustment, applied atomically and
/// logged to inventory_adjustments with the acting user. For receives, the optional money
/// fields link/record the purchase (BACK-3-016): new expense, existing expense, or on-account.
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

    // Money fields only make sense on a receive.
    let is_receive = req.kind == "receive";
    let on_account = is_receive && req.on_account.unwrap_or(false);
    let mut total_cost = if is_receive { req.total_cost.filter(|v| *v > 0) } else { None };
    let link_expense = if is_receive {
        req.link_expense_id.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
    } else {
        None
    };
    if on_account && total_cost.is_none() {
        return Err((StatusCode::BAD_REQUEST, "enter the amount owed for an on-account receive".to_string()));
    }

    // Linking an existing expense: validate it's a live parts expense and not already linked.
    if let Some(exp_id) = &link_expense {
        let ok: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM expenses WHERE id = ? AND category = 'parts' AND voided = 0 \
             AND receive_id IS NULL \
             AND id NOT IN (SELECT expense_id FROM inventory_adjustments WHERE expense_id IS NOT NULL)",
        )
        .bind(exp_id)
        .fetch_one(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?;
        if ok == 0 {
            return Err((StatusCode::CONFLICT, "That expense is unavailable (not a parts expense, voided, or already linked).".to_string()));
        }
        // Inherit the receive's money value from the linked expense unless given explicitly.
        if total_cost.is_none() {
            total_cost = sqlx::query_scalar("SELECT amount FROM expenses WHERE id = ? LIMIT 1")
                .bind(exp_id)
                .fetch_optional(&state.pool)
                .await
                .ok()
                .flatten();
        }
    }

    // Read the item (name/sku for the auto-expense note) and bump stock.
    let item = sqlx::query("SELECT name, sku FROM inventory WHERE id = ? LIMIT 1")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "item not found".to_string()))?;
    let item_name: String = item.try_get("name").unwrap_or_default();
    let item_sku: String = item.try_get("sku").unwrap_or_default();

    sqlx::query("UPDATE inventory SET stock_on_hand = stock_on_hand + ?, updated_at = ? WHERE id = ?")
        .bind(req.delta)
        .bind(now_ms())
        .bind(&id)
        .execute(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "adjust failed".to_string()))?;

    let note = req.note.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let now = now_ms();

    // Auto-create the linked parts expense when a payment was recorded here (not on-account,
    // not linking an existing one).
    let mut expense_id = link_expense.clone();
    if let (Some(cost), false, None) = (total_cost, on_account, link_expense.as_ref()) {
        let exp_note = match &note {
            Some(n) => format!("Receive {}× {} ({}) — {}", req.delta, item_name, item_sku, n),
            None => format!("Receive {}× {} ({})", req.delta, item_name, item_sku),
        };
        let eid = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO expenses (id, category, amount, note, paid_from_drawer, author, voided, created_at, updated_at) \
             VALUES (?, 'parts', ?, ?, ?, ?, 0, ?, ?)",
        )
        .bind(&eid)
        .bind(cost)
        .bind(&exp_note)
        .bind(if req.paid_from_drawer.unwrap_or(true) { 1_i64 } else { 0_i64 })
        .bind(&session.name)
        .bind(now)
        .bind(now)
        .execute(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "expense insert failed".to_string()))?;
        expense_id = Some(eid);
    }

    // Supplier: a typed name finds-or-creates the master record; both the id link and the
    // denormalized display name are stored.
    let supplier = if is_receive {
        req.supplier.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
    } else {
        None
    };
    let supplier_id = match &supplier {
        Some(name) => crate::suppliers::find_or_create_by_name(&state.pool, name).await,
        None => None,
    };
    let _ = sqlx::query(
        "INSERT INTO inventory_adjustments (id, item_id, type, delta, note, author, expense_id, total_cost, on_account, supplier, supplier_id, created_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&id)
    .bind(&req.kind)
    .bind(req.delta)
    .bind(&note)
    .bind(&session.name)
    .bind(&expense_id)
    .bind(total_cost)
    .bind(if on_account { 1_i64 } else { 0_i64 })
    .bind(&supplier)
    .bind(&supplier_id)
    .bind(now)
    .execute(&state.pool)
    .await;

    // Optionally refresh the item's reference cost from this purchase.
    if req.update_unit_cost.unwrap_or(false) {
        if let Some(cost) = total_cost {
            let qty = req.delta.abs();
            if qty > 0.0 {
                let unit = (cost as f64 / qty).round() as i64;
                let _ = sqlx::query("UPDATE inventory SET unit_cost = ?, updated_at = ? WHERE id = ?")
                    .bind(unit)
                    .bind(now_ms())
                    .bind(&id)
                    .execute(&state.pool)
                    .await;
            }
        }
    }

    fetch_item(&state, &id).await
}

/// GET /api/inventory/payables — outstanding on-account receives (owed to suppliers, not yet
/// settled by a linked expense). Staff only.
pub async fn list_payables(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> Result<Json<Vec<Value>>, StatusCode> {
    require_staff(&state, &headers)?;
    let rows = sqlx::query(
        "SELECT a.id, a.item_id, a.delta, a.total_cost, a.note, a.supplier, a.supplier_id, a.created_at, i.name AS item_name, i.sku, \
                a.total_cost - COALESCE((SELECT SUM(e.amount) FROM expenses e \
                    WHERE e.receive_id = a.id AND e.voided = 0), 0) AS balance \
         FROM inventory_adjustments a JOIN inventory i ON i.id = a.item_id \
         WHERE a.on_account = 1 AND a.expense_id IS NULL \
         AND a.total_cost > COALESCE((SELECT SUM(e.amount) FROM expenses e \
                    WHERE e.receive_id = a.id AND e.voided = 0), 0) \
         ORDER BY a.supplier, a.created_at DESC LIMIT 100",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(rows.iter().map(|r| Value::Object(row_to_json(r))).collect()))
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
        let now = now_ms();
        let ok = sqlx::query(
            "INSERT INTO inventory (id, sku, name, description, stock_on_hand, reorder_point, unit_cost, unit_price, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(&sku)
        .bind(name)
        .bind(&desc)
        .bind(item.stock.unwrap_or(0.0))
        .bind(item.reorder_point.unwrap_or(5.0))
        .bind(item.unit_cost.unwrap_or(0))
        .bind(item.unit_price.unwrap_or(0))
        .bind(now)
        .bind(now)
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
/// name (case-insensitive) + phone combination already exists in the DB or earlier in the
/// same file. Returns {imported, skipped, skipped_rows} — skipped_rows carry a reason
/// (duplicate/invalid) for the caller to display; nothing about them is persisted.
pub async fn import_customers(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(req): Json<ImportCustomersReq>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_staff(&state, &headers).map_err(|s| (s, "staff only".to_string()))?;
    let tenant = crate::api_data::tenant_id(&state).await;
    let mut imported = 0u32;
    let mut skipped_rows: Vec<Value> = Vec::new();
    let mut seen: std::collections::HashSet<(String, String)> = std::collections::HashSet::new();
    let clean = |o: &Option<String>| o.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    for c in &req.customers {
        let name = c.name.trim();
        let phone = clean(&c.phone);
        let skip = |reason: &str, skipped_rows: &mut Vec<Value>| {
            skipped_rows.push(json!({
                "name": name,
                "phone": phone.clone().unwrap_or_default(),
                "email": clean(&c.email).unwrap_or_default(),
                "address": clean(&c.address).unwrap_or_default(),
                "reason": reason,
            }));
        };
        if name.is_empty() {
            skip("invalid (no name)", &mut skipped_rows);
            continue;
        }
        let key = (name.to_lowercase(), phone.clone().unwrap_or_default());
        if seen.contains(&key) {
            skip("duplicate (in file)", &mut skipped_rows);
            continue;
        }
        let exists: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM customers WHERE name = ? COLLATE NOCASE AND COALESCE(phone,'') = COALESCE(?, '')",
        )
        .bind(name)
        .bind(&phone)
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);
        if exists > 0 {
            skip("duplicate", &mut skipped_rows);
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
        if ok {
            imported += 1;
            seen.insert(key);
        } else {
            skip("invalid (insert failed)", &mut skipped_rows);
        }
    }
    Ok(Json(json!({ "imported": imported, "skipped": skipped_rows.len(), "skipped_rows": skipped_rows })))
}

async fn fetch_item(state: &ApiState, id: &str) -> Result<Json<Value>, (StatusCode, String)> {
    let row = sqlx::query("SELECT * FROM inventory WHERE id = ? LIMIT 1")
        .bind(id)
        .fetch_one(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "reload failed".to_string()))?;
    Ok(Json(Value::Object(row_to_json(&row))))
}
