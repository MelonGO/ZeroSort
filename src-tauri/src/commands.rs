//! Tauri command handlers for the desktop host.

use crate::services::sync::SyncConnectionConfig;
use crate::state::AppState;
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::{DialogExt, FilePath, MessageDialogKind};

fn ok(extra: Value) -> Value {
    let mut map = serde_json::Map::new();
    map.insert("success".to_string(), Value::Bool(true));
    if let Value::Object(obj) = extra {
        for (k, v) in obj {
            map.insert(k, v);
        }
    }
    Value::Object(map)
}

fn err(message: impl Into<String>) -> Value {
    json!({ "success": false, "error": message.into() })
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

#[tauri::command(rename_all = "camelCase")]
pub fn save_credential(state: State<'_, Arc<AppState>>, key: String, value: String) -> Value {
    match state.credentials.save(&key, &value) {
        Ok(()) => ok(json!({})),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub fn get_credential(state: State<'_, Arc<AppState>>, key: String) -> Value {
    match state.credentials.get(&key) {
        Ok(value) => ok(json!({ "value": value })),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub fn delete_credential(state: State<'_, Arc<AppState>>, key: String) -> Value {
    match state.credentials.delete(&key) {
        Ok(()) => ok(json!({})),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub fn has_credential(state: State<'_, Arc<AppState>>, key: String) -> Value {
    ok(json!({ "exists": state.credentials.has(&key) }))
}

#[tauri::command]
pub fn list_credential_keys(state: State<'_, Arc<AppState>>) -> Value {
    ok(json!({ "keys": state.credentials.list_keys() }))
}

#[tauri::command]
pub fn clear_all_credentials(state: State<'_, Arc<AppState>>) -> Value {
    match state.credentials.clear() {
        Ok(()) => ok(json!({})),
        Err(e) => err(e),
    }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn store_get(state: State<'_, Arc<AppState>>, key: String) -> Value {
    ok(json!({ "value": state.store.get(&key) }))
}

#[tauri::command]
pub fn store_set(state: State<'_, Arc<AppState>>, key: String, value: Value) -> Value {
    match state.store.set(&key, value) {
        Ok(()) => ok(json!({})),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub fn store_delete(state: State<'_, Arc<AppState>>, key: String) -> Value {
    match state.store.delete(&key) {
        Ok(()) => ok(json!({})),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub fn store_has(state: State<'_, Arc<AppState>>, key: String) -> Value {
    ok(json!({ "exists": state.store.has(&key) }))
}

#[tauri::command]
pub fn save_s3_config(state: State<'_, Arc<AppState>>, config: Value) -> Value {
    match state.store.set("s3_config", config) {
        Ok(()) => ok(json!({})),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub fn get_s3_config(state: State<'_, Arc<AppState>>) -> Value {
    ok(json!({ "config": state.store.get("s3_config") }))
}

#[tauri::command]
pub fn delete_s3_config(state: State<'_, Arc<AppState>>) -> Value {
    match state.store.delete("s3_config") {
        Ok(()) => ok(json!({})),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub fn has_s3_config(state: State<'_, Arc<AppState>>) -> Value {
    ok(json!({ "exists": state.store.has("s3_config") }))
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveImageArgs {
    pub note_id: Option<String>,
    pub bytes: Vec<u8>,
    pub original_name: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedImageArgs {
    pub relative_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteImageArgs {
    pub relative_path: String,
    pub bytes: Vec<u8>,
}

#[tauri::command]
pub fn save_image_file(state: State<'_, Arc<AppState>>, payload: SaveImageArgs) -> Value {
    match state.images.save_image(
        payload.note_id.as_deref(),
        &payload.bytes,
        payload.original_name.as_deref(),
    ) {
        Ok(result) => ok(json!({ "result": result })),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub fn write_managed_image_file(state: State<'_, Arc<AppState>>, payload: WriteImageArgs) -> Value {
    match state
        .images
        .write_image(&payload.relative_path, &payload.bytes)
    {
        Ok(metadata) => ok(json!({ "metadata": metadata })),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub fn read_managed_image_file(
    state: State<'_, Arc<AppState>>,
    payload: ManagedImageArgs,
) -> Value {
    match state.images.read_image(&payload.relative_path) {
        Ok(data) => ok(json!({ "data": data })),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub fn delete_image_file(state: State<'_, Arc<AppState>>, payload: ManagedImageArgs) -> Value {
    match state.images.delete_image(&payload.relative_path) {
        Ok(()) => ok(json!({})),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub fn get_managed_image_metadata(
    state: State<'_, Arc<AppState>>,
    payload: ManagedImageArgs,
) -> Value {
    match state.images.get_metadata(&payload.relative_path) {
        Ok(metadata) => ok(json!({ "metadata": metadata })),
        Err(e) => err(e),
    }
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct DbQuery {
    pub sql: String,
    pub params: Option<Vec<Value>>,
}

#[tauri::command]
pub fn db_select(state: State<'_, Arc<AppState>>, query: DbQuery) -> Value {
    let params = query.params.unwrap_or_default();
    match state.db.select(&query.sql, &params) {
        Ok(rows) => ok(json!({ "rows": rows })),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub fn db_execute(state: State<'_, Arc<AppState>>, query: DbQuery) -> Value {
    let params = query.params.unwrap_or_default();
    match state.db.execute(&query.sql, &params) {
        Ok(changes) => ok(json!({ "changes": changes })),
        Err(e) => err(e),
    }
}

// ---------------------------------------------------------------------------
// Filesystem
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn fs_exists(path: String) -> Value {
    ok(json!({ "exists": Path::new(&path).exists() }))
}

#[tauri::command]
pub fn fs_mkdir(path: String, options: Option<Value>) -> Value {
    let recursive = options
        .as_ref()
        .and_then(|o| o.get("recursive"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let result = if recursive {
        std::fs::create_dir_all(&path)
    } else {
        std::fs::create_dir(&path)
    };
    match result {
        Ok(()) => ok(json!({})),
        Err(e) => err(e.to_string()),
    }
}

#[tauri::command]
pub fn fs_read_dir(path: String) -> Value {
    match std::fs::read_dir(&path) {
        Ok(entries) => {
            let mut list = Vec::new();
            for entry in entries.flatten() {
                let file_type = entry.file_type().ok();
                list.push(json!({
                    "name": entry.file_name().to_string_lossy(),
                    "isFile": file_type.as_ref().map(|t| t.is_file()).unwrap_or(false),
                    "isDirectory": file_type.as_ref().map(|t| t.is_dir()).unwrap_or(false),
                    "isSymlink": file_type.as_ref().map(|t| t.is_symlink()).unwrap_or(false),
                }));
            }
            ok(json!({ "entries": list }))
        }
        Err(e) => err(e.to_string()),
    }
}

#[tauri::command]
pub fn fs_read_text_file(path: String) -> Value {
    match std::fs::read_to_string(&path) {
        Ok(content) => ok(json!({ "content": content })),
        Err(e) => err(e.to_string()),
    }
}

#[tauri::command]
pub fn fs_read_file(path: String) -> Value {
    match std::fs::read(&path) {
        Ok(data) => ok(json!({ "data": data })),
        Err(e) => err(e.to_string()),
    }
}

#[tauri::command]
pub fn fs_stat(path: String) -> Value {
    match std::fs::symlink_metadata(&path) {
        Ok(meta) => {
            let file_type = meta.file_type();
            let to_ms = |t: std::io::Result<std::time::SystemTime>| -> f64 {
                t.ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as f64)
                    .unwrap_or(0.0)
            };
            ok(json!({
                "stat": {
                    "size": meta.len(),
                    "isFile": file_type.is_file(),
                    "isDirectory": file_type.is_dir(),
                    "isSymlink": file_type.is_symlink(),
                    "birthtimeMs": to_ms(meta.created()),
                    "mtimeMs": to_ms(meta.modified()),
                    "atimeMs": to_ms(meta.accessed()),
                }
            }))
        }
        Err(e) => err(e.to_string()),
    }
}

#[tauri::command]
pub fn fs_write_file(path: String, data: Vec<u8>) -> Value {
    match std::fs::write(&path, data) {
        Ok(()) => ok(json!({})),
        Err(e) => err(e.to_string()),
    }
}

#[tauri::command]
pub fn fs_write_text_file(path: String, content: String) -> Value {
    match std::fs::write(&path, content) {
        Ok(()) => ok(json!({})),
        Err(e) => err(e.to_string()),
    }
}

// ---------------------------------------------------------------------------
// Path
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn path_app_data_dir(handle: AppHandle) -> Value {
    match crate::paths::app_data_dir(&handle) {
        Ok(path) => ok(json!({ "path": path.to_string_lossy() })),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub fn path_join(segments: Vec<String>) -> Value {
    let mut path = PathBuf::new();
    for segment in segments {
        path.push(segment);
    }
    ok(json!({ "path": path.to_string_lossy() }))
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OpenDialogOptions {
    pub title: Option<String>,
    pub directory: Option<bool>,
    pub multiple: Option<bool>,
    pub filters: Option<Vec<DialogFilter>>,
    pub default_path: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SaveDialogOptions {
    pub title: Option<String>,
    pub default_path: Option<String>,
    pub filters: Option<Vec<DialogFilter>>,
}

#[derive(Deserialize)]
pub struct DialogFilter {
    pub name: String,
    pub extensions: Vec<String>,
}

#[derive(Deserialize, Default)]
pub struct MessageOptions {
    pub title: Option<String>,
    pub kind: Option<String>,
}

#[tauri::command]
pub async fn dialog_open(app: AppHandle, options: Option<OpenDialogOptions>) -> Value {
    let options = options.unwrap_or_default();
    let mut builder = app.dialog().file();
    if let Some(title) = options.title {
        builder = builder.set_title(title);
    }
    if let Some(default_path) = options.default_path {
        builder = builder.set_directory(default_path);
    }
    if let Some(filters) = options.filters {
        for filter in filters {
            let exts: Vec<&str> = filter.extensions.iter().map(String::as_str).collect();
            builder = builder.add_filter(filter.name, &exts);
        }
    }

    let directory = options.directory.unwrap_or(false);
    let multiple = options.multiple.unwrap_or(false);

    if directory {
        let result = if multiple {
            // Directory multi-select is not widely supported; fall back to single.
            builder.blocking_pick_folder().map(|p| vec![p])
        } else {
            builder.blocking_pick_folder().map(|p| vec![p])
        };
        return match result {
            Some(paths) => {
                let file_paths: Vec<String> = paths
                    .into_iter()
                    .filter_map(|p| match p {
                        FilePath::Path(path) => Some(path.to_string_lossy().to_string()),
                        FilePath::Url(url) => Some(url.to_string()),
                    })
                    .collect();
                ok(json!({ "canceled": false, "filePaths": file_paths }))
            }
            None => ok(json!({ "canceled": true, "filePaths": [] })),
        };
    }

    if multiple {
        match builder.blocking_pick_files() {
            Some(paths) => {
                let file_paths: Vec<String> = paths
                    .into_iter()
                    .filter_map(|p| match p {
                        FilePath::Path(path) => Some(path.to_string_lossy().to_string()),
                        FilePath::Url(url) => Some(url.to_string()),
                    })
                    .collect();
                ok(json!({ "canceled": false, "filePaths": file_paths }))
            }
            None => ok(json!({ "canceled": true, "filePaths": [] })),
        }
    } else {
        match builder.blocking_pick_file() {
            Some(path) => {
                let file_path = match path {
                    FilePath::Path(p) => p.to_string_lossy().to_string(),
                    FilePath::Url(url) => url.to_string(),
                };
                ok(json!({ "canceled": false, "filePaths": [file_path] }))
            }
            None => ok(json!({ "canceled": true, "filePaths": [] })),
        }
    }
}

#[tauri::command]
pub async fn dialog_save(app: AppHandle, options: Option<SaveDialogOptions>) -> Value {
    let options = options.unwrap_or_default();
    let mut builder = app.dialog().file();
    if let Some(title) = options.title {
        builder = builder.set_title(title);
    }
    if let Some(default_path) = options.default_path {
        let path = PathBuf::from(&default_path);
        if let Some(parent) = path.parent() {
            builder = builder.set_directory(parent);
        }
        if let Some(name) = path.file_name() {
            builder = builder.set_file_name(name.to_string_lossy());
        }
    }
    if let Some(filters) = options.filters {
        for filter in filters {
            let exts: Vec<&str> = filter.extensions.iter().map(String::as_str).collect();
            builder = builder.add_filter(filter.name, &exts);
        }
    }

    match builder.blocking_save_file() {
        Some(path) => {
            let file_path = match path {
                FilePath::Path(p) => p.to_string_lossy().to_string(),
                FilePath::Url(url) => url.to_string(),
            };
            ok(json!({ "canceled": false, "filePath": file_path }))
        }
        None => ok(json!({ "canceled": true })),
    }
}

#[tauri::command]
pub async fn dialog_message(
    app: AppHandle,
    message: String,
    options: Option<MessageOptions>,
) -> Value {
    let options = options.unwrap_or_default();
    let kind = match options.kind.as_deref() {
        Some("error") => MessageDialogKind::Error,
        Some("warning") => MessageDialogKind::Warning,
        _ => MessageDialogKind::Info,
    };
    let mut builder = app.dialog().message(message).kind(kind);
    if let Some(title) = options.title {
        builder = builder.title(title);
    } else {
        builder = builder.title("Notice");
    }
    builder.blocking_show();
    ok(json!({}))
}

// ---------------------------------------------------------------------------
// Shell / App
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn shell_open_external(app: AppHandle, url: String) -> Value {
    use tauri_plugin_opener::OpenerExt;
    match app.opener().open_url(url, None::<&str>) {
        Ok(()) => ok(json!({})),
        Err(e) => err(e.to_string()),
    }
}

#[tauri::command]
pub fn app_quit(app: AppHandle) -> Value {
    app.exit(0);
    ok(json!({}))
}

#[tauri::command]
pub fn app_relaunch(app: AppHandle) -> Value {
    app.restart();
    #[allow(unreachable_code)]
    ok(json!({}))
}

#[tauri::command]
pub fn app_get_version(app: AppHandle) -> Value {
    ok(json!({ "version": app.package_info().version.to_string() }))
}

#[derive(Deserialize)]
pub struct ConfirmCloseArgs {
    #[serde(rename = "requestId")]
    pub _request_id: Option<u64>,
}

#[tauri::command]
pub fn app_confirm_close(app: AppHandle, state: State<'_, Arc<AppState>>, _args: ConfirmCloseArgs) -> Value {
    state.set_allow_close(true);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.close();
    }
    ok(json!({}))
}

#[tauri::command]
pub fn window_is_focused(app: AppHandle) -> Value {
    let focused = app
        .get_webview_window("main")
        .map(|w| w.is_focused().unwrap_or(false))
        .unwrap_or(false);
    ok(json!({ "focused": focused }))
}

// ---------------------------------------------------------------------------
// Shortcuts
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn shortcut_register(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    accelerator: String,
) -> Value {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

    let parsed: Shortcut = match accelerator.parse() {
        Ok(s) => s,
        Err(e) => return err(format!("Invalid accelerator: {e}")),
    };

    if app.global_shortcut().is_registered(parsed) {
        state
            .shortcut_owners
            .lock()
            .insert(accelerator.clone(), "main".to_string());
        return ok(json!({}));
    }

    let accel = accelerator.clone();
    match app.global_shortcut().on_shortcut(parsed, move |app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.emit("shortcut:pressed", json!({ "accelerator": accel }));
            }
        }
    }) {
        Ok(()) => {
            state
                .shortcut_owners
                .lock()
                .insert(accelerator, "main".to_string());
            ok(json!({}))
        }
        Err(e) => err(format!("Failed to register accelerator: {e}")),
    }
}

#[tauri::command]
pub fn shortcut_unregister(app: AppHandle, state: State<'_, Arc<AppState>>, accelerator: String) -> Value {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

    let parsed: Shortcut = match accelerator.parse() {
        Ok(s) => s,
        Err(e) => return err(format!("Invalid accelerator: {e}")),
    };

    let _ = app.global_shortcut().unregister(parsed);
    state.shortcut_owners.lock().remove(&accelerator);
    ok(json!({}))
}

// ---------------------------------------------------------------------------
// S3 Sync
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn connect_s3_sync(app: AppHandle, args: Value) -> Value {
    let state = app.state::<Arc<AppState>>().inner().clone();
    let config: SyncConnectionConfig = if let Some(config) = args.get("config") {
        match serde_json::from_value(config.clone()) {
            Ok(c) => c,
            Err(e) => return err(e.to_string()),
        }
    } else {
        match serde_json::from_value(args) {
            Ok(c) => c,
            Err(e) => return err(e.to_string()),
        }
    };

    match state.s3.connect(config).await {
        Ok(connection) => ok(json!({ "connection": connection })),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub fn disconnect_s3_sync(state: State<'_, Arc<AppState>>, connection_id: String) -> Value {
    state.s3.disconnect(&connection_id);
    ok(json!({}))
}

#[derive(Deserialize)]
pub struct SyncOpts {
    pub connection_id: String,
    pub bucket_name: String,
    pub prefix: Option<String>,
    pub key: Option<String>,
    pub keys: Option<Vec<String>>,
    pub content: Option<String>,
    pub json_content: Option<String>,
    pub content_type: Option<String>,
    pub bytes: Option<Vec<u8>>,
}

fn extract_opts(args: Value) -> Result<SyncOpts, String> {
    if let Some(opts) = args.get("opts") {
        serde_json::from_value(opts.clone()).map_err(|e| e.to_string())
    } else {
        serde_json::from_value(args).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn list_sync_objects(app: AppHandle, args: Value) -> Value {
    let state = app.state::<Arc<AppState>>().inner().clone();
    let opts = match extract_opts(args) {
        Ok(o) => o,
        Err(e) => return err(e),
    };
    match state
        .s3
        .list_objects(
            &opts.connection_id,
            &opts.bucket_name,
            opts.prefix.as_deref().unwrap_or(""),
        )
        .await
    {
        Ok(objects) => ok(json!({ "objects": objects })),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub async fn get_sync_object_metadata(app: AppHandle, args: Value) -> Value {
    let state = app.state::<Arc<AppState>>().inner().clone();
    let opts = match extract_opts(args) {
        Ok(o) => o,
        Err(e) => return err(e),
    };
    let key = match opts.key.as_deref() {
        Some(k) => k,
        None => return err("Missing key"),
    };
    match state
        .s3
        .get_object_metadata(&opts.connection_id, &opts.bucket_name, key)
        .await
    {
        Ok(metadata) => ok(json!({ "metadata": metadata })),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub async fn upload_sync_object(app: AppHandle, args: Value) -> Value {
    let state = app.state::<Arc<AppState>>().inner().clone();
    let opts = match extract_opts(args) {
        Ok(o) => o,
        Err(e) => return err(e),
    };
    let key = match opts.key.as_deref() {
        Some(k) => k,
        None => return err("Missing key"),
    };
    let content = opts
        .json_content
        .or(opts.content)
        .unwrap_or_default();
    match state
        .s3
        .upload_object(
            &opts.connection_id,
            &opts.bucket_name,
            key,
            &content,
            opts.content_type.as_deref(),
        )
        .await
    {
        Ok(result) => ok(json!({ "result": result })),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub async fn upload_sync_binary(app: AppHandle, args: Value) -> Value {
    let state = app.state::<Arc<AppState>>().inner().clone();
    let opts = match extract_opts(args) {
        Ok(o) => o,
        Err(e) => return err(e),
    };
    let key = match opts.key.as_deref() {
        Some(k) => k,
        None => return err("Missing key"),
    };
    let bytes = opts.bytes.unwrap_or_default();
    match state
        .s3
        .upload_binary(
            &opts.connection_id,
            &opts.bucket_name,
            key,
            bytes,
            opts.content_type.as_deref(),
        )
        .await
    {
        Ok(result) => ok(json!({ "result": result })),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub async fn download_sync_object(app: AppHandle, args: Value) -> Value {
    let state = app.state::<Arc<AppState>>().inner().clone();
    let opts = match extract_opts(args) {
        Ok(o) => o,
        Err(e) => return err(e),
    };
    let key = match opts.key.as_deref() {
        Some(k) => k,
        None => return err("Missing key"),
    };
    match state
        .s3
        .download_object(&opts.connection_id, &opts.bucket_name, key)
        .await
    {
        Ok(content) => ok(json!({ "content": content })),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub async fn download_sync_binary(app: AppHandle, args: Value) -> Value {
    let state = app.state::<Arc<AppState>>().inner().clone();
    let opts = match extract_opts(args) {
        Ok(o) => o,
        Err(e) => return err(e),
    };
    let key = match opts.key.as_deref() {
        Some(k) => k,
        None => return err("Missing key"),
    };
    match state
        .s3
        .download_binary(&opts.connection_id, &opts.bucket_name, key)
        .await
    {
        Ok(data) => ok(json!({ "data": data })),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub async fn delete_sync_objects_batch(app: AppHandle, args: Value) -> Value {
    let state = app.state::<Arc<AppState>>().inner().clone();
    let opts = match extract_opts(args) {
        Ok(o) => o,
        Err(e) => return err(e),
    };
    let keys = opts.keys.unwrap_or_default();
    match state
        .s3
        .delete_batch(&opts.connection_id, &opts.bucket_name, &keys)
        .await
    {
        Ok(result) => ok(json!({ "result": result })),
        Err(e) => err(e),
    }
}
