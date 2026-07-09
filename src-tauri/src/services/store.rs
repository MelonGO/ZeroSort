//! JSON key-value store persisted as `store.json`.

use parking_lot::Mutex;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

const STORE_FILE: &str = "store.json";

pub struct StoreManager {
    path: PathBuf,
    data: Mutex<HashMap<String, Value>>,
}

impl StoreManager {
    pub fn new(app_data_dir: &std::path::Path) -> Result<Self, String> {
        let path = app_data_dir.join(STORE_FILE);
        let data = if path.exists() {
            let raw = fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read store.json: {e}"))?;
            serde_json::from_str(&raw).unwrap_or_default()
        } else {
            HashMap::new()
        };

        Ok(Self {
            path,
            data: Mutex::new(data),
        })
    }

    pub fn get(&self, key: &str) -> Option<Value> {
        self.data.lock().get(key).cloned()
    }

    pub fn set(&self, key: &str, value: Value) -> Result<(), String> {
        {
            let mut data = self.data.lock();
            data.insert(key.to_string(), value);
        }
        self.persist()
    }

    pub fn delete(&self, key: &str) -> Result<(), String> {
        {
            let mut data = self.data.lock();
            data.remove(key);
        }
        self.persist()
    }

    pub fn has(&self, key: &str) -> bool {
        self.data.lock().contains_key(key)
    }

    fn persist(&self) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create store dir: {e}"))?;
        }
        let data = self.data.lock();
        let json = serde_json::to_string_pretty(&*data)
            .map_err(|e| format!("Failed to serialize store: {e}"))?;
        fs::write(&self.path, json).map_err(|e| format!("Failed to write store.json: {e}"))
    }
}
