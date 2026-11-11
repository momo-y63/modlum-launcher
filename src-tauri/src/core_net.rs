use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use futures_util::StreamExt;
use serde::de::DeserializeOwned;
use sha1::{Digest, Sha1};
use sha2::Sha256;
use tokio::fs;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const USER_AGENT: &str = "ModlumLauncher/1.1 (Minecraft launcher)";

pub type ByteCb = Option<Arc<dyn Fn(u64) + Send + Sync>>;

pub fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .connect_timeout(Duration::from_secs(20))
            .build()
            .unwrap_or_default()
    })
}

pub fn hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

async fn get_retry(url: &str) -> Result<reqwest::Response, String> {
    let mut last = String::new();
    for attempt in 0..4u32 {
        match client().get(url).send().await {
            Ok(res) => {
                if res.status().is_success() {
                    return Ok(res);
                }
                let status = res.status().as_u16();
                last = format!("HTTP {status}: {url}");
                if status < 500 && status != 429 {
                    return Err(last);
                }
            }
            Err(err) => last = format!("{err}"),
        }
        if attempt < 3 {
            tokio::time::sleep(Duration::from_millis(600 * (1u64 << attempt))).await;
        }
    }
    Err(last)
}

pub async fn fetch_json<T: DeserializeOwned>(url: &str) -> Result<T, String> {
    let text = fetch_text(url).await?;
    serde_json::from_str(&text).map_err(|err| format!("{err}: {url}"))
}

pub async fn fetch_text(url: &str) -> Result<String, String> {
    let res = get_retry(url).await?;
    res.text().await.map_err(|err| err.to_string())
}

pub async fn sha1_file(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path).await.map_err(|e| e.to_string())?;
    let mut hasher = Sha1::new();
    let mut buffer = vec![0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).await.map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex(&hasher.finalize()))
}

pub async fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path).await.map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).await.map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex(&hasher.finalize()))
}

pub struct DownloadTask {
    pub url: String,
    pub dest: PathBuf,
    pub sha1: Option<String>,
    pub sha256: Option<String>,
    pub size: Option<u64>,
}

pub fn is_file(path: &Path) -> bool {
    std::fs::metadata(path).map(|meta| meta.is_file()).unwrap_or(false)
}

/// Tek dosya indirir; hash verilmişse ve mevcut dosya doğruysa atlar.
pub async fn download_file(task: &DownloadTask, on_bytes: ByteCb) -> Result<bool, String> {
    if let Some(parent) = task.dest.parent() {
        let _ = fs::create_dir_all(parent).await;
    }

    if task.sha1.is_some() || task.sha256.is_some() {
        if let Ok(meta) = fs::metadata(&task.dest).await {
            let size_ok = task.size.is_none() || task.size == Some(meta.len());
            if meta.is_file() && meta.len() > 0 && size_ok {
                let hash_ok = if let Some(want) = &task.sha1 {
                    sha1_file(&task.dest).await? == want.to_lowercase()
                } else if let Some(want) = &task.sha256 {
                    sha256_file(&task.dest).await? == want.to_lowercase()
                } else {
                    true
                };
                if hash_ok {
                    if let Some(cb) = &on_bytes {
                        cb(meta.len());
                    }
                    return Ok(true);
                }
            }
        }
    } else if let Ok(meta) = fs::metadata(&task.dest).await {
        if meta.is_file() && meta.len() > 0 {
            return Ok(true);
        }
    }

    let tmp = PathBuf::from(format!("{}.part", task.dest.display()));
    let res = get_retry(&task.url).await?;
    let mut file = fs::File::create(&tmp)
        .await
        .map_err(|e| format!("Dosya oluşturulamadı: {e}"))?;
    let mut stream = res.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("İndirme hatası: {e}"))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Yazma hatası: {e}"))?;
        if let Some(cb) = &on_bytes {
            cb(chunk.len() as u64);
        }
    }
    let _ = file.flush().await;
    drop(file);

    let name = task
        .dest
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    if let Some(want) = &task.sha1 {
        if sha1_file(&tmp).await? != want.to_lowercase() {
            let _ = fs::remove_file(&tmp).await;
            return Err(format!("Dosya bütünlüğü bozuk: {name}"));
        }
    } else if let Some(want) = &task.sha256 {
        if sha256_file(&tmp).await? != want.to_lowercase() {
            let _ = fs::remove_file(&tmp).await;
            return Err(format!("Dosya bütünlüğü bozuk: {name}"));
        }
    }

    fs::rename(&tmp, &task.dest)
        .await
        .map_err(|e| format!("Dosya taşınamadı: {e}"))?;
    Ok(false)
}

/// Basit eşzamanlılık havuzu (Electron'daki mapLimit karşılığı)
pub async fn map_limit<T, R, F, Fut>(items: Vec<T>, limit: usize, f: F) -> Vec<Result<R, String>>
where
    T: Send + 'static,
    R: Send + 'static,
    F: Fn(T) -> Fut + Send + Sync,
    Fut: std::future::Future<Output = Result<R, String>> + Send,
{
    let f = &f;
    let stream = futures_util::stream::iter(items.into_iter().map(|item| async move { f(item).await }));
    stream.buffer_unordered(limit.max(1)).collect::<Vec<_>>().await
}
