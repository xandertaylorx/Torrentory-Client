use std::{io::SeekFrom, net::Ipv4Addr};

use axum::{
    body::Body,
    extract::{Path, State},
    http::{
        header::{
            ACCEPT_RANGES, ACCESS_CONTROL_ALLOW_HEADERS, ACCESS_CONTROL_ALLOW_METHODS,
            ACCESS_CONTROL_ALLOW_ORIGIN, ACCESS_CONTROL_EXPOSE_HEADERS, CACHE_CONTROL,
            CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE, RANGE,
        },
        HeaderMap, HeaderValue, StatusCode,
    },
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use librqbit::{api::TorrentIdOrHash, Api};
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;
use uuid::Uuid;

#[derive(Clone)]
struct MediaState {
    api: Api,
    token: String,
}

pub async fn start(api: Api) -> anyhow::Result<String> {
    let listener = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await?;
    let address = listener.local_addr()?;
    let token = Uuid::new_v4().simple().to_string();
    let state = MediaState {
        api,
        token: token.clone(),
    };
    let router = Router::new()
        .route(
            "/media/{token}/{torrent_id}/{file_id}",
            get(stream_file).options(preflight),
        )
        .with_state(state);

    tokio::spawn(async move {
        if let Err(error) = axum::serve(listener, router).await {
            eprintln!("media stream server stopped: {error:#}");
        }
    });

    Ok(format!("http://{address}/media/{token}"))
}

async fn preflight() -> Response {
    let mut response = StatusCode::NO_CONTENT.into_response();
    response
        .headers_mut()
        .insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
    response.headers_mut().insert(
        ACCESS_CONTROL_ALLOW_METHODS,
        HeaderValue::from_static("GET, HEAD, OPTIONS"),
    );
    response.headers_mut().insert(
        ACCESS_CONTROL_ALLOW_HEADERS,
        HeaderValue::from_static("Range"),
    );
    response
}

async fn stream_file(
    State(state): State<MediaState>,
    Path((token, torrent_id, file_id)): Path<(String, usize, usize)>,
    headers: HeaderMap,
) -> Response {
    if token != state.token {
        return error_response(StatusCode::NOT_FOUND, "Media stream not found");
    }

    let torrent = TorrentIdOrHash::Id(torrent_id);
    let mut stream = match state.api.api_stream(torrent, file_id) {
        Ok(stream) => stream,
        Err(error) => return error_response(StatusCode::NOT_FOUND, &error.to_string()),
    };
    let total = stream.len();
    let (start, end, status) = match requested_range(headers.get(RANGE), total) {
        Ok(range) => range,
        Err(()) => {
            let mut response = error_response(StatusCode::RANGE_NOT_SATISFIABLE, "Invalid range");
            if let Ok(value) = HeaderValue::from_str(&format!("bytes */{total}")) {
                response.headers_mut().insert(CONTENT_RANGE, value);
            }
            return response;
        }
    };

    if let Err(error) = stream.seek(SeekFrom::Start(start)).await {
        return error_response(StatusCode::INTERNAL_SERVER_ERROR, &error.to_string());
    }

    let content_length = end.saturating_sub(start).saturating_add(1);
    let body = Body::from_stream(ReaderStream::with_capacity(
        stream.take(content_length),
        64 * 1024,
    ));
    let mut response = Response::builder().status(status).body(body).unwrap();
    let output = response.headers_mut();
    output.insert(ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    output.insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    output.insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
    output.insert(
        ACCESS_CONTROL_EXPOSE_HEADERS,
        HeaderValue::from_static("Accept-Ranges, Content-Length, Content-Range"),
    );
    if let Ok(value) = HeaderValue::from_str(&content_length.to_string()) {
        output.insert(CONTENT_LENGTH, value);
    }
    if status == StatusCode::PARTIAL_CONTENT {
        if let Ok(value) = HeaderValue::from_str(&format!("bytes {start}-{end}/{total}")) {
            output.insert(CONTENT_RANGE, value);
        }
    }
    if let Ok(mime) = state.api.torrent_file_mime_type(torrent, file_id) {
        output.insert(CONTENT_TYPE, HeaderValue::from_static(mime));
    }
    response
}

fn requested_range(value: Option<&HeaderValue>, total: u64) -> Result<(u64, u64, StatusCode), ()> {
    if total == 0 {
        return Err(());
    }
    let Some(value) = value else {
        return Ok((0, total - 1, StatusCode::OK));
    };
    let value = value.to_str().map_err(|_| ())?;
    let range = value.strip_prefix("bytes=").ok_or(())?;
    if range.contains(',') {
        return Err(());
    }
    let (start, end) = range.split_once('-').ok_or(())?;
    let (start, end) = if start.is_empty() {
        let suffix = end.parse::<u64>().map_err(|_| ())?.min(total);
        if suffix == 0 {
            return Err(());
        }
        (total - suffix, total - 1)
    } else {
        let start = start.parse::<u64>().map_err(|_| ())?;
        let end = if end.is_empty() {
            total - 1
        } else {
            end.parse::<u64>().map_err(|_| ())?.min(total - 1)
        };
        (start, end)
    };
    if start >= total || end < start {
        return Err(());
    }
    Ok((start, end, StatusCode::PARTIAL_CONTENT))
}

fn error_response(status: StatusCode, message: &str) -> Response {
    let mut response = (status, message.to_owned()).into_response();
    response
        .headers_mut()
        .insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
    response.headers_mut().insert(
        ACCESS_CONTROL_ALLOW_METHODS,
        HeaderValue::from_static("GET, HEAD, OPTIONS"),
    );
    response.headers_mut().insert(
        ACCESS_CONTROL_ALLOW_HEADERS,
        HeaderValue::from_static("Range"),
    );
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    use anyhow::Context;
    use librqbit::{
        create_torrent, AddTorrent, AddTorrentOptions, CreateTorrentOptions, Session,
        SessionOptions,
    };
    use std::time::Duration;
    use tempfile::TempDir;
    use tokio::time::timeout;

    #[test]
    fn parses_media_byte_ranges() {
        let header = HeaderValue::from_static("bytes=10-19");
        assert_eq!(
            requested_range(Some(&header), 100),
            Ok((10, 19, StatusCode::PARTIAL_CONTENT))
        );
        let suffix = HeaderValue::from_static("bytes=-10");
        assert_eq!(
            requested_range(Some(&suffix), 100),
            Ok((90, 99, StatusCode::PARTIAL_CONTENT))
        );
        let open = HeaderValue::from_static("bytes=95-");
        assert_eq!(
            requested_range(Some(&open), 100),
            Ok((95, 99, StatusCode::PARTIAL_CONTENT))
        );
    }

    #[test]
    fn rejects_invalid_media_byte_ranges() {
        let invalid = HeaderValue::from_static("bytes=100-101");
        assert!(requested_range(Some(&invalid), 100).is_err());
        let multiple = HeaderValue::from_static("bytes=0-1,4-5");
        assert!(requested_range(Some(&multiple), 100).is_err());
    }

    #[tokio::test]
    async fn serves_bounded_ranges_from_rqbit_file_streams() -> anyhow::Result<()> {
        let root = TempDir::with_prefix("torrentory-media-stream")?;
        let media_path = root.path().join("sample.mp4");
        let content = (0_u8..=127).collect::<Vec<_>>();
        std::fs::write(&media_path, &content)?;
        let torrent = create_torrent(&media_path, CreateTorrentOptions::default()).await?;
        let session = Session::new_with_opts(
            root.path().into(),
            SessionOptions {
                disable_dht: true,
                persistence: None,
                listen_port_range: None,
                enable_upnp_port_forwarding: false,
                ..Default::default()
            },
        )
        .await?;
        let handle = session
            .add_torrent(
                AddTorrent::from_bytes(torrent.as_bytes()?),
                Some(AddTorrentOptions {
                    output_folder: Some(root.path().to_string_lossy().into_owned()),
                    overwrite: true,
                    ..Default::default()
                }),
            )
            .await?
            .into_handle()
            .context("expected torrent handle")?;
        timeout(Duration::from_secs(5), handle.wait_until_completed()).await??;
        let id = handle.id();
        let base_url = start(Api::new(session, None)).await?;

        let response = reqwest::Client::new()
            .get(format!("{base_url}/{id}/0"))
            .header(RANGE, "bytes=10-19")
            .send()
            .await?;
        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(response.headers()[CONTENT_RANGE], "bytes 10-19/128");
        assert_eq!(response.bytes().await?.as_ref(), &content[10..20]);
        Ok(())
    }
}
