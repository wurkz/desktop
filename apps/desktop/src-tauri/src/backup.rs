// Local backup & restore (BACK-0-008, D18). Consistent single-file backups via SQLite
// `VACUUM INTO`; restore is staged and applied on next launch (safe with an open DB).
// Never destructive: backups only add files; restore replaces the live DB only from a backup.

use serde::Serialize;
use serde_json::{json, Value};
use sqlx::{Pool, Row, Sqlite};
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

const KEEP: usize = 10; // rolling retention (db-only)
const KEEP_FULL: usize = 5; // full-zip retention (larger; on-demand)
const RESTORE_PENDING: &str = "restore-pending.db";
const RESTORE_PENDING_MEDIA: &str = "restore-pending-media";
const DB_FILE: &str = "zorviz.db";

#[derive(Serialize)]
pub struct BackupInfo {
    pub name: String,
    pub size: u64,
    pub modified: i64,
}

/// Resolve the backup folder from app_config (or default to <data>/backups) and ensure it exists.
pub async fn resolve_backup_dir(pool: &Pool<Sqlite>, data_dir: &Path) -> PathBuf {
    let configured: Option<String> = sqlx::query("SELECT backup_dir FROM app_config WHERE id = 'default' LIMIT 1")
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .and_then(|r| r.try_get::<Option<String>, _>("backup_dir").ok())
        .flatten()
        .filter(|s| !s.trim().is_empty());
    let dir = configured.map(PathBuf::from).unwrap_or_else(|| data_dir.join("backups"));
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// Create a consistent backup copy. Returns the file name. Idempotent within a second.
pub async fn backup_now(pool: &Pool<Sqlite>, data_dir: &Path) -> Result<String, String> {
    let dir = resolve_backup_dir(pool, data_dir).await;
    let name = format!("zorviz-{}.db", chrono::Utc::now().format("%Y%m%d-%H%M%S"));
    let path = dir.join(&name);
    if !path.exists() {
        // VACUUM INTO writes a clean, WAL-consistent single-file copy.
        sqlx::query("VACUUM INTO ?")
            .bind(path.to_string_lossy().to_string())
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        prune(&dir);
    }
    Ok(name)
}

fn prune(dir: &Path) {
    prune_matching(dir, |n| n.starts_with("zorviz-") && n.ends_with(".db"), KEEP);
}

fn prune_matching(dir: &Path, pred: impl Fn(&str) -> bool, keep: usize) {
    let mut backups: Vec<PathBuf> = std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.file_name().and_then(|n| n.to_str()).map(&pred).unwrap_or(false))
        .collect();
    backups.sort(); // timestamped names sort chronologically
    if backups.len() > keep {
        for old in &backups[..backups.len() - keep] {
            let _ = std::fs::remove_file(old);
        }
    }
}

// Recursively collect files under `root`, returning (absolute path, path relative to root).
fn collect_files(root: &Path) -> Vec<(PathBuf, String)> {
    fn walk(dir: &Path, base: &Path, out: &mut Vec<(PathBuf, String)>) {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for e in entries.flatten() {
                let p = e.path();
                if p.is_dir() {
                    walk(&p, base, out);
                } else if let Ok(rel) = p.strip_prefix(base) {
                    out.push((p.clone(), rel.to_string_lossy().replace('\\', "/")));
                }
            }
        }
    }
    let mut out = Vec::new();
    walk(root, root, &mut out);
    out
}

/// Full backup: a single .zip with a VACUUM'd `zorviz.db` + the whole `media/` tree
/// (logo + ticket photos). On-demand (the rolling auto-backups stay DB-only). Returns the name.
pub async fn full_backup_now(pool: &Pool<Sqlite>, data_dir: &Path) -> Result<String, String> {
    let dir = resolve_backup_dir(pool, data_dir).await;
    let ts = chrono::Utc::now().format("%Y%m%d-%H%M%S").to_string();
    let name = format!("zorviz-full-{}.zip", ts);
    let zip_path = dir.join(&name);
    if zip_path.exists() {
        return Ok(name); // idempotent within a second
    }

    // 1) Clean DB copy via VACUUM INTO a temp file.
    let tmp_db = dir.join(format!("._full-{}.db", ts));
    let _ = std::fs::remove_file(&tmp_db);
    sqlx::query("VACUUM INTO ?")
        .bind(tmp_db.to_string_lossy().to_string())
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    // 2) Build the zip: db + media/*.
    let result = (|| -> std::io::Result<()> {
        let file = File::create(&zip_path)?;
        let mut zip = zip::ZipWriter::new(file);
        let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        let mut db_bytes = Vec::new();
        File::open(&tmp_db)?.read_to_end(&mut db_bytes)?;
        zip.start_file(DB_FILE, opts)?;
        zip.write_all(&db_bytes)?;

        let media = data_dir.join("media");
        if media.is_dir() {
            for (abs, rel) in collect_files(&media) {
                let mut bytes = Vec::new();
                if File::open(&abs).and_then(|mut f| f.read_to_end(&mut bytes)).is_ok() {
                    zip.start_file(format!("media/{}", rel), opts)?;
                    zip.write_all(&bytes)?;
                }
            }
        }
        zip.finish()?;
        Ok(())
    })();

    let _ = std::fs::remove_file(&tmp_db);
    result.map_err(|e| e.to_string())?;
    prune_matching(&dir, |n| n.starts_with("zorviz-full-") && n.ends_with(".zip"), KEEP_FULL);
    Ok(name)
}

pub async fn list_backups(pool: &Pool<Sqlite>, data_dir: &Path) -> Vec<Value> {
    let dir = resolve_backup_dir(pool, data_dir).await;
    let mut out: Vec<BackupInfo> = std::fs::read_dir(&dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            if !(name.starts_with("zorviz-") && (name.ends_with(".db") || name.ends_with(".zip"))) {
                return None;
            }
            let meta = e.metadata().ok()?;
            let modified = meta
                .modified()
                .ok()
                .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            Some(BackupInfo { name, size: meta.len(), modified })
        })
        .collect();
    out.sort_by(|a, b| b.modified.cmp(&a.modified)); // newest first
    out.into_iter().map(|b| json!({ "name": b.name, "size": b.size, "modified": b.modified })).collect()
}

/// Stage a backup to be restored on next launch. Validates the filename (no path traversal).
/// A `.db` stages just the database; a `.zip` (full backup) also stages the media tree.
pub async fn stage_restore(pool: &Pool<Sqlite>, data_dir: &Path, filename: &str) -> Result<(), String> {
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err("invalid backup name".to_string());
    }
    let dir = resolve_backup_dir(pool, data_dir).await;
    let src = dir.join(filename);
    if !src.exists() {
        return Err("backup not found".to_string());
    }

    // Clear any previously staged restore.
    let _ = std::fs::remove_file(data_dir.join(RESTORE_PENDING));
    let _ = std::fs::remove_dir_all(data_dir.join(RESTORE_PENDING_MEDIA));

    if filename.ends_with(".zip") {
        // Full backup: extract zorviz.db + media/ into staging areas.
        let file = File::open(&src).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        let media_stage = data_dir.join(RESTORE_PENDING_MEDIA);
        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
            if entry.is_dir() {
                continue;
            }
            let entry_name = entry.name().replace('\\', "/");
            let out = if entry_name == DB_FILE {
                data_dir.join(RESTORE_PENDING)
            } else if let Some(rel) = entry_name.strip_prefix("media/") {
                media_stage.join(rel)
            } else {
                continue;
            };
            if let Some(parent) = out.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut o = File::create(&out).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut o).map_err(|e| e.to_string())?;
        }
        if !data_dir.join(RESTORE_PENDING).exists() {
            return Err("backup zip missing database".to_string());
        }
    } else {
        std::fs::copy(&src, data_dir.join(RESTORE_PENDING)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Apply a staged restore, if any. MUST be called before the DB pool is opened.
pub fn apply_pending_restore(data_dir: &Path) {
    let pending = data_dir.join(RESTORE_PENDING);
    if !pending.exists() {
        return;
    }
    let db = data_dir.join(DB_FILE);
    // Remove the live DB + stale WAL/SHM, then move the backup into place.
    let _ = std::fs::remove_file(&db);
    let _ = std::fs::remove_file(data_dir.join(format!("{}-wal", DB_FILE)));
    let _ = std::fs::remove_file(data_dir.join(format!("{}-shm", DB_FILE)));
    if std::fs::rename(&pending, &db).is_err() {
        // Cross-volume rename can fail; fall back to copy.
        let _ = std::fs::copy(&pending, &db);
        let _ = std::fs::remove_file(&pending);
    }

    // Full restore: a staged media tree replaces the live media/ to match the snapshot.
    let media_stage = data_dir.join(RESTORE_PENDING_MEDIA);
    if media_stage.is_dir() {
        let media = data_dir.join("media");
        let _ = std::fs::remove_dir_all(&media);
        if std::fs::rename(&media_stage, &media).is_err() {
            // Cross-volume fallback: recursive copy, then drop the staging dir.
            let _ = copy_dir_all(&media_stage, &media);
            let _ = std::fs::remove_dir_all(&media_stage);
        }
    }
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let p = entry.path();
        let target = dst.join(entry.file_name());
        if p.is_dir() {
            copy_dir_all(&p, &target)?;
        } else {
            std::fs::copy(&p, &target)?;
        }
    }
    Ok(())
}
