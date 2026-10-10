//! SKEPI desktop (Tauri 2, Windows). The React UI (`apps/desktop/src`) runs `@skepi/core` and talks
//! to the native engines (`crates/desktop-core`) only through the commands in `commands.rs`.

pub mod commands;
pub mod protocols;
pub mod state;
pub mod webview2;

use state::AppState;
use tauri::Manager;

pub fn run() {
    desktop_core::install_crypto_provider();
    tauri::Builder::default()
        // Native file/folder pickers only (used from Rust; the webview has no dialog permission).
        .plugin(tauri_plugin_dialog::init())
        .register_uri_scheme_protocol("zim", |ctx, request| protocols::zim(&ctx, &request))
        .register_uri_scheme_protocol("maps", |ctx, request| protocols::maps(&ctx, &request))
        .setup(|app| {
            let app_data =
                std::env::var_os("SKEPI_APP_DATA").map(std::path::PathBuf::from).map_or_else(|| app.path().app_local_data_dir(), Ok)?;
            let state = AppState::open(&app_data, &app_data.join("content")).map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;
            app.manage(state);
            Ok(())
        })
        .on_page_load(|webview, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Started {
                webview2::harden(webview);
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::zim_open_installed,
            commands::zim_suggest,
            commands::zim_search,
            commands::zim_article,
            commands::zim_plain_text,
            commands::viewer_open,
            commands::viewer_close,
            commands::llm_load,
            commands::llm_generate,
            commands::llm_abort,
            commands::llm_unload,
            commands::device_info,
            commands::content_state,
            commands::content_reconcile,
            commands::content_download,
            commands::content_cancel,
            commands::content_check_update,
            commands::content_import,
            commands::content_verify,
            commands::content_remove,
            commands::content_consent,
            commands::content_choose_folder,
            commands::settings_get,
            commands::settings_set,
            commands::places_query,
            commands::station_addresses,
            commands::station_choose_apk,
            commands::station_start,
            commands::station_stop,
            commands::station_status,
            commands::report_save,
        ])
        .on_window_event(|window, event| {
            // Closing the main window ends Station mode and the app (the viewer closes with it).
            if window.label() == protocols::MAIN_LABEL
                && let tauri::WindowEvent::CloseRequested { .. } = event
            {
                if let Some(state) = window.app_handle().try_state::<AppState>() {
                    state.station.stop("app closed");
                }
                window.app_handle().exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running SKEPI");
}
