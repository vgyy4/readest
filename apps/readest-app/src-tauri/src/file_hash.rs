//! SHA-256 of a file, read in pieces so a book of several gigabytes is never held in memory.
//! It is how the app checks that what arrived (or what the server stored) is the file that was sent.

use sha2::{Digest, Sha256};
use tokio::{fs::File, io::AsyncReadExt};

const CHUNK: usize = 1024 * 1024;

/// The SHA-256 of the file at `path`, as 64 lowercase hex characters.
pub async fn sha256_hex(path: &str) -> std::io::Result<String> {
    let mut file = File::open(path).await?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; CHUNK];
    loop {
        let read = file.read(&mut buffer).await?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str, content: &[u8]) -> String {
        let path = std::env::temp_dir().join(format!("hash-{}-{name}", std::process::id()));
        std::fs::write(&path, content).unwrap();
        path.to_string_lossy().to_string()
    }

    #[tokio::test]
    async fn matches_the_published_test_vectors() {
        let abc = temp("abc", b"abc");
        assert_eq!(
            sha256_hex(&abc).await.unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        let empty = temp("empty", b"");
        assert_eq!(
            sha256_hex(&empty).await.unwrap(),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        let _ = std::fs::remove_file(abc);
        let _ = std::fs::remove_file(empty);
    }

    #[tokio::test]
    async fn reads_a_file_bigger_than_its_buffer_the_same_way_as_all_at_once() {
        // Three chunks and a bit, with a pattern, so a dropped or repeated chunk would show.
        let data: Vec<u8> = (0..(3 * CHUNK + 1234)).map(|i| (i % 251) as u8).collect();
        let path = temp("big", &data);
        let all_at_once: String = Sha256::digest(&data)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect();
        assert_eq!(sha256_hex(&path).await.unwrap(), all_at_once);
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn a_missing_file_is_an_error() {
        assert!(sha256_hex("/no/such/file").await.is_err());
    }
}
