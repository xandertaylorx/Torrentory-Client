use std::{
    collections::VecDeque,
    path::{Path, PathBuf},
    sync::Mutex,
};

use tauri::{AppHandle, Emitter, Manager, Runtime, State};

#[derive(Default)]
pub struct OpenSourceState {
    pending: Mutex<VecDeque<String>>,
}

pub fn enqueue<R, I, S>(app: &AppHandle<R>, values: I, cwd: Option<&Path>)
where
    R: Runtime,
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let state = app.state::<OpenSourceState>();
    let mut pending = state.pending.lock().expect("open source queue poisoned");
    let mut added = false;

    for value in values {
        if let Some(source) = normalize(value.as_ref(), cwd) {
            if !pending.contains(&source) {
                pending.push_back(source);
                added = true;
            }
        }
    }
    drop(pending);

    if added {
        let _ = app.emit("torrentory://open-source-available", ());
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }
}

#[tauri::command]
pub fn take_pending_open_sources(state: State<'_, OpenSourceState>) -> Vec<String> {
    state
        .pending
        .lock()
        .expect("open source queue poisoned")
        .drain(..)
        .collect()
}

fn normalize(value: &str, cwd: Option<&Path>) -> Option<String> {
    let value = value.trim().trim_matches('"');
    if value.is_empty() {
        return None;
    }

    // url::Url interprets a Windows drive letter as a URI scheme, so recognize
    // drive paths before attempting URL parsing.
    let is_windows_drive_path = value.as_bytes().get(1) == Some(&b':')
        && value
            .as_bytes()
            .first()
            .is_some_and(|letter| letter.is_ascii_alphabetic());
    if is_windows_drive_path {
        return torrent_path(PathBuf::from(value));
    }

    if let Ok(url) = url::Url::parse(value) {
        if url.scheme().eq_ignore_ascii_case("magnet") {
            return Some(value.to_owned());
        }
        if url.scheme().eq_ignore_ascii_case("file") {
            return url.to_file_path().ok().and_then(torrent_path);
        }
        return None;
    }

    let path = PathBuf::from(value);
    let path = if path.is_absolute() {
        path
    } else {
        cwd.unwrap_or_else(|| Path::new(".")).join(path)
    };
    torrent_path(path)
}

fn torrent_path(path: PathBuf) -> Option<String> {
    path.extension()
        .and_then(|extension| extension.to_str())
        .filter(|extension| extension.eq_ignore_ascii_case("torrent"))
        .map(|_| path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::normalize;
    use std::path::Path;

    #[test]
    fn accepts_magnet_links() {
        assert_eq!(
            normalize("magnet:?xt=urn:btih:abc", None).as_deref(),
            Some("magnet:?xt=urn:btih:abc")
        );
    }

    #[test]
    fn accepts_torrent_paths_case_insensitively() {
        assert_eq!(
            normalize("release.TORRENT", Some(Path::new("/tmp"))).as_deref(),
            Some("/tmp/release.TORRENT")
        );
    }

    #[test]
    fn accepts_windows_drive_paths() {
        assert_eq!(
            normalize(r"C:\Users\Xander\My Release.torrent", None).as_deref(),
            Some(r"C:\Users\Xander\My Release.torrent")
        );
    }

    #[test]
    fn decodes_file_urls() {
        assert_eq!(
            normalize("file:///tmp/My%20Release.torrent", None).as_deref(),
            Some("/tmp/My Release.torrent")
        );
    }

    #[test]
    fn ignores_unrelated_inputs() {
        assert_eq!(normalize("https://example.com/file.torrent", None), None);
        assert_eq!(normalize("/tmp/readme.txt", None), None);
    }
}
