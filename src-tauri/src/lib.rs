#[path = "core_net.rs"]
mod net;

mod auth;
mod commands;
mod install;
mod java;
mod launch;
mod loaders;
mod merge;
mod model;
mod mojang;
mod paths;
mod spotify;
mod state;
mod store;

use state::AppState;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::win_minimize,
            commands::win_maximize,
            commands::win_close,
            commands::settings_get,
            commands::settings_set,
            commands::pick_folder,
            commands::open_folder,
            commands::open_path,
            commands::open_url,
            commands::versions_list,
            commands::instances_list,
            commands::instances_create,
            commands::instances_update,
            commands::instances_delete,
            commands::instances_set_active,
            commands::instances_content,
            commands::instances_toggle_mod,
            commands::instances_delete_file,
            commands::instances_open,
            commands::java_list,
            commands::launch_start,
            commands::launch_stop,
            commands::accounts_add_offline,
            commands::accounts_set_active,
            commands::accounts_remove,
            commands::ms_start,
            commands::ms_cancel,
            commands::logs_get,
            commands::logs_clear,
            commands::news_list,
            commands::spotify_login,
            commands::spotify_logout,
            commands::spotify_status,
            commands::spotify_control,
            commands::spotify_lyrics,
        ])
        .run(tauri::generate_context!())
        .expect("Modlum Launcher başlatılamadı");
}
