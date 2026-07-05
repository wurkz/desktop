// BACK-0-013: shop logo storage. The logo is written to {data_dir}/media/ and served
// back over HTTP so the desktop webview, LAN phones, and the invoice PDF all render it
// the same way. Single logo per shop (fixed basename), so replacing overwrites.

use axum::{
    body::Body,
    extract::State,
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::Deserialize;
use serde_json::{json, Value};
use std::fs;

use crate::api_data::{now_ms, require_admin};
use crate::auth::ApiState;

const MAX_BYTES: usize = 2 * 1024 * 1024; // 2 MB

fn media_dir() -> std::path::PathBuf {
    crate::db::data_dir().join("media")
}

// Allowed image extensions -> MIME type.
fn ext_mime(ext: &str) -> Option<&'static str> {
    match ext.to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "gif" => Some("image/gif"),
        _ => None,
    }
}

// Remove any existing media/logo.* so replacing with a different extension can't leave
// a stale file behind.
fn remove_existing_logos() {
    if let Ok(entries) = fs::read_dir(media_dir()) {
        for e in entries.flatten() {
            if e.file_name().to_string_lossy().starts_with("logo.") {
                let _ = fs::remove_file(e.path());
            }
        }
    }
}

#[derive(Deserialize)]
pub struct LogoUploadReq {
    data: String, // base64 (with or without a data: URL prefix)
    ext: String,
}

// POST /api/logo — save the shop logo (admin only).
pub async fn upload_logo(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(req): Json<LogoUploadReq>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_admin(&state, &headers).map_err(|s| (s, "admin only".to_string()))?;

    let ext = req.ext.trim().to_ascii_lowercase();
    if ext_mime(&ext).is_none() {
        return Err((StatusCode::BAD_REQUEST, "unsupported image type (use png/jpg/webp/gif)".to_string()));
    }
    // Accept a raw base64 string or a full data: URL.
    let b64 = req.data.split(',').last().unwrap_or("").trim();
    let bytes = B64.decode(b64).map_err(|_| (StatusCode::BAD_REQUEST, "invalid image data".to_string()))?;
    if bytes.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "empty image".to_string()));
    }
    if bytes.len() > MAX_BYTES {
        return Err((StatusCode::PAYLOAD_TOO_LARGE, "image too large (max 2 MB)".to_string()));
    }

    let dir = media_dir();
    fs::create_dir_all(&dir).map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "media dir failed".to_string()))?;
    remove_existing_logos();
    let filename = format!("logo.{}", ext);
    fs::write(dir.join(&filename), &bytes)
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "write failed".to_string()))?;

    let rel = format!("media/{}", filename);
    sqlx::query("UPDATE app_config SET logo_path = ?, updated_at = ? WHERE id = 'default'")
        .bind(&rel)
        .bind(now_ms())
        .execute(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "config update failed".to_string()))?;

    Ok(Json(json!({ "ok": true, "logo_path": rel })))
}

// DELETE /api/logo — remove the shop logo (admin only).
pub async fn delete_logo(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_admin(&state, &headers).map_err(|s| (s, "admin only".to_string()))?;
    remove_existing_logos();
    sqlx::query("UPDATE app_config SET logo_path = NULL, updated_at = ? WHERE id = 'default'")
        .bind(now_ms())
        .execute(&state.pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "config update failed".to_string()))?;
    Ok(Json(json!({ "ok": true })))
}

// GET /api/logo — serve the current logo bytes. Public (the login screen shows it before
// any user is authenticated). 404 when no logo is set.
pub async fn get_logo(State(state): State<ApiState>) -> Response {
    let rel: Option<String> = sqlx::query_scalar("SELECT logo_path FROM app_config WHERE id = 'default' LIMIT 1")
        .fetch_optional(&state.pool)
        .await
        .ok()
        .flatten();
    let rel = match rel {
        Some(r) if !r.is_empty() => r,
        _ => return (StatusCode::NOT_FOUND, "no logo").into_response(),
    };
    let path = crate::db::data_dir().join(&rel);
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    let mime = ext_mime(ext).unwrap_or("application/octet-stream");
    match fs::read(&path) {
        Ok(bytes) => {
            let mut resp = Response::new(Body::from(bytes));
            resp.headers_mut().insert(header::CONTENT_TYPE, header::HeaderValue::from_static(mime));
            resp.headers_mut().insert(header::CACHE_CONTROL, header::HeaderValue::from_static("no-cache"));
            resp
        }
        Err(_) => (StatusCode::NOT_FOUND, "no logo").into_response(),
    }
}
