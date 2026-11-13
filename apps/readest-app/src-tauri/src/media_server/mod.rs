mod core;

use std::sync::OnceLock;
use tauri::{command, AppHandle};

static SERVER: OnceLock<core::MediaServer> = OnceLock::new();

/// A streaming `http://127.0.0.1` address for an audio file in the app's storage, with Range
/// support, for the player's `<audio>` element (iOS cannot play from the asset protocol).
#[command]
pub fn serve_media_file(
    app: AppHandle,
    file_path: String,
    mime_type: String,
) -> Result<String, String> {
    crate::transfer_file::ensure_path_allowed(&app, &file_path).map_err(|e| e.to_string())?;
    let server = match SERVER.get() {
        Some(server) => server,
        None => {
            let started = core::MediaServer::start().map_err(|e| e.to_string())?;
            SERVER.get_or_init(|| started)
        }
    };
    Ok(server.register(std::path::PathBuf::from(file_path), mime_type))
}
