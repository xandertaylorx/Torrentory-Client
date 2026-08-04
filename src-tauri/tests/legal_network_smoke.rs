use torrentory_client_lib::engine::{
    rqbit::RqbitEngine, AddRequest, SourceKind, TorrentEngine, TorrentSource,
};

/// Opt-in because it contacts the public BitTorrent network and briefly writes payload data.
/// Run with TORRENTORY_TEST_TORRENT pointing to a legal Linux-distribution .torrent file.
#[tokio::test]
#[ignore = "requires a legal torrent file and network access"]
async fn legal_torrent_add_pause_resume_remove_flow() {
    let torrent = std::env::var("TORRENTORY_TEST_TORRENT")
        .expect("set TORRENTORY_TEST_TORRENT to a legal .torrent file");
    let root =
        std::env::temp_dir().join(format!("torrentory-network-smoke-{}", std::process::id()));
    let downloads = root.join("downloads");
    let session = root.join("session");
    std::fs::create_dir_all(&downloads).unwrap();

    let engine = RqbitEngine::new(downloads.clone(), session, 45100)
        .await
        .unwrap();
    let source = TorrentSource {
        kind: SourceKind::File,
        value: torrent,
    };
    let inspected = engine
        .inspect(source.clone(), downloads.to_string_lossy().into_owned())
        .await
        .unwrap();
    assert!(inspected.pointer("/details/files").is_some());

    let added = engine
        .add(AddRequest {
            source,
            destination: downloads.to_string_lossy().into_owned(),
            file_indices: Vec::new(),
        })
        .await
        .unwrap();
    let id = added.get("id").and_then(|value| value.as_u64()).unwrap() as usize;
    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    engine.pause(id).await.unwrap();
    engine.resume(id).await.unwrap();
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    engine.pause(id).await.unwrap();

    let list = engine.list().await.unwrap();
    assert_eq!(
        list.pointer("/torrents/0/stats/state")
            .and_then(|value| value.as_str()),
        Some("paused")
    );
    engine.remove(id, true).await.unwrap();
    let _ = std::fs::remove_dir_all(root);
}
