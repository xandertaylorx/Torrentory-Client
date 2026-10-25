mod commands;
mod default_client;
pub mod engine;
mod media_stream;
mod open_sources;
pub mod storage;
mod torrent_creator;

use std::{collections::HashSet, sync::Arc, time::Duration};

use engine::{rqbit::RqbitEngine, TorrentEngine};
use storage::settings::SettingsStore;
use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_notification::NotificationExt;

pub struct AppState {
    pub engine: Arc<dyn TorrentEngine>,
    pub settings: Arc<SettingsStore>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(open_sources::OpenSourceState::default())
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            // With the `deep-link` feature, magnet URLs are forwarded through the
            // deep-link listener. Plain .torrent paths still arrive here.
            open_sources::enqueue(
                app,
                argv.into_iter().filter(|arg| !arg.starts_with("magnet:")),
                Some(std::path::Path::new(&cwd)),
            );
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                open_sources::enqueue(&handle, event.urls().iter().map(|url| url.as_str()), None);
            });
            let startup_cwd = std::env::current_dir().ok();
            open_sources::enqueue(
                app.handle(),
                std::env::args().skip(1),
                startup_cwd.as_deref(),
            );
            if let Some(urls) = app.deep_link().get_current()? {
                open_sources::enqueue(app.handle(), urls.iter().map(|url| url.as_str()), None);
            }

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
            engine.set_speed_limits(current.download_limit_kbps, current.upload_limit_kbps);
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
            open_sources::take_pending_open_sources,
        ]);

    builder
        .run(tauri::generate_context!())
        .expect("failed to run Torrentory Client");
}
