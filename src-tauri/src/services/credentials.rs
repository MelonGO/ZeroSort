//! Encrypted credential storage persisted as `credentials.bin`.

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

const APP_SALT: &str = "zero-sort-credential-salt-v1";
const CREDENTIALS_FILE: &str = "credentials.bin";

#[derive(Debug, Clone, Serialize, Deserialize)]
struct EncryptedValue {
    nonce: String,
    ciphertext: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct CredentialStore {
    credentials: HashMap<String, EncryptedValue>,
}

pub struct CredentialManager {
    path: PathBuf,
    key: [u8; 32],
    store: Mutex<CredentialStore>,
}

impl CredentialManager {
    pub fn new(app_data_dir: &Path, machine_id: &str) -> Result<Self, String> {
        let path = app_data_dir.join(CREDENTIALS_FILE);
        let key = derive_key(machine_id);
        let store = if path.exists() {
            let raw = fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read credentials.bin: {e}"))?;
            serde_json::from_str(&raw).unwrap_or_default()
        } else {
            CredentialStore::default()
        };

        Ok(Self {
            path,
            key,
            store: Mutex::new(store),
        })
    }

    pub fn save(&self, key: &str, value: &str) -> Result<(), String> {
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&self.key));
        let mut nonce_bytes = [0u8; 12];
        getrandom_nonce(&mut nonce_bytes)?;

        let ciphertext = cipher
            .encrypt(Nonce::from_slice(&nonce_bytes), value.as_bytes())
            .map_err(|e| format!("Encryption failed: {e}"))?;

        let encrypted = EncryptedValue {
            nonce: BASE64.encode(nonce_bytes),
            ciphertext: BASE64.encode(ciphertext),
        };

        {
            let mut store = self.store.lock();
            store.credentials.insert(key.to_string(), encrypted);
        }
        self.persist()
    }

    pub fn get(&self, key: &str) -> Result<Option<String>, String> {
        let store = self.store.lock();
        let Some(encrypted) = store.credentials.get(key) else {
            return Ok(None);
        };

        let nonce = BASE64
            .decode(&encrypted.nonce)
            .map_err(|e| format!("Invalid nonce: {e}"))?;
        let combined = BASE64
            .decode(&encrypted.ciphertext)
            .map_err(|e| format!("Invalid ciphertext: {e}"))?;

        if nonce.len() != 12 {
            return Err("Invalid nonce length".to_string());
        }

        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&self.key));
        let plaintext = cipher
            .decrypt(Nonce::from_slice(&nonce), combined.as_ref())
            .map_err(|e| format!("Decryption failed: {e}"))?;

        String::from_utf8(plaintext).map(Some).map_err(|e| e.to_string())
    }

    pub fn delete(&self, key: &str) -> Result<(), String> {
        {
            let mut store = self.store.lock();
            store.credentials.remove(key);
        }
        self.persist()
    }

    pub fn has(&self, key: &str) -> bool {
        self.store.lock().credentials.contains_key(key)
    }

    pub fn list_keys(&self) -> Vec<String> {
        self.store.lock().credentials.keys().cloned().collect()
    }

    pub fn clear(&self) -> Result<(), String> {
        {
            let mut store = self.store.lock();
            store.credentials.clear();
        }
        self.persist()
    }

    fn persist(&self) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create credentials dir: {e}"))?;
        }
        let store = self.store.lock();
        let json = serde_json::to_string_pretty(&*store)
            .map_err(|e| format!("Failed to serialize credentials: {e}"))?;
        fs::write(&self.path, json).map_err(|e| format!("Failed to write credentials.bin: {e}"))
    }
}

/// Derives AES-256 key: SHA256(machineId + salt).
pub fn derive_key(machine_id: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(machine_id.as_bytes());
    hasher.update(APP_SALT.as_bytes());
    hasher.finalize().into()
}

fn getrandom_nonce(out: &mut [u8; 12]) -> Result<(), String> {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    use std::time::{SystemTime, UNIX_EPOCH};

    // Prefer OS randomness via uuid's getrandom if available through aes-gcm.
    // Fall back to a time-based mix only if needed — use std::getrandom via uuid.
    let uuid = uuid::Uuid::new_v4();
    let bytes = uuid.as_bytes();
    out.copy_from_slice(&bytes[..12]);

    // Mix in time to avoid identical nonces if UUID entropy is weak in tests.
    let mut hasher = DefaultHasher::new();
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
        .hash(&mut hasher);
    let mix = hasher.finish().to_le_bytes();
    for (i, b) in mix.iter().enumerate() {
        out[i % 12] ^= b;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn round_trips_credential() {
        let dir = tempdir().unwrap();
        let manager = CredentialManager::new(dir.path(), "test-machine-id").unwrap();
        manager.save("api_key", "secret-value").unwrap();
        assert_eq!(manager.get("api_key").unwrap().as_deref(), Some("secret-value"));
        assert!(manager.has("api_key"));
        assert_eq!(manager.list_keys(), vec!["api_key".to_string()]);
        manager.delete("api_key").unwrap();
        assert_eq!(manager.get("api_key").unwrap(), None);
    }

    #[test]
    fn derive_key_is_stable() {
        let a = derive_key("abc");
        let b = derive_key("abc");
        assert_eq!(a, b);
        assert_ne!(derive_key("abc"), derive_key("abd"));
    }
}
