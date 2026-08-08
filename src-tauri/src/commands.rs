use serde_json::Value;
use tauri::State;

use crate::{
    default_client::{self, DefaultClientStatus},
    engine::{AddRequest, TorrentSource},
    storage::settings::Settings,
    torrent_creator::{self, CreateTorrentRequest, CreateTorrentSummary},
    AppState,
};

#[tauri::command]
pub async fn create_torrent_file(
    request: CreateTorrentRequest,
) -> Result<CreateTorrentSummary, String> {
    torrent_creator::create(request).await.map_err(message)
}

fn message(error: anyhow::Error) -> String {
    format!("{error:#}")
}

#[tauri::command]
pub async fn list_torrents(state: State<'_, AppState>) -> Result<Value, String> {
    state.engine.list().await.map_err(message)
}

#[tauri::command]
pub async fn inspect_torrent(
    source: TorrentSource,
    destination: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    state
        .engine
        .inspect(source, destination)
        .await
        .map_err(message)
}

#[tauri::command]
pub async fn add_torrent(request: AddRequest, state: State<'_, AppState>) -> Result<Value, String> {
    state.engine.add(request).await.map_err(message)
}

#[tauri::command]
pub async fn pause_torrent(id: usize, state: State<'_, AppState>) -> Result<(), String> {
    state.engine.pause(id).await.map_err(message)
}

#[tauri::command]
pub async fn resume_torrent(id: usize, state: State<'_, AppState>) -> Result<(), String> {
    state.engine.resume(id).await.map_err(message)
}

#[tauri::command]
pub async fn remove_torrent(
    id: usize,
    delete_files: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.engine.remove(id, delete_files).await.map_err(message)
}

#[tauri::command]
pub async fn torrent_details(id: usize, state: State<'_, AppState>) -> Result<Value, String> {
    state.engine.details(id).await.map_err(message)
}

#[tauri::command]
pub fn media_stream_url(
    id: usize,
    file_id: usize,
    state: State<'_, AppState>,
) -> Result<String, String> {
    state.engine.media_stream_url(id, file_id).map_err(message)
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Settings {
    state.settings.get()
}

#[tauri::command]
pub fn save_settings(settings: Settings, state: State<'_, AppState>) -> Result<(), String> {
    state.settings.save(settings).map_err(message)
}

#[tauri::command]
pub fn get_default_client_status() -> DefaultClientStatus {
    default_client::status()
}

#[tauri::command]
pub fn make_default_torrent_client() -> Result<DefaultClientStatus, String> {
    default_client::make_default()
}
