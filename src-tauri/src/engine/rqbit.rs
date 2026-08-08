use std::path::PathBuf;

use anyhow::Context;
use async_trait::async_trait;
use librqbit::{
    api::{ApiTorrentListOpts, TorrentIdOrHash},
    AddTorrent, AddTorrentOptions, Api, Session, SessionOptions, SessionPersistenceConfig,
};
use serde_json::{json, Value};

use super::{
    map_torrent_status, validate_destination, validate_source, AddRequest, SourceKind,
    TorrentEngine, TorrentSource,
};

pub struct RqbitEngine {
    api: Api,
    media_base_url: String,
}

impl RqbitEngine {
    pub async fn new(
        default_downloads: PathBuf,
        state_dir: PathBuf,
        port: u16,
    ) -> anyhow::Result<Self> {
        std::fs::create_dir_all(&default_downloads)?;
        std::fs::create_dir_all(&state_dir)?;
        let options = SessionOptions {
            fastresume: true,
            persistence: Some(SessionPersistenceConfig::Json {
                folder: Some(state_dir),
            }),
            listen_port_range: Some(port..port.saturating_add(20)),
            enable_upnp_port_forwarding: false,
            ..Default::default()
        };
        let session = Session::new_with_opts(default_downloads, options).await?;
        let api = Api::new(session, None);
        let media_base_url = crate::media_stream::start(api.clone()).await?;
        Ok(Self {
            api,
            media_base_url,
        })
    }

    fn source<'a>(source: &'a TorrentSource, bytes: &'a [u8]) -> AddTorrent<'a> {
        match source.kind {
            SourceKind::Magnet => AddTorrent::from_url(source.value.trim()),
            SourceKind::File => AddTorrent::TorrentFileBytes(bytes.to_vec().into()),
        }
    }

    fn read_source(source: &TorrentSource) -> anyhow::Result<Vec<u8>> {
        match source.kind {
            SourceKind::Magnet => Ok(Vec::new()),
            SourceKind::File => std::fs::read(&source.value).context("Could not read torrent file"),
        }
    }
}

#[async_trait]
impl TorrentEngine for RqbitEngine {
    async fn list(&self) -> anyhow::Result<Value> {
        let response = self
            .api
            .api_torrent_list_ext(ApiTorrentListOpts { with_stats: true });
        let mut value = serde_json::to_value(response)?;
        if let Some(torrents) = value.get_mut("torrents").and_then(Value::as_array_mut) {
            for torrent in torrents {
                let state = torrent
                    .pointer("/stats/state")
                    .and_then(Value::as_str)
                    .unwrap_or("error");
                let finished = torrent
                    .pointer("/stats/finished")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                torrent["display_status"] = json!(map_torrent_status(state, finished));
            }
        }
        Ok(value)
    }

    async fn inspect(&self, source: TorrentSource, destination: String) -> anyhow::Result<Value> {
        validate_source(&source)?;
        validate_destination(&destination)?;
        let bytes = Self::read_source(&source)?;
        let options = AddTorrentOptions {
            list_only: true,
            output_folder: Some(destination),
            ..Default::default()
        };
        let response = self
            .api
            .api_add_torrent(Self::source(&source, &bytes), Some(options))
            .await
            .map_err(|error| anyhow::anyhow!(error.to_string()))?;
        Ok(serde_json::to_value(response)?)
    }

    async fn add(&self, request: AddRequest) -> anyhow::Result<Value> {
        validate_source(&request.source)?;
        validate_destination(&request.destination)?;
        if request.file_indices.len() > 100_000 {
            anyhow::bail!("Too many selected files");
        }
        let bytes = Self::read_source(&request.source)?;
        let options = AddTorrentOptions {
            output_folder: Some(request.destination),
            only_files: if request.file_indices.is_empty() {
                None
            } else {
                Some(request.file_indices)
            },
            overwrite: false,
            ..Default::default()
        };
        let response = self
            .api
            .api_add_torrent(Self::source(&request.source, &bytes), Some(options))
            .await
            .map_err(|error| anyhow::anyhow!(error.to_string()))?;
        Ok(serde_json::to_value(response)?)
    }

    async fn pause(&self, id: usize) -> anyhow::Result<()> {
        self.api
            .api_torrent_action_pause(TorrentIdOrHash::Id(id))
            .await
            .map_err(|error| anyhow::anyhow!(error.to_string()))?;
        Ok(())
    }

    async fn resume(&self, id: usize) -> anyhow::Result<()> {
        self.api
            .api_torrent_action_start(TorrentIdOrHash::Id(id))
            .await
            .map_err(|error| anyhow::anyhow!(error.to_string()))?;
        Ok(())
    }

    async fn remove(&self, id: usize, delete_files: bool) -> anyhow::Result<()> {
        let torrent = TorrentIdOrHash::Id(id);
        if delete_files {
            self.api.api_torrent_action_delete(torrent).await
        } else {
            self.api.api_torrent_action_forget(torrent).await
        }
        .map_err(|error| anyhow::anyhow!(error.to_string()))?;
        Ok(())
    }

    async fn details(&self, id: usize) -> anyhow::Result<Value> {
        let torrent = TorrentIdOrHash::Id(id);
        let mut details = serde_json::to_value(
            self.api
                .api_torrent_details(torrent)
                .map_err(|error| anyhow::anyhow!(error.to_string()))?,
        )?;
        let stats = self
            .api
            .mgr_handle(torrent)
            .map_err(|error| anyhow::anyhow!(error.to_string()))?
            .stats();

        let stats_value = serde_json::to_value(stats)?;

        let peer_stats = stats_value
            .pointer("/live/snapshot/peer_stats")
            .cloned()
            .unwrap_or_else(|| json!({}));

        let live = peer_stats.get("live").and_then(Value::as_u64).unwrap_or(0);

        let connecting = peer_stats
            .get("connecting")
            .and_then(Value::as_u64)
            .unwrap_or(0);

        let queued = peer_stats
            .get("queued")
            .and_then(Value::as_u64)
            .unwrap_or(0);

        let seen = peer_stats.get("seen").and_then(Value::as_u64).unwrap_or(0);

        details["stats"] = stats_value;
        details["peer_summary"] = json!({
            "connected": live,
            "connecting": connecting,
            "queued": queued,
            "known": seen
        });
        let peers = self
            .api
            .api_peer_stats(torrent, Default::default())
            .map(serde_json::to_value)
            .ok()
            .transpose()?
            .unwrap_or_else(|| json!([]));
        details["peers"] = peers;
        let trackers = self
            .api
            .mgr_handle(torrent)
            .map(|handle| {
                handle
                    .shared()
                    .trackers
                    .iter()
                    .map(ToString::to_string)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        details["trackers"] = json!(trackers);
        Ok(details)
    }

    fn media_stream_url(&self, id: usize, file_id: usize) -> anyhow::Result<String> {
        self.api
            .torrent_file_mime_type(TorrentIdOrHash::Id(id), file_id)
            .map_err(|error| anyhow::anyhow!(error.to_string()))?;
        Ok(format!("{}/{id}/{file_id}", self.media_base_url))
    }
}
