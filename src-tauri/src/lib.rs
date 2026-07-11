mod commands;
mod machine_id;
mod paths;
mod services;
mod state;

use state::AppState;
use std::sync::Arc;
use tauri::{Emitter, Manager, RunEvent, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_global_shortcut::Builder::new().build());
    }

    let app = builder
        .invoke_handler(tauri::generate_handler![
            commands::save_credential,
            commands::get_credential,
            commands::delete_credential,
            commands::has_credential,
            commands::list_credential_keys,
            commands::clear_all_credentials,
            commands::store_get,
            commands::store_set,
            commands::store_delete,
            commands::store_has,
            commands::save_s3_config,
            commands::get_s3_config,
            commands::delete_s3_config,
            commands::has_s3_config,
            commands::save_image_file,
            commands::write_managed_image_file,
            commands::read_managed_image_file,
            commands::delete_image_file,
            commands::get_managed_image_metadata,
            commands::db_select,
            commands::db_execute,
            commands::fs_exists,
            commands::fs_mkdir,
            commands::fs_read_dir,
            commands::fs_read_text_file,
            commands::fs_read_file,
            commands::fs_stat,
            commands::fs_write_file,
            commands::fs_write_text_file,
            commands::path_app_data_dir,
            commands::path_join,
            commands::dialog_open,
            commands::dialog_save,
            commands::dialog_message,
            commands::shell_open_external,
            commands::app_quit,
            commands::app_relaunch,
            commands::app_get_version,
            commands::app_confirm_close,
            commands::window_is_focused,
            commands::shortcut_register,
            commands::shortcut_unregister,
            commands::connect_s3_sync,
            commands::disconnect_s3_sync,
            commands::list_sync_objects,
            commands::get_sync_object_metadata,
            commands::upload_sync_object,
            commands::upload_sync_binary,
            commands::download_sync_object,
            commands::download_sync_binary,
            commands::delete_sync_objects_batch,
        ])
        .setup(move |app| {
            let app_data = crate::paths::ensure_app_data_dir(app.handle())
                .map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;
            let app_state = AppState::new(&app_data)
                .map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;
            app.manage(app_state);

            if let Some(window) = app.get_webview_window("main") {
                let state = app.state::<Arc<AppState>>().inner().clone();
                let window_for_focus = window.clone();
                window.on_window_event(move |event| {
                    match event {
                        WindowEvent::Focused(focused) => {
                            let _ = window_for_focus.emit("window:focus_changed", *focused);
                        }
                        WindowEvent::CloseRequested { api, .. } => {
                            if state.should_allow_close() {
                                return;
                            }
                            api.prevent_close();
                            let request_id = state.next_close_request_id();
                            let _ = window_for_focus
                                .emit("app:close_requested", serde_json::json!({ "requestId": request_id }));
                        }
                        _ => {}
                    }
                });
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, event| {
        if let RunEvent::ExitRequested { .. } = event {
            // no-op
        }
    });
}
