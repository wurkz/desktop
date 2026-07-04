// Offline license verification (D17): Ed25519-signed license files bound to device fingerprints.
// The app embeds the owner's PUBLIC key; the owner keeps the private key and signs licenses with
// the `licensegen` bin. Trial handling + UI gating are a later increment.

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::Path;

// Owner's public key (base64 of the 32-byte Ed25519 verifying key).
// DEV KEY — the owner MUST regenerate a keypair (`licensegen keygen`), keep the private key
// secret, and replace this with their public key for production builds.
pub const EMBEDDED_PUBLIC_KEY_B64: &str = "znwE5huw4Ns+DjRgdBPVG/oJYhWl13T7g2TRzwD2kOE=";

const LICENSE_FILE: &str = "license.json";

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

#[derive(Serialize, Deserialize, Clone)]
pub struct LicensePayload {
    pub license_id: String,
    pub shop_name: String,
    #[serde(default)]
    pub devices: Vec<String>, // allowed device fingerprints
    #[serde(default)]
    pub modules: Vec<String>,
    pub expires: Option<i64>, // ms epoch; None = perpetual
    pub issued_at: i64,
}

#[derive(Serialize, Deserialize)]
pub struct LicenseFile {
    pub data: String, // base64 of the payload JSON bytes (signed verbatim)
    pub sig: String,  // base64 of the Ed25519 signature over those bytes
}

#[derive(Serialize)]
pub struct LicenseStatus {
    pub state: String, // valid | expired | wrong_device | invalid | missing
    pub device_code: String,
    pub shop_name: Option<String>,
    pub modules: Vec<String>,
    pub expires: Option<i64>,
    pub message: Option<String>,
}

/// Stable per-device code (short) derived from the OS machine id.
pub fn device_fingerprint() -> String {
    let raw = machine_uid::get().unwrap_or_else(|_| "unknown-device".to_string());
    let mut h = Sha256::new();
    h.update(raw.as_bytes());
    hex::encode(&h.finalize()[..8]) // 16 hex chars
}

// ---- Owner-side (licensegen) ----

pub fn generate_keypair() -> (String, String) {
    let sk = SigningKey::generate(&mut OsRng);
    let vk = sk.verifying_key();
    (B64.encode(sk.to_bytes()), B64.encode(vk.to_bytes()))
}

pub fn sign_license(payload: &LicensePayload, priv_b64: &str) -> Result<String, String> {
    let sk_bytes = B64.decode(priv_b64).map_err(|e| e.to_string())?;
    let sk_arr: [u8; 32] = sk_bytes.as_slice().try_into().map_err(|_| "bad private key length".to_string())?;
    let sk = SigningKey::from_bytes(&sk_arr);
    let data = serde_json::to_vec(payload).map_err(|e| e.to_string())?;
    let sig = sk.sign(&data);
    let file = LicenseFile {
        data: B64.encode(&data),
        sig: B64.encode(sig.to_bytes()),
    };
    serde_json::to_string_pretty(&file).map_err(|e| e.to_string())
}

// ---- App-side verification ----

fn status(state: &str, fp: &str, msg: &str) -> LicenseStatus {
    LicenseStatus {
        state: state.to_string(),
        device_code: fp.to_string(),
        shop_name: None,
        modules: vec![],
        expires: None,
        message: Some(msg.to_string()),
    }
}

pub fn verify_license_str(content: &str) -> LicenseStatus {
    let fp = device_fingerprint();
    // Tolerate a UTF-8 BOM / surrounding whitespace (e.g. files saved by some editors).
    let content = content.trim_start_matches('\u{feff}').trim();

    let file: LicenseFile = match serde_json::from_str(content) {
        Ok(f) => f,
        Err(_) => return status("invalid", &fp, "Malformed license file"),
    };
    let (data, sig_bytes, vk_bytes) = match (
        B64.decode(&file.data),
        B64.decode(&file.sig),
        B64.decode(EMBEDDED_PUBLIC_KEY_B64),
    ) {
        (Ok(d), Ok(s), Ok(v)) => (d, s, v),
        _ => return status("invalid", &fp, "Bad license encoding"),
    };
    let vk_arr: [u8; 32] = match vk_bytes.as_slice().try_into() {
        Ok(a) => a,
        Err(_) => return status("invalid", &fp, "Bad embedded key"),
    };
    let vk = match VerifyingKey::from_bytes(&vk_arr) {
        Ok(v) => v,
        Err(_) => return status("invalid", &fp, "Bad embedded key"),
    };
    let sig_arr: [u8; 64] = match sig_bytes.as_slice().try_into() {
        Ok(a) => a,
        Err(_) => return status("invalid", &fp, "Bad signature"),
    };
    let sig = Signature::from_bytes(&sig_arr);
    if vk.verify(&data, &sig).is_err() {
        return status("invalid", &fp, "Signature verification failed");
    }
    let payload: LicensePayload = match serde_json::from_slice(&data) {
        Ok(p) => p,
        Err(_) => return status("invalid", &fp, "Bad payload"),
    };

    if !payload.devices.is_empty() && !payload.devices.contains(&fp) {
        return LicenseStatus {
            state: "wrong_device".to_string(),
            device_code: fp,
            shop_name: Some(payload.shop_name),
            modules: payload.modules,
            expires: payload.expires,
            message: Some("License is not valid for this device".to_string()),
        };
    }
    if let Some(exp) = payload.expires {
        if now_ms() > exp {
            return LicenseStatus {
                state: "expired".to_string(),
                device_code: fp,
                shop_name: Some(payload.shop_name),
                modules: payload.modules,
                expires: payload.expires,
                message: Some("License has expired".to_string()),
            };
        }
    }
    LicenseStatus {
        state: "valid".to_string(),
        device_code: fp,
        shop_name: Some(payload.shop_name),
        modules: payload.modules,
        expires: payload.expires,
        message: None,
    }
}

pub fn read_license_status(data_dir: &Path) -> LicenseStatus {
    let path = data_dir.join(LICENSE_FILE);
    match std::fs::read_to_string(&path) {
        Ok(content) => verify_license_str(&content),
        Err(_) => status("missing", &device_fingerprint(), "No license installed"),
    }
}

pub fn write_license(data_dir: &Path, content: &str) -> Result<(), String> {
    std::fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
    std::fs::write(data_dir.join(LICENSE_FILE), content).map_err(|e| e.to_string())
}
