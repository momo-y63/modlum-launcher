import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Lyrics, NowPlaying, Settings } from '../../../shared/types'
import { api, errorMessage } from '../api'
import { Icon } from '../components/Icons'

interface Props {
  settings: Settings
  onUpdate: (patch: Partial<Settings>) => Promise<Settings>
  onToast: (input: { kind: 'success' | 'error' | 'info'; title: string; body?: string }) => void
}

interface LyricLine {
  at: number
  text: string
}

const REDIRECT_URI = 'http://127.0.0.1:8888/callback'

function parseSynced(synced: string): LyricLine[] {
  const lines: LyricLine[] = []
  for (const raw of synced.split('\n')) {
    const match = raw.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/)
    if (!match) continue
    const text = match[3].trim()
    if (!text) continue
    lines.push({ at: Number(match[1]) * 60 + Number(match[2]), text })
  }
  return lines
}

function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function SpotifyPage({ settings, onUpdate, onToast }: Props): React.JSX.Element {
  const [clientId, setClientId] = useState(settings.spotifyClientId)
  const [now, setNow] = useState<NowPlaying | null>(null)
  const [lyrics, setLyrics] = useState<Lyrics | null>(null)
  const [lyricsFor, setLyricsFor] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([])

  const connected = Boolean(settings.spotify?.refreshToken)
  const track = now?.track ?? null

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const state = await api.spotify.status()
      setNow(state)
      setProgress(state.progressMs)
      if (state.error) setError(state.error)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [])

  useEffect(() => {
    if (!connected) {
      setNow(null)
      return
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 2500)
    return () => window.clearInterval(timer)
  }, [connected, refresh])

  useEffect(() => {
    if (!now?.playing) return
    const duration = now.track?.durationMs ?? 0
    const timer = window.setInterval(() => {
      setProgress((prev) => (duration > 0 ? Math.min(duration, prev + 500) : prev + 500))
    }, 500)
    return () => window.clearInterval(timer)
  }, [now?.playing, now?.track?.durationMs])

  useEffect(() => {
    if (!track) {
      setLyrics(null)
      setLyricsFor(null)
      return
    }
    const key = `${track.id}|${track.name}`
    if (lyricsFor === key) return
    let cancelled = false
    setLyricsFor(key)
    setLyrics(null)
    void api.spotify
      .lyrics({ artist: track.artists, title: track.name, album: track.album, durationMs: track.durationMs })
      .then((result) => {
        if (!cancelled) setLyrics(result)
      })
      .catch(() => {
        if (!cancelled) setLyrics(null)
      })
    return () => {
      cancelled = true
    }
  }, [track?.id, track?.name, track?.artists, track?.album, track?.durationMs, lyricsFor, track])

  const lines = useMemo(() => (lyrics?.synced ? parseSynced(lyrics.synced) : []), [lyrics])

  const activeIndex = useMemo(() => {
    if (lines.length === 0) return -1
    const seconds = progress / 1000
    let index = -1
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].at <= seconds) index = i
      else break
    }
    return index
  }, [lines, progress])

  useEffect(() => {
    const container = scrollRef.current
    const line = activeIndex >= 0 ? lineRefs.current[activeIndex] : null
    if (!container || !line) return
    container.scrollTo({
      top: Math.max(0, line.offsetTop - container.clientHeight / 2 + line.clientHeight / 2),
      behavior: 'smooth'
    })
  }, [activeIndex])

  const control = useCallback(
    async (action: string, positionMs?: number): Promise<void> => {
      setBusy(action)
      setError(null)
      try {
        await api.spotify.control(action, positionMs)
        window.setTimeout(() => void refresh(), 700)
      } catch (err) {
        setError(errorMessage(err))
      } finally {
        setBusy(null)
      }
    },
    [refresh]
  )

  const connect = useCallback(async (): Promise<void> => {
    const id = clientId.trim()
    if (!id) {
      setError('Önce Spotify Client ID gir.')
      return
    }
    setBusy('login')
    setError(null)
    try {
      await onUpdate({ spotifyClientId: id })
      const connection = await api.spotify.login()
      await onUpdate({})
      onToast({ kind: 'success', title: 'Spotify bağlandı', body: connection.displayName ?? undefined })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }, [clientId, onToast, onUpdate])

  const disconnect = useCallback(async (): Promise<void> => {
    setBusy('logout')
    setError(null)
    try {
      await api.spotify.logout()
      await onUpdate({})
      setNow(null)
      setLyrics(null)
      setLyricsFor(null)
      onToast({ kind: 'info', title: 'Spotify bağlantısı kesildi' })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }, [onToast, onUpdate])

  const seek = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (!track || track.durationMs === 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    void control('seek', Math.round(ratio * track.durationMs))
  }

  const percent = track && track.durationMs > 0 ? Math.min(100, (progress / track.durationMs) * 100) : 0

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Müzik</div>
          <h1 className="page-title">Spotify</h1>
          <p className="page-sub">
            Oyun açıkken arka planda çalan şarkıyı buradan gör, parça değiştir ve sözleri takip et.
          </p>
        </div>
        {connected && (
          <div className="row" style={{ gap: 8 }}>
            <span className="badge installed">{settings.spotify.displayName ?? 'Bağlı'}</span>
            <button className="btn outline sm" disabled={busy !== null} onClick={() => void connect()}>
              <Icon name="refresh" size={14} />
              Yeniden bağlan
            </button>
            <button className="btn ghost sm" disabled={busy !== null} onClick={() => void disconnect()}>
              Bağlantıyı kes
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="spotify-error">
          <Icon name="alert" size={16} />
          <span>{error}</span>
        </div>
      )}

      {!connected ? (
        <div className="settings-stack stagger">
          <div className="card">
            <h3 className="card-title">
              <Icon name="music" size={15} />
              Spotify hesabını bağla
            </h3>
            <div className="field">
              <label className="field-label">Spotify Client ID</label>
              <input
                className="input"
                placeholder="ör. 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                onBlur={() => {
                  if (clientId.trim() !== settings.spotifyClientId) {
                    void onUpdate({ spotifyClientId: clientId.trim() })
                  }
                }}
              />
              <div className="field-hint">
                {settings.spotifyClientId
                  ? 'Client ID kayıtlı. Bağlan dediğinde tarayıcı açılır ve izin istenir.'
                  : 'Girilmedi — Spotify paneli devre dışı.'}
              </div>
            </div>

            <div className="row" style={{ gap: 8, marginTop: 14 }}>
              <button className="btn primary" disabled={busy !== null} onClick={() => void connect()}>
                {busy === 'login' ? <span className="spinner dark sm" /> : <Icon name="music" size={15} />}
                {busy === 'login' ? 'Tarayıcı bekleniyor…' : "Spotify'a bağlan"}
              </button>
            </div>

            <div className="card veil" style={{ marginTop: 16 }}>
              <div className="setting-name" style={{ marginBottom: 10 }}>
                4 adımda bağlantı
              </div>
              <ol className="tiny" style={{ margin: 0, paddingLeft: 18, lineHeight: 2, color: 'var(--muted)' }}>
                <li>
                  <span
                    className="link"
                    onClick={() => void api.shell.openUrl('https://developer.spotify.com/dashboard')}
                  >
                    developer.spotify.com/dashboard
                  </span>{' '}
                  → <b>Create app</b>.
                </li>
                <li>
                  <b>Redirect URI</b> alanına şunu ekle:{' '}
                  <code className="mono-code">{REDIRECT_URI}</code>
                </li>
                <li>
                  App ayarlarında <b>Web API</b> erişimini aç ve <b>Client ID</b> değerini buraya yapıştır.
                </li>
                <li>
                  <b>Spotify'a bağlan</b> → tarayıcıda izin ver. Uygulama geliştirme modunda olduğu için
                  Spotify hesabını (ve en fazla 4 arkadaşını) Users alanına eklemen gerekir.
                </li>
              </ol>
              <div className="field-hint" style={{ marginTop: 10 }}>
                Parça değiştirme/oynatma kontrolü Spotify <b>Premium</b> ister; sözler ve şu an çalan bilgisi
                her hesapta çalışır.
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="spotify-grid stagger">
          <div className="card np-card">
            <div className="np-cover">
              {track?.image ? (
                <img src={track.image} alt={track.name} draggable={false} />
              ) : (
                <Icon name="music" size={54} />
              )}
            </div>

            <div className="np-meta">
              <div className="np-title">{track?.name ?? 'Şu an bir şey çalmıyor'}</div>
              <div className="np-artist">{track?.artists ?? 'Spotify’da müziği başlat'}</div>
              {track?.album && <div className="np-album">{track.album}</div>}
            </div>

            <div className="np-bar" role="presentation" onClick={seek} title="Konuma atla">
              <div className="np-bar-fill" style={{ width: `${percent}%` }} />
            </div>
            <div className="np-times">
              <span>{formatTime(progress)}</span>
              <span>{formatTime(track?.durationMs ?? 0)}</span>
            </div>

            <div className="np-controls">
              <button
                className="np-btn"
                title="Önceki"
                disabled={!track || busy !== null}
                onClick={() => void control('previous')}
              >
                <Icon name="skipBack" size={20} />
              </button>
              <button
                className="np-btn main"
                title={now?.playing ? 'Duraklat' : 'Çal'}
                disabled={!track || busy !== null}
                onClick={() => void control(now?.playing ? 'pause' : 'play')}
              >
                <Icon name={now?.playing ? 'pause' : 'play'} size={22} />
              </button>
              <button
                className="np-btn"
                title="Sonraki"
                disabled={!track || busy !== null}
                onClick={() => void control('next')}
              >
                <Icon name="skipForward" size={20} />
              </button>
              <button
                className="np-btn ghost"
                title="Spotify'da aç"
                disabled={!track?.url}
                onClick={() => {
                  if (track?.url) void api.shell.openUrl(track.url)
                }}
              >
                <Icon name="external" size={18} />
              </button>
            </div>

            <div className="np-device">{now?.device ? `Çalıyor: ${now.device}` : 'Cihaz bekleniyor'}</div>
          </div>

          <div className="card lyrics-card">
            <h3 className="card-title">
              <Icon name="quote" size={15} />
              Sözler
            </h3>

            {lines.length > 0 ? (
              <div className="lyrics-scroll" ref={scrollRef}>
                {lines.map((line, index) => (
                  <p
                    key={`${line.at}-${index}`}
                    ref={(element) => {
                      lineRefs.current[index] = element
                    }}
                    className={`lyric-line${index === activeIndex ? ' active' : ''}`}
                    onClick={() => void control('seek', Math.round(line.at * 1000))}
                  >
                    {line.text}
                  </p>
                ))}
              </div>
            ) : lyrics?.plain ? (
              <div className="lyrics-scroll">
                <p className="lyric-line plain">{lyrics.plain}</p>
              </div>
            ) : (
              <div className="lyrics-empty">
                {lyrics?.instrumental ? 'Bu şarkı enstrümantal.' : 'Söz bulunamadı.'}
              </div>
            )}

            {lyrics && (
              <div className="field-hint" style={{ marginTop: 10 }}>
                {lyrics.synced ? 'Senkron sözler' : 'Düz sözler'} · LRCLIB
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
