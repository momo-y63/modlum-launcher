import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Lyrics, NowPlaying } from '../../../shared/types'
import { api, errorMessage } from '../api'
import { Icon } from '../components/Icons'

interface Props {
  onToast: (input: { kind: 'success' | 'error' | 'info'; title: string; body?: string }) => void
}

interface LyricLine {
  at: number
  text: string
}

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

export function SpotifyPage({ onToast }: Props): React.JSX.Element {
  const [now, setNow] = useState<NowPlaying | null>(null)
  const [lyrics, setLyrics] = useState<Lyrics | null>(null)
  const [lyricsFor, setLyricsFor] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([])

  const track = now?.track ?? null
  const duration = now?.durationMs || track?.durationMs || 0

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const state = await api.spotify.status()
      setNow(state)
      setProgress(state.progressMs)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 2000)
    return () => window.clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    if (!now?.playing) return
    const timer = window.setInterval(() => {
      setProgress((prev) => (duration > 0 ? Math.min(duration, prev + 500) : prev + 500))
    }, 500)
    return () => window.clearInterval(timer)
  }, [now?.playing, duration])

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
      .lyrics({ artist: track.artists, title: track.name, album: track.album, durationMs: duration })
      .then((result) => {
        if (!cancelled) setLyrics(result)
      })
      .catch(() => {
        if (!cancelled) setLyrics(null)
      })
    return () => {
      cancelled = true
    }
  }, [track?.id, track?.name, track?.artists, track?.album, duration, lyricsFor, track])

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
        window.setTimeout(() => void refresh(), 400)
      } catch (err) {
        const message = errorMessage(err)
        setError(message)
        onToast({ kind: 'error', title: 'Spotify komutu çalışmadı', body: message })
      } finally {
        setBusy(null)
      }
    },
    [onToast, refresh]
  )

  const seek = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (!track || duration === 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    void control('seek', Math.round(ratio * duration))
  }

  const percent = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Müzik</div>
          <h1 className="page-title">Spotify</h1>
          <p className="page-sub">
            Arka planda Spotify çalarken şarkıyı buradan gör, parça değiştir ve sözleri takip et.
            Hesap bağlaman gerekmez.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className={`badge${now?.available ? ' installed' : ''}`}>
            {now?.available ? 'Medya oturumu açık' : 'Oturum bekleniyor'}
          </span>
          <button className="btn ghost sm" onClick={() => void refresh()}>
            <Icon name="refresh" size={14} />
            Yenile
          </button>
        </div>
      </div>

      {error && (
        <div className="spotify-error">
          <Icon name="alert" size={16} />
          <span>{error}</span>
        </div>
      )}

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
            <div className="np-artist">{track?.artists ?? 'Spotify’da bir şarkı başlat'}</div>
            {track?.album && <div className="np-album">{track.album}</div>}
          </div>

          <div className="np-bar" role="presentation" onClick={seek} title="Konuma atla">
            <div className="np-bar-fill" style={{ width: `${percent}%` }} />
          </div>
          <div className="np-times">
            <span>{formatTime(progress)}</span>
            <span>{formatTime(duration)}</span>
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
          </div>

          <div className="np-device">
            {now?.device ? now.device.replace(/\.exe$/i, '') : 'Spotify masaüstü uygulaması bekleniyor'}
          </div>

          {!now?.available && (
            <div className="field-hint" style={{ textAlign: 'center' }}>
              Spotify masaüstü uygulamasında bir şarkı başlat; panel otomatik olarak bağlanır.
              Kontroller medya tuşları gibi çalıştığı için Premium gerekmez.
            </div>
          )}
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
              {lyrics?.instrumental
                ? 'Bu şarkı enstrümantal.'
                : track
                  ? 'Söz bulunamadı.'
                  : 'Bir şarkı çalarken sözler burada görünür.'}
            </div>
          )}

          {lyrics && (
            <div className="field-hint" style={{ marginTop: 10 }}>
              {lyrics.synced ? 'Senkron sözler' : 'Düz sözler'} · LRCLIB
            </div>
          )}
        </div>
      </div>
    </>
  )
}
