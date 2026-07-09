//! Shared application state for Tauri commands.

use crate::services::{
    credentials::CredentialManager, db::DatabaseManager, images::ImageManager,
    license::LicenseManager, store::StoreManager, sync::S3ConnectionManager,
};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

pub struct AppState {
    pub store: StoreManager,
    pub db: DatabaseManager,
    pub credentials: CredentialManager,
    pub license: LicenseManager,
    pub images: ImageManager,
    pub s3: S3ConnectionManager,
    pub allow_close: AtomicBool,
    pub close_request_id: AtomicU64,
    pub shortcut_owners: Mutex<HashMap<String, String>>,
}

impl AppState {
    pub fn new(app_data: &Path, is_dev: bool) -> Result<Arc<Self>, String> {
        let credential_machine_id = crate::machine_id::machine_id_or_credential_fallback();
        let license_machine_id = crate::machine_id::machine_id_or_license_fallback();

        Ok(Arc::new(Self {
            store: StoreManager::new(app_data)?,
            db: DatabaseManager::new(app_data)?,
            credentials: CredentialManager::new(app_data, &credential_machine_id)?,
            license: LicenseManager::new(app_data, &license_machine_id, is_dev)?,
            images: ImageManager::new(app_data)?,
            s3: S3ConnectionManager::new(),
            allow_close: AtomicBool::new(false),
            close_request_id: AtomicU64::new(0),
            shortcut_owners: Mutex::new(HashMap::new()),
        }))
    }

    pub fn next_close_request_id(&self) -> u64 {
        self.close_request_id.fetch_add(1, Ordering::SeqCst) + 1
    }

    pub fn set_allow_close(&self, allow: bool) {
        self.allow_close.store(allow, Ordering::SeqCst);
    }

    pub fn should_allow_close(&self) -> bool {
        self.allow_close.load(Ordering::SeqCst)
    }
}
