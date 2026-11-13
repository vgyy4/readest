//! Downloads a file in 1 MB parts, several at a time, each part tried again if it fails.
//!
//! A download is only done when every part has arrived. (It used to skip a part that failed and
//! report success, leaving a book with a hole in it that would not open.)

use futures::stream::{self, StreamExt};
use reqwest::Client;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::fs::File;
use tokio::io::{AsyncSeekExt, AsyncWriteExt};

pub const PART_SIZE: u64 = 1024 * 1024;
const PARALLEL_PARTS: usize = 8;
const ATTEMPTS: u32 = 3;

/// An error page can be long and full of markup; keep the part worth showing.
pub fn tidy_body(body: &str) -> String {
    body.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(160)
        .collect()
}

/// A short, readable cause for a response that was not a success.
pub fn describe_status(status: u16, body: &str) -> String {
    let text = tidy_body(body);
    if text.is_empty() {
        format!("request failed with status code {status}")
    } else {
        format!("request failed with status code {status}: {text}")
    }
}

async fn fetch_part(
    client: &Client,
    url: &str,
    headers: &HashMap<String, String>,
    start: u64,
    end: u64,
) -> Result<Vec<u8>, String> {
    let wanted = end - start + 1;
    let mut last = String::new();
    for attempt in 0..ATTEMPTS {
        if attempt > 0 {
            tokio::time::sleep(Duration::from_millis(300 * (1 << attempt))).await;
        }
        let mut request = client
            .get(url)
            .header("Range", format!("bytes={start}-{end}"));
        for (key, value) in headers {
            request = request.header(key, value);
        }
        match request.send().await {
            Ok(response) if response.status().is_success() => match response.bytes().await {
                Ok(bytes) if bytes.len() as u64 == wanted => return Ok(bytes.to_vec()),
                Ok(bytes) => {
                    last = format!(
                        "a part of the file came back {} bytes long instead of {wanted} (the server may not support partial downloads)",
                        bytes.len()
                    )
                }
                Err(error) => last = error.to_string(),
            },
            Ok(response) => {
                let status = response.status().as_u16();
                let body = response.text().await.unwrap_or_default();
                last = describe_status(status, &body);
            }
            Err(error) => last = error.to_string(),
        }
    }
    Err(last)
}

/// Fetch `total` bytes of `url` into `file_path`. `on_part` is called with the length of each part
/// as it lands. On any failure the half-written file is removed and the cause is returned.
pub async fn download_in_parts<F>(
    client: &Client,
    url: &str,
    file_path: &str,
    headers: &HashMap<String, String>,
    total: u64,
    on_part: F,
) -> Result<(), String>
where
    F: Fn(usize) + Send + Sync,
{
    let file = File::create(file_path).await.map_err(|e| e.to_string())?;
    file.set_len(total).await.map_err(|e| e.to_string())?;
    let file = Arc::new(tokio::sync::Mutex::new(file));
    let failure: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let on_part = &on_part;

    stream::iter(0..total.div_ceil(PART_SIZE))
        .for_each_concurrent(PARALLEL_PARTS, |index| {
            let file = Arc::clone(&file);
            let failure = Arc::clone(&failure);
            async move {
                // Once one part has failed for good the download is lost: stop asking for more.
                if failure.lock().map(|f| f.is_some()).unwrap_or(true) {
                    return;
                }
                let start = index * PART_SIZE;
                let end = (start + PART_SIZE - 1).min(total - 1);
                let outcome = match fetch_part(client, url, headers, start, end).await {
                    Ok(bytes) => {
                        let mut file = file.lock().await;
                        match file.seek(std::io::SeekFrom::Start(start)).await {
                            Ok(_) => file.write_all(&bytes).await.map(|_| bytes.len()),
                            Err(error) => Err(error),
                        }
                        .map_err(|e| e.to_string())
                    }
                    Err(message) => Err(message),
                };
                match outcome {
                    Ok(len) => on_part(len),
                    Err(message) => {
                        if let Ok(mut slot) = failure.lock() {
                            slot.get_or_insert(message);
                        }
                    }
                }
            }
        })
        .await;

    let message = failure.lock().ok().and_then(|mut f| f.take());
    if let Some(message) = message {
        drop(file);
        let _ = tokio::fs::remove_file(file_path).await;
        return Err(message);
    }
    let mut file = file.lock().await;
    file.flush().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::atomic::{AtomicUsize, Ordering};

    /// How the test server treats requests for a part.
    #[derive(Clone, Copy)]
    enum Behaviour {
        Fine,
        /// The first `n` requests for this part number fail with 500, then it works.
        FailFirst {
            part: u64,
            times: usize,
        },
        /// Every request for this part fails with 403.
        AlwaysRefuse {
            part: u64,
        },
        /// The server ignores Range and sends the whole file with 200.
        IgnoreRange,
    }

    fn content(len: usize) -> Vec<u8> {
        (0..len).map(|i| (i % 251) as u8).collect()
    }

    fn serve(data: Vec<u8>, behaviour: Behaviour) -> (String, Arc<AtomicUsize>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let hits = Arc::new(AtomicUsize::new(0));
        let counted = hits.clone();
        std::thread::spawn(move || {
            let failures = Arc::new(AtomicUsize::new(0));
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { continue };
                let data = data.clone();
                let failures = failures.clone();
                let counted = counted.clone();
                std::thread::spawn(move || {
                    let mut buffer = [0u8; 4096];
                    let read = stream.read(&mut buffer).unwrap_or(0);
                    let request = String::from_utf8_lossy(&buffer[..read]).to_string();
                    counted.fetch_add(1, Ordering::SeqCst);
                    let range = request.lines().find_map(|l| {
                        l.to_lowercase()
                            .strip_prefix("range: bytes=")
                            .map(String::from)
                    });
                    let (start, end) = match range.as_ref().and_then(|r| r.split_once('-')) {
                        Some((a, b)) => (
                            a.trim().parse::<u64>().unwrap(),
                            b.trim().parse::<u64>().unwrap(),
                        ),
                        None => (0, data.len() as u64 - 1),
                    };
                    let part = start / PART_SIZE;
                    let respond = |stream: &mut std::net::TcpStream,
                                   status: &str,
                                   extra: &str,
                                   body: &[u8]| {
                        let head = format!(
                            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n{extra}\r\n",
                            body.len()
                        );
                        let _ = stream.write_all(head.as_bytes());
                        let _ = stream.write_all(body);
                    };
                    match behaviour {
                        Behaviour::FailFirst { part: p, times }
                            if p == part && failures.fetch_add(1, Ordering::SeqCst) < times =>
                        {
                            respond(&mut stream, "500 Internal Server Error", "", b"oops");
                            return;
                        }
                        Behaviour::AlwaysRefuse { part: p } if p == part && start > 0 => {
                            respond(
                                &mut stream,
                                "403 Forbidden",
                                "",
                                b"<html>Access denied</html>",
                            );
                            return;
                        }
                        Behaviour::IgnoreRange if start > 0 => {
                            respond(&mut stream, "200 OK", "", &data);
                            return;
                        }
                        _ => {}
                    }
                    let end = end.min(data.len() as u64 - 1);
                    let body = &data[start as usize..=end as usize];
                    let extra = format!(
                        "Content-Range: bytes {start}-{end}/{}\r\nAccept-Ranges: bytes\r\n",
                        data.len()
                    );
                    respond(&mut stream, "206 Partial Content", &extra, body);
                });
            }
        });
        (format!("http://{address}/file"), hits)
    }

    fn temp_path(name: &str) -> String {
        let dir = std::env::temp_dir().join(format!("dl-parts-{}-{name}", std::process::id()));
        dir.to_string_lossy().to_string()
    }

    async fn run(
        data: &[u8],
        behaviour: Behaviour,
        name: &str,
    ) -> (Result<(), String>, String, usize) {
        let (url, _hits) = serve(data.to_vec(), behaviour);
        let path = temp_path(name);
        let transferred = Arc::new(AtomicUsize::new(0));
        let seen = transferred.clone();
        let result = download_in_parts(
            &Client::new(),
            &url,
            &path,
            &HashMap::new(),
            data.len() as u64,
            move |len| {
                seen.fetch_add(len, Ordering::SeqCst);
            },
        )
        .await;
        (result, path, transferred.load(Ordering::SeqCst))
    }

    #[tokio::test]
    async fn downloads_a_file_of_several_parts_exactly() {
        let data = content(5 * 1024 * 1024 + 123);
        let (result, path, transferred) = run(&data, Behaviour::Fine, "ok").await;
        assert_eq!(result, Ok(()));
        assert_eq!(std::fs::read(&path).unwrap(), data);
        assert_eq!(transferred, data.len());
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn downloads_a_file_smaller_than_one_part() {
        let data = content(777);
        let (result, path, _) = run(&data, Behaviour::Fine, "tiny").await;
        assert_eq!(result, Ok(()));
        assert_eq!(std::fs::read(&path).unwrap(), data);
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn a_part_that_fails_twice_is_tried_again_and_the_file_is_complete() {
        let data = content(4 * 1024 * 1024);
        let (result, path, _) =
            run(&data, Behaviour::FailFirst { part: 2, times: 2 }, "retry").await;
        assert_eq!(result, Ok(()));
        assert_eq!(std::fs::read(&path).unwrap(), data);
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn a_part_that_cannot_be_fetched_fails_the_download_and_leaves_no_broken_file() {
        let data = content(4 * 1024 * 1024);
        let (result, path, _) = run(&data, Behaviour::AlwaysRefuse { part: 2 }, "refuse").await;
        let error = result.unwrap_err();
        assert!(
            error.contains("403"),
            "the cause should name the status: {error}"
        );
        assert!(
            error.contains("Access denied"),
            "and what the server said: {error}"
        );
        assert!(
            !std::path::Path::new(&path).exists(),
            "a half-filled file must not be left behind"
        );
    }

    #[tokio::test]
    async fn a_server_that_ignores_range_is_an_error_not_a_silently_wrong_file() {
        let data = content(3 * 1024 * 1024);
        let (result, path, _) = run(&data, Behaviour::IgnoreRange, "norange").await;
        let error = result.unwrap_err();
        assert!(error.contains("instead of"), "{error}");
        assert!(!std::path::Path::new(&path).exists());
    }

    #[test]
    fn describes_a_refusal_briefly() {
        assert_eq!(
            describe_status(404, ""),
            "request failed with status code 404"
        );
        let long = "x ".repeat(500);
        assert!(describe_status(403, &long).len() < 200);
        assert_eq!(
            describe_status(403, "<html>\n  Access   denied\n</html>"),
            "request failed with status code 403: <html> Access denied </html>"
        );
    }
}
