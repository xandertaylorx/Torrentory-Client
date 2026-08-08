use std::{
    collections::HashSet,
    fs::File,
    io::{BufWriter, Write},
    path::{Component, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::{bail, Context};
use bencode::bencode_serialize_to_writer;
use librqbit::{create_torrent, torrent_from_bytes, ByteBuf, CreateTorrentOptions};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTorrentRequest {
    pub source_path: String,
    pub output_path: String,
    pub trackers: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTorrentSummary {
    pub output_path: String,
    pub info_hash: String,
    pub file_count: usize,
    pub total_bytes: u64,
    pub piece_length: u32,
    pub tracker_count: usize,
}

fn checked_path(value: &str, label: &str) -> anyhow::Result<PathBuf> {
    let path = PathBuf::from(value);
    if !path.is_absolute() {
        bail!("{label} must be an absolute path");
    }
    if path
        .components()
        .any(|part| matches!(part, Component::ParentDir))
    {
        bail!("{label} cannot contain parent traversal");
    }
    Ok(path)
}

fn normalize_trackers(values: Vec<String>) -> anyhow::Result<Vec<String>> {
    if values.len() > 64 {
        bail!("A torrent can contain at most 64 trackers");
    }
    let mut seen = HashSet::new();
    let mut trackers = Vec::new();
    for value in values {
        let value = value.trim();
        if value.is_empty() {
            continue;
        }
        if value.len() > 2_048 {
            bail!("A tracker URL is too long");
        }
        let parsed = url::Url::parse(value).context("Invalid tracker URL")?;
        if !matches!(parsed.scheme(), "udp" | "http" | "https") || parsed.host_str().is_none() {
            bail!("Trackers must use udp, http, or https URLs");
        }
        if seen.insert(value.to_owned()) {
            trackers.push(value.to_owned());
        }
    }
    Ok(trackers)
}

pub async fn create(request: CreateTorrentRequest) -> anyhow::Result<CreateTorrentSummary> {
    let source = checked_path(&request.source_path, "Source")?;
    let output = checked_path(&request.output_path, "Output")?;
    let source_metadata =
        std::fs::metadata(&source).context("The selected source is not readable")?;
    if !source_metadata.is_file() && !source_metadata.is_dir() {
        bail!("Select a regular file or folder");
    }
    if source_metadata.is_dir() && std::fs::read_dir(&source)?.next().is_none() {
        bail!("The selected folder is empty");
    }
    if output.extension().and_then(|value| value.to_str()) != Some("torrent") {
        bail!("The output filename must end in .torrent");
    }
    if source == output {
        bail!("The torrent file cannot replace its source");
    }
    let parent = output
        .parent()
        .context("The output location has no parent folder")?;
    if !parent.is_dir() {
        bail!("The output folder does not exist");
    }

    let trackers = normalize_trackers(request.trackers)?;
    let generated = create_torrent(&source, CreateTorrentOptions::default())
        .await
        .context("Could not hash the selected content")?;
    let info_hash = generated.info_hash().as_string();
    let mut metainfo = generated.as_info().clone();
    metainfo.announce = trackers
        .first()
        .map(|tracker| tracker.as_bytes().to_vec().into());
    metainfo.announce_list = trackers
        .iter()
        .map(|tracker| vec![tracker.as_bytes().to_vec().into()])
        .collect();
    metainfo.created_by = Some(
        format!("Torrentory Client {}", env!("CARGO_PKG_VERSION"))
            .into_bytes()
            .into(),
    );
    metainfo.creation_date = Some(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .context("System clock is before the Unix epoch")?
            .as_secs()
            .try_into()
            .context("Creation timestamp is out of range")?,
    );

    let file_count = metainfo.info.files.as_ref().map_or(1, Vec::len);
    if file_count == 0 {
        bail!("The selected folder does not contain any files");
    }
    let total_bytes = metainfo.info.length.unwrap_or_else(|| {
        metainfo
            .info
            .files
            .as_deref()
            .unwrap_or_default()
            .iter()
            .map(|file| file.length)
            .sum()
    });
    let piece_length = metainfo.info.piece_length;

    let temporary = output.with_extension(format!("torrent.{}.tmp", uuid::Uuid::new_v4()));
    let write_result = (|| -> anyhow::Result<()> {
        let file = File::create(&temporary).context("Could not create the torrent file")?;
        let mut writer = BufWriter::new(file);
        bencode_serialize_to_writer(&metainfo, &mut writer)
            .context("Could not serialize torrent metadata")?;
        writer
            .flush()
            .context("Could not finish writing the torrent file")?;
        writer
            .get_ref()
            .sync_all()
            .context("Could not sync the torrent file")?;
        let bytes = std::fs::read(&temporary).context("Could not verify the torrent file")?;
        let parsed = torrent_from_bytes::<ByteBuf>(&bytes)
            .context("Generated torrent metadata did not pass validation")?;
        if parsed.info_hash.as_string() != info_hash {
            bail!("Generated torrent info hash did not pass validation");
        }
        std::fs::rename(&temporary, &output).context("Could not save the torrent file")?;
        Ok(())
    })();
    if write_result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    write_result?;

    Ok(CreateTorrentSummary {
        output_path: output.to_string_lossy().into_owned(),
        info_hash,
        file_count,
        total_bytes,
        piece_length,
        tracker_count: trackers.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn creates_parseable_single_file_torrent_with_trackers() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("sample.txt");
        let output = directory.path().join("sample.torrent");
        std::fs::write(&source, b"Torrentory test payload").unwrap();
        let summary = create(CreateTorrentRequest {
            source_path: source.to_string_lossy().into_owned(),
            output_path: output.to_string_lossy().into_owned(),
            trackers: vec![
                "udp://tracker.opentrackr.org:1337/announce".into(),
                "https://tracker.example/announce".into(),
            ],
        })
        .await
        .unwrap();
        let bytes = std::fs::read(output).unwrap();
        let parsed = torrent_from_bytes::<ByteBuf>(&bytes).unwrap();
        assert_eq!(summary.info_hash, parsed.info_hash.as_string());
        assert_eq!(summary.file_count, 1);
        assert_eq!(summary.total_bytes, 23);
        assert_eq!(parsed.announce_list.len(), 2);
        assert_eq!(parsed.iter_announce().count(), 2);
    }

    #[test]
    fn rejects_unsafe_tracker_schemes() {
        assert!(normalize_trackers(vec!["file:///tmp/tracker".into()]).is_err());
        assert!(normalize_trackers(vec!["javascript:alert(1)".into()]).is_err());
    }
}
