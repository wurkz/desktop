use axum::{
    extract::Request,
    response::{Html, IntoResponse, Json},
    routing::get,
    Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use tower_http::{
    cors::{Any, CorsLayer},
    services::ServeDir,
};

#[derive(Serialize, Deserialize)]
struct ServerInfo {
    url: String,
    ip: String,
    port: u16,
}

#[derive(Serialize)]
struct TimeResponse {
    time: String,
}

async fn get_server_info() -> Json<ServerInfo> {
    let local_ip = local_ip_address::local_ip()
        .unwrap_or_else(|_| std::net::IpAddr::V4(std::net::Ipv4Addr::new(127, 0, 0, 1)));
    
    let port = 3030;
    
    Json(ServerInfo {
        url: format!("http://{}:{}/mechanic.html", local_ip, port),
        ip: local_ip.to_string(),
        port,
    })
}

async fn get_time() -> Json<TimeResponse> {
    use std::time::{SystemTime, UNIX_EPOCH};
    
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    
    let time = chrono::NaiveDateTime::from_timestamp_opt(timestamp as i64, 0)
        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
        .unwrap_or_else(|| "Unknown".to_string());
    
    Json(TimeResponse { time })
}

async fn serve_mechanic_page() -> Html<String> {
    let html = std::fs::read_to_string("mechanic.html")
        .unwrap_or_else(|_| "<h1>Error loading mechanic page</h1>".to_string());
    Html(html)
}

#[tokio::main]
async fn main() {
    // Get local IP address
    let local_ip = local_ip_address::local_ip()
        .unwrap_or_else(|_| std::net::IpAddr::V4(std::net::Ipv4Addr::new(127, 0, 0, 1)));
    
    println!("\n🚀 Starting LAN Server Spike...\n");
    println!("📍 Local IP: {}", local_ip);
    
    // CORS layer to allow access from any origin (for testing)
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);
    
    // Build our application with routes
    let app = Router::new()
        .route("/api/info", get(get_server_info))
        .route("/api/time", get(get_time))
        .route("/mechanic.html", get(serve_mechanic_page))
        .fallback_service(ServeDir::new("."))
        .layer(cors);
    
    // Bind to 0.0.0.0 so it's accessible from other devices on the network
    let addr = SocketAddr::from(([0, 0, 0, 0], 3030));
    
    println!("\n✅ Server is running!");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("📱 Desktop App: http://localhost:3030/index.html");
    println!("📱 Mechanic Mobile: http://{}:3030/mechanic.html", local_ip);
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    println!("🔍 Testing Instructions:");
    println!("  1. Open http://localhost:3030/index.html on this PC");
    println!("  2. Connect your phone to the SAME Wi-Fi network");
    println!("  3. Open http://{}:3030/mechanic.html on your phone", local_ip);
    println!("\n⚠️  Make sure Windows Firewall allows connections on port 3030\n");
    
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
