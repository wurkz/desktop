// Financial layer (BACK-3-010/011): expenses log + cash-drawer sessions.
// Money-out tracking feeds the profit picture; drawer sessions surface over/short
// (leakage) — both sync to the cloud for the owner's remote dashboard.

use axum::{
    extract::{Path, Query, State},
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

/// GET /api/expenses?from=&to=&limit=&offset= — expenses in a period, newest first (voided
/// included, flagged). BACK-2-030: expenses are reviewed by month, so the page filters by
/// period and windows within it instead of a silent global cap. Staff only.
pub async fn list_expenses(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Value>, StatusCode> {
    require_staff(&state, &headers)?;
    let from: i64 = params.get("from").and_then(|s| s.parse().ok()).unwrap_or(0);
    let to: i64 = params.get("to").and_then(|s| s.parse().ok()).unwrap_or(i64::MAX);
    let limit: i64 = params.get("limit").and_then(|s| s.parse().ok()).unwrap_or(100).clamp(1, 500);
    let offset: i64 = params.get("offset").and_then(|s| s.parse().ok()).unwrap_or(0).max(0);
    let rows = sqlx::query(
        "SELECT * FROM expenses WHERE created_at >= ? AND created_at <= ? \
         ORDER BY created_at DESC LIMIT ? OFFSET ?",
    )
    .bind(from)
    .bind(to)
    .bind(limit)
    .bind(offset)
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
    // Partial payments allowed — the payable keeps a running balance and clears when it hits 0.
    let settle = req
        .receive_adjustment_id
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    if let Some(adj_id) = &settle {
        if category != "parts" {
            return Err((StatusCode::BAD_REQUEST, "only a parts expense can settle a stock receive".to_string()));
        }
        let balance: Option<i64> = sqlx::query_scalar(
            "SELECT a.total_cost - COALESCE((SELECT SUM(e.amount) FROM expenses e \
                WHERE e.receive_id = a.id AND e.voided = 0), 0) \
             FROM inventory_adjustments a \
             WHERE a.id = ? AND a.on_account = 1 AND a.expense_id IS NULL",
        )
        .bind(adj_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?;
        let balance = balance.filter(|b| *b > 0).ok_or((
            StatusCode::CONFLICT,
            "That receive is not an outstanding payable.".to_string(),
        ))?;
        if req.amount > balance {
            return Err((
                StatusCode::BAD_REQUEST,
                "That's more than the remaining balance owed on that receive.".to_string(),
            ));
        }
    }

    let author = session_from_headers(&state, &headers).map(|s| s.name);
    let note = req.note.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_ms();
    sqlx::query(
        "INSERT INTO expenses (id, category, amount, note, paid_from_drawer, author, voided, receive_id, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&category)
    .bind(req.amount)
    .bind(&note)
    .bind(if req.paid_from_drawer { 1_i64 } else { 0_i64 })
    .bind(&author)
    .bind(&settle)
    .bind(now)
    .bind(now)
    .execute(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "could not record the expense".to_string()))?;
    // No expense_id write on the receive: the payables list clears it once the summed
    // receive_id payments cover total_cost, and voiding a payment reopens it naturally.

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
         WHERE category = 'parts' AND voided = 0 AND receive_id IS NULL \
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

/// GET /api/reports/receivables — every customer with an outstanding balance across done
/// jobs (the collectibles list; per-customer detail is the SOA). Staff only.
pub async fn receivables(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> Result<Json<Vec<Value>>, (StatusCode, String)> {
    require_staff(&state, &headers).map_err(|s| (s, "staff only".to_string()))?;
    let rows = sqlx::query(
        "SELECT o.customer_id, c.name, c.phone, o.total, o.created_at, \
                COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.order_id = o.id), 0) AS paid \
         FROM orders o JOIN customers c ON c.id = o.customer_id \
         WHERE o.status = 'done' ORDER BY o.created_at",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?;

    // Aggregate per customer, keeping only open balances and the oldest unpaid job's age.
    let mut by_customer: std::collections::HashMap<String, (String, Option<String>, i64, i64, i64)> =
        std::collections::HashMap::new();
    for r in &rows {
        let total: i64 = r.try_get("total").unwrap_or(0);
        let paid: i64 = r.try_get("paid").unwrap_or(0);
        if total - paid <= 0 {
            continue;
        }
        let cid: String = r.try_get("customer_id").unwrap_or_default();
        let name: String = r.try_get("name").unwrap_or_default();
        let phone: Option<String> = r.try_get("phone").ok();
        let created: i64 = r.try_get("created_at").unwrap_or(0);
        let e = by_customer.entry(cid).or_insert((name, phone, 0, 0, i64::MAX));
        e.2 += total - paid; // balance
        e.3 += 1; // open jobs
        e.4 = e.4.min(created); // oldest unpaid
    }
    let mut out: Vec<Value> = by_customer
        .into_iter()
        .map(|(cid, (name, phone, balance, jobs, oldest))| {
            json!({
                "customer_id": cid, "name": name, "phone": phone,
                "balance": balance, "jobs": jobs, "oldest_at": oldest,
            })
        })
        .collect();
    out.sort_by_key(|v| -(v["balance"].as_i64().unwrap_or(0)));
    Ok(Json(out))
}

#[derive(Deserialize)]
pub struct RangeQuery {
    from: Option<i64>,
    to: Option<i64>,
}

/// GET /api/reports/financial-summary?from=&to= — composed numbers for the P&L and VAT summary
/// documents (BACK-3-018 Tier 2). Pro-rata figures use the same per-payment basis as the cloud
/// tiles (payment share × order tax/COGS/discounts). Staff only.
pub async fn financial_summary(
    State(state): State<ApiState>,
    headers: HeaderMap,
    axum::extract::Query(q): axum::extract::Query<RangeQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_staff(&state, &headers).map_err(|s| (s, "staff only".to_string()))?;
    let from = q.from.unwrap_or(0);
    let to = q.to.unwrap_or(now_ms());

    let by_method = sqlx::query(
        "SELECT method, COUNT(*) AS n, COALESCE(SUM(amount),0) AS total FROM payments \
         WHERE created_at >= ? AND created_at <= ? GROUP BY method",
    )
    .bind(from)
    .bind(to)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?;

    let expenses_by_category = sqlx::query(
        "SELECT category, COALESCE(SUM(amount),0) AS total FROM expenses \
         WHERE voided = 0 AND created_at >= ? AND created_at <= ? GROUP BY category ORDER BY total DESC",
    )
    .bind(from)
    .bind(to)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?;

    // Per-order COGS map (cost_at_sale × qty; services/uncosted lines contribute 0).
    let cogs_rows = sqlx::query(
        "SELECT order_id, COALESCE(SUM(cost_at_sale * quantity),0) AS cogs FROM order_items \
         WHERE cost_at_sale IS NOT NULL GROUP BY order_id",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?;
    let mut cogs_map = std::collections::HashMap::new();
    for r in &cogs_rows {
        let oid: String = r.try_get("order_id").unwrap_or_default();
        let c: f64 = r.try_get::<f64, _>("cogs").unwrap_or(0.0);
        cogs_map.insert(oid, c);
    }

    // Pro-rata accumulation over the range's payments.
    let pays = sqlx::query(
        "SELECT p.order_id, p.amount, o.total, o.tax, (o.discount + o.senior_discount) AS disc, o.senior_pwd_type \
         FROM payments p JOIN orders o ON o.id = p.order_id \
         WHERE p.created_at >= ? AND p.created_at <= ?",
    )
    .bind(from)
    .bind(to)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?;

    let mut revenue: i64 = 0;
    let (mut vat, mut cogs_p, mut disc_p) = (0.0_f64, 0.0_f64, 0.0_f64);
    let mut exempt_collected: i64 = 0;
    for p in &pays {
        let amount: i64 = p.try_get("amount").unwrap_or(0);
        let total: i64 = p.try_get("total").unwrap_or(0);
        revenue += amount;
        if total > 0 {
            let share = amount as f64 / total as f64;
            vat += p.try_get::<i64, _>("tax").unwrap_or(0) as f64 * share;
            disc_p += p.try_get::<i64, _>("disc").unwrap_or(0) as f64 * share;
            let oid: String = p.try_get("order_id").unwrap_or_default();
            cogs_p += cogs_map.get(&oid).copied().unwrap_or(0.0) * share;
        }
        let senior: Option<String> = p.try_get("senior_pwd_type").ok().flatten();
        if senior.is_some() {
            exempt_collected += amount;
        }
    }

    let expenses_total: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount),0) FROM expenses WHERE voided = 0 AND created_at >= ? AND created_at <= ?",
    )
    .bind(from)
    .bind(to)
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);

    Ok(Json(json!({
        "revenue": revenue,
        "payments_by_method": by_method.iter().map(|r| Value::Object(row_to_json(r))).collect::<Vec<_>>(),
        "expenses_by_category": expenses_by_category.iter().map(|r| Value::Object(row_to_json(r))).collect::<Vec<_>>(),
        "expenses_total": expenses_total,
        "vat_collected": vat.round() as i64,
        "cogs": cogs_p.round() as i64,
        "discounts_given": disc_p.round() as i64,
        "exempt_collections": exempt_collected,
    })))
}

/// GET /api/reports/senior-pwd?from=&to= — BIR-style Senior/PWD discount record: senior/PWD
/// orders whose FIRST payment falls in the range (collection basis, consistent with the VAT
/// figures). Staff only.
pub async fn senior_pwd_report(
    State(state): State<ApiState>,
    headers: HeaderMap,
    axum::extract::Query(q): axum::extract::Query<RangeQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_staff(&state, &headers).map_err(|s| (s, "staff only".to_string()))?;
    let from = q.from.unwrap_or(0);
    let to = q.to.unwrap_or(now_ms());
    let rows = sqlx::query(
        "SELECT o.id, o.receipt_number, o.senior_pwd_type, o.senior_pwd_id, o.senior_pwd_name, \
                o.subtotal, o.senior_discount, o.total, MIN(p.created_at) AS paid_at \
         FROM orders o JOIN payments p ON p.order_id = o.id \
         WHERE o.senior_pwd_type IS NOT NULL \
         GROUP BY o.id HAVING paid_at >= ? AND paid_at <= ? ORDER BY paid_at",
    )
    .bind(from)
    .bind(to)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?;
    Ok(Json(Value::Array(rows.iter().map(|r| Value::Object(row_to_json(r))).collect())))
}

/// GET /api/reports/mechanics?from=&to= — per-mechanic productivity: jobs completed in the range
/// with average and total wrench time (started_at → completed_at). Staff only.
pub async fn mechanic_report(
    State(state): State<ApiState>,
    headers: HeaderMap,
    axum::extract::Query(q): axum::extract::Query<RangeQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_staff(&state, &headers).map_err(|s| (s, "staff only".to_string()))?;
    let from = q.from.unwrap_or(0);
    let to = q.to.unwrap_or(now_ms());
    let rows = sqlx::query(
        "SELECT o.assigned_mechanic_id, u.name, COUNT(*) AS jobs, \
                COALESCE(AVG(o.completed_at - o.started_at),0) AS avg_ms, \
                COALESCE(SUM(o.completed_at - o.started_at),0) AS total_ms, \
                COALESCE(SUM(o.total),0) AS revenue \
         FROM orders o LEFT JOIN users u ON u.id = o.assigned_mechanic_id \
         WHERE o.completed_at IS NOT NULL AND o.completed_at >= ? AND o.completed_at <= ? \
           AND o.assigned_mechanic_id IS NOT NULL AND o.started_at IS NOT NULL \
         GROUP BY o.assigned_mechanic_id ORDER BY jobs DESC",
    )
    .bind(from)
    .bind(to)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "query failed".to_string()))?;
    Ok(Json(Value::Array(rows.iter().map(|r| Value::Object(row_to_json(r))).collect())))
}
