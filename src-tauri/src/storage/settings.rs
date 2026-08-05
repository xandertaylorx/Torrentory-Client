use std::{
    path::{Path, PathBuf},
    sync::RwLock,
};

use anyhow::Context;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub download_location: String,
    pub ask_where_to_save: bool,
    pub launch_at_login: bool,
    pub continue_in_background: bool,
    pub completion_notifications: bool,
    #[serde(default)]
    pub default_client_prompt_dismissed: bool,
    pub confirm_remove: bool,
    pub confirm_delete_files: bool,
    pub download_limit_kbps: u64,
    pub upload_limit_kbps: u64,
    pub listening_port: u16,
    pub incoming_connections: bool,
    pub appearance: Appearance,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Appearance {
    System,
    Light,
    Dark,
}

impl Default for Settings {
    fn default() -> Self {
        let download_location = directories::UserDirs::new()
            .and_then(|dirs| dirs.download_dir().map(Path::to_path_buf))
            .unwrap_or_else(|| PathBuf::from("/tmp"));
        Self {
            download_location: download_location.to_string_lossy().into_owned(),
            ask_where_to_save: true,
            launch_at_login: false,
            continue_in_background: true,
            completion_notifications: true,
            default_client_prompt_dismissed: false,
            confirm_remove: true,
            confirm_delete_files: true,
            download_limit_kbps: 0,
            upload_limit_kbps: 0,
            listening_port: 4240,
            incoming_connections: true,
            appearance: Appearance::System,
        }
    }
}

pub struct SettingsStore {
    path: PathBuf,
    value: RwLock<Settings>,
}

impl SettingsStore {
    pub fn load(path: PathBuf) -> anyhow::Result<Self> {
        let value = if path.exists() {
            let bytes = std::fs::read(&path).context("Could not read settings")?;
            serde_json::from_slice(&bytes).context("Settings file is invalid")?
        } else {
            Settings::default()
        };
        Ok(Self {
            path,
            value: RwLock::new(value),
        })
    }

    pub fn get(&self) -> Settings {
        self.value.read().expect("settings lock poisoned").clone()
    }

    pub fn save(&self, value: Settings) -> anyhow::Result<()> {
        if value.listening_port == 0 {
            anyhow::bail!("Listening port must be between 1 and 65535");
        }
        let destination = Path::new(&value.download_location);
        if !destination.is_absolute() {
            anyhow::bail!("Download location must be absolute");
        }
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let temporary = self.path.with_extension("json.tmp");
        std::fs::write(&temporary, serde_json::to_vec_pretty(&value)?)?;
        std::fs::rename(&temporary, &self.path)?;
        *self.value.write().expect("settings lock poisoned") = value;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_round_trip_atomically() {
        let root = std::env::temp_dir().join(format!("torrentory-settings-{}", std::process::id()));
        let path = root.join("settings.json");
        let store = SettingsStore::load(path.clone()).unwrap();
        let mut expected = store.get();
        expected.download_location = root.to_string_lossy().into_owned();
        expected.appearance = Appearance::Dark;
        store.save(expected.clone()).unwrap();
        let loaded = SettingsStore::load(path).unwrap();
        assert_eq!(loaded.get(), expected);
        let _ = std::fs::remove_dir_all(root);
    }
}
