use std::time::Duration;

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

use crate::model::{now_ms, SpotifyConnection};
use crate::net::client;

/**
 * Spotify Web API entegrasyonu.
 * Authorization Code + PKCE akışı kullanılır (istemci sırrı gerekmez).
 * Spotify yalnızca `http://127.0.0.1:PORT` biçimindeki loopback adreslerine
 * http yönlendirmesine izin verir; bu yüzden sabit bir port dinlenir.
 */
const AUTH_URL: &str = "https://accounts.spotify.com/authorize";
const TOKEN_URL: &str = "https://accounts.spotify.com/api/token";
const API_BASE: &str = "https://api.spotify.com/v1";
const SCOPES: &str =
    "user-read-playback-state user-modify-playback-state user-read-currently-playing";
const USER_AGENT: &str = "ModlumLauncher/1.1 (https://github.com/momo-y63/modlum-launcher)";

pub const REDIRECT_PORT: u16 = 8888;

pub fn redirect_uri() -> String {
    format!("http://127.0.0.1:{REDIRECT_PORT}/callback")
}

fn random_token(len: usize) -> String {
    let mut out = String::new();
    while out.len() < len {
        out.push_str(&uuid::Uuid::new_v4().simple().to_string());
    }
    out.truncate(len);
    out
}

fn challenge(verifier: &str) -> String {
    use base64::Engine;
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(verifier.as_bytes());
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(digest)
}

#[derive(Deserialize, Default)]
struct TokenPayload {
    access_token: Option<String>,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
}

#[derive(Deserialize, Default)]
struct PlayerState {
    #[serde(default)]
    is_playing: bool,
    progress_ms: Option<u64>,
    item: Option<TrackItem>,
    device: Option<DeviceInfo>,
}

#[derive(Deserialize)]
struct TrackItem {
    id: Option<String>,
    #[serde(default)]
    name: String,
    #[serde(default)]
    duration_ms: u64,
    #[serde(default)]
    artists: Vec<ArtistItem>,
    album: Option<AlbumInfo>,
    external_urls: Option<ExternalUrls>,
}

#[derive(Deserialize)]
struct ArtistItem {
    #[serde(default)]
    name: String,
}

#[derive(Deserialize)]
struct AlbumInfo {
    #[serde(default)]
    name: String,
    #[serde(default)]
    images: Vec<ImageInfo>,
}

#[derive(Deserialize)]
struct ImageInfo {
    #[serde(default)]
    url: String,
}

#[derive(Deserialize)]
struct DeviceInfo {
    #[serde(default)]
    name: String,
}

#[derive(Deserialize)]
struct ExternalUrls {
    spotify: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TrackInfo {
    pub id: String,
    pub name: String,
    pub artists: String,
    pub album: String,
    pub image: Option<String>,
    pub duration_ms: u64,
    pub url: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NowPlaying {
    pub connected: bool,
    pub playing: bool,
    pub progress_ms: u64,
    pub device: Option<String>,
    pub track: Option<TrackInfo>,
    pub error: Option<String>,
}

impl NowPlaying {
    pub fn disconnected() -> Self {
        Self {
            connected: false,
            playing: false,
            progress_ms: 0,
            device: None,
            track: None,
            error: None,
        }
    }

    fn idle(error: Option<String>) -> Self {
        Self {
            connected: true,
            playing: false,
            progress_ms: 0,
            device: None,
            track: None,
            error,
        }
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Lyrics {
    pub plain: Option<String>,
    pub synced: Option<String>,
    pub source: String,
    pub instrumental: bool,
}

fn api_error(status: u16, body: &str) -> String {
    let data: Value = serde_json::from_str(body).unwrap_or(Value::Null);
    let message = data
        .pointer("/error/message")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    match status {
        401 => "Spotify oturumu geçersiz. Yeniden bağlan.".to_string(),
        403 if message.to_lowercase().contains("premium") => {
            "Şarkı değiştirmek için Spotify Premium gerekli. Şu an çalan şarkıyı buradan izleyebilirsin."
                .to_string()
        }
        404 => "Aktif Spotify cihazı yok. Spotify'ı bir cihazda aç ve müziği başlat.".to_string(),
        429 => "Spotify istek sınırına takıldı, birkaç saniye sonra tekrar dene.".to_string(),
        _ if !message.is_empty() => message.to_string(),
        _ => format!("Spotify hatası (HTTP {status})."),
    }
}

fn parse_query(query: &str) -> std::collections::HashMap<String, String> {
    let mut out = std::collections::HashMap::new();
    for pair in query.split('&') {
        if pair.is_empty() {
            continue;
        }
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        let key = urlencoding::decode(key)
            .map(|value| value.to_string())
            .unwrap_or_else(|_| key.to_string());
        let value = urlencoding::decode(value)
            .map(|value| value.to_string())
            .unwrap_or_else(|_| value.to_string());
        out.insert(key, value);
    }
    out
}

/// Tarayıcıda yetkilendirme akışını başlatır, loopback yönlendirmesini bekler
/// ve gelen kodu token ile değiştirir.
pub async fn login(client_id_raw: &str) -> Result<SpotifyConnection, String> {
    let client_id = client_id_raw.trim();
    if client_id.is_empty() {
        return Err(
            "Spotify için Developer Dashboard'dan aldığın Client ID'yi girmelisin.".to_string(),
        );
    }

    let verifier = random_token(64);
    let state_token = random_token(16);
    let redirect = redirect_uri();
    let authorize = format!(
        "{AUTH_URL}?client_id={}&response_type=code&redirect_uri={}&scope={}&code_challenge_method=S256&code_challenge={}&state={}",
        urlencoding::encode(client_id),
        urlencoding::encode(&redirect),
        urlencoding::encode(SCOPES),
        challenge(&verifier),
        state_token
    );

    let listener = TcpListener::bind(("127.0.0.1", REDIRECT_PORT))
        .await
        .map_err(|e| format!("127.0.0.1:{REDIRECT_PORT} dinlenemedi: {e}"))?;

    opener::open(&authorize).map_err(|e| format!("Tarayıcı açılamadı: {e}"))?;

    let (mut socket, _) = tokio::time::timeout(Duration::from_secs(180), listener.accept())
        .await
        .map_err(|_| "Spotify girişi zaman aşımına uğradı.".to_string())?
        .map_err(|e| e.to_string())?;

    let mut buffer = vec![0u8; 8192];
    let read = socket.read(&mut buffer).await.map_err(|e| e.to_string())?;
    let request = String::from_utf8_lossy(&buffer[..read]).to_string();
    let path = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .unwrap_or("/")
        .to_string();
    let query = path.split_once('?').map(|(_, rest)| rest).unwrap_or("");
    let params = parse_query(query);

    let body = "<!doctype html><html lang=\"tr\"><head><meta charset=\"utf-8\"><title>Modlum Launcher</title><style>body{font-family:system-ui,-apple-system,sans-serif;background:#f5f5f7;color:#1d1d1f;display:grid;place-items:center;height:100vh;margin:0}main{text-align:center;padding:32px;border-radius:20px;background:#fff;box-shadow:0 20px 50px rgba(0,0,0,.08)}h1{font-size:20px;margin:0 0 8px}p{color:#5a5a60;margin:0;font-size:14px}</style></head><body><main><h1>Spotify bağlandı</h1><p>Bu sekmeyi kapatıp Modlum Launcher'a dönebilirsin.</p></main></body></html>";
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = socket.write_all(response.as_bytes()).await;
    let _ = socket.flush().await;

    if let Some(error) = params.get("error") {
        return Err(format!("Spotify girişi tamamlanmadı ({error})."));
    }
    if params.get("state") != Some(&state_token) {
        return Err("Spotify girişinde state doğrulanamadı.".to_string());
    }
    let code = params
        .get("code")
        .cloned()
        .ok_or_else(|| "Spotify yetkilendirme kodu alınamadı.".to_string())?;

    let form = vec![
        ("grant_type", "authorization_code".to_string()),
        ("code", code),
        ("redirect_uri", redirect),
        ("client_id", client_id.to_string()),
        ("code_verifier", verifier),
    ];
    let res = client()
        .post(TOKEN_URL)
        .form(&form)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = res.status();
    let text = res.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(api_error(status.as_u16(), &text));
    }
    let payload: TokenPayload = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let access_token = payload
        .access_token
        .ok_or_else(|| "Spotify token alınamadı.".to_string())?;

    let display_name = authorized_get::<Value>(&access_token, "/me")
        .await
        .ok()
        .and_then(|me| {
            me.get("display_name")
                .and_then(|value| value.as_str())
                .map(|value| value.to_string())
        });

    Ok(SpotifyConnection {
        refresh_token: payload.refresh_token,
        access_token: Some(access_token),
        expires_at: now_ms() + payload.expires_in.unwrap_or(3600) * 1000,
        display_name,
    })
}

/// Geçerli bir erişim token'ı döndürür; süresi dolduysa refresh token ile yeniler.
pub async fn ensure_access_token(
    connection: &mut SpotifyConnection,
    client_id: &str,
) -> Result<String, String> {
    if let Some(token) = connection.access_token.clone() {
        if !token.is_empty() && connection.expires_at > now_ms() + 30_000 {
            return Ok(token);
        }
    }
    let refresh = connection
        .refresh_token
        .clone()
        .ok_or_else(|| "Spotify oturumu yok. Yeniden bağlan.".to_string())?;
    let form = vec![
        ("grant_type", "refresh_token".to_string()),
        ("refresh_token", refresh),
        ("client_id", client_id.to_string()),
    ];
    let res = client()
        .post(TOKEN_URL)
        .form(&form)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = res.status();
    let text = res.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(if status.as_u16() == 400 {
            "Spotify oturumu sona ermiş. Yeniden bağlan.".to_string()
        } else {
            api_error(status.as_u16(), &text)
        });
    }
    let payload: TokenPayload = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let token = payload
        .access_token
        .ok_or_else(|| "Spotify token yenilenemedi.".to_string())?;
    connection.access_token = Some(token.clone());
    if payload.refresh_token.is_some() {
        connection.refresh_token = payload.refresh_token;
    }
    connection.expires_at = now_ms() + payload.expires_in.unwrap_or(3600) * 1000;
    Ok(token)
}

async fn authorized_get<T: DeserializeOwned>(token: &str, path: &str) -> Result<T, String> {
    let res = client()
        .get(format!("{API_BASE}{path}"))
        .header("Authorization", format!("Bearer {token}"))
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = res.status();
    let text = res.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(api_error(status.as_u16(), &text));
    }
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

pub async fn now_playing(
    connection: &mut SpotifyConnection,
    client_id: &str,
) -> Result<NowPlaying, String> {
    let token = ensure_access_token(connection, client_id).await?;
    let res = client()
        .get(format!("{API_BASE}/me/player"))
        .header("Authorization", format!("Bearer {token}"))
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = res.status();
    if status.as_u16() == 204 {
        return Ok(NowPlaying::idle(None));
    }
    let text = res.text().await.unwrap_or_default();
    if !status.is_success() {
        return Ok(NowPlaying::idle(Some(api_error(status.as_u16(), &text))));
    }
    let data: PlayerState = serde_json::from_str(&text).map_err(|e| e.to_string())?;

    let track = data.item.map(|item| TrackInfo {
        id: item.id.unwrap_or_default(),
        name: item.name,
        artists: item
            .artists
            .iter()
            .map(|artist| artist.name.clone())
            .collect::<Vec<_>>()
            .join(", "),
        album: item
            .album
            .as_ref()
            .map(|album| album.name.clone())
            .unwrap_or_default(),
        image: item
            .album
            .as_ref()
            .and_then(|album| album.images.first())
            .map(|image| image.url.clone())
            .filter(|url| !url.is_empty()),
        duration_ms: item.duration_ms,
        url: item.external_urls.and_then(|urls| urls.spotify),
    });

    Ok(NowPlaying {
        connected: true,
        playing: data.is_playing,
        progress_ms: data.progress_ms.unwrap_or(0),
        device: data.device.map(|device| device.name),
        track,
        error: None,
    })
}

pub async fn control(
    connection: &mut SpotifyConnection,
    client_id: &str,
    action: &str,
    position_ms: Option<u64>,
) -> Result<(), String> {
    let token = ensure_access_token(connection, client_id).await?;

    let mut request = match action {
        "next" => client().post(format!("{API_BASE}/me/player/next")),
        "previous" => client().post(format!("{API_BASE}/me/player/previous")),
        "play" => client().put(format!("{API_BASE}/me/player/play")),
        "pause" => client().put(format!("{API_BASE}/me/player/pause")),
        "seek" => client()
            .put(format!("{API_BASE}/me/player/seek"))
            .query(&[("position_ms", position_ms.unwrap_or(0))]),
        other => return Err(format!("Bilinmeyen Spotify komutu: {other}")),
    };

    let res = request
        .header("Authorization", format!("Bearer {token}"))
        .header("User-Agent", USER_AGENT)
        .header("Content-Length", "0")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = res.status();
    if status.is_success() {
        return Ok(());
    }
    let text = res.text().await.unwrap_or_default();
    Err(api_error(status.as_u16(), &text))
}

/// Sözler için Spotify'ın kendi lyrics uç noktası artık kısıtlı olduğundan
/// ücretsiz LRCLIB kataloğu kullanılır (senkron LRC varsa onunla).
pub async fn lyrics(
    artist: &str,
    title: &str,
    album: &str,
    duration_ms: u64,
) -> Result<Lyrics, String> {
    if title.trim().is_empty() || artist.trim().is_empty() {
        return Err("Şarkı bilgisi eksik.".to_string());
    }
    let mut url = format!(
        "https://lrclib.net/api/get?artist_name={}&track_name={}",
        urlencoding::encode(artist.trim()),
        urlencoding::encode(title.trim())
    );
    if !album.trim().is_empty() {
        url.push_str(&format!("&album_name={}", urlencoding::encode(album.trim())));
    }
    if duration_ms > 0 {
        url.push_str(&format!("&duration={}", duration_ms / 1000));
    }

    let res = client()
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .header("Lrclib-Client", USER_AGENT)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().as_u16() == 404 {
        return Ok(Lyrics {
            plain: None,
            synced: None,
            source: "lrclib".to_string(),
            instrumental: false,
        });
    }
    let status = res.status();
    let text = res.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Söz servisi hatası (HTTP {}).", status.as_u16()));
    }
    let data: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;

    Ok(Lyrics {
        plain: data
            .get("plainLyrics")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string()),
        synced: data
            .get("syncedLyrics")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string()),
        instrumental: data
            .get("instrumental")
            .and_then(|value| value.as_bool())
            .unwrap_or(false),
        source: "lrclib".to_string(),
    })
}
