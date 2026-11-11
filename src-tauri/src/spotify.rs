use serde::Serialize;
use serde_json::Value;

use crate::net::client;

/**
 * Spotify paneli: Windows medya oturumu (SMTC) üzerinden çalışır.
 *
 * Spotify masaüstü uygulaması çalarken Windows'a bir medya oturumu yayınlar;
 * başlık/sanatçı/albüm/süre buradan okunur ve ileri/geri/oynat-duraklat
 * komutları medya tuşları gibi gönderilir. Bu yol Spotify Web API'sinden
 * bağımsızdır: hesap bağlama, Client ID ve Premium gerekmez.
 */
const USER_AGENT: &str = "ModlumLauncher/1.1 (https://github.com/momo-y63/modlum-launcher)";

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
    /// Bir Spotify medya oturumu bulundu mu?
    pub available: bool,
    pub playing: bool,
    pub progress_ms: u64,
    pub duration_ms: u64,
    /// Oturumu yayınlayan uygulama (ör. "Spotify.exe")
    pub device: Option<String>,
    pub track: Option<TrackInfo>,
    pub error: Option<String>,
}

impl NowPlaying {
    pub fn unavailable(error: Option<String>) -> Self {
        Self {
            available: false,
            playing: false,
            progress_ms: 0,
            duration_ms: 0,
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

pub fn now_playing() -> NowPlaying {
    #[cfg(windows)]
    {
        imp::now_playing()
    }
    #[cfg(not(windows))]
    {
        NowPlaying::unavailable(Some(
            "Medya oturumu yalnızca Windows'ta okunabilir.".to_string(),
        ))
    }
}

pub fn control(action: &str, position_ms: Option<u64>) -> Result<(), String> {
    #[cfg(windows)]
    {
        imp::control(action, position_ms)
    }
    #[cfg(not(windows))]
    {
        let _ = (action, position_ms);
        Err("Medya kontrolü yalnızca Windows'ta çalışır.".to_string())
    }
}

#[cfg(windows)]
mod imp {
    use super::{NowPlaying, TrackInfo};
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSession,
        GlobalSystemMediaTransportControlsSessionManager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus,
    };

    fn spotify_session() -> Option<GlobalSystemMediaTransportControlsSession> {
        let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .ok()?
            .get()
            .ok()?;
        let sessions = manager.GetSessions().ok()?;
        let count = sessions.Size().ok()?;
        for index in 0..count {
            let Ok(session) = sessions.GetAt(index) else {
                continue;
            };
            let app = session
                .SourceAppUserModelId()
                .map(|id| id.to_string().to_lowercase())
                .unwrap_or_default();
            if app.contains("spotify") {
                return Some(session);
            }
        }
        None
    }

    pub fn now_playing() -> NowPlaying {
        let Some(session) = spotify_session() else {
            return NowPlaying::unavailable(None);
        };

        let device = session
            .SourceAppUserModelId()
            .map(|id| id.to_string())
            .ok()
            .filter(|id| !id.is_empty());

        let playing = session
            .GetPlaybackInfo()
            .ok()
            .and_then(|info| info.PlaybackStatus().ok())
            .map(|status| status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing)
            .unwrap_or(false);

        let (progress_ms, duration_ms) = session
            .GetTimelineProperties()
            .ok()
            .map(|timeline| {
                let position = timeline.Position().map(|span| span.Duration).unwrap_or(0);
                let end = timeline.EndTime().map(|span| span.Duration).unwrap_or(0);
                (
                    (position.max(0) / 10_000) as u64,
                    (end.max(0) / 10_000) as u64,
                )
            })
            .unwrap_or((0, 0));

        let properties = session.TryGetMediaPropertiesAsync().ok().and_then(|op| op.get().ok());
        let (title, artist, album) = match &properties {
            Some(props) => (
                props.Title().map(|value| value.to_string()).unwrap_or_default(),
                props.Artist().map(|value| value.to_string()).unwrap_or_default(),
                props
                    .AlbumTitle()
                    .map(|value| value.to_string())
                    .unwrap_or_default(),
            ),
            None => (String::new(), String::new(), String::new()),
        };

        if title.trim().is_empty() {
            return NowPlaying {
                available: true,
                playing,
                progress_ms,
                duration_ms,
                device,
                track: None,
                error: None,
            };
        }

        let track = TrackInfo {
            id: format!("{artist}|{title}"),
            name: title,
            artists: artist,
            album,
            image: None,
            duration_ms,
            url: None,
        };

        NowPlaying {
            available: true,
            playing,
            progress_ms,
            duration_ms,
            device,
            track: Some(track),
            error: None,
        }
    }

    pub fn control(action: &str, position_ms: Option<u64>) -> Result<(), String> {
        let session = spotify_session()
            .ok_or_else(|| "Spotify medya oturumu bulunamadı. Spotify'ı açıp bir şarkı başlat.".to_string())?;

        let accepted = match action {
            "next" => session.TrySkipNextAsync().and_then(|op| op.get()),
            "previous" => session.TrySkipPreviousAsync().and_then(|op| op.get()),
            "play" => session.TryPlayAsync().and_then(|op| op.get()),
            "pause" => session.TryPauseAsync().and_then(|op| op.get()),
            "seek" => {
                let ticks = (position_ms.unwrap_or(0) as i64) * 10_000;
                session
                    .TryChangePlaybackPositionAsync(ticks)
                    .and_then(|op| op.get())
            }
            other => return Err(format!("Bilinmeyen medya komutu: {other}")),
        }
        .map_err(|error| format!("Spotify komutu gönderilemedi: {error}"))?;

        if accepted {
            Ok(())
        } else {
            Err("Spotify bu komutu kabul etmedi.".to_string())
        }
    }
}

/// Sözler için Spotify'ın kendi lyrics uç noktası kısıtlı olduğundan ücretsiz
/// LRCLIB kataloğu kullanılır (senkron LRC varsa onunla).
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
