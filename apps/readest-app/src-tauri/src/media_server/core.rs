//! A tiny loopback HTTP server that streams local audio files with `Range` support.
//!
//! Why: iOS's web view cannot play audio from Tauri's custom `asset://` addresses, and
//! reading a whole audiobook through the app bridge into a Blob takes minutes and gigabytes
//! of memory on an old iPad. An `<audio>` element pointed at `http://127.0.0.1:<port>/…`
//! instead streams and seeks like any web audio (iOS does not apply App Transport Security to
//! IP addresses). The server only answers for files the app registered, under random tokens,
//! and only on the loopback interface. Plain `std`, no async runtime and no extra crates.

use std::collections::hash_map::RandomState;
use std::collections::HashMap;
use std::fs::File;
use std::hash::{BuildHasher, Hasher};
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4, TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

const CHUNK: usize = 64 * 1024;
const MAX_HEADER_BYTES: usize = 16 * 1024;

struct Entry {
    path: PathBuf,
    mime: String,
}

#[derive(Clone)]
pub struct MediaServer {
    port: u16,
    files: Arc<Mutex<HashMap<String, Entry>>>,
}

/// An inclusive byte range, resolved against the file length.
#[derive(Debug, PartialEq, Eq)]
pub enum RangeSpec {
    /// No `Range` header: the whole file.
    Whole,
    Bytes { start: u64, end: u64 },
    /// The range cannot be satisfied (416).
    Unsatisfiable,
}

/// `bytes=START-END`, `bytes=START-` or `bytes=-SUFFIX` against a file of `len` bytes.
pub fn parse_range(header: Option<&str>, len: u64) -> RangeSpec {
    let Some(value) = header else {
        return RangeSpec::Whole;
    };
    let Some(spec) = value.trim().strip_prefix("bytes=") else {
        return RangeSpec::Whole;
    };
    // Only the first range of a multi-range request is served.
    let first = spec.split(',').next().unwrap_or("").trim();
    let Some((from, to)) = first.split_once('-') else {
        return RangeSpec::Whole;
    };
    if len == 0 {
        return RangeSpec::Unsatisfiable;
    }
    let (start, end) = if from.is_empty() {
        // Suffix: the last N bytes.
        let Ok(suffix) = to.parse::<u64>() else {
            return RangeSpec::Whole;
        };
        if suffix == 0 {
            return RangeSpec::Unsatisfiable;
        }
        (len.saturating_sub(suffix), len - 1)
    } else {
        let Ok(start) = from.parse::<u64>() else {
            return RangeSpec::Whole;
        };
        let end = if to.is_empty() {
            len - 1
        } else {
            match to.parse::<u64>() {
                Ok(end) => end.min(len - 1),
                Err(_) => return RangeSpec::Whole,
            }
        };
        (start, end)
    };
    if start >= len || start > end {
        return RangeSpec::Unsatisfiable;
    }
    RangeSpec::Bytes { start, end }
}

fn random_token() -> String {
    // Two independently seeded SipHash states, mixed with the clock: unguessable enough for a
    // loopback-only address that is also useless without a registered file.
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let mut out = String::new();
    for salt in 0u8..2 {
        let mut hasher = RandomState::new().build_hasher();
        hasher.write(&nanos.to_le_bytes());
        hasher.write_u8(salt);
        out.push_str(&format!("{:016x}", hasher.finish()));
    }
    out
}

struct Request {
    method: String,
    target: String,
    range: Option<String>,
}

fn read_request(stream: &TcpStream) -> Option<Request> {
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    reader.read_line(&mut line).ok()?;
    let mut parts = line.split_whitespace();
    let method = parts.next()?.to_string();
    let target = parts.next()?.to_string();
    let mut range = None;
    let mut total = line.len();
    loop {
        let mut header = String::new();
        let n = reader.read_line(&mut header).ok()?;
        total += n;
        if n == 0 || header == "\r\n" || header == "\n" {
            break;
        }
        if total > MAX_HEADER_BYTES {
            return None;
        }
        if let Some((name, value)) = header.split_once(':') {
            if name.trim().eq_ignore_ascii_case("range") {
                range = Some(value.trim().to_string());
            }
        }
    }
    Some(Request {
        method,
        target,
        range,
    })
}

fn respond_text(stream: &mut TcpStream, status: &str, extra: &str) {
    let _ = write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Length: 0\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n{extra}\r\n"
    );
}

impl MediaServer {
    /// Start listening on a free loopback port.
    pub fn start() -> std::io::Result<Self> {
        let listener = TcpListener::bind(SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0)))?;
        let port = listener.local_addr()?.port();
        let server = MediaServer {
            port,
            files: Arc::new(Mutex::new(HashMap::new())),
        };
        let shared = server.clone();
        thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let server = shared.clone();
                thread::spawn(move || server.handle(stream));
            }
        });
        Ok(server)
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    /// Serve `path` as `mime`; returns the URL to hand to an `<audio>` element.
    pub fn register(&self, path: PathBuf, mime: String) -> String {
        let token = random_token();
        self.files
            .lock()
            .unwrap()
            .insert(token.clone(), Entry { path, mime });
        format!("http://127.0.0.1:{}/{}/audio", self.port, token)
    }

    fn handle(&self, mut stream: TcpStream) {
        let _ = stream.set_read_timeout(Some(Duration::from_secs(30)));
        let _ = stream.set_write_timeout(Some(Duration::from_secs(60)));
        let Some(request) = read_request(&stream) else {
            return respond_text(&mut stream, "400 Bad Request", "");
        };
        if request.method == "OPTIONS" {
            return respond_text(
                &mut stream,
                "204 No Content",
                "Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\nAccess-Control-Allow-Headers: Range\r\n",
            );
        }
        if request.method != "GET" && request.method != "HEAD" {
            return respond_text(&mut stream, "405 Method Not Allowed", "");
        }
        let token = request
            .target
            .trim_start_matches('/')
            .split('/')
            .next()
            .unwrap_or("")
            .to_string();
        let entry = {
            let files = self.files.lock().unwrap();
            files.get(&token).map(|e| (e.path.clone(), e.mime.clone()))
        };
        let Some((path, mime)) = entry else {
            return respond_text(&mut stream, "404 Not Found", "");
        };
        let Ok(mut file) = File::open(&path) else {
            return respond_text(&mut stream, "404 Not Found", "");
        };
        let len = file.metadata().map(|m| m.len()).unwrap_or(0);
        let (status, start, end, content_range) = match parse_range(request.range.as_deref(), len) {
            RangeSpec::Whole => ("200 OK", 0, len.saturating_sub(1), String::new()),
            RangeSpec::Bytes { start, end } => (
                "206 Partial Content",
                start,
                end,
                format!("Content-Range: bytes {start}-{end}/{len}\r\n"),
            ),
            RangeSpec::Unsatisfiable => {
                return respond_text(
                    &mut stream,
                    "416 Range Not Satisfiable",
                    &format!("Content-Range: bytes */{len}\r\n"),
                )
            }
        };
        let body_len = if len == 0 { 0 } else { end - start + 1 };
        let head = format!(
            "HTTP/1.1 {status}\r\nContent-Type: {mime}\r\nContent-Length: {body_len}\r\n{content_range}Accept-Ranges: bytes\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n"
        );
        if stream.write_all(head.as_bytes()).is_err() || request.method == "HEAD" || body_len == 0 {
            return;
        }
        if file.seek(SeekFrom::Start(start)).is_err() {
            return;
        }
        let mut remaining = body_len;
        let mut buffer = vec![0u8; CHUNK];
        while remaining > 0 {
            let want = remaining.min(CHUNK as u64) as usize;
            match file.read(&mut buffer[..want]) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    // The player closes the connection when it seeks: stop quietly.
                    if stream.write_all(&buffer[..n]).is_err() {
                        break;
                    }
                    remaining -= n as u64;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn whole_file_without_a_range_header() {
        assert_eq!(parse_range(None, 100), RangeSpec::Whole);
        assert_eq!(parse_range(Some("items=0-5"), 100), RangeSpec::Whole);
    }

    #[test]
    fn closed_open_and_suffix_ranges() {
        assert_eq!(parse_range(Some("bytes=0-9"), 100), RangeSpec::Bytes { start: 0, end: 9 });
        assert_eq!(parse_range(Some("bytes=90-"), 100), RangeSpec::Bytes { start: 90, end: 99 });
        assert_eq!(parse_range(Some("bytes=-10"), 100), RangeSpec::Bytes { start: 90, end: 99 });
        assert_eq!(parse_range(Some("bytes=-500"), 100), RangeSpec::Bytes { start: 0, end: 99 });
        // An end past the file is clamped to its last byte.
        assert_eq!(parse_range(Some("bytes=50-999"), 100), RangeSpec::Bytes { start: 50, end: 99 });
        // Only the first of several ranges is served.
        assert_eq!(parse_range(Some("bytes=0-4, 10-14"), 100), RangeSpec::Bytes { start: 0, end: 4 });
    }

    #[test]
    fn unsatisfiable_ranges() {
        assert_eq!(parse_range(Some("bytes=100-"), 100), RangeSpec::Unsatisfiable);
        assert_eq!(parse_range(Some("bytes=20-10"), 100), RangeSpec::Unsatisfiable);
        assert_eq!(parse_range(Some("bytes=-0"), 100), RangeSpec::Unsatisfiable);
        assert_eq!(parse_range(Some("bytes=0-5"), 0), RangeSpec::Unsatisfiable);
    }

    #[test]
    fn tokens_differ() {
        assert_ne!(random_token(), random_token());
        assert_eq!(random_token().len(), 32);
    }
}
