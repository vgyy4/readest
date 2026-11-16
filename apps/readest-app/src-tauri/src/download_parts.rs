//! Downloads a file in 1 MB parts, several at a time (how many is adjusted while it goes, see
//! [`Adaptive`]), each part tried again if it fails.
//!
//! A download is only done when every part has arrived. (It used to skip a part that failed and
//! report success, leaving a book with a hole in it that would not open.)

use futures::stream::{FuturesUnordered, StreamExt};
use reqwest::Client;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::fs::File;
use tokio::io::{AsyncSeekExt, AsyncWriteExt};

pub const PART_SIZE: u64 = 1024 * 1024;
/// How many parts are in flight: it starts here and is adjusted between the two limits.
const START_PARTS: usize = 4;
const MIN_PARTS: usize = 2;
const MAX_PARTS: usize = 16;
/// How often the speed is looked at.
const WINDOW: Duration = Duration::from_secs(1);
const ATTEMPTS: u32 = 3;

/// One more is kept when the speed is at least this much better than before it.
const GAIN: f64 = 1.1;
/// The speed falling below this share of the best seen means there are too many.
const DROP: f64 = 0.7;
/// Windows to stay at a number that works before trying one more.
const HOLD_WINDOWS: u32 = 4;

#[derive(PartialEq, Clone, Copy, Debug)]
enum Mode {
    Probe,
    Hold,
}

/// How many parts to fetch at the same time, adjusted while they go. Too few leave the link idle
/// (each request waits for its own round trips); too many compete and fail. Every window the speed
/// is measured: one more is added while that clearly makes it faster, one fewer is used when the
/// speed falls, one more is tried again from time to time, and a failed request halves the number.
/// The app's JavaScript uploader and parallel-file downloader (src/libs/adaptiveLimit.ts) follow
/// the same rules; keep them alike.
#[derive(Debug)]
pub struct Adaptive {
    min: usize,
    max: usize,
    current: usize,
    mode: Mode,
    before_probe: f64,
    best: f64,
    held: u32,
    settling: u32,
}

impl Adaptive {
    pub fn new(min: usize, start: usize, max: usize) -> Self {
        let min = min.max(1);
        let max = max.max(min);
        Adaptive {
            min,
            max,
            current: start.clamp(min, max),
            mode: Mode::Probe,
            before_probe: 0.0,
            best: 0.0,
            held: 0,
            settling: 0,
        }
    }

    pub fn limit(&self) -> usize {
        self.current
    }

    fn change(&mut self, next: usize) {
        self.current = next;
        self.settling = 1;
    }

    fn hold(&mut self) {
        self.mode = Mode::Hold;
        self.held = 0;
    }

    /// Look at the speed (bytes a second over the last window); returns the number to use now.
    pub fn step(&mut self, rate: f64) -> usize {
        if self.settling > 0 {
            self.settling -= 1;
            return self.current;
        }
        if self.mode == Mode::Probe {
            if rate >= self.before_probe * GAIN {
                self.best = rate;
                if self.current < self.max {
                    self.before_probe = rate;
                    self.change(self.current + 1);
                } else {
                    self.hold();
                }
            } else {
                self.best = rate.max(self.before_probe);
                self.change(self.current.saturating_sub(1).max(self.min));
                self.hold();
            }
            return self.current;
        }
        if rate > self.best {
            self.best = rate;
        } else {
            self.best = rate.max(self.best * 0.98);
        }
        if rate < self.best * DROP && self.current > self.min {
            self.best = rate;
            self.change(self.current - 1);
            self.held = 0;
        } else {
            self.held += 1;
            if self.held >= HOLD_WINDOWS && self.current < self.max {
                self.mode = Mode::Probe;
                self.before_probe = rate;
                self.change(self.current + 1);
            }
        }
        self.current
    }

    /// A request failed: halve the number, and stay there a while.
    pub fn failed(&mut self) -> usize {
        let lower = (self.current / 2).max(self.min);
        if lower < self.current {
            self.change(lower);
        }
        self.hold();
        self.best = 0.0;
        self.current
    }
}

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
    struggling: &AtomicBool,
) -> Result<Vec<u8>, String> {
    let wanted = end - start + 1;
    let mut last = String::new();
    for attempt in 0..ATTEMPTS {
        if attempt > 0 {
            // A part that has to be asked for again is a sign there are too many at once.
            struggling.store(true, Ordering::Relaxed);
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

    // How many parts are in flight, adjusted every window from the speed the parts add up to.
    let limit = Arc::new(AtomicUsize::new(START_PARTS));
    let received = Arc::new(AtomicU64::new(0));
    let struggling = Arc::new(AtomicBool::new(false));
    let controller = {
        let (limit, received, struggling) = (limit.clone(), received.clone(), struggling.clone());
        tokio::spawn(async move {
            let mut adaptive = Adaptive::new(MIN_PARTS, START_PARTS, MAX_PARTS);
            let mut ticker = tokio::time::interval(WINDOW);
            ticker.tick().await;
            let mut last = (std::time::Instant::now(), 0u64);
            loop {
                ticker.tick().await;
                let now = std::time::Instant::now();
                let bytes = received.load(Ordering::Relaxed);
                let seconds = now.duration_since(last.0).as_secs_f64();
                let rate = if seconds > 0.0 {
                    (bytes - last.1) as f64 / seconds
                } else {
                    0.0
                };
                last = (now, bytes);
                let next = if struggling.swap(false, Ordering::Relaxed) {
                    adaptive.failed()
                } else {
                    adaptive.step(rate)
                };
                limit.store(next, Ordering::Relaxed);
            }
        })
    };

    let fetch_one = |index: u64| {
        let file = Arc::clone(&file);
        let failure = Arc::clone(&failure);
        let received = Arc::clone(&received);
        let struggling = Arc::clone(&struggling);
        async move {
            // Once one part has failed for good the download is lost: stop asking for more.
            if failure.lock().map(|f| f.is_some()).unwrap_or(true) {
                return;
            }
            let start = index * PART_SIZE;
            let end = (start + PART_SIZE - 1).min(total - 1);
            let outcome = match fetch_part(client, url, headers, start, end, &struggling).await {
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
                Ok(len) => {
                    received.fetch_add(len as u64, Ordering::Relaxed);
                    on_part(len)
                }
                Err(message) => {
                    if let Ok(mut slot) = failure.lock() {
                        slot.get_or_insert(message);
                    }
                }
            }
        }
    };

    let mut next = 0..total.div_ceil(PART_SIZE);
    let mut in_flight = FuturesUnordered::new();
    loop {
        let failed = failure.lock().map(|f| f.is_some()).unwrap_or(true);
        while !failed && in_flight.len() < limit.load(Ordering::Relaxed) {
            match next.next() {
                Some(index) => in_flight.push(fetch_one(index)),
                None => break,
            }
        }
        if in_flight.next().await.is_none() {
            break;
        }
    }
    controller.abort();

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

    /// Run `windows` windows of a link whose speed depends on how many parts are in flight.
    fn drive(
        adaptive: &mut Adaptive,
        speed_at: impl Fn(usize) -> f64,
        windows: usize,
    ) -> Vec<usize> {
        (0..windows)
            .map(|_| {
                adaptive.step(speed_at(adaptive.limit()));
                adaptive.limit()
            })
            .collect()
    }

    #[test]
    fn goes_up_while_each_one_more_makes_it_clearly_faster() {
        let mut a = Adaptive::new(1, 1, 6);
        drive(&mut a, |n| 100.0 * n as f64, 12);
        assert_eq!(a.limit(), 6);
    }

    #[test]
    fn settles_where_one_more_stops_helping() {
        let mut a = Adaptive::new(1, 1, 8);
        drive(&mut a, |n| (100.0 * n as f64).min(300.0), 14);
        assert!((3..=4).contains(&a.limit()), "{}", a.limit());
    }

    #[test]
    fn comes_down_when_too_many_make_everything_slower() {
        let mut a = Adaptive::new(1, 1, 8);
        drive(
            &mut a,
            |n| {
                if n <= 3 {
                    100.0 * n as f64
                } else {
                    300.0 - 80.0 * (n - 3) as f64
                }
            },
            30,
        );
        assert!((2..=4).contains(&a.limit()), "{}", a.limit());
    }

    #[test]
    fn follows_the_network_as_it_changes() {
        let mut a = Adaptive::new(1, 1, 8);
        drive(&mut a, |n| 100.0 * n as f64, 12);
        let high = a.limit();
        assert!(high >= 5);
        drive(&mut a, |n| (100.0 - 25.0 * (n as f64 - 1.0)).max(40.0), 40);
        assert!(a.limit() < high);
        drive(&mut a, |n| 100.0 * n as f64, 40);
        assert!(a.limit() >= 5);
    }

    #[test]
    fn halves_on_a_failure_and_stays_within_its_limits() {
        let mut a = Adaptive::new(2, 8, 16);
        assert_eq!(a.failed(), 4);
        assert_eq!(a.failed(), 2);
        assert_eq!(a.failed(), 2);
        let top = drive(&mut Adaptive::new(2, 2, 5), |n| 1000.0 * n as f64, 40);
        assert_eq!(*top.iter().max().unwrap(), 5);
        assert!(*top.iter().min().unwrap() >= 2);
    }

    #[test]
    fn ignores_the_window_in_which_it_changed() {
        let mut a = Adaptive::new(1, 1, 4);
        a.step(100.0);
        assert_eq!(a.limit(), 2);
        assert_eq!(a.step(0.0), 2);
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
