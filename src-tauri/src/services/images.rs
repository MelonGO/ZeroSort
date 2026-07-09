//! Managed image storage under the app data directory.

use infer;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const IMAGE_DIRECTORY: &str = "images";
const FALLBACK_NOTE_ID: &str = "unassigned";

const ALLOWED_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "tif", "tiff", "avif", "heic", "heif",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedImageFile {
    pub relative_path: String,
    pub absolute_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedImageMetadata {
    pub relative_path: String,
    pub absolute_path: String,
    pub size_bytes: u64,
    pub modified_at_ms: u64,
}

pub struct ImageManager {
    app_data_dir: PathBuf,
    images_root: PathBuf,
}

impl ImageManager {
    pub fn new(app_data_dir: &Path) -> Result<Self, String> {
        let images_root = app_data_dir.join(IMAGE_DIRECTORY);
        fs::create_dir_all(&images_root)
            .map_err(|e| format!("Failed to create images dir: {e}"))?;
        Ok(Self {
            app_data_dir: app_data_dir.to_path_buf(),
            images_root,
        })
    }

    pub fn save_image(
        &self,
        note_id: Option<&str>,
        bytes: &[u8],
        original_name: Option<&str>,
    ) -> Result<SavedImageFile, String> {
        if bytes.is_empty() {
            return Err("Cannot save an empty image file".to_string());
        }

        let extension = detect_image_extension(bytes, original_name)?;
        let safe_note_id = sanitize_path_segment(note_id.unwrap_or(""));
        let file_name = format!("{}.{}", Uuid::new_v4(), extension);
        let target_dir = self.images_root.join(&safe_note_id);
        fs::create_dir_all(&target_dir)
            .map_err(|e| format!("Failed to create image note dir: {e}"))?;

        let absolute_path = target_dir.join(&file_name);
        fs::write(&absolute_path, bytes).map_err(|e| format!("Failed to write image: {e}"))?;

        Ok(SavedImageFile {
            relative_path: format!("{IMAGE_DIRECTORY}/{safe_note_id}/{file_name}"),
            absolute_path: absolute_path.to_string_lossy().to_string(),
        })
    }

    pub fn delete_image(&self, relative_path: &str) -> Result<(), String> {
        let absolute_path = self.resolve_managed_path(relative_path)?.1;
        match fs::remove_file(&absolute_path) {
            Ok(()) => {
                cleanup_empty_parent_dirs(&absolute_path, &self.images_root);
                Ok(())
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(format!("Failed to delete image file: {e}")),
        }
    }

    pub fn read_image(&self, relative_path: &str) -> Result<Vec<u8>, String> {
        let absolute_path = self.resolve_managed_path(relative_path)?.1;
        fs::read(&absolute_path).map_err(|e| format!("Failed to read image: {e}"))
    }

    pub fn write_image(
        &self,
        relative_path: &str,
        bytes: &[u8],
    ) -> Result<ManagedImageMetadata, String> {
        if bytes.is_empty() {
            return Err("Cannot write an empty image file".to_string());
        }
        let (safe_relative, absolute_path) = self.resolve_managed_path(relative_path)?;
        if let Some(parent) = absolute_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create image parent: {e}"))?;
        }
        fs::write(&absolute_path, bytes).map_err(|e| format!("Failed to write image: {e}"))?;
        build_metadata(&safe_relative, &absolute_path)
    }

    pub fn get_metadata(
        &self,
        relative_path: &str,
    ) -> Result<Option<ManagedImageMetadata>, String> {
        let (safe_relative, absolute_path) = self.resolve_managed_path(relative_path)?;
        match build_metadata(&safe_relative, &absolute_path) {
            Ok(meta) => Ok(Some(meta)),
            Err(e) if e.contains("No such file") || e.contains("os error 2") => Ok(None),
            Err(e) => {
                if !absolute_path.exists() {
                    Ok(None)
                } else {
                    Err(e)
                }
            }
        }
    }

    fn resolve_managed_path(&self, relative_path: &str) -> Result<(String, PathBuf), String> {
        let safe = validate_relative_image_path(relative_path)?;
        let absolute = self.app_data_dir.join(Path::new(&safe));
        Ok((safe.replace('\\', "/"), absolute))
    }
}

fn detect_image_extension(bytes: &[u8], original_name: Option<&str>) -> Result<String, String> {
    if let Some(kind) = infer::get(bytes) {
        if kind.mime_type().starts_with("image/") {
            return Ok(kind.extension().to_string());
        }
    }

    if let Some(name) = original_name {
        if let Some(ext) = Path::new(name)
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
        {
            if ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
                return Ok(ext);
            }
        }
    }

    Err("Unsupported image format".to_string())
}

fn sanitize_path_segment(segment: &str) -> String {
    let sanitized: String = segment
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if sanitized.is_empty() {
        FALLBACK_NOTE_ID.to_string()
    } else {
        sanitized
    }
}

/// Validates managed image relative paths; rejects `..` and non-images/ prefixes.
pub fn validate_relative_image_path(relative_path: &str) -> Result<String, String> {
    if relative_path.is_empty() {
        return Err("Invalid managed image path".to_string());
    }

    let normalized = relative_path.replace('\\', "/");
    if !normalized.starts_with(&format!("{IMAGE_DIRECTORY}/")) {
        return Err("Invalid managed image path".to_string());
    }

    let mut parts = Vec::new();
    for part in normalized.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." || part.contains('\0') {
            return Err("Invalid managed image path".to_string());
        }
        parts.push(part);
    }

    if parts.is_empty() || parts[0] != IMAGE_DIRECTORY {
        return Err("Invalid managed image path".to_string());
    }

    Ok(parts.join(std::path::MAIN_SEPARATOR_STR))
}

fn build_metadata(
    safe_relative_path: &str,
    absolute_path: &Path,
) -> Result<ManagedImageMetadata, String> {
    let stats = fs::metadata(absolute_path).map_err(|e| format!("Failed to stat image: {e}"))?;
    let modified_at_ms = stats
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    Ok(ManagedImageMetadata {
        relative_path: safe_relative_path.replace('\\', "/"),
        absolute_path: absolute_path.to_string_lossy().to_string(),
        size_bytes: stats.len(),
        modified_at_ms,
    })
}

fn cleanup_empty_parent_dirs(file_path: &Path, root: &Path) {
    let mut current = file_path.parent().map(Path::to_path_buf);
    while let Some(dir) = current {
        if dir == root {
            break;
        }
        if fs::remove_dir(&dir).is_err() {
            break;
        }
        current = dir.parent().map(Path::to_path_buf);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn rejects_path_traversal() {
        assert!(validate_relative_image_path("images/../etc/passwd").is_err());
        assert!(validate_relative_image_path("other/file.png").is_err());
        assert!(validate_relative_image_path("images/note/a.png").is_ok());
    }

    #[test]
    fn save_and_read_round_trip() {
        let dir = tempdir().unwrap();
        let manager = ImageManager::new(dir.path()).unwrap();
        // Minimal PNG header-ish bytes won't pass infer; use originalName fallback.
        let bytes = b"not-a-real-image";
        let saved = manager
            .save_image(Some("note-1"), bytes, Some("photo.png"))
            .unwrap();
        assert!(saved.relative_path.starts_with("images/note-1/"));
        let read = manager.read_image(&saved.relative_path).unwrap();
        assert_eq!(read, bytes);
        manager.delete_image(&saved.relative_path).unwrap();
        // Missing delete is success
        manager.delete_image(&saved.relative_path).unwrap();
    }
}
