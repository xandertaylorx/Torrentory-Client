mod commands;
mod default_client;
pub mod engine;
mod media_stream;
pub mod storage;
mod torrent_creator;

use std::{collections::HashSet, sync::Arc, time::Duration};

use engine::{rqbit::RqbitEngine, TorrentEngine};
use storage::settings::SettingsStore;
use tauri::{Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

pub struct AppState {
    pub engine: Arc<dyn TorrentEngine>,
    pub settings: Arc<SettingsStore>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            for arg in argv {
                if arg.starts_with("magnet:") || arg.ends_with(".torrent") {
                    let _ = app.emit("torrentory://open-source", arg);
                }
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let settings = Arc::new(SettingsStore::load(data_dir.join("settings.json"))?);
            let current = settings.get();
            std::fs::create_dir_all(&current.download_location)?;
            let engine = tauri::async_runtime::block_on(RqbitEngine::new(
                current.download_location.clone().into(),
                data_dir.join("session"),
                current.listening_port,
            ))?;
            let engine: Arc<dyn TorrentEngine> = Arc::new(engine);
            app.manage(AppState {
                engine: engine.clone(),
                settings: settings.clone(),
            });

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut ticker = tokio::time::interval(Duration::from_millis(750));
                let mut notified = HashSet::new();
                loop {
                    ticker.tick().await;
                    match engine.list().await {
                        Ok(snapshot) => {
                            if settings.get().completion_notifications {
                                if let Some(torrents) =
                                    snapshot.get("torrents").and_then(|value| value.as_array())
                                {
                                    for torrent in torrents {
                                        let id = torrent
                                            .get("id")
                                            .and_then(|value| value.as_u64())
                                            .unwrap_or_default();
                                        let finished = torrent
                                            .pointer("/stats/finished")
                                            .and_then(|value| value.as_bool())
                                            .unwrap_or(false);
                                        if finished && notified.insert(id) {
                                            let name = torrent
                                                .get("name")
                                                .and_then(|value| value.as_str())
                                                .unwrap_or("Your download");
                                            let _ = handle
                                                .notification()
                                                .builder()
                                                .title("Download complete")
                                                .body(name)
                                                .show();
                                        }
                                    }
                                }
                            }
                            let _ = handle.emit("torrentory://snapshot", snapshot);
                        }
                        Err(error) => {
                            let _ = handle.emit("torrentory://engine-error", error.to_string());
                        }
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_torrents,
            commands::inspect_torrent,
            commands::add_torrent,
            commands::pause_torrent,
            commands::resume_torrent,
            commands::remove_torrent,
            commands::torrent_details,
            commands::media_stream_url,
            commands::create_torrent_file,
            commands::get_settings,
            commands::save_settings,
            commands::get_default_client_status,
            commands::make_default_torrent_client,
        ]);

    builder
        .run(tauri::generate_context!())
        .expect("failed to run Torrentory Client");
}
