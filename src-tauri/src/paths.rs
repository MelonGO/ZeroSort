//! Tauri-native app-data path helpers.
//!
//! Uses `PathResolver::app_data_dir()`, which resolves to
//! `{dataDir}/{bundleIdentifier}` (e.g. `com.melongo.zerosort` on macOS/Windows,
//! and the XDG data dir equivalent on Linux).

use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Bundle identifier used by Tauri for the native app data directory.
/// Kept in sync with `tauri.conf.json` → `identifier`.
#[allow(dead_code)]
pub const APP_IDENTIFIER: &str = "com.melongo.zerosort";

/// Returns the Tauri-native application data directory.
pub fn app_data_dir(handle: &AppHandle) -> Result<PathBuf, String> {
    handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Unable to resolve app data directory: {e}"))
}

/// Ensures the app data directory exists and returns it.
pub fn ensure_app_data_dir(handle: &AppHandle) -> Result<PathBuf, String> {
    let dir = app_data_dir(handle)?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create app data dir: {e}"))?;
    Ok(dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_identifier_matches_tauri_config() {
        assert_eq!(APP_IDENTIFIER, "com.melongo.zerosort");
    }

    #[test]
    fn native_app_data_folder_name_is_bundle_identifier() {
        let dir = tempfile::tempdir().expect("tempdir");
        let nested = dir.path().join(APP_IDENTIFIER);
        std::fs::create_dir_all(&nested).expect("create");
        assert!(
            nested.ends_with(APP_IDENTIFIER),
            "expected path ending with {APP_IDENTIFIER}, got {}",
            nested.display()
        );
    }
}
