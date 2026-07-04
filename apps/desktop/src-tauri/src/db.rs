use sqlx::{migrate::MigrateDatabase, sqlite::SqlitePoolOptions, Pool, Sqlite};
use std::fs;
use tauri::AppHandle;

pub struct DbState {
    pub pool: Pool<Sqlite>,
}

// PORTABLE MODE: the 'data' folder lives next to the executable (or CWD), or one level up
// when running from 'src-tauri' (dev) to avoid an infinite file-watch loop. Single source of
// truth for the data location (DB, license file, media).
pub fn data_dir() -> std::path::PathBuf {
    let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    if cwd.ends_with("src-tauri") {
        cwd.parent().map(|p| p.join("data")).unwrap_or_else(|| cwd.join("data"))
    } else {
        cwd.join("data")
    }
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

#[tauri::command]
pub async fn execute_sql(
    state: tauri::State<'_, DbState>,
    sql: String,
    params: Vec<serde_json::Value>,
) -> Result<Vec<serde_json::Value>, String> {
    use sqlx::Row;
    use sqlx::Column;

    let mut query = sqlx::query(&sql);

    // Bind parameters
    for param in params {
        match param {
            serde_json::Value::Null => query = query.bind(Option::<String>::None),
            serde_json::Value::Bool(b) => query = query.bind(b),
            serde_json::Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    query = query.bind(i);
                } else if let Some(f) = n.as_f64() {
                    query = query.bind(f);
                }
            }
            serde_json::Value::String(s) => query = query.bind(s),
            // For Arrays/Objects, we store as JSON string
            serde_json::Value::Array(_) | serde_json::Value::Object(_) => {
                query = query.bind(param.to_string());
            }
        }
    }

    // Execute
    let rows = query.fetch_all(&state.pool).await.map_err(|e| e.to_string())?;
    
    // Serialize results
    let mut results = Vec::new();
    for row in rows {
        let mut map = serde_json::Map::new();
        for col in row.columns() {
            let col_name = col.name();
            // This is a simplified extraction. 
            // In a real generic implementation, we'd need better type checking.
             // Try to unpack based on common types
            if let Ok(val) = row.try_get::<i64, _>(col_name) {
                map.insert(col_name.to_string(), serde_json::Value::Number(val.into()));
            } else if let Ok(val) = row.try_get::<f64, _>(col_name) {
                 if let Some(n) = serde_json::Number::from_f64(val) {
                    map.insert(col_name.to_string(), serde_json::Value::Number(n));
                 }
            } else if let Ok(val) = row.try_get::<bool, _>(col_name) {
                map.insert(col_name.to_string(), serde_json::Value::Bool(val));
            } else if let Ok(val) = row.try_get::<String, _>(col_name) {
                map.insert(col_name.to_string(), serde_json::Value::String(val));
            } else {
                 // Fallback or Null
                 map.insert(col_name.to_string(), serde_json::Value::Null);
            }
        }
        results.push(serde_json::Value::Object(map));
    }

    Ok(results)
}
