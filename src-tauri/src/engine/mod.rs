use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub mod rqbit;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentSource {
    pub kind: SourceKind,
    pub value: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SourceKind {
    Magnet,
    File,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddRequest {
    pub source: TorrentSource,
    pub destination: String,
    pub file_indices: Vec<usize>,
}

#[async_trait]
pub trait TorrentEngine: Send + Sync {
    async fn list(&self) -> anyhow::Result<Value>;
    async fn inspect(&self, source: TorrentSource, destination: String) -> anyhow::Result<Value>;
    async fn add(&self, request: AddRequest) -> anyhow::Result<Value>;
    async fn pause(&self, id: usize) -> anyhow::Result<()>;
    async fn resume(&self, id: usize) -> anyhow::Result<()>;
    async fn remove(&self, id: usize, delete_files: bool) -> anyhow::Result<()>;
    async fn details(&self, id: usize) -> anyhow::Result<Value>;
    fn media_stream_url(&self, id: usize, file_id: usize) -> anyhow::Result<String>;
    /// Applies global speed limits in KB/s. Zero means unlimited. Takes effect immediately.
    fn set_speed_limits(&self, download_kbps: u64, upload_kbps: u64);
}

/// Converts a KB/s setting to bytes per second for the rate limiter; zero is unlimited.
pub fn kbps_to_bps(kbps: u64) -> Option<std::num::NonZeroU32> {
    let bps = kbps.saturating_mul(1024).min(u64::from(u32::MAX));
    std::num::NonZeroU32::new(bps as u32)
}

pub fn validate_source(source: &TorrentSource) -> anyhow::Result<()> {
    use anyhow::{bail, Context};
    match source.kind {
        SourceKind::Magnet => {
            if source.value.len() > 16_384 {
                bail!("Magnet link is too long");
            }
            let url = url::Url::parse(source.value.trim()).context("Invalid magnet link")?;
            if url.scheme() != "magnet" || !url.query_pairs().any(|(key, _)| key == "xt") {
                bail!("Magnet link must contain an xt info hash");
            }
        }
        SourceKind::File => {
            let path = std::path::Path::new(&source.value);
            if !path.is_absolute() || path.extension().and_then(|e| e.to_str()) != Some("torrent") {
                bail!("Select an absolute .torrent file path");
            }
            let metadata = std::fs::metadata(path).context("Torrent file is not readable")?;
            if metadata.len() > 10 * 1024 * 1024 {
                bail!("Torrent metadata exceeds the 10 MB safety limit");
            }
        }
    }
    Ok(())
}

pub fn validate_destination(destination: &str) -> anyhow::Result<()> {
    use anyhow::bail;
    let path = std::path::Path::new(destination);
    if !path.is_absolute() {
        bail!("Download destination must be an absolute path");
    }
    if path
        .components()
        .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        bail!("Download destination cannot contain parent traversal");
    }
    Ok(())
}

pub fn map_torrent_status(engine_state: &str, finished: bool) -> &'static str {
    if finished {
        return "completed";
    }
    match engine_state {
        "live" => "downloading",
        "paused" => "paused",
        "initializing" => "preparing",
        _ => "error",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_kbps_limits_and_treats_zero_as_unlimited() {
        assert_eq!(kbps_to_bps(0), None);
        assert_eq!(kbps_to_bps(1).map(|v| v.get()), Some(1024));
        assert_eq!(kbps_to_bps(5_000).map(|v| v.get()), Some(5_120_000));
        assert_eq!(kbps_to_bps(u64::MAX).map(|v| v.get()), Some(u32::MAX));
    }

    #[test]
    fn rejects_relative_and_traversing_destinations() {
        assert!(validate_destination("Downloads/file").is_err());
        assert!(validate_destination("/tmp/../private").is_err());
        assert!(validate_destination("/tmp/torrentory").is_ok());
    }

    #[test]
    fn validates_magnet_scheme_and_hash_parameter() {
        let valid = TorrentSource {
            kind: SourceKind::Magnet,
            value: "magnet:?xt=urn:btih:0123456789012345678901234567890123456789".into(),
        };
        assert!(validate_source(&valid).is_ok());
        let invalid = TorrentSource {
            kind: SourceKind::Magnet,
            value: "https://example.com".into(),
        };
        assert!(validate_source(&invalid).is_err());
    }

    #[test]
    fn maps_native_engine_states_to_stable_ui_states() {
        assert_eq!(map_torrent_status("live", false), "downloading");
        assert_eq!(map_torrent_status("paused", false), "paused");
        assert_eq!(map_torrent_status("initializing", false), "preparing");
        assert_eq!(map_torrent_status("error", false), "error");
        assert_eq!(map_torrent_status("live", true), "completed");
    }
}
