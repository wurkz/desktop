// Customer master data: the directory + profile behind the receivables flow.
// (Typeahead search/create for the job flow lives in api_data.rs; this is the management view.)
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::Row;

use crate::api_data::{now_ms, require_staff, row_to_json};
use crate::auth::ApiState;

/// GET /api/customers/all?q= — directory with money aggregates: open balance across done
/// jobs, lifetime paid, job count. Empty q lists everyone. Staff only.
pub async fn customer_directory(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Vec<Value>>, StatusCode> {
    require_staff(&state, &headers)?;
    let q = params.get("q").cloned().unwrap_or_default();
    let like = format!("%{}%", q.trim());
    let rows = sqlx::query(
        "SELECT c.id, c.name, c.phone, c.email, c.created_at, \
            (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS jobs, \
            COALESCE((SELECT SUM(p.amount) FROM payments p \
                JOIN orders o ON o.id = p.order_id WHERE o.customer_id = c.id), 0) AS lifetime_paid, \
            COALESCE((SELECT SUM(o.total - COALESCE((SELECT SUM(p.amount) FROM payments p \
                WHERE p.order_id = o.id), 0)) \
                FROM orders o WHERE o.customer_id = c.id AND o.status = 'done' \
                AND o.total > COALESCE((SELECT SUM(p.amount) FROM payments p \
                    WHERE p.order_id = o.id), 0)), 0) AS balance \
         FROM customers c \
         WHERE c.deleted_at IS NULL AND (? = '' OR c.name LIKE ? OR c.phone LIKE ?) \
         ORDER BY c.name COLLATE NOCASE LIMIT ? OFFSET ?",
    )
    .bind(q.trim())
    .bind(&like)
    .bind(&like)
    .bind(params.get("limit").and_then(|s| s.parse::<i64>().ok()).unwrap_or(100).clamp(1, 500))
    .bind(params.get("offset").and_then(|s| s.parse::<i64>().ok()).unwrap_or(0).max(0))
    .fetch_all(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(rows.iter().map(|r| Value::Object(row_to_json(r))).collect()))
}

/// GET /api/customers/:id/detail — profile: the record, their assets, and every job with
/// paid/balance so the profile is the collection cockpit. Staff only.
pub async fn customer_detail(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_staff(&state, &headers).map_err(|s| (s, "staff only".to_string()))?;
    let customer = sqlx::query("SELECT * FROM customers WHERE id = ? LIMIT 1")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "customer not found".to_string()))?;

    let assets = sqlx::query(
        "SELECT id, type, specs, created_at FROM assets \
         WHERE owner_id = ? AND deleted_at IS NULL ORDER BY created_at DESC",
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?;

    let orders = sqlx::query(
        "SELECT o.id, o.job_order_no, o.receipt_number, o.status, o.total, o.created_at, o.asset_id, \
                COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.order_id = o.id), 0) AS paid \
         FROM orders o WHERE o.customer_id = ? ORDER BY o.created_at DESC LIMIT 200",
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?;

    let mut jobs: Vec<Value> = Vec::new();
    let mut balance: i64 = 0;
    let mut lifetime_paid: i64 = 0;
    for r in &orders {
        let mut obj = row_to_json(r);
        let total: i64 = r.try_get("total").unwrap_or(0);
        let paid: i64 = r.try_get("paid").unwrap_or(0);
        let status: String = r.try_get("status").unwrap_or_default();
        let open = if status == "done" { (total - paid).max(0) } else { 0 };
        balance += open;
        lifetime_paid += paid;
        obj.insert("balance".to_string(), Value::from(open));
        jobs.push(Value::Object(obj));
    }

    Ok(Json(json!({
        "customer": Value::Object(row_to_json(&customer)),
        "assets": assets.iter().map(|r| Value::Object(row_to_json(r))).collect::<Vec<_>>(),
        "jobs": jobs,
        "balance": balance,
        "lifetime_paid": lifetime_paid,
    })))
}

#[derive(Deserialize)]
pub struct UpdateCustomerReq {
    name: String,
    phone: Option<String>,
    email: Option<String>,
    address: Option<String>,
    notes: Option<String>,
}

/// PUT /api/customers/:id — update contact details + notes. Staff only.
pub async fn update_customer(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<UpdateCustomerReq>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_staff(&state, &headers).map_err(|s| (s, "staff only".to_string()))?;
    let name = req.name.trim().to_string();
    if name.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "the customer needs a name".to_string()));
    }
    let clean = |v: &Option<String>| v.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let res = sqlx::query(
        "UPDATE customers SET name = ?, phone = ?, email = ?, address = ?, notes = ?, updated_at = ? \
         WHERE id = ?",
    )
    .bind(&name)
    .bind(clean(&req.phone))
    .bind(clean(&req.email))
    .bind(clean(&req.address))
    .bind(clean(&req.notes))
    .bind(now_ms())
    .bind(&id)
    .execute(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "could not update the customer".to_string()))?;
    if res.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "customer not found".to_string()));
    }
    let row = sqlx::query("SELECT * FROM customers WHERE id = ? LIMIT 1")
        .bind(&id)
        .fetch_one(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "read failed".to_string()))?;
    Ok(Json(Value::Object(row_to_json(&row))))
}

/// DELETE /api/customers/:id — soft-delete (sync has no hard deletes; assets pattern).
/// Blocked while the customer has open tickets or an unpaid balance on done jobs. Staff only.
pub async fn delete_customer(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_staff(&state, &headers).map_err(|s| (s, "staff only".to_string()))?;

    let open: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM orders WHERE customer_id = ? AND status NOT IN ('paid', 'cancelled')",
    )
    .bind(&id)
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);
    if open > 0 {
        return Err((
            StatusCode::CONFLICT,
            format!("This customer has {} open job ticket(s). Close or finish them before deleting.", open),
        ));
    }
    let balance: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(o.total - COALESCE((SELECT SUM(p.amount) FROM payments p \
            WHERE p.order_id = o.id), 0)), 0) \
         FROM orders o WHERE o.customer_id = ? AND o.status = 'done' \
         AND o.total > COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.order_id = o.id), 0)",
    )
    .bind(&id)
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);
    if balance > 0 {
        return Err((
            StatusCode::CONFLICT,
            "This customer still owes an open balance. Collect or settle it before deleting.".to_string(),
        ));
    }

    let now = now_ms();
    let result = sqlx::query("UPDATE customers SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(now)
        .bind(now)
        .bind(&id)
        .execute(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "delete failed".to_string()))?;
    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "customer not found".to_string()));
    }
    Ok(Json(json!({ "ok": true })))
}
