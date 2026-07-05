use sqlx::{migrate::MigrateDatabase, sqlite::SqlitePoolOptions, Pool, Sqlite};
use std::fs;
use tauri::AppHandle;

pub struct DbState {
    pub pool: Pool<Sqlite>,
}

// Single source of truth for the data location (DB, license, media, backups).
//
// - **Dev (debug builds):** the working directory is the project, so keep `data` next to the app
//   source — one level up when launched from `src-tauri` (avoids the dev file-watch loop),
//   otherwise `<cwd>/data`. This matches how `npm run tauri dev` runs.
// - **Installed (release builds):** an installed app's working directory is unreliable (often
//   `System32`) and its exe folder (e.g. `Program Files\Zorviz`) is read-only for normal users.
//   Use a stable, always-writable per-user location: `%LOCALAPPDATA%\Zorviz\data`
//   (falling back to `%APPDATA%`, then the exe folder, then the cwd).
pub fn data_dir() -> std::path::PathBuf {
    use std::path::PathBuf;

    if cfg!(debug_assertions) {
        let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        return if cwd.ends_with("src-tauri") {
            cwd.parent().map(|p| p.join("data")).unwrap_or_else(|| cwd.join("data"))
        } else {
            cwd.join("data")
        };
    }

    if let Some(base) = std::env::var_os("LOCALAPPDATA").or_else(|| std::env::var_os("APPDATA")) {
        return PathBuf::from(base).join("Zorviz").join("data");
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            return dir.join("data");
        }
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")).join("data")
}

pub async fn init_db(_app_handle: &AppHandle) -> Result<Pool<Sqlite>, String> {
    let data_dir = data_dir();

    if !data_dir.exists() {
        fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    }

    let db_path = data_dir.join("zorviz.db");
    let db_url = format!("sqlite:{}", db_path.to_str().unwrap());

    if !Sqlite::database_exists(&db_url).await.unwrap_or(false) {
        Sqlite::create_database(&db_url).await.map_err(|e| e.to_string())?;
    }

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await
        .map_err(|e| e.to_string())?;

    // Run migrations
    sqlx::migrate!("../../../packages/db/migrations/sqlite").run(&pool).await.map_err(|e| e.to_string())?;

    Ok(pool)
}
