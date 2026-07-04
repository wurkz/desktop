use axum::{
    body::Body,
    extract::Request,
    http::{header, HeaderValue, Method, StatusCode, Uri},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use local_ip_address::local_ip;
use rust_embed::RustEmbed;
use serde_json::{json, Value};
use sqlx::{Pool, Sqlite};
use std::net::{IpAddr, SocketAddr};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};
use tower_http::cors::{AllowOrigin, CorsLayer};

use crate::api_data;
use crate::auth::{self, ApiState, AuthState};

const PORT: u16 = 3030;

pub struct ServerState {
    pub url: Mutex<Option<String>>,
}

#[tauri::command]
pub fn get_server_url(state: State<ServerState>) -> Option<String> {
    state.url.lock().unwrap().clone()
}

// The built React frontend (apps/desktop/dist). In debug builds rust-embed reads these
// from disk at runtime; in release they are embedded into the binary so the axum server
// can serve the SPA to LAN devices with no external files.
#[derive(RustEmbed)]
#[folder = "../dist"]
struct Assets;

fn serve_embedded(path: &str) -> Option<Response> {
    let file = Assets::get(path)?;
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    let mut resp = Response::new(Body::from(file.data.into_owned()));
    if let Ok(value) = HeaderValue::from_str(mime.as_ref()) {
        resp.headers_mut().insert(header::CONTENT_TYPE, value);
    }
    Some(resp)
}

// Serve static assets; fall back to index.html (the app uses HashRouter, so all client
// routes live under `/`).
async fn static_handler(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };
    serve_embedded(path)
        .or_else(|| serve_embedded("index.html"))
        .unwrap_or_else(|| (StatusCode::NOT_FOUND, "Not found").into_response())
}

// Allow only the desktop webview origins (dev vite server + Tauri's tauri.localhost) to
// call the API cross-origin. Phones load the SPA from this same server, so they are
// same-origin and need no CORS. Public origins are rejected (not a wildcard).
fn cors_layer() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(|origin: &HeaderValue, _| {
            let o = origin.to_str().unwrap_or("");
            o.contains("tauri.localhost")
                || o.starts_with("http://localhost")
                || o.starts_with("http://127.0.0.1")
        }))
        .allow_methods([
            axum::http::Method::GET,
            axum::http::Method::POST,
            axum::http::Method::PUT,
            axum::http::Method::DELETE,
        ])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE])
}

pub async fn start_server(app: AppHandle, pool: Pool<Sqlite>) {
    let my_local_ip = local_ip().unwrap_or(IpAddr::from([0, 0, 0, 0]));
    let addr = SocketAddr::from(([0, 0, 0, 0], PORT));
    let url = format!("http://{}:{}", my_local_ip, PORT);

    println!("Attempting to bind HTTP server to {}", addr);
    ensure_firewall_rule();

    if let Some(state) = app.try_state::<ServerState>() {
        *state.url.lock().unwrap() = Some(url.clone());
    }

    let api_state = ApiState {
        pool,
        auth: Arc::new(AuthState::default()),
    };

    let router = Router::new()
        .route("/api/info", get(info_handler))
        .route("/api/login", post(auth::login))
        .route("/api/logout", post(auth::logout))
        .route("/api/me", get(auth::me))
        .route("/api/config", get(api_data::get_config))
        .route("/api/stats", get(api_data::get_stats))
        .route(
            "/api/assets",
            get(api_data::search_assets).post(api_data::create_asset),
        )
        .route(
            "/api/customers",
            get(api_data::search_customers).post(api_data::create_customer),
        )
        .route(
            "/api/orders",
            get(api_data::list_orders).post(api_data::create_order),
        )
        .route("/api/orders/:id", get(api_data::get_order))
        .route("/api/orders/:id/estimate", axum::routing::put(api_data::save_estimate))
        .route("/api/orders/:id/approve", post(api_data::approve_order))
        .route("/api/orders/:id/assign", post(api_data::assign_order))
        .route("/api/orders/:id/done", post(api_data::mark_done))
        .route("/api/orders/:id/bill", post(api_data::bill_order))
        .route(
            "/api/order_items/:id/complete",
            axum::routing::put(api_data::complete_item),
        )
        .route("/api/users", get(api_data::list_users).post(api_data::create_user))
        .route("/api/users/:id", axum::routing::put(api_data::update_user))
        .route(
            "/api/license",
            get(api_data::get_license).post(api_data::load_license),
        )
        .route("/api/backup", post(api_data::backup_now))
        .route("/api/backups", get(api_data::list_backups))
        .route("/api/restore", post(api_data::restore_backup))
        .route("/api/backup-dir", post(api_data::set_backup_dir))
        .route(
            "/api/inventory",
            get(api_data::search_inventory).post(api_data::create_inventory),
        )
        .fallback(static_handler) // serve the SPA for everything else
        .layer(middleware::from_fn(license_gate))
        .layer(cors_layer())
        .with_state(api_state);

    tauri::async_runtime::spawn(async move {
        match tokio::net::TcpListener::bind(addr).await {
            Ok(listener) => {
                println!("Server running on {}", url);
                let _ = app.emit("server-started", json!({ "url": url }));

                if let Err(e) = axum::serve(listener, router).await {
                    eprintln!("Server error: {}", e);
                }
            }
            Err(e) => {
                eprintln!("Failed to bind server port: {}", e);
            }
        }
    });
}

// Read-only gate (D24): when the license/trial is inactive, block mutating business requests
// but NEVER touch data. Reads, auth, and installing a license are always allowed.
async fn license_gate(req: Request, next: Next) -> Response {
    let mutating = matches!(req.method(), &Method::POST | &Method::PUT | &Method::DELETE | &Method::PATCH);
    let path = req.uri().path();
    // Auth + license install + data-safety ops (backup/restore) are always allowed — even
    // read-only (D24): the shop can always export/recover its own data.
    let exempt = matches!(path, "/api/login" | "/api/logout" | "/api/license" | "/api/restore" | "/api/backup-dir")
        || path.starts_with("/api/backup");

    if mutating && path.starts_with("/api/") && !exempt {
        let status = crate::license::read_license_status(&crate::db::data_dir());
        if status.access == "readonly" {
            return (
                StatusCode::FORBIDDEN,
                "License inactive — the app is read-only. Your data is safe; enter a valid license to continue editing.",
            )
                .into_response();
        }
    }
    next.run(req).await
}

async fn info_handler() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "service": "zorviz-desktop",
        "version": "0.1.0"
    }))
}

// Best-effort: open inbound TCP 3030 so LAN devices can reach the server. Succeeds only
// when the process is elevated (e.g. run once as admin, or added by the installer);
// otherwise it fails silently and the rule must be added by the installer / manually.
#[cfg(target_os = "windows")]
fn ensure_firewall_rule() {
    use std::process::Command;
    let name = "Zorviz LAN Server (Port 3030)";

    let already = Command::new("netsh")
        .args(["advfirewall", "firewall", "show", "rule", &format!("name={}", name)])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).contains("Rule Name"))
        .unwrap_or(false);
    if already {
        return;
    }

    let _ = Command::new("netsh")
        .args([
            "advfirewall",
            "firewall",
            "add",
            "rule",
            &format!("name={}", name),
            "dir=in",
            "action=allow",
            "protocol=TCP",
            "localport=3030",
        ])
        .output();
}

#[cfg(not(target_os = "windows"))]
fn ensure_firewall_rule() {}
