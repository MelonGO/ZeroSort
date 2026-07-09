//! License verification using Ed25519 JWT verification.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const LICENSE_STATE_FILE: &str = "license_state.json";
const PRODUCTION_LICENSE_SERVER_URL: &str = "https://zerosort.app/api/license/activate";
const DEVELOPMENT_LICENSE_SERVER_URL: &str = "http://localhost:8787/api/license/activate";

/// Embedded Ed25519 public key (SPKI / SubjectPublicKeyInfo DER bytes).
/// PEM: MCowBQYDK2VwAyEAmSKlPtWkCh749Zp6wvVrEo5UJ+IMbE/6421LLRnMHpY=
const PUBLIC_KEY_RAW: [u8; 32] = [
    0x99, 0x22, 0xa5, 0x3e, 0xd5, 0xa4, 0x0a, 0x1e, 0xf8, 0xf5, 0x9a, 0x7a, 0xc2, 0xf5, 0x6b, 0x12,
    0x8e, 0x54, 0x27, 0xe2, 0x0c, 0x6c, 0x4f, 0xfa, 0xe3, 0x6d, 0x4b, 0x2d, 0x19, 0xcc, 0x1e, 0x96,
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseInfo {
    pub is_valid: bool,
    pub user: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct LicenseState {
    license_key: Option<String>,
    license_key_id: Option<String>,
}

pub struct LicenseManager {
    path: PathBuf,
    machine_id: String,
    state: Mutex<LicenseState>,
    verifying_key: VerifyingKey,
    is_dev: bool,
}

impl LicenseManager {
    pub fn new(app_data_dir: &Path, machine_id: &str, is_dev: bool) -> Result<Self, String> {
        let path = app_data_dir.join(LICENSE_STATE_FILE);
        let verifying_key = VerifyingKey::from_bytes(&PUBLIC_KEY_RAW)
            .map_err(|e| format!("Invalid public key: {e}"))?;

        let state = if path.exists() {
            let raw = fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read license_state.json: {e}"))?;
            serde_json::from_str(&raw).unwrap_or_default()
        } else {
            LicenseState::default()
        };

        Ok(Self {
            path,
            machine_id: machine_id.to_string(),
            state: Mutex::new(state),
            verifying_key,
            is_dev,
        })
    }

    pub fn get_machine_id(&self) -> String {
        self.machine_id.clone()
    }

    pub async fn activate(&self, license_key: &str) -> LicenseInfo {
        let url = if self.is_dev {
            DEVELOPMENT_LICENSE_SERVER_URL
        } else {
            PRODUCTION_LICENSE_SERVER_URL
        };

        let client = match reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
        {
            Ok(c) => c,
            Err(e) => {
                return LicenseInfo {
                    is_valid: false,
                    user: None,
                    error: Some(format!("Activation failed: {e}")),
                };
            }
        };

        let body = serde_json::json!({
            "licenseKey": license_key,
            "machineId": self.machine_id,
        });

        let response = match client.post(url).json(&body).send().await {
            Ok(r) => r,
            Err(e) => {
                return LicenseInfo {
                    is_valid: false,
                    user: None,
                    error: Some(format!("Activation failed: {e}")),
                };
            }
        };

        if !response.status().is_success() {
            let status = response.status();
            let error_message = response
                .json::<Value>()
                .await
                .ok()
                .and_then(|v| v.get("error")?.as_str().map(str::to_string))
                .unwrap_or_else(|| format!("Server returned {status}"));
            return LicenseInfo {
                is_valid: false,
                user: None,
                error: Some(error_message),
            };
        }

        let result: Value = match response.json().await {
            Ok(v) => v,
            Err(e) => {
                return LicenseInfo {
                    is_valid: false,
                    user: None,
                    error: Some(format!("Activation failed: {e}")),
                };
            }
        };

        let Some(jwt) = result.get("jwt").and_then(|v| v.as_str()) else {
            return LicenseInfo {
                is_valid: false,
                user: None,
                error: Some(
                    result
                        .get("error")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Activation failed")
                        .to_string(),
                ),
            };
        };

        let info = self.verify_jwt(jwt);
        if info.is_valid {
            let license_key_id = result
                .get("licenseKeyId")
                .and_then(|v| v.as_str())
                .map(str::to_string);
            {
                let mut state = self.state.lock();
                state.license_key = Some(jwt.to_string());
                state.license_key_id = license_key_id;
            }
            let _ = self.persist();
        }
        info
    }

    pub fn get_status(&self) -> LicenseInfo {
        let jwt = {
            let state = self.state.lock();
            state.license_key.clone()
        };

        let Some(jwt) = jwt else {
            return LicenseInfo {
                is_valid: false,
                user: None,
                error: None,
            };
        };

        let info = self.verify_jwt(&jwt);
        if let Some(license_key_id) = self.extract_license_key_id(&jwt) {
            let mut state = self.state.lock();
            if state.license_key_id.as_deref() != Some(license_key_id.as_str()) {
                state.license_key_id = Some(license_key_id);
                drop(state);
                let _ = self.persist();
            }
        }
        info
    }

    pub fn deactivate(&self) -> Result<(), String> {
        {
            let mut state = self.state.lock();
            state.license_key = None;
            state.license_key_id = None;
        }
        self.persist()
    }

    fn verify_jwt(&self, token: &str) -> LicenseInfo {
        let parts: Vec<&str> = token.split('.').collect();
        if parts.len() != 3 {
            return LicenseInfo {
                is_valid: false,
                user: None,
                error: Some("Invalid license: Malformed JWT".to_string()),
            };
        }

        let header_json = match decode_base64url(parts[0]) {
            Ok(bytes) => String::from_utf8_lossy(&bytes).to_string(),
            Err(e) => {
                return LicenseInfo {
                    is_valid: false,
                    user: None,
                    error: Some(format!("Invalid license: {e}")),
                };
            }
        };

        let header: Value = match serde_json::from_str(&header_json) {
            Ok(v) => v,
            Err(e) => {
                return LicenseInfo {
                    is_valid: false,
                    user: None,
                    error: Some(format!("Invalid license: {e}")),
                };
            }
        };

        if header.get("alg").and_then(|v| v.as_str()) != Some("EdDSA") {
            return LicenseInfo {
                is_valid: false,
                user: None,
                error: Some(format!(
                    "Invalid license: Unsupported license algorithm: {}",
                    header
                        .get("alg")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown")
                )),
            };
        }

        let signing_input = format!("{}.{}", parts[0], parts[1]);
        let signature_bytes = match decode_base64url(parts[2]) {
            Ok(b) => b,
            Err(e) => {
                return LicenseInfo {
                    is_valid: false,
                    user: None,
                    error: Some(format!("Invalid license: {e}")),
                };
            }
        };

        let signature = match Signature::from_slice(&signature_bytes) {
            Ok(s) => s,
            Err(_) => {
                return LicenseInfo {
                    is_valid: false,
                    user: None,
                    error: Some("Invalid license: Invalid signature".to_string()),
                };
            }
        };

        if self
            .verifying_key
            .verify(signing_input.as_bytes(), &signature)
            .is_err()
        {
            return LicenseInfo {
                is_valid: false,
                user: None,
                error: Some("Invalid license: Invalid signature".to_string()),
            };
        }

        let payload_json = match decode_base64url(parts[1]) {
            Ok(bytes) => String::from_utf8_lossy(&bytes).to_string(),
            Err(e) => {
                return LicenseInfo {
                    is_valid: false,
                    user: None,
                    error: Some(format!("Invalid license: {e}")),
                };
            }
        };

        let payload: Value = match serde_json::from_str(&payload_json) {
            Ok(v) => v,
            Err(e) => {
                return LicenseInfo {
                    is_valid: false,
                    user: None,
                    error: Some(format!("Invalid license: {e}")),
                };
            }
        };

        let Some(sub) = payload.get("sub").and_then(|v| v.as_str()) else {
            return LicenseInfo {
                is_valid: false,
                user: None,
                error: Some("Invalid license: Missing license subject".to_string()),
            };
        };

        if let Some(exp) = payload.get("exp").and_then(|v| v.as_i64()) {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64;
            if exp <= now {
                return LicenseInfo {
                    is_valid: false,
                    user: None,
                    error: Some("License has expired".to_string()),
                };
            }
        }

        if let Some(hardware_id) = payload.get("hardware_id").and_then(|v| v.as_str()) {
            if hardware_id != self.machine_id {
                return LicenseInfo {
                    is_valid: false,
                    user: None,
                    error: Some("License is bound to a different machine".to_string()),
                };
            }
        }

        LicenseInfo {
            is_valid: true,
            user: Some(sub.to_string()),
            error: None,
        }
    }

    fn extract_license_key_id(&self, token: &str) -> Option<String> {
        let parts: Vec<&str> = token.split('.').collect();
        if parts.len() != 3 {
            return None;
        }
        let payload = decode_base64url(parts[1]).ok()?;
        let payload: Value = serde_json::from_slice(&payload).ok()?;
        payload
            .get("license_key_id")
            .and_then(|v| v.as_str())
            .map(str::to_string)
    }

    fn persist(&self) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create license dir: {e}"))?;
        }
        let state = self.state.lock();
        let json = serde_json::to_string_pretty(&*state)
            .map_err(|e| format!("Failed to serialize license state: {e}"))?;
        fs::write(&self.path, json).map_err(|e| format!("Failed to write license_state.json: {e}"))
    }
}

fn decode_base64url(input: &str) -> Result<Vec<u8>, String> {
    URL_SAFE_NO_PAD
        .decode(input)
        .or_else(|_| {
            let mut padded = input.to_string();
            while padded.len() % 4 != 0 {
                padded.push('=');
            }
            base64::engine::general_purpose::URL_SAFE
                .decode(&padded)
        })
        .map_err(|e| format!("base64url decode failed: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn rejects_malformed_jwt() {
        let dir = tempdir().unwrap();
        let manager = LicenseManager::new(dir.path(), "machine-1", true).unwrap();
        let info = manager.verify_jwt("not-a-jwt");
        assert!(!info.is_valid);
    }

    #[test]
    fn deactivate_clears_state() {
        let dir = tempdir().unwrap();
        let manager = LicenseManager::new(dir.path(), "machine-1", true).unwrap();
        {
            let mut state = manager.state.lock();
            state.license_key = Some("a.b.c".to_string());
        }
        manager.deactivate().unwrap();
        let status = manager.get_status();
        assert!(!status.is_valid);
        assert!(status.error.is_none());
    }
}
