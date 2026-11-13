//! Tells the app when files appear, change or go in the folders it watches for books, using the
//! system's own change notifications (inotify on Android and Linux, FSEvents on macOS and
//! ReadDirectoryChangesW on Windows) instead of looking again and again. The app scans the
//! folders when told, and also when it starts and comes back to the front.

#[cfg(not(target_os = "ios"))]
mod core {
    use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
    use std::path::PathBuf;
    use std::sync::mpsc::{self, RecvTimeoutError, Sender};
    use std::thread::JoinHandle;
    use std::time::Duration;

    /// Only changes to the folder's content matter. Reading a file raises "access" events, and the
    /// scan that follows a change reads files: counting those would make it loop forever.
    pub fn is_relevant(kind: &EventKind) -> bool {
        matches!(
            kind,
            EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(_)
        )
    }

    /// A running watch. Dropping it stops watching and ends its thread.
    pub struct FolderWatch {
        _watcher: RecommendedWatcher,
        stop: Sender<()>,
        thread: Option<JoinHandle<()>>,
    }

    impl Drop for FolderWatch {
        fn drop(&mut self) {
            let _ = self.stop.send(());
            if let Some(thread) = self.thread.take() {
                let _ = thread.join();
            }
        }
    }

    enum Message {
        Changed,
        Stop,
    }

    /// Watch `paths` (and everything below them). `on_change` is called once the folders have been
    /// quiet for `quiet`, however many files changed meanwhile: a book being copied in raises many
    /// events, and it is only complete once they stop.
    pub fn watch<F>(paths: &[PathBuf], quiet: Duration, on_change: F) -> notify::Result<FolderWatch>
    where
        F: Fn() + Send + 'static,
    {
        let (tx, rx) = mpsc::channel::<Message>();
        let (stop_tx, stop_rx) = mpsc::channel::<()>();

        let event_tx = tx.clone();
        let mut watcher = RecommendedWatcher::new(
            move |result: notify::Result<Event>| {
                if let Ok(event) = result {
                    if is_relevant(&event.kind) {
                        let _ = event_tx.send(Message::Changed);
                    }
                }
            },
            Config::default(),
        )?;
        for path in paths {
            watcher.watch(path, RecursiveMode::Recursive)?;
        }

        // Forward the stop signal into the same queue the events use.
        let stop_forward = tx;
        let forwarder = std::thread::spawn(move || {
            let _ = stop_rx.recv();
            let _ = stop_forward.send(Message::Stop);
        });

        let thread = std::thread::spawn(move || {
            loop {
                match rx.recv() {
                    Ok(Message::Changed) => {}
                    Ok(Message::Stop) | Err(_) => break,
                }
                // Wait for quiet: every further event restarts the wait.
                loop {
                    match rx.recv_timeout(quiet) {
                        Ok(Message::Changed) => continue,
                        Ok(Message::Stop) => return,
                        Err(RecvTimeoutError::Timeout) => {
                            on_change();
                            break;
                        }
                        Err(RecvTimeoutError::Disconnected) => return,
                    }
                }
            }
            let _ = forwarder.join();
        });

        Ok(FolderWatch {
            _watcher: watcher,
            stop: stop_tx,
            thread: Some(thread),
        })
    }
}

#[cfg(not(target_os = "ios"))]
mod command {
    use super::core::{watch, FolderWatch};
    use std::path::PathBuf;
    use std::sync::Mutex;
    use std::time::Duration;
    use tauri::{command, AppHandle, Emitter};

    /// A book being copied in raises events until it is complete; scan after this much quiet.
    const QUIET: Duration = Duration::from_millis(2000);

    static ACTIVE: Mutex<Option<FolderWatch>> = Mutex::new(None);

    /// Watch exactly these folders (an empty list stops watching). Each change, once things go
    /// quiet, is announced to the web view as the `watched-folders-changed` event.
    #[command]
    pub fn watch_folders(app: AppHandle, paths: Vec<String>) -> Result<(), String> {
        let mut active = ACTIVE
            .lock()
            .map_err(|_| "watcher lock poisoned".to_string())?;
        // Stop the old watch first, so folders the user removed stop being watched.
        *active = None;
        let mut folders = Vec::new();
        for path in paths {
            crate::transfer_file::ensure_path_allowed(&app, &path).map_err(|e| e.to_string())?;
            let folder = PathBuf::from(&path);
            if folder.is_dir() {
                folders.push(folder);
            }
        }
        if folders.is_empty() {
            return Ok(());
        }
        let handle = app.clone();
        let started = watch(&folders, QUIET, move || {
            let _ = handle.emit("watched-folders-changed", ());
        })
        .map_err(|e| e.to_string())?;
        *active = Some(started);
        Ok(())
    }
}

#[cfg(not(target_os = "ios"))]
pub use command::watch_folders;

/// iOS keeps apps inside their sandbox and has no folder change notifications for them: the app
/// scans when it starts and comes back to the front instead.
#[cfg(target_os = "ios")]
#[tauri::command]
pub fn watch_folders(_paths: Vec<String>) -> Result<(), String> {
    Err("Watching folders is not available on iOS".to_string())
}

#[cfg(test)]
mod tests {
    use super::core::watch;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::time::Duration;
    use std::time::Instant;

    fn counter() -> (Arc<AtomicUsize>, impl Fn() + Send + 'static) {
        let count = Arc::new(AtomicUsize::new(0));
        let inner = count.clone();
        (count, move || {
            inner.fetch_add(1, Ordering::SeqCst);
        })
    }

    fn wait_for(count: &Arc<AtomicUsize>, at_least: usize, within: Duration) -> bool {
        let start = Instant::now();
        while start.elapsed() < within {
            if count.load(Ordering::SeqCst) >= at_least {
                return true;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        false
    }

    #[test]
    fn a_new_file_is_reported_once_the_folder_is_quiet() {
        let dir = tempfile::tempdir().unwrap();
        let (count, on_change) = counter();
        let _watch = watch(
            &[dir.path().to_path_buf()],
            Duration::from_millis(200),
            on_change,
        )
        .unwrap();
        fs::write(dir.path().join("book.epub"), b"x").unwrap();
        assert!(
            wait_for(&count, 1, Duration::from_secs(3)),
            "no report for a new file"
        );
    }

    #[test]
    fn a_burst_of_changes_is_one_report() {
        let dir = tempfile::tempdir().unwrap();
        let (count, on_change) = counter();
        let _watch = watch(
            &[dir.path().to_path_buf()],
            Duration::from_millis(400),
            on_change,
        )
        .unwrap();
        for i in 0..20 {
            fs::write(dir.path().join(format!("b{i}.epub")), vec![0u8; 1000]).unwrap();
            std::thread::sleep(Duration::from_millis(20));
        }
        assert!(wait_for(&count, 1, Duration::from_secs(3)));
        std::thread::sleep(Duration::from_millis(900));
        assert_eq!(
            count.load(Ordering::SeqCst),
            1,
            "a burst should be reported once"
        );
    }

    #[test]
    fn a_file_in_a_subfolder_is_reported() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join("Fantasy")).unwrap();
        let (count, on_change) = counter();
        let _watch = watch(
            &[dir.path().to_path_buf()],
            Duration::from_millis(200),
            on_change,
        )
        .unwrap();
        fs::write(dir.path().join("Fantasy").join("a.m4b"), b"x").unwrap();
        assert!(wait_for(&count, 1, Duration::from_secs(3)));
    }

    #[test]
    fn reading_a_file_does_not_count_as_a_change() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("book.epub"), b"hello").unwrap();
        let (count, on_change) = counter();
        let _watch = watch(
            &[dir.path().to_path_buf()],
            Duration::from_millis(200),
            on_change,
        )
        .unwrap();
        std::thread::sleep(Duration::from_millis(300));
        for _ in 0..5 {
            let _ = fs::read(dir.path().join("book.epub")).unwrap();
        }
        std::thread::sleep(Duration::from_millis(800));
        assert_eq!(
            count.load(Ordering::SeqCst),
            0,
            "reading must not trigger a scan"
        );
    }

    #[test]
    fn nothing_is_reported_after_the_watch_is_dropped() {
        let dir = tempfile::tempdir().unwrap();
        let (count, on_change) = counter();
        let watch_handle = watch(
            &[dir.path().to_path_buf()],
            Duration::from_millis(100),
            on_change,
        )
        .unwrap();
        drop(watch_handle);
        fs::write(dir.path().join("late.epub"), b"x").unwrap();
        std::thread::sleep(Duration::from_millis(500));
        assert_eq!(count.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn a_missing_folder_is_an_error_not_a_crash() {
        let (_count, on_change) = counter();
        let result = watch(
            &[PathBuf::from("/definitely/not/here")],
            Duration::from_millis(100),
            on_change,
        );
        assert!(result.is_err());
    }
}
