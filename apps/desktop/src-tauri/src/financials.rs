// Financial layer (BACK-3-010/011): expenses log + cash-drawer sessions.
// Money-out tracking feeds the profit picture; drawer sessions surface over/short
// (leakage) — both sync to the cloud for the owner's remote dashboard.

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::Row;

use crate::api_data::{now_ms, require_admin, require_staff, row_to_json};
use crate::auth::{session_from_headers, ApiState};

const CATEGORIES: [&str; 5] = ["parts", "salary", "utilities", "rent", "misc"];

// ---- Expenses (BACK-3-010) ----

/// GET /api/expenses — recent expenses, newest first (voided included, flagged). Staff only.
pub async fn list_expenses(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    require_staff(&state, &headers)?;
    let rows = sqlx::query("SELECT * FROM expenses ORDER BY created_at DESC LIMIT 200")
        .fetch_all(&state.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(Value::Array(rows.iter().map(|r| Value::Object(row_to_json(r))).collect())))
}

#[derive(Deserialize)]
pub struct CreateExpenseReq {
    category: String,
    amount: i64, // centavos
    note: Option<String>,
    #[serde(default = "default_true")]
    paid_from_drawer: bool,
    // BACK-3-016: optional — this expense settles an outstanding on-account stock receive.
    receive_adjustment_id: Option<String>,
}
fn default_true() -> bool {
    true
}

/// POST /api/expenses — record money out. Staff only; the log is immutable (void, don't delete).
pub async fn create_expense(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(req): Json<CreateExpenseReq>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_staff(&state, &headers).map_err(|s| (s, "staff only".to_string()))?;
    let category = req.category.trim().to_lowercase();
    if !CATEGORIES.contains(&category.as_str()) {
        return Err((StatusCode::BAD_REQUEST, "unknown expense category".to_string()));
    }
    if req.amount <= 0 {
        return Err((StatusCode::BAD_REQUEST, "the amount must be greater than zero".to_string()));
    }
    // Settling a payable (BACK-3-016): the target must be an outstanding on-account receive.
    let settle = req
        .receive_adjustment_id
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    if let Some(adj_id) = &settle {
        if category != "parts" {
            return Err((StatusCode::BAD_REQUEST, "only a parts expense can settle a stock receive".to_string()));
        }
        let ok: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM inventory_adjustments WHERE id = ? AND on_account = 1 AND expense_id IS NULL",
        )
        .bind(adj_id)
        .fetch_one(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?;
        if ok == 0 {
            return Err((StatusCode::CONFLICT, "That receive is not an outstanding payable.".to_string()));
        }
    }

    let author = session_from_headers(&state, &headers).map(|s| s.name);
    let note = req.note.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_ms();
    sqlx::query(
        "INSERT INTO expenses (id, category, amount, note, paid_from_drawer, author, voided, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)",
    )
    .bind(&id)
    .bind(&category)
    .bind(req.amount)
    .bind(&note)
    .bind(if req.paid_from_drawer { 1_i64 } else { 0_i64 })
    .bind(&author)
    .bind(now)
    .bind(now)
    .execute(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "could not record the expense".to_string()))?;

    // Link the settled receive to this expense (clears it from the payables list).
    if let Some(adj_id) = &settle {
        let _ = sqlx::query("UPDATE inventory_adjustments SET expense_id = ? WHERE id = ?")
            .bind(&id)
            .bind(adj_id)
            .execute(&state.pool)
            .await;
    }

    let row = sqlx::query("SELECT * FROM expenses WHERE id = ? LIMIT 1")
        .bind(&id)
        .fetch_one(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "read failed".to_string()))?;
    Ok(Json(Value::Object(row_to_json(&row))))
}

/// POST /api/expenses/:id/void — soft-void a mistaken entry (admin/owner only; nothing is deleted).
pub async fn void_expense(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_admin(&state, &headers).map_err(|s| (s, "admin only".to_string()))?;
    let actor = session_from_headers(&state, &headers).map(|s| s.name);
    let result = sqlx::query("UPDATE expenses SET voided = 1, voided_by = ?, updated_at = ? WHERE id = ? AND voided = 0")
        .bind(&actor)
        .bind(now_ms())
        .bind(&id)
        .execute(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "void failed".to_string()))?;
    if result.rows_affected() == 0 {
        return Err((StatusCode::CONFLICT, "expense not found or already voided".to_string()));
    }
    let row = sqlx::query("SELECT * FROM expenses WHERE id = ? LIMIT 1")
        .bind(&id)
        .fetch_one(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "read failed".to_string()))?;
    Ok(Json(Value::Object(row_to_json(&row))))
}

/// GET /api/expenses/linkable — recent live parts expenses not yet linked to a receive
/// (candidates for "this receive was already paid"). Staff only.
pub async fn list_linkable_expenses(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    require_staff(&state, &headers)?;
    let rows = sqlx::query(
        "SELECT id, amount, note, author, created_at FROM expenses \
         WHERE category = 'parts' AND voided = 0 \
         AND id NOT IN (SELECT expense_id FROM inventory_adjustments WHERE expense_id IS NOT NULL) \
         ORDER BY created_at DESC LIMIT 20",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(Value::Array(rows.iter().map(|r| Value::Object(row_to_json(r))).collect())))
}

// ---- Drawer movements (BACK-3-017): POS paid-in/paid-out ----

#[derive(Deserialize)]
pub struct MovementReq {
    #[serde(rename = "type")]
    kind: String, // 'cash_in' | 'cash_drop'
    amount: i64,  // centavos
    note: Option<String>,
}

/// POST /api/drawer/movement — mid-day cash in (top-up) or cash drop (to safe/bank).
/// NOT an expense: the money changes location, not ownership — profit is untouched; only the
/// drawer expectation moves. Requires an open session. Staff only.
pub async fn drawer_movement(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(req): Json<MovementReq>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_staff(&state, &headers).map_err(|s| (s, "staff only".to_string()))?;
    if !matches!(req.kind.as_str(), "cash_in" | "cash_drop") {
        return Err((StatusCode::BAD_REQUEST, "invalid movement type".to_string()));
    }
    if req.amount <= 0 {
        return Err((StatusCode::BAD_REQUEST, "the amount must be greater than zero".to_string()));
    }
    let open: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM drawer_sessions WHERE closed_at IS NULL")
        .fetch_one(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?;
    if open == 0 {
        return Err((StatusCode::CONFLICT, "No open drawer session — open the day first.".to_string()));
    }
    let author = session_from_headers(&state, &headers).map(|s| s.name);
    let note = req.note.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO drawer_movements (id, type, amount, note, author, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&req.kind)
    .bind(req.amount)
    .bind(&note)
    .bind(&author)
    .bind(now_ms())
    .execute(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "could not record the movement".to_string()))?;
    let row = sqlx::query("SELECT * FROM drawer_movements WHERE id = ? LIMIT 1")
        .bind(&id)
        .fetch_one(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "read failed".to_string()))?;
    Ok(Json(Value::Object(row_to_json(&row))))
}

// ---- Drawer sessions (BACK-3-011) ----

/// GET /api/drawer — the open session (if any) + the most recent closed one. Staff only.
pub async fn drawer_status(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    require_staff(&state, &headers)?;
    let open = sqlx::query("SELECT * FROM drawer_sessions WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1")
        .fetch_optional(&state.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .map(|r| Value::Object(row_to_json(&r)))
        .unwrap_or(Value::Null);
    let last_closed = sqlx::query("SELECT * FROM drawer_sessions WHERE closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT 1")
        .fetch_optional(&state.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .map(|r| Value::Object(row_to_json(&r)))
        .unwrap_or(Value::Null);
    // Movements within the open session (for display on the drawer card).
    let movements = match open.get("opened_at").and_then(|v| v.as_i64()) {
        Some(opened_at) => sqlx::query("SELECT * FROM drawer_movements WHERE created_at >= ? ORDER BY created_at DESC")
            .bind(opened_at)
            .fetch_all(&state.pool)
            .await
            .map(|rows| rows.iter().map(|r| Value::Object(row_to_json(r))).collect::<Vec<_>>())
            .unwrap_or_default(),
        None => vec![],
    };
    Ok(Json(json!({ "open": open, "last_closed": last_closed, "movements": movements })))
}

#[derive(Deserialize)]
pub struct OpenDrawerReq {
    opening_float: i64, // centavos
}

/// POST /api/drawer/open — start the day: record the float. One open session at a time. Staff only.
pub async fn open_drawer(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(req): Json<OpenDrawerReq>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_staff(&state, &headers).map_err(|s| (s, "staff only".to_string()))?;
    if req.opening_float < 0 {
        return Err((StatusCode::BAD_REQUEST, "the opening float can't be negative".to_string()));
    }
    let already_open: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM drawer_sessions WHERE closed_at IS NULL")
        .fetch_one(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?;
    if already_open > 0 {
        return Err((StatusCode::CONFLICT, "The drawer is already open — close it first.".to_string()));
    }
    let opened_by = session_from_headers(&state, &headers).map(|s| s.name);
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_ms();
    sqlx::query(
        "INSERT INTO drawer_sessions (id, opening_float, opened_by, opened_at, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(req.opening_float)
    .bind(&opened_by)
    .bind(now)
    .bind(now)
    .bind(now)
    .execute(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "could not open the drawer".to_string()))?;
    let row = sqlx::query("SELECT * FROM drawer_sessions WHERE id = ? LIMIT 1")
        .bind(&id)
        .fetch_one(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "read failed".to_string()))?;
    Ok(Json(Value::Object(row_to_json(&row))))
}

#[derive(Deserialize)]
pub struct CloseDrawerReq {
    counted_cash: i64, // centavos actually in the drawer
}

/// POST /api/drawer/close — end the day: expected = float + cash payments − drawer-paid expenses
/// (within the session window); records counted cash and the over/short. Staff only.
pub async fn close_drawer(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(req): Json<CloseDrawerReq>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_staff(&state, &headers).map_err(|s| (s, "staff only".to_string()))?;
    if req.counted_cash < 0 {
        return Err((StatusCode::BAD_REQUEST, "the counted cash can't be negative".to_string()));
    }
    let open = sqlx::query("SELECT id, opening_float, opened_at FROM drawer_sessions WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1")
        .fetch_optional(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?
        .ok_or((StatusCode::CONFLICT, "No open drawer session — open the day first.".to_string()))?;
    let session_id: String = open.try_get("id").map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "read failed".to_string()))?;
    let opening_float: i64 = open.try_get("opening_float").unwrap_or(0);
    let opened_at: i64 = open.try_get("opened_at").unwrap_or(0);

    let cash_in: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount), 0) FROM payments WHERE method = 'cash' AND created_at >= ?",
    )
    .bind(opened_at)
    .fetch_one(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?;

    let cash_out: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE paid_from_drawer = 1 AND voided = 0 AND created_at >= ?",
    )
    .bind(opened_at)
    .fetch_one(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?;

    // BACK-3-017: mid-day movements — top-ups add, safe/bank drops subtract.
    let moved_in: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount), 0) FROM drawer_movements WHERE type = 'cash_in' AND created_at >= ?",
    )
    .bind(opened_at)
    .fetch_one(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?;
    let dropped: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount), 0) FROM drawer_movements WHERE type = 'cash_drop' AND created_at >= ?",
    )
    .bind(opened_at)
    .fetch_one(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?;

    let expected = opening_float + cash_in - cash_out + moved_in - dropped;
    let over_short = req.counted_cash - expected; // negative = short
    let closed_by = session_from_headers(&state, &headers).map(|s| s.name);
    let now = now_ms();
    sqlx::query(
        "UPDATE drawer_sessions SET expected_cash = ?, counted_cash = ?, over_short = ?, \
         closed_by = ?, closed_at = ?, updated_at = ? WHERE id = ?",
    )
    .bind(expected)
    .bind(req.counted_cash)
    .bind(over_short)
    .bind(&closed_by)
    .bind(now)
    .bind(now)
    .bind(&session_id)
    .execute(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "could not close the drawer".to_string()))?;

    let row = sqlx::query("SELECT * FROM drawer_sessions WHERE id = ? LIMIT 1")
        .bind(&session_id)
        .fetch_one(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "read failed".to_string()))?;
    Ok(Json(Value::Object(row_to_json(&row))))
}

// ---- Reports (BACK-3-018 Tier 1) ----

/// GET /api/drawer/report — composed numbers for the End-of-Day (Z-reading) report of the most
/// recently CLOSED session: sales by method, drawer expenses, movements, jobs completed — all
/// within the session window. Staff only.
pub async fn eod_report(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_staff(&state, &headers).map_err(|s| (s, "staff only".to_string()))?;
    let session = sqlx::query("SELECT * FROM drawer_sessions WHERE closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT 1")
        .fetch_optional(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "No closed drawer session yet — close a day first.".to_string()))?;
    let opened_at: i64 = session.try_get("opened_at").unwrap_or(0);
    let closed_at: i64 = session.try_get("closed_at").unwrap_or(0);

    let by_method = sqlx::query(
        "SELECT method, COUNT(*) AS n, COALESCE(SUM(amount),0) AS total FROM payments \
         WHERE created_at >= ? AND created_at <= ? GROUP BY method",
    )
    .bind(opened_at)
    .bind(closed_at)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?;

    let expenses = sqlx::query(
        "SELECT category, amount, note, author, created_at FROM expenses \
         WHERE paid_from_drawer = 1 AND voided = 0 AND created_at >= ? AND created_at <= ? ORDER BY created_at",
    )
    .bind(opened_at)
    .bind(closed_at)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?;

    let movements = sqlx::query(
        "SELECT type, amount, note, author, created_at FROM drawer_movements \
         WHERE created_at >= ? AND created_at <= ? ORDER BY created_at",
    )
    .bind(opened_at)
    .bind(closed_at)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?;

    let jobs_done: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM order_status_history WHERE to_status = 'done' AND created_at >= ? AND created_at <= ?",
    )
    .bind(opened_at)
    .bind(closed_at)
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);

    Ok(Json(json!({
        "session": Value::Object(row_to_json(&session)),
        "payments_by_method": by_method.iter().map(|r| Value::Object(row_to_json(r))).collect::<Vec<_>>(),
        "drawer_expenses": expenses.iter().map(|r| Value::Object(row_to_json(r))).collect::<Vec<_>>(),
        "movements": movements.iter().map(|r| Value::Object(row_to_json(r))).collect::<Vec<_>>(),
        "jobs_done": jobs_done,
    })))
}

/// GET /api/reports/soa/:customer_id — Statement of Account: the customer's unpaid balances
/// across finished jobs (status done, payments < total). Staff only.
pub async fn soa(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(customer_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_staff(&state, &headers).map_err(|s| (s, "staff only".to_string()))?;
    let customer = sqlx::query("SELECT id, name, phone FROM customers WHERE id = ? LIMIT 1")
        .bind(&customer_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "customer not found".to_string()))?;

    let rows = sqlx::query(
        "SELECT o.id, o.receipt_number, o.job_order_no, o.total, o.created_at, o.asset_id, \
                COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.order_id = o.id), 0) AS paid \
         FROM orders o WHERE o.customer_id = ? AND o.status = 'done' ORDER BY o.created_at",
    )
    .bind(&customer_id)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?;

    // Only jobs with an outstanding balance belong on the statement.
    let mut items: Vec<Value> = Vec::new();
    for r in &rows {
        let total: i64 = r.try_get("total").unwrap_or(0);
        let paid: i64 = r.try_get("paid").unwrap_or(0);
        if total - paid > 0 {
            let mut obj = row_to_json(r);
            obj.insert("balance".to_string(), Value::from(total - paid));
            items.push(Value::Object(obj));
        }
    }

    Ok(Json(json!({
        "customer": Value::Object(row_to_json(&customer)),
        "items": items,
    })))
}
