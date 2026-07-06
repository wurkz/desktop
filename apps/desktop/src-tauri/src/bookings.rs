// BACK-2-010: lightweight bookings (call-aheads). A booking is contact + note + time,
// with no asset yet; an admin/advisor converts it into the normal asset + job-ticket
// flow when the customer arrives. Front-desk staff only (owner/admin/advisor).

use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;

use crate::api_data::{now_ms, require_staff, row_to_json};
use crate::auth::ApiState;

// GET /api/bookings — active bookings (pending/confirmed) by time; ?scope=all for everything.
pub async fn list_bookings(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_staff(&state, &headers).map_err(|s| (s, "staff only".to_string()))?;
    let all = params.get("scope").map(|s| s == "all").unwrap_or(false);
    let sql = if all {
        "SELECT * FROM bookings ORDER BY scheduled_time ASC"
    } else {
        "SELECT * FROM bookings WHERE status IN ('pending','confirmed') ORDER BY scheduled_time ASC"
    };
    let rows = sqlx::query(sql)
        .fetch_all(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?;
    Ok(Json(Value::Array(rows.iter().map(|r| Value::Object(row_to_json(r))).collect())))
}

#[derive(Deserialize)]
pub struct CreateBookingReq {
    customer_name: Option<String>,
    customer_phone: Option<String>,
    note: Option<String>,
    scheduled_time: i64,
}

// POST /api/bookings — create a lightweight booking (status pending).
pub async fn create_booking(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(req): Json<CreateBookingReq>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_staff(&state, &headers).map_err(|s| (s, "staff only".to_string()))?;
    let has_name = req.customer_name.as_deref().map(|s| !s.trim().is_empty()).unwrap_or(false);
    let has_note = req.note.as_deref().map(|s| !s.trim().is_empty()).unwrap_or(false);
    if !has_name && !has_note {
        return Err((StatusCode::BAD_REQUEST, "add a customer name or a note".to_string()));
    }
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_ms();
    let clean = |o: &Option<String>| o.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    sqlx::query(
        "INSERT INTO bookings (id, customer_name, customer_phone, note, scheduled_time, status, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)",
    )
    .bind(&id)
    .bind(clean(&req.customer_name))
    .bind(clean(&req.customer_phone))
    .bind(clean(&req.note))
    .bind(req.scheduled_time)
    .bind(now)
    .bind(now)
    .execute(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "create failed".to_string()))?;
    fetch_one(&state, &id).await
}

#[derive(Deserialize)]
pub struct BookingStatusReq {
    status: String,
    asset_id: Option<String>,
    customer_id: Option<String>,
}

// POST /api/bookings/:id/status — advance status (confirm/cancel) or link on convert.
pub async fn set_booking_status(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<BookingStatusReq>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_staff(&state, &headers).map_err(|s| (s, "staff only".to_string()))?;
    const ALLOWED: [&str; 5] = ["pending", "confirmed", "in_progress", "completed", "cancelled"];
    if !ALLOWED.contains(&req.status.as_str()) {
        return Err((StatusCode::BAD_REQUEST, "invalid status".to_string()));
    }
    let result = sqlx::query(
        "UPDATE bookings SET status = ?, \
         asset_id = COALESCE(?, asset_id), customer_id = COALESCE(?, customer_id), updated_at = ? \
         WHERE id = ?",
    )
    .bind(&req.status)
    .bind(&req.asset_id)
    .bind(&req.customer_id)
    .bind(now_ms())
    .bind(&id)
    .execute(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "update failed".to_string()))?;
    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "booking not found".to_string()));
    }
    fetch_one(&state, &id).await
}

async fn fetch_one(state: &ApiState, id: &str) -> Result<Json<Value>, (StatusCode, String)> {
    let row = sqlx::query("SELECT * FROM bookings WHERE id = ? LIMIT 1")
        .bind(id)
        .fetch_one(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "reload failed".to_string()))?;
    Ok(Json(Value::Object(row_to_json(&row))))
}
