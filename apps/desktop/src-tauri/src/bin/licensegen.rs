// Owner-side license generator (BACK-0-006). Run with `cargo run --bin licensegen -- ...`.
//   licensegen keygen
//   licensegen sign --shop "Name" --devices <fp,fp> --modules <m,m> --expires <ms|none> --key <private-b64>
// Keep the private key secret; embed the printed public key in license.rs.

use appsdesktop_lib::license::{device_fingerprint, generate_keypair, sign_license, LicensePayload};

fn arg(args: &[String], flag: &str) -> Option<String> {
    args.iter().position(|a| a == flag).and_then(|i| args.get(i + 1)).cloned()
}

fn csv(args: &[String], flag: &str) -> Vec<String> {
    arg(args, flag)
        .map(|s| s.split(',').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect())
        .unwrap_or_default()
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(|s| s.as_str()) {
        Some("keygen") => {
            let (sk, vk) = generate_keypair();
            println!("PRIVATE_KEY (keep secret, never ship): {}", sk);
            println!("PUBLIC_KEY  (embed in license.rs):     {}", vk);
        }
        Some("fingerprint") => {
            println!("{}", device_fingerprint());
        }
        Some("sign") => {
            let key = match arg(&args, "--key") {
                Some(k) => k,
                None => {
                    eprintln!("error: --key <private-b64> is required");
                    std::process::exit(1);
                }
            };
            let mut modules = csv(&args, "--modules");
            if modules.is_empty() {
                modules.push("repair".to_string());
            }
            let expires = arg(&args, "--expires").and_then(|s| if s == "none" { None } else { s.parse::<i64>().ok() });
            let payload = LicensePayload {
                license_id: format!("ZRV-{}", &uuid::Uuid::new_v4().simple().to_string()[..8].to_uppercase()),
                shop_name: arg(&args, "--shop").unwrap_or_else(|| "Shop".to_string()),
                devices: csv(&args, "--devices"),
                modules,
                expires,
                issued_at: chrono::Utc::now().timestamp_millis(),
            };
            match sign_license(&payload, &key) {
                Ok(json) => println!("{}", json),
                Err(e) => {
                    eprintln!("error: sign failed: {}", e);
                    std::process::exit(1);
                }
            }
        }
        _ => {
            eprintln!(
                "usage:\n  licensegen keygen\n  licensegen sign --shop <name> --devices <fp,fp> --modules <m,m> --expires <ms|none> --key <private-b64>"
            );
            std::process::exit(1);
        }
    }
}
