// Typed data endpoints for the shared HTTP API (D23, single path).
// The pattern here is the template every future resource (orders, inventory, ...) follows:
// a typed handler that guards auth where needed, queries via sqlx, and returns JSON —
// never raw SQL over the network.

use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use sqlx::sqlite::SqliteRow;
use sqlx::{Column, Row, ValueRef};
use std::collections::HashMap;

use crate::auth::{session_from_headers, ApiState};

pub(crate) fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

// Single source of truth for tenant_id: read it from app_config (falls back to the dev value).
pub(crate) async fn tenant_id(state: &ApiState) -> String {
    sqlx::query("SELECT tenant_id FROM app_config WHERE id = 'default' LIMIT 1")
        .fetch_optional(&state.pool)
        .await
        .ok()
        .flatten()
        .and_then(|r| r.try_get::<String, _>("tenant_id").ok())
        .unwrap_or_else(|| "dev-tenant".to_string())
}

// Tax rate (fraction, e.g. 0.12) from app_config; 0.0 if unset (region-agnostic, D13).
async fn tax_rate(state: &ApiState) -> f64 {
    sqlx::query("SELECT tax_rate FROM app_config WHERE id = 'default' LIMIT 1")
        .fetch_optional(&state.pool)
        .await
        .ok()
        .flatten()
        .and_then(|r| r.try_get::<Option<f64>, _>("tax_rate").ok())
        .flatten()
        .unwrap_or(0.0)
}

// Max manual-discount cap (fraction) from app_config; None = no cap. Senior/PWD is exempt.
async fn max_discount_pct(state: &ApiState) -> Option<f64> {
    sqlx::query("SELECT max_discount_pct FROM app_config WHERE id = 'default' LIMIT 1")
        .fetch_optional(&state.pool)
        .await
        .ok()
        .flatten()
        .and_then(|r| r.try_get::<Option<f64>, _>("max_discount_pct").ok())
        .flatten()
        .filter(|v| *v > 0.0)
}

// Reject a manual discount that exceeds the configured max (% of subtotal). Ok if no cap.
fn check_discount_cap(subtotal: i64, discount: i64, max: Option<f64>) -> Result<(), (StatusCode, String)> {
    if let Some(m) = max {
        let cap = (subtotal as f64 * m).round() as i64;
        if discount > cap {
            return Err((
                StatusCode::BAD_REQUEST,
                format!("Discount exceeds the maximum allowed ({:.0}% of subtotal).", m * 100.0),
            ));
        }
    }
    Ok(())
}

// Generic row -> JSON object (INTEGER -> number, REAL -> number, TEXT -> string, NULL -> null).
pub(crate) fn row_to_json(row: &SqliteRow) -> Map<String, Value> {
    let mut map = Map::new();
    for col in row.columns() {
        let name = col.name();
        // Check NULL first: try_get::<i64> can decode a NULL as 0, which is wrong.
        let is_null = row.try_get_raw(name).map(|v| v.is_null()).unwrap_or(true);
        let value: Value = if is_null {
            Value::Null
        } else if let Ok(v) = row.try_get::<i64, _>(name) {
            Value::from(v)
        } else if let Ok(v) = row.try_get::<f64, _>(name) {
            serde_json::Number::from_f64(v).map(Value::Number).unwrap_or(Value::Null)
        } else if let Ok(v) = row.try_get::<String, _>(name) {
            Value::String(v)
        } else {
            Value::Null
        };
        map.insert(name.to_string(), value);
    }
    map
}

// Parse a stored JSON-string column into a nested object/array in place.
pub(crate) fn parse_json_field(obj: &mut Map<String, Value>, field: &str) {
    if let Some(Value::String(s)) = obj.get(field) {
        if let Ok(parsed) = serde_json::from_str::<Value>(s) {
            obj.insert(field.to_string(), parsed);
        }
    }
}

// Expand an asset's `specs` (stored as text) and attach an (empty) pendingBookings array.
fn expand_specs(obj: &mut Map<String, Value>) {
    parse_json_field(obj, "specs");
    obj.insert("pendingBookings".to_string(), json!([]));
}

/// GET /api/config — public (needed pre-login to render the login/setup screen). Returns
/// the app_config row or null. Branding only; low sensitivity on a LAN.
pub async fn get_config(State(state): State<ApiState>) -> Result<Json<Value>, (StatusCode, String)> {
    let row = sqlx::query("SELECT * FROM app_config WHERE id = 'default' LIMIT 1")
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    match row {
        Some(r) => Ok(Json(Value::Object(row_to_json(&r)))),
        None => Ok(Json(Value::Null)),
    }
}

/// GET /api/assets?q=... — search assets by id/specs. Auth required.
pub async fn search_assets(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Vec<Value>>, StatusCode> {
    if session_from_headers(&state, &headers).is_none() {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let q = params.get("q").cloned().unwrap_or_default();
    if q.trim().is_empty() {
        return Ok(Json(vec![]));
    }
    let like = format!("%{}%", q);
    let rows = sqlx::query(
        "SELECT * FROM assets WHERE (id LIKE ? OR specs LIKE ?) AND deleted_at IS NULL LIMIT 10",
    )
    .bind(&like)
    .bind(&like)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let out = rows
        .iter()
        .map(|r| {
            let mut obj = row_to_json(r);
            expand_specs(&mut obj);
            Value::Object(obj)
        })
        .collect();
    Ok(Json(out))
}

// ---- Customers ----

/// GET /api/customers?q=... — search customers by name/phone. Auth required.
pub async fn search_customers(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Vec<Value>>, StatusCode> {
    if session_from_headers(&state, &headers).is_none() {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let q = params.get("q").cloned().unwrap_or_default();
    if q.trim().is_empty() {
        return Ok(Json(vec![]));
    }
    let like = format!("%{}%", q);
    let rows = sqlx::query("SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? LIMIT 10")
        .bind(&like)
        .bind(&like)
        .fetch_all(&state.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(rows.iter().map(|r| Value::Object(row_to_json(r))).collect()))
}

#[derive(Deserialize)]
pub struct CreateCustomerReq {
    name: String,
    phone: Option<String>,
    email: Option<String>,
    address: Option<String>,
}

/// POST /api/customers — create a customer. Auth required. tenant from app_config.
pub async fn create_customer(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(req): Json<CreateCustomerReq>,
) -> Result<Json<Value>, StatusCode> {
    if session_from_headers(&state, &headers).is_none() {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let tenant = tenant_id(&state).await;
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_ms();
    sqlx::query(
        "INSERT INTO customers (id, tenant_id, name, phone, email, address, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&tenant)
    .bind(req.name.trim())
    .bind(&req.phone)
    .bind(&req.email)
    .bind(&req.address)
    .bind(now)
    .bind(now)
    .execute(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let row = sqlx::query("SELECT * FROM customers WHERE id = ? LIMIT 1")
        .bind(&id)
        .fetch_one(&state.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(Value::Object(row_to_json(&row))))
}

// ---- Assets ----

/// GET /api/assets/:id — one asset with parsed specs, owner, and service history. Auth required.
pub async fn get_asset(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    if session_from_headers(&state, &headers).is_none() {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let row = sqlx::query("SELECT * FROM assets WHERE id = ? LIMIT 1")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;
    let mut obj = row_to_json(&row);
    parse_json_field(&mut obj, "specs");

    if let Some(owner_id) = obj.get("owner_id").and_then(|v| v.as_str()).map(String::from) {
        if let Ok(Some(c)) = sqlx::query("SELECT * FROM customers WHERE id = ? LIMIT 1")
            .bind(&owner_id)
            .fetch_optional(&state.pool)
            .await
        {
            obj.insert("owner".to_string(), Value::Object(row_to_json(&c)));
        }
    }

    let history = sqlx::query(
        "SELECT id, status, total, created_at, receipt_number, customer_complaint FROM orders WHERE asset_id = ? ORDER BY created_at DESC",
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await
    .map(|rows| rows.iter().map(|r| Value::Object(row_to_json(r))).collect::<Vec<_>>())
    .unwrap_or_default();
    obj.insert("history".to_string(), Value::Array(history));

    Ok(Json(Value::Object(obj)))
}

#[derive(Deserialize)]
pub struct CreateAssetReq {
    #[serde(rename = "type")]
    kind: String,
    specs: Value,
    owner_id: Option<String>,
}

/// POST /api/assets — create an asset. Auth required. tenant_id is taken from app_config
/// (single source of truth) rather than hardcoded.
pub async fn create_asset(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(req): Json<CreateAssetReq>,
) -> Result<Json<Value>, StatusCode> {
    if session_from_headers(&state, &headers).is_none() {
        return Err(StatusCode::UNAUTHORIZED);
    }

    let tenant = tenant_id(&state).await;
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_ms();
    let specs_str = req.specs.to_string();

    sqlx::query(
        "INSERT INTO assets (id, tenant_id, owner_id, type, specs, created_at, updated_at, deleted_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)",
    )
    .bind(&id)
    .bind(&tenant)
    .bind(&req.owner_id)
    .bind(&req.kind)
    .bind(&specs_str)
    .bind(now)
    .bind(now)
    .execute(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let row = sqlx::query("SELECT * FROM assets WHERE id = ? LIMIT 1")
        .bind(&id)
        .fetch_one(&state.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let mut obj = row_to_json(&row);
    expand_specs(&mut obj);
    Ok(Json(Value::Object(obj)))
}

#[derive(Deserialize)]
pub struct UpdateAssetReq {
    specs: Value,
    owner_id: Option<String>,
}

/// PUT /api/assets/:id — edit an asset's specs and owner. Auth required. The asset
/// TYPE is intentionally immutable (a shop's asset kind is fixed); to change type,
/// delete and re-create. 404 if the asset is missing or already soft-deleted.
pub async fn update_asset(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<UpdateAssetReq>,
) -> Result<Json<Value>, StatusCode> {
    if session_from_headers(&state, &headers).is_none() {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let now = now_ms();
    let specs_str = req.specs.to_string();
    let result = sqlx::query(
        "UPDATE assets SET specs = ?, owner_id = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(&specs_str)
    .bind(&req.owner_id)
    .bind(now)
    .bind(&id)
    .execute(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    let row = sqlx::query("SELECT * FROM assets WHERE id = ? LIMIT 1")
        .bind(&id)
        .fetch_one(&state.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let mut obj = row_to_json(&row);
    parse_json_field(&mut obj, "specs");
    Ok(Json(Value::Object(obj)))
}

/// DELETE /api/assets/:id — soft-delete (sets deleted_at; never destroys data, D24).
/// Blocked (409) if the asset still has open job tickets (any status except paid/cancelled)
/// so active work is never hidden. Auth required.
pub async fn soft_delete_asset(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    if session_from_headers(&state, &headers).is_none() {
        return Err((StatusCode::UNAUTHORIZED, "unauthorized".to_string()));
    }

    let open: i64 = sqlx::query(
        "SELECT COUNT(*) AS c FROM orders WHERE asset_id = ? AND status NOT IN ('paid', 'cancelled')",
    )
    .bind(&id)
    .fetch_one(&state.pool)
    .await
    .ok()
    .and_then(|r| r.try_get::<i64, _>("c").ok())
    .unwrap_or(0);
    if open > 0 {
        return Err((
            StatusCode::CONFLICT,
            format!(
                "This asset has {} open job ticket(s). Close or finish them before deleting.",
                open
            ),
        ));
    }

    let now = now_ms();
    let result = sqlx::query("UPDATE assets SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(now)
        .bind(now)
        .bind(&id)
        .execute(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "delete failed".to_string()))?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "asset not found".to_string()));
    }
    Ok(Json(json!({ "ok": true })))
}

// ---- Job tickets (orders) ----

#[derive(Deserialize)]
pub struct CreateOrderReq {
    asset_id: String,
    customer_complaint: Option<String>,
    inspection: Option<Value>,
    job_order_no: Option<String>,
    terms: Option<String>,
}

/// POST /api/orders — create a job ticket at status `triage`. Auth required.
/// customer_id is derived from the asset's owner.
pub async fn create_order(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(req): Json<CreateOrderReq>,
) -> Result<Json<Value>, StatusCode> {
    if session_from_headers(&state, &headers).is_none() {
        return Err(StatusCode::UNAUTHORIZED);
    }

    // Derive customer from the asset's owner.
    let customer_id: Option<String> = sqlx::query("SELECT owner_id FROM assets WHERE id = ? LIMIT 1")
        .bind(&req.asset_id)
        .fetch_optional(&state.pool)
        .await
        .ok()
        .flatten()
        .and_then(|r| r.try_get::<Option<String>, _>("owner_id").ok())
        .flatten();

    let id = uuid::Uuid::new_v4().to_string();
    let now = now_ms();
    let inspection_str = req.inspection.as_ref().map(|v| v.to_string());
    let nz = |o: &Option<String>| o.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());

    sqlx::query(
        "INSERT INTO orders (id, asset_id, customer_id, status, customer_complaint, inspection, \
         job_order_no, terms, subtotal, tax, discount, total, created_at, updated_at) \
         VALUES (?, ?, ?, 'triage', ?, ?, ?, ?, 0, 0, 0, 0, ?, ?)",
    )
    .bind(&id)
    .bind(&req.asset_id)
    .bind(&customer_id)
    .bind(&req.customer_complaint)
    .bind(&inspection_str)
    .bind(nz(&req.job_order_no))
    .bind(nz(&req.terms))
    .bind(now)
    .bind(now)
    .execute(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    order_detail(&state, &id).await.ok_or(StatusCode::INTERNAL_SERVER_ERROR).map(Json)
}

/// GET /api/orders/:id — a job ticket with its asset and customer embedded. Auth required.
pub async fn get_order(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    if session_from_headers(&state, &headers).is_none() {
        return Err(StatusCode::UNAUTHORIZED);
    }
    order_detail(&state, &id).await.ok_or(StatusCode::NOT_FOUND).map(Json)
}

// Current status of an order, or None if it doesn't exist. Used by the transition guards
// so lifecycle endpoints can't act on jobs in the wrong state (e.g. billing a cancelled job).
async fn order_status(state: &ApiState, id: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT status FROM orders WHERE id = ? LIMIT 1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await
        .ok()
        .flatten()
}

#[derive(Deserialize)]
pub struct ApproveReq {
    approved_by: String,
    method: String, // verbal | phone | in_person
}

/// POST /api/orders/:id/approve — record a simple approval (who + how) and move
/// `estimate → approved`. No signature/OTP (D5). Auth required. On approval, stock is
/// deducted for line items linked to inventory (D6/BACK-3-006) — exactly once, since the
/// transition guard makes re-approval impossible.
pub async fn approve_order(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<ApproveReq>,
) -> Result<Json<Value>, (StatusCode, String)> {
    if session_from_headers(&state, &headers).is_none() {
        return Err((StatusCode::UNAUTHORIZED, "unauthorized".to_string()));
    }
    match order_status(&state, &id).await.as_deref() {
        None => return Err((StatusCode::NOT_FOUND, "order not found".to_string())),
        Some("estimate") => {}
        Some(s) => {
            return Err((StatusCode::CONFLICT, format!("Only a pending estimate can be approved (this job is {}).", s)))
        }
    }
    let now = now_ms();
    let proof = json!({ "approved_by": req.approved_by.trim(), "method": req.method, "at": now }).to_string();
    sqlx::query(
        "UPDATE orders SET status = 'approved', approval_proof = ?, updated_at = ? WHERE id = ? AND status = 'estimate'",
    )
    .bind(&proof)
    .bind(now)
    .bind(&id)
    .execute(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "approve failed".to_string()))?;

    // Deduct stock for parts picked from inventory (D6). May go negative — that surfaces
    // as an oversell on the low-stock report rather than blocking the shop mid-approval.
    adjust_stock_for_order(&state, &id, -1.0).await;

    order_detail(&state, &id).await.ok_or((StatusCode::NOT_FOUND, "not found".to_string())).map(Json)
}

// Apply each inventory-linked line item's quantity × sign to stock_on_hand.
// sign = -1.0 deducts (approval); sign = +1.0 restocks (cancel after approval).
async fn adjust_stock_for_order(state: &ApiState, order_id: &str, sign: f64) {
    if let Ok(rows) = sqlx::query(
        "SELECT inventory_item_id, quantity FROM order_items WHERE order_id = ? AND inventory_item_id IS NOT NULL",
    )
    .bind(order_id)
    .fetch_all(&state.pool)
    .await
    {
        for r in rows {
            let inv_id: Option<String> = r.try_get("inventory_item_id").ok();
            let qty: f64 = r.try_get("quantity").unwrap_or(0.0);
            if let Some(inv_id) = inv_id {
                let _ = sqlx::query("UPDATE inventory SET stock_on_hand = stock_on_hand + ? WHERE id = ?")
                    .bind(sign * qty)
                    .bind(&inv_id)
                    .execute(&state.pool)
                    .await;
            }
        }
    }
}

// Build a job-ticket detail object: order fields (inspection parsed) + nested asset + customer.
async fn order_detail(state: &ApiState, id: &str) -> Option<Value> {
    let row = sqlx::query("SELECT * FROM orders WHERE id = ? LIMIT 1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await
        .ok()
        .flatten()?;
    let mut obj = row_to_json(&row);
    parse_json_field(&mut obj, "inspection");
    parse_json_field(&mut obj, "approval_proof");

    if let Some(asset_id) = obj.get("asset_id").and_then(|v| v.as_str()).map(String::from) {
        if let Ok(Some(arow)) = sqlx::query("SELECT * FROM assets WHERE id = ? LIMIT 1")
            .bind(&asset_id)
            .fetch_optional(&state.pool)
            .await
        {
            let mut a = row_to_json(&arow);
            parse_json_field(&mut a, "specs");
            obj.insert("asset".to_string(), Value::Object(a));
        }
    }

    if let Some(customer_id) = obj.get("customer_id").and_then(|v| v.as_str()).map(String::from) {
        if let Ok(Some(crow)) = sqlx::query("SELECT * FROM customers WHERE id = ? LIMIT 1")
            .bind(&customer_id)
            .fetch_optional(&state.pool)
            .await
        {
            obj.insert("customer".to_string(), Value::Object(row_to_json(&crow)));
        }
    }

    if let Some(mech_id) = obj.get("assigned_mechanic_id").and_then(|v| v.as_str()).map(String::from) {
        if let Ok(Some(mrow)) = sqlx::query("SELECT id, name, username, role FROM users WHERE id = ? LIMIT 1")
            .bind(&mech_id)
            .fetch_optional(&state.pool)
            .await
        {
            obj.insert("mechanic".to_string(), Value::Object(row_to_json(&mrow)));
        }
    }

    // Line items (estimate rows).
    let items = sqlx::query("SELECT * FROM order_items WHERE order_id = ?")
        .bind(id)
        .fetch_all(&state.pool)
        .await
        .map(|rows| rows.iter().map(|r| Value::Object(row_to_json(r))).collect::<Vec<_>>())
        .unwrap_or_default();
    obj.insert("items".to_string(), Value::Array(items));

    Some(Value::Object(obj))
}

// ---- Inventory (minimal, for the estimate parts picker) ----

pub async fn search_inventory(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Vec<Value>>, StatusCode> {
    if session_from_headers(&state, &headers).is_none() {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let q = params.get("q").cloned().unwrap_or_default();
    if q.trim().is_empty() {
        return Ok(Json(vec![]));
    }
    let like = format!("%{}%", q);
    let rows = sqlx::query("SELECT * FROM inventory WHERE sku LIKE ? OR name LIKE ? LIMIT 10")
        .bind(&like)
        .bind(&like)
        .fetch_all(&state.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(rows.iter().map(|r| Value::Object(row_to_json(r))).collect()))
}

#[derive(Deserialize)]
pub struct CreateInventoryReq {
    name: String,
    sku: Option<String>,
    description: Option<String>,
    stock_on_hand: Option<f64>,
    reorder_point: Option<f64>,
    unit_price: Option<i64>,
    unit_cost: Option<i64>,
}

pub async fn create_inventory(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(req): Json<CreateInventoryReq>,
) -> Result<Json<Value>, StatusCode> {
    if session_from_headers(&state, &headers).is_none() {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let id = uuid::Uuid::new_v4().to_string();
    // Auto-generate a SKU from the name if none given.
    let sku = req.sku.unwrap_or_else(|| {
        let slug: String = req
            .name
            .to_lowercase()
            .chars()
            .map(|c| if c.is_alphanumeric() { c } else { '-' })
            .collect();
        format!("{}-{}", slug.trim_matches('-'), &id[..4])
    });
    let desc = req.description.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    sqlx::query(
        "INSERT INTO inventory (id, sku, name, description, stock_on_hand, reorder_point, unit_cost, unit_price) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&sku)
    .bind(req.name.trim())
    .bind(&desc)
    .bind(req.stock_on_hand.unwrap_or(0.0))
    .bind(req.reorder_point.unwrap_or(5.0))
    .bind(req.unit_cost.unwrap_or(0))
    .bind(req.unit_price.unwrap_or(0))
    .execute(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let row = sqlx::query("SELECT * FROM inventory WHERE id = ? LIMIT 1")
        .bind(&id)
        .fetch_one(&state.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(Value::Object(row_to_json(&row))))
}

// ---- Estimate ----

// Shared money math. Senior/PWD (RA 9994 / RA 10754): the sale is VAT-exempt (tax = 0)
// and gets a statutory 20% discount on the (VAT-exclusive) subtotal. Returns
// (tax, senior_discount, total), all centavos.
fn compute_totals(subtotal: i64, discount: i64, senior: bool, rate: f64) -> (i64, i64, i64) {
    let tax = if senior { 0 } else { (subtotal as f64 * rate).round() as i64 };
    let senior_discount = if senior { (subtotal as f64 * 0.20).round() as i64 } else { 0 };
    let total = subtotal + tax - discount - senior_discount;
    (tax, senior_discount, total)
}

// Normalize a senior/PWD type string to a valid value or None.
fn senior_type(o: &Option<String>) -> Option<String> {
    o.as_ref().map(|s| s.trim().to_lowercase()).filter(|s| s == "senior" || s == "pwd")
}

#[derive(Deserialize)]
pub struct EstimateItem {
    #[serde(rename = "type")]
    kind: String,
    description: String,
    quantity: f64,
    unit: Option<String>, // e.g. "pc", "set", "L"
    unit_price: i64, // centavos
    inventory_item_id: Option<String>,
}

#[derive(Deserialize)]
pub struct SaveEstimateReq {
    items: Vec<EstimateItem>,
    discount: i64, // centavos (manual)
    senior_pwd_type: Option<String>, // 'senior' | 'pwd' | null
    senior_pwd_id: Option<String>,
    senior_pwd_name: Option<String>,
}

/// PUT /api/orders/:id/estimate — replace line items, recompute totals (tax from app_config),
/// set status to `estimate`. Server is authoritative on the math. Auth required.
pub async fn save_estimate(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<SaveEstimateReq>,
) -> Result<Json<Value>, (StatusCode, String)> {
    if session_from_headers(&state, &headers).is_none() {
        return Err((StatusCode::UNAUTHORIZED, "unauthorized".to_string()));
    }

    // The estimate is only editable before approval (guarded BEFORE deleting items).
    match order_status(&state, &id).await.as_deref() {
        None => return Err((StatusCode::NOT_FOUND, "order not found".to_string())),
        Some("triage") | Some("estimate") => {}
        Some(s) => return Err((StatusCode::CONFLICT, format!("The estimate can no longer be edited (this job is {}).", s))),
    }

    // Cap check BEFORE mutating anything (compute subtotal from the incoming items first).
    let subtotal_pre: i64 = req
        .items
        .iter()
        .map(|i| (i.quantity * i.unit_price as f64).round() as i64)
        .sum();
    check_discount_cap(subtotal_pre, req.discount, max_discount_pct(&state).await)?;

    let ise = || (StatusCode::INTERNAL_SERVER_ERROR, "estimate save failed".to_string());

    sqlx::query("DELETE FROM order_items WHERE order_id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await
        .map_err(|_| ise())?;

    let mut subtotal: i64 = 0;
    for item in &req.items {
        let total = (item.quantity * item.unit_price as f64).round() as i64;
        subtotal += total;
        let unit = item.unit.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        sqlx::query(
            "INSERT INTO order_items (id, order_id, type, description, quantity, unit, unit_price, total, inventory_item_id) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(&id)
        .bind(&item.kind)
        .bind(&item.description)
        .bind(item.quantity)
        .bind(&unit)
        .bind(item.unit_price)
        .bind(total)
        .bind(&item.inventory_item_id)
        .execute(&state.pool)
        .await
        .map_err(|_| ise())?;
    }

    let rate = tax_rate(&state).await;
    let stype = senior_type(&req.senior_pwd_type);
    let (tax, senior_discount, total) = compute_totals(subtotal, req.discount, stype.is_some(), rate);
    let nz = |o: &Option<String>| o.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let now = now_ms();

    sqlx::query(
        "UPDATE orders SET subtotal = ?, tax = ?, discount = ?, senior_discount = ?, \
         senior_pwd_type = ?, senior_pwd_id = ?, senior_pwd_name = ?, total = ?, status = 'estimate', updated_at = ? WHERE id = ?",
    )
    .bind(subtotal)
    .bind(tax)
    .bind(req.discount)
    .bind(senior_discount)
    .bind(&stype)
    .bind(nz(&req.senior_pwd_id))
    .bind(nz(&req.senior_pwd_name))
    .bind(total)
    .bind(now)
    .bind(&id)
    .execute(&state.pool)
    .await
    .map_err(|_| ise())?;

    order_detail(&state, &id).await.ok_or((StatusCode::NOT_FOUND, "not found".to_string())).map(Json)
}

#[derive(Deserialize)]
pub struct SetDiscountsReq {
    discount: i64, // centavos (manual)
    senior_pwd_type: Option<String>,
    senior_pwd_id: Option<String>,
    senior_pwd_name: Option<String>,
}

/// POST /api/orders/:id/discounts — set the manual discount + senior/PWD status on an order
/// and recompute totals from its existing subtotal (line items unchanged). Admin/advisor only;
/// usable at the estimate stage or the final/billing stage.
pub async fn set_discounts(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<SetDiscountsReq>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_staff(&state, &headers).map_err(|s| (s, "staff only".to_string()))?;
    let subtotal: Option<i64> = sqlx::query_scalar("SELECT subtotal FROM orders WHERE id = ? LIMIT 1")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?;
    let subtotal = subtotal.ok_or((StatusCode::NOT_FOUND, "order not found".to_string()))?;

    check_discount_cap(subtotal, req.discount, max_discount_pct(&state).await)?;

    let rate = tax_rate(&state).await;
    let stype = senior_type(&req.senior_pwd_type);
    let (tax, senior_discount, total) = compute_totals(subtotal, req.discount, stype.is_some(), rate);
    let nz = |o: &Option<String>| o.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());

    sqlx::query(
        "UPDATE orders SET discount = ?, senior_discount = ?, senior_pwd_type = ?, senior_pwd_id = ?, \
         senior_pwd_name = ?, tax = ?, total = ?, updated_at = ? WHERE id = ?",
    )
    .bind(req.discount)
    .bind(senior_discount)
    .bind(&stype)
    .bind(nz(&req.senior_pwd_id))
    .bind(nz(&req.senior_pwd_name))
    .bind(tax)
    .bind(total)
    .bind(now_ms())
    .bind(&id)
    .execute(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "update failed".to_string()))?;

    order_detail(&state, &id).await.ok_or((StatusCode::NOT_FOUND, "not found".to_string())).map(Json)
}

// ---- Licensing ----

/// GET /api/license — current license status (public; needed to gate the app pre-login).
/// Always includes this device's `device_code` so the setup screen can show it.
pub async fn get_license() -> Json<Value> {
    let dd = crate::db::data_dir();
    Json(serde_json::to_value(crate::license::read_license_status(&dd)).unwrap_or(Value::Null))
}

#[derive(Deserialize)]
pub struct SetupReq {
    shop_name: String,
    address: Option<String>,
    contact_phone: Option<String>,
    contact_email: Option<String>,
    tax_registration_id: Option<String>,
    custom_fields: Option<Value>,
    currency_symbol: String,
    locale: Option<String>,
    tax_rate: Option<f64>,
    admin_name: String,
    admin_username: String,
    admin_pin: String,
    // Asset types the shop selected during onboarding (BACK-1-006). If omitted/empty, the
    // three built-in templates are seeded so the app is usable out of the box.
    asset_types: Option<Vec<crate::asset_types::AssetTypeInput>>,
}

/// POST /api/setup — first-run setup: create app_config + the first admin. Unauthenticated by
/// design (no user exists yet), but only works while UNCONFIGURED (no app_config row).
pub async fn setup(
    State(state): State<ApiState>,
    Json(req): Json<SetupReq>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let existing: i64 = sqlx::query("SELECT COUNT(*) AS c FROM app_config")
        .fetch_one(&state.pool)
        .await
        .ok()
        .and_then(|r| r.try_get::<i64, _>("c").ok())
        .unwrap_or(0);
    if existing > 0 {
        return Err((StatusCode::CONFLICT, "already set up".to_string()));
    }
    if req.shop_name.trim().is_empty() || req.currency_symbol.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "shop name and currency are required".to_string()));
    }
    if req.admin_name.trim().is_empty() || req.admin_username.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "admin name and username are required".to_string()));
    }
    if req.admin_pin.len() != 6 || !req.admin_pin.chars().all(|c| c.is_ascii_digit()) {
        return Err((StatusCode::BAD_REQUEST, "PIN must be exactly 6 digits".to_string()));
    }

    let now = now_ms();
    let custom_fields = req.custom_fields.map(|v| v.to_string());
    sqlx::query(
        "INSERT INTO app_config (id, tenant_id, branch_id, shop_name, device_name, currency_symbol, locale, \
         tax_rate, address, contact_phone, contact_email, logo_path, tax_registration_id, custom_fields, created_at, updated_at) \
         VALUES ('default', 'dev-tenant', 'main', ?, 'Main PC', ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)",
    )
    .bind(req.shop_name.trim())
    .bind(req.currency_symbol.trim())
    .bind(req.locale.as_deref().unwrap_or("en-US"))
    .bind(req.tax_rate)
    .bind(&req.address)
    .bind(&req.contact_phone)
    .bind(&req.contact_email)
    .bind(&req.tax_registration_id)
    .bind(&custom_fields)
    .bind(now)
    .bind(now)
    .execute(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "config insert failed".to_string()))?;

    let (hash, salt) = crate::auth::hash_pin(&req.admin_pin);
    sqlx::query(
        "INSERT INTO users (id, name, username, pin_hash, pin_salt, role, is_active, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, 'admin', 1, ?, ?)",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(req.admin_name.trim())
    .bind(req.admin_username.trim().to_lowercase()) // BACK-2-021: store usernames lowercase
    .bind(&hash)
    .bind(&salt)
    .bind(now)
    .bind(now)
    .execute(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "admin insert failed".to_string()))?;

    // Seed the shop's asset types (BACK-1-006). tenant_id matches the app_config insert above.
    match req.asset_types {
        Some(types) if !types.is_empty() => {
            for (i, t) in types.iter().enumerate() {
                let _ = crate::asset_types::insert_type(&state.pool, "dev-tenant", t, i as i64).await;
            }
        }
        _ => {
            let _ = crate::asset_types::seed_builtins(&state.pool, "dev-tenant").await;
        }
    }

    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
pub struct UpdateConfigReq {
    shop_name: String,
    device_name: String,
    currency_symbol: String,
    locale: Option<String>,
    tax_rate: Option<f64>,
    address: Option<String>,
    contact_phone: Option<String>,
    contact_email: Option<String>,
    tax_registration_id: Option<String>,
    custom_fields: Option<Value>,
    // BIR-style document fields (blank values simply aren't printed).
    proprietor: Option<String>,
    business_style: Option<String>,
    vat_status: Option<String>,
    terms_and_conditions: Option<String>,
    document_title: Option<String>,
    max_discount_pct: Option<f64>, // fraction; null = no cap
    mechanic_label: Option<String>, // display name for the mechanic role
}

/// PUT /api/config — edit the shop profile (admin/owner only). Never touches
/// identity columns (id/tenant_id/branch_id) or auth. Returns the updated config.
pub async fn update_config(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(req): Json<UpdateConfigReq>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_admin(&state, &headers).map_err(|s| (s, "admin only".to_string()))?;
    if req.shop_name.trim().is_empty() || req.currency_symbol.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "shop name and currency are required".to_string()));
    }
    if req.device_name.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "device name is required".to_string()));
    }
    let custom_fields = req.custom_fields.map(|v| v.to_string());
    // Trim to None so blank optional fields store as NULL (and never print).
    let nz = |o: &Option<String>| o.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let now = now_ms();
    let result = sqlx::query(
        "UPDATE app_config SET shop_name = ?, device_name = ?, currency_symbol = ?, locale = ?, \
         tax_rate = ?, address = ?, contact_phone = ?, contact_email = ?, tax_registration_id = ?, \
         custom_fields = ?, proprietor = ?, business_style = ?, vat_status = ?, \
         terms_and_conditions = ?, document_title = ?, max_discount_pct = ?, mechanic_label = ?, updated_at = ? WHERE id = 'default'",
    )
    .bind(req.shop_name.trim())
    .bind(req.device_name.trim())
    .bind(req.currency_symbol.trim())
    .bind(req.locale.as_deref().unwrap_or("en-US"))
    .bind(req.tax_rate)
    .bind(&req.address)
    .bind(&req.contact_phone)
    .bind(&req.contact_email)
    .bind(&req.tax_registration_id)
    .bind(&custom_fields)
    .bind(nz(&req.proprietor))
    .bind(nz(&req.business_style))
    .bind(nz(&req.vat_status))
    .bind(nz(&req.terms_and_conditions))
    .bind(nz(&req.document_title))
    .bind(req.max_discount_pct.filter(|v| *v > 0.0))
    .bind(nz(&req.mechanic_label))
    .bind(now)
    .execute(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "config update failed".to_string()))?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "app not set up".to_string()));
    }

    let row = sqlx::query("SELECT * FROM app_config WHERE id = 'default' LIMIT 1")
        .fetch_one(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "config reload failed".to_string()))?;
    Ok(Json(Value::Object(row_to_json(&row))))
}

#[derive(Deserialize)]
pub struct LoadLicenseReq {
    content: String,
}

/// POST /api/license — install a license file (writes it next to the DB). Auth required.
pub async fn load_license(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(req): Json<LoadLicenseReq>,
) -> Result<Json<Value>, StatusCode> {
    if session_from_headers(&state, &headers).is_none() {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let dd = crate::db::data_dir();
    crate::license::write_license(&dd, &req.content).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(serde_json::to_value(crate::license::read_license_status(&dd)).unwrap_or(Value::Null)))
}

// ---- Dashboard stats ----

/// GET /api/stats — live dashboard counts (auth required). Read-only.
pub async fn get_stats(State(state): State<ApiState>, headers: HeaderMap) -> Result<Json<Value>, StatusCode> {
    if session_from_headers(&state, &headers).is_none() {
        return Err(StatusCode::UNAUTHORIZED);
    }
    use chrono::{Datelike, TimeZone};
    let now = chrono::Utc::now();
    let month_start = chrono::Utc
        .with_ymd_and_hms(now.year(), now.month(), 1, 0, 0, 0)
        .single()
        .map(|d| d.timestamp_millis())
        .unwrap_or(0);

    let scalar = |sql: &'static str, bind: Option<i64>| {
        let pool = state.pool.clone();
        async move {
            let mut q = sqlx::query(sql);
            if let Some(b) = bind {
                q = q.bind(b);
            }
            q.fetch_one(&pool).await.ok().and_then(|r| r.try_get::<i64, _>(0).ok()).unwrap_or(0)
        }
    };

    let active_jobs = scalar("SELECT COUNT(*) FROM orders WHERE status = 'in_progress'", None).await;
    let pending_estimates = scalar("SELECT COUNT(*) FROM orders WHERE status = 'estimate'", None).await;
    let low_stock = scalar("SELECT COUNT(*) FROM inventory WHERE stock_on_hand <= reorder_point", None).await;
    let month_revenue = scalar(
        "SELECT COALESCE(SUM(total), 0) FROM orders WHERE status = 'paid' AND updated_at >= ?",
        Some(month_start),
    )
    .await;

    Ok(Json(json!({
        "active_jobs": active_jobs,
        "pending_estimates": pending_estimates,
        "low_stock": low_stock,
        "month_revenue": month_revenue
    })))
}

// ---- Backup & restore ----

pub async fn backup_now(State(state): State<ApiState>, headers: HeaderMap) -> Result<Json<Value>, StatusCode> {
    require_staff(&state, &headers)?; // BACK-2-015: staff only (mechanic → 403)
    let name = crate::backup::backup_now(&state.pool, &crate::db::data_dir())
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(json!({ "name": name })))
}

/// POST /api/backup-full — on-demand full backup (DB + media, single zip). Auth required.
pub async fn backup_full(State(state): State<ApiState>, headers: HeaderMap) -> Result<Json<Value>, StatusCode> {
    require_staff(&state, &headers)?; // BACK-2-015: staff only (mechanic → 403)
    let name = crate::backup::full_backup_now(&state.pool, &crate::db::data_dir())
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(json!({ "name": name })))
}

pub async fn list_backups(State(state): State<ApiState>, headers: HeaderMap) -> Result<Json<Value>, StatusCode> {
    require_staff(&state, &headers)?; // BACK-2-015: staff only (mechanic → 403)
    let dir = crate::db::data_dir();
    let backups = crate::backup::list_backups(&state.pool, &dir).await;
    let dir_path = crate::backup::resolve_backup_dir(&state.pool, &dir).await;
    Ok(Json(json!({ "dir": dir_path.to_string_lossy(), "backups": backups })))
}

#[derive(Deserialize)]
pub struct RestoreReq {
    filename: String,
}

pub async fn restore_backup(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(req): Json<RestoreReq>,
) -> Result<Json<Value>, StatusCode> {
    require_admin(&state, &headers)?; // BACK-2-015: restore is destructive — admin/owner only
    crate::backup::stage_restore(&state.pool, &crate::db::data_dir(), &req.filename)
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    Ok(Json(json!({ "restart_required": true })))
}

#[derive(Deserialize)]
pub struct BackupDirReq {
    dir: String,
}

pub async fn set_backup_dir(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(req): Json<BackupDirReq>,
) -> Result<Json<Value>, StatusCode> {
    require_admin(&state, &headers)?; // BACK-2-015: changing the backup folder — admin/owner only
    let value = if req.dir.trim().is_empty() { None } else { Some(req.dir.trim().to_string()) };
    sqlx::query("UPDATE app_config SET backup_dir = ?, updated_at = ? WHERE id = 'default'")
        .bind(&value)
        .bind(now_ms())
        .execute(&state.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(json!({ "ok": true })))
}

// ---- Users / mechanic assignment & execution ----

/// GET /api/users?role=mechanic&all=1 — list users (never returns pin fields). `all=1` includes
/// deactivated users (for management). Auth required.
pub async fn list_users(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Vec<Value>>, StatusCode> {
    if session_from_headers(&state, &headers).is_none() {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let include_all = params.contains_key("all");
    let rows = if let Some(role) = params.get("role") {
        sqlx::query("SELECT id, name, username, role, is_active FROM users WHERE role = ? AND is_active = 1 ORDER BY name")
            .bind(role)
            .fetch_all(&state.pool)
            .await
    } else if include_all {
        sqlx::query("SELECT id, name, username, role, is_active FROM users ORDER BY is_active DESC, name")
            .fetch_all(&state.pool)
            .await
    } else {
        sqlx::query("SELECT id, name, username, role, is_active FROM users WHERE is_active = 1 ORDER BY name")
            .fetch_all(&state.pool)
            .await
    }
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(rows.iter().map(|r| Value::Object(row_to_json(r))).collect()))
}

// Require an admin/owner session. Returns Err(status) otherwise.
pub(crate) fn require_admin(state: &ApiState, headers: &HeaderMap) -> Result<(), StatusCode> {
    match session_from_headers(state, headers) {
        None => Err(StatusCode::UNAUTHORIZED),
        Some(s) if s.role == "admin" || s.role == "owner" => Ok(()),
        Some(_) => Err(StatusCode::FORBIDDEN),
    }
}

// Front-desk staff: owner/admin/advisor (mechanics excluded). Used for bookings (D10/BACK-2-010).
pub(crate) fn require_staff(state: &ApiState, headers: &HeaderMap) -> Result<(), StatusCode> {
    match session_from_headers(state, headers) {
        None => Err(StatusCode::UNAUTHORIZED),
        Some(s) if s.role == "owner" || s.role == "admin" || s.role == "advisor" => Ok(()),
        Some(_) => Err(StatusCode::FORBIDDEN),
    }
}

#[derive(Deserialize)]
pub struct CreateUserReq {
    name: String,
    username: String,
    role: String,
    pin: String,
}

/// POST /api/users — create a staff user (admin/owner only).
pub async fn create_user(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(req): Json<CreateUserReq>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_admin(&state, &headers).map_err(|s| (s, "admin only".to_string()))?;
    let username = req.username.trim().to_lowercase(); // BACK-2-021: store usernames lowercase
    if req.name.trim().is_empty() || username.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "name and username are required".to_string()));
    }
    if req.pin.len() != 6 || !req.pin.chars().all(|c| c.is_ascii_digit()) {
        return Err((StatusCode::BAD_REQUEST, "PIN must be exactly 6 digits".to_string()));
    }
    let taken: i64 = sqlx::query("SELECT COUNT(*) AS c FROM users WHERE username = ?")
        .bind(&username)
        .fetch_one(&state.pool)
        .await
        .ok()
        .and_then(|r| r.try_get::<i64, _>("c").ok())
        .unwrap_or(0);
    if taken > 0 {
        return Err((StatusCode::CONFLICT, "username already taken".to_string()));
    }

    let (hash, salt) = crate::auth::hash_pin(&req.pin);
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_ms();
    sqlx::query(
        "INSERT INTO users (id, name, username, pin_hash, pin_salt, role, is_active, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)",
    )
    .bind(&id)
    .bind(req.name.trim())
    .bind(&username)
    .bind(&hash)
    .bind(&salt)
    .bind(&req.role)
    .bind(now)
    .bind(now)
    .execute(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "create failed".to_string()))?;

    let row = sqlx::query("SELECT id, name, username, role, is_active FROM users WHERE id = ? LIMIT 1")
        .bind(&id)
        .fetch_one(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "read failed".to_string()))?;
    Ok(Json(Value::Object(row_to_json(&row))))
}

#[derive(Deserialize)]
pub struct UpdateUserReq {
    name: Option<String>,
    role: Option<String>,
    is_active: Option<i64>,
    pin: Option<String>,
}

/// PUT /api/users/:id — update a user's name/role/active state, and/or reset PIN (admin/owner only).
pub async fn update_user(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<UpdateUserReq>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_admin(&state, &headers).map_err(|s| (s, "admin only".to_string()))?;
    let now = now_ms();
    let err = |_e| (StatusCode::INTERNAL_SERVER_ERROR, "update failed".to_string());

    if let Some(name) = req.name.as_ref().filter(|n| !n.trim().is_empty()) {
        sqlx::query("UPDATE users SET name = ?, updated_at = ? WHERE id = ?")
            .bind(name.trim()).bind(now).bind(&id).execute(&state.pool).await.map_err(err)?;
    }
    if let Some(role) = req.role.as_ref() {
        sqlx::query("UPDATE users SET role = ?, updated_at = ? WHERE id = ?")
            .bind(role).bind(now).bind(&id).execute(&state.pool).await.map_err(err)?;
    }
    if let Some(active) = req.is_active {
        sqlx::query("UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?")
            .bind(active).bind(now).bind(&id).execute(&state.pool).await.map_err(err)?;
    }
    if let Some(pin) = req.pin.as_ref() {
        if pin.len() != 6 || !pin.chars().all(|c| c.is_ascii_digit()) {
            return Err((StatusCode::BAD_REQUEST, "PIN must be exactly 6 digits".to_string()));
        }
        let (hash, salt) = crate::auth::hash_pin(pin);
        sqlx::query("UPDATE users SET pin_hash = ?, pin_salt = ?, updated_at = ? WHERE id = ?")
            .bind(&hash).bind(&salt).bind(now).bind(&id).execute(&state.pool).await.map_err(err)?;
    }

    let row = sqlx::query("SELECT id, name, username, role, is_active FROM users WHERE id = ? LIMIT 1")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await
        .map_err(err)?
        .ok_or((StatusCode::NOT_FOUND, "user not found".to_string()))?;
    Ok(Json(Value::Object(row_to_json(&row))))
}

#[derive(Deserialize)]
pub struct AssignReq {
    mechanic_id: Option<String>,
}

/// POST /api/orders/:id/assign — assign (or clear) the mechanic. Auth required.
pub async fn assign_order(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<AssignReq>,
) -> Result<Json<Value>, StatusCode> {
    require_staff(&state, &headers)?; // BACK-2-023: assign/re-assign is staff-only (mechanic → 403)
    // Closed jobs (paid/cancelled) can't be (re)assigned.
    match order_status(&state, &id).await.as_deref() {
        None => return Err(StatusCode::NOT_FOUND),
        Some("paid") | Some("cancelled") => return Err(StatusCode::CONFLICT),
        _ => {}
    }
    sqlx::query("UPDATE orders SET assigned_mechanic_id = ?, updated_at = ? WHERE id = ?")
        .bind(&req.mechanic_id)
        .bind(now_ms())
        .bind(&id)
        .execute(&state.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    order_detail(&state, &id).await.ok_or(StatusCode::NOT_FOUND).map(Json)
}

/// GET /api/orders?assigned=me — active job board (approved + in_progress). `assigned=me`
/// filters to the current user's assignments. Each item includes a light nested asset. Auth required.
pub async fn list_orders(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Vec<Value>>, StatusCode> {
    let session = session_from_headers(&state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    // `assigned=me` → a mechanic's active queue; `scope=all` → every job, all statuses
    // (management "Jobs" view for admin/advisor); default → active board (approved/in_progress).
    let rows = if params.get("assigned").map(|s| s.as_str()) == Some("me") {
        sqlx::query(
            "SELECT * FROM orders WHERE status IN ('approved','in_progress') AND assigned_mechanic_id = ? ORDER BY created_at DESC",
        )
        .bind(&session.user_id)
        .fetch_all(&state.pool)
        .await
    } else if params.get("scope").map(|s| s.as_str()) == Some("all") {
        sqlx::query("SELECT * FROM orders ORDER BY created_at DESC")
            .fetch_all(&state.pool)
            .await
    } else {
        sqlx::query("SELECT * FROM orders WHERE status IN ('approved','in_progress') ORDER BY created_at DESC")
            .fetch_all(&state.pool)
            .await
    }
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut out = Vec::new();
    for r in &rows {
        let mut obj = row_to_json(r);
        if let Some(asset_id) = obj.get("asset_id").and_then(|v| v.as_str()).map(String::from) {
            if let Ok(Some(arow)) = sqlx::query("SELECT * FROM assets WHERE id = ? LIMIT 1")
                .bind(&asset_id)
                .fetch_optional(&state.pool)
                .await
            {
                let mut a = row_to_json(&arow);
                parse_json_field(&mut a, "specs");
                obj.insert("asset".to_string(), Value::Object(a));
            }
        }
        if let Some(cid) = obj.get("customer_id").and_then(|v| v.as_str()).map(String::from) {
            if let Ok(Some(crow)) = sqlx::query("SELECT id, name, phone FROM customers WHERE id = ? LIMIT 1")
                .bind(&cid)
                .fetch_optional(&state.pool)
                .await
            {
                obj.insert("customer".to_string(), Value::Object(row_to_json(&crow)));
            }
        }
        out.push(Value::Object(obj));
    }
    Ok(Json(out))
}

#[derive(Deserialize)]
pub struct CompleteItemReq {
    completed: bool,
}

/// PUT /api/order_items/:id/complete — check/uncheck a line item; bumps the order
/// approved -> in_progress on first check. Returns the updated ticket. Auth required.
pub async fn complete_item(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(item_id): Path<String>,
    Json(req): Json<CompleteItemReq>,
) -> Result<Json<Value>, StatusCode> {
    if session_from_headers(&state, &headers).is_none() {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let order_id: String = sqlx::query("SELECT order_id FROM order_items WHERE id = ? LIMIT 1")
        .bind(&item_id)
        .fetch_optional(&state.pool)
        .await
        .ok()
        .flatten()
        .and_then(|r| r.try_get::<String, _>("order_id").ok())
        .ok_or(StatusCode::NOT_FOUND)?;

    // Work items are only tickable while the job is actually executable.
    match order_status(&state, &order_id).await.as_deref() {
        Some("approved") | Some("in_progress") => {}
        _ => return Err(StatusCode::CONFLICT),
    }

    sqlx::query("UPDATE order_items SET completed = ? WHERE id = ?")
        .bind(if req.completed { 1 } else { 0 })
        .bind(&item_id)
        .execute(&state.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Starting work moves an approved ticket into progress.
    sqlx::query("UPDATE orders SET status = 'in_progress', updated_at = ? WHERE id = ? AND status = 'approved'")
        .bind(now_ms())
        .bind(&order_id)
        .execute(&state.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    order_detail(&state, &order_id).await.ok_or(StatusCode::NOT_FOUND).map(Json)
}

/// POST /api/orders/:id/done — mark the job done (only from approved/in_progress). Auth required.
pub async fn mark_done(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    if session_from_headers(&state, &headers).is_none() {
        return Err(StatusCode::UNAUTHORIZED);
    }
    match order_status(&state, &id).await.as_deref() {
        None => return Err(StatusCode::NOT_FOUND),
        Some("approved") | Some("in_progress") => {}
        _ => return Err(StatusCode::CONFLICT),
    }
    let now = now_ms();
    // Stamp completed_at once (keep the first done time if re-marked).
    sqlx::query("UPDATE orders SET status = 'done', completed_at = COALESCE(completed_at, ?), updated_at = ? WHERE id = ?")
        .bind(now)
        .bind(now)
        .bind(&id)
        .execute(&state.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    order_detail(&state, &id).await.ok_or(StatusCode::NOT_FOUND).map(Json)
}

#[derive(Deserialize)]
pub struct CancelReq {
    reason: Option<String>,
}

/// POST /api/orders/:id/cancel — cancel an open job (admin/advisor). Non-destructive: sets
/// status 'cancelled' + optional reason; keeps all data (D24). Not allowed once paid.
pub async fn cancel_order(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<CancelReq>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_staff(&state, &headers).map_err(|s| (s, "staff only".to_string()))?;
    let status: Option<String> = sqlx::query_scalar("SELECT status FROM orders WHERE id = ? LIMIT 1")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?;
    match status.as_deref() {
        None => return Err((StatusCode::NOT_FOUND, "order not found".to_string())),
        Some("paid") => return Err((StatusCode::CONFLICT, "This job is already paid — it can't be cancelled.".to_string())),
        Some("cancelled") => return Err((StatusCode::CONFLICT, "This job is already cancelled.".to_string())),
        _ => {}
    }
    // A reason is required so the record always states why the job was cancelled.
    let reason = req
        .reason
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or((StatusCode::BAD_REQUEST, "a cancellation reason is required".to_string()))?;
    sqlx::query("UPDATE orders SET status = 'cancelled', cancel_reason = ?, updated_at = ? WHERE id = ?")
        .bind(&reason)
        .bind(now_ms())
        .bind(&id)
        .execute(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "cancel failed".to_string()))?;

    // Stock was deducted at approval (D6) — cancelling an already-approved job puts the
    // linked parts back so inventory doesn't drift.
    if matches!(status.as_deref(), Some("approved") | Some("in_progress") | Some("done")) {
        adjust_stock_for_order(&state, &id, 1.0).await;
    }

    order_detail(&state, &id).await.ok_or((StatusCode::NOT_FOUND, "not found".to_string())).map(Json)
}

/// POST /api/orders/:id/start — a mechanic starts work: approved → in_progress, stamps
/// `started_at` (once), and claims the job (assigns to the current user) if it's unassigned
/// and the actor is a mechanic. Auth required. Idempotent while in_progress.
pub async fn start_order(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let session = session_from_headers(&state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    let now = now_ms();
    sqlx::query(
        "UPDATE orders SET status = 'in_progress', started_at = COALESCE(started_at, ?), updated_at = ? \
         WHERE id = ? AND status IN ('approved', 'in_progress')",
    )
    .bind(now)
    .bind(now)
    .bind(&id)
    .execute(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // A mechanic starting an unassigned job claims it.
    if session.role == "mechanic" {
        let _ = sqlx::query("UPDATE orders SET assigned_mechanic_id = ?, updated_at = ? WHERE id = ? AND assigned_mechanic_id IS NULL")
            .bind(&session.user_id)
            .bind(now)
            .bind(&id)
            .execute(&state.pool)
            .await;
    }
    order_detail(&state, &id).await.ok_or(StatusCode::NOT_FOUND).map(Json)
}

/// POST /api/orders/:id/bill — assign a receipt number (once) and mark `paid`. Auth required.
pub async fn bill_order(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    require_staff(&state, &headers)?; // BACK-2-020: billing is front-desk work (mechanic → 403)
    // Only a finished job can be billed ('paid' allowed again — re-billing is idempotent
    // and reuses the receipt number).
    match order_status(&state, &id).await.as_deref() {
        None => return Err(StatusCode::NOT_FOUND),
        Some("done") | Some("paid") => {}
        _ => return Err(StatusCode::CONFLICT),
    }

    // Reuse an existing receipt number if this order was already billed.
    let existing: Option<String> = sqlx::query("SELECT receipt_number FROM orders WHERE id = ? LIMIT 1")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await
        .ok()
        .flatten()
        .and_then(|r| r.try_get::<Option<String>, _>("receipt_number").ok())
        .flatten();

    let receipt = match existing {
        Some(r) => r,
        None => {
            let n: i64 = sqlx::query("SELECT COUNT(*) AS c FROM orders WHERE receipt_number IS NOT NULL")
                .fetch_one(&state.pool)
                .await
                .ok()
                .and_then(|r| r.try_get::<i64, _>("c").ok())
                .unwrap_or(0);
            format!("INV-{:05}", n + 1)
        }
    };

    sqlx::query("UPDATE orders SET receipt_number = ?, status = 'paid', updated_at = ? WHERE id = ?")
        .bind(&receipt)
        .bind(now_ms())
        .bind(&id)
        .execute(&state.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    order_detail(&state, &id).await.ok_or(StatusCode::NOT_FOUND).map(Json)
}
