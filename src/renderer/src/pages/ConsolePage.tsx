import { useEffect, useRef, useState } from 'react'
import type { LogLine } from '../../../shared/types'
import { Icon } from '../components/Icons'
import { formatTime } from '../lib/format'

interface Props {
  logs: LogLine[]
  running: boolean
  onClear: () => void
}

export function ConsolePage({ logs, running, onClear }: Props): React.JSX.Element {
  const [autoScroll, setAutoScroll] = useState(true)
  const [filter, setFilter] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (autoScroll && ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [logs, autoScroll])

  const matched = filter.trim()
    ? logs.filter((line) => line.text.toLowerCase().includes(filter.trim().toLowerCase()))
    : logs
  // DOM'u şişirmemek için yalnızca son 800 satırı çiz
  const visible = matched.length > 800 ? matched.slice(-800) : matched

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Günlük</div>
          <h1 className="page-title">Konsol</h1>
          <p className="page-sub">Oyun günlükleri ve başlatıcı olayları burada akar.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className={`pill${running ? ' accent' : ''}`}>
            <span className="titlebar-dot running" style={{ opacity: running ? 1 : 0.3 }} />
            {running ? 'Oyun çalışıyor' : 'Boşta'}
          </span>
          <button className={`btn sm ${autoScroll ? 'primary' : 'outline'}`} onClick={() => setAutoScroll(!autoScroll)}>
            Otomatik kaydır
          </button>
          <button className="btn sm ghost" onClick={onClear}>
            <Icon name="trash" size={14} />
            Temizle
          </button>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 14 }}>
        <div className="search" style={{ maxWidth: 380 }}>
          <span className="search-icon">
            <Icon name="search" size={16} />
          </span>
          <input
            className="input"
            placeholder="Günlükte ara…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      <div className="console" data-tour="console" ref={ref}>
        {visible.length === 0 ? (
          <div style={{ color: 'rgba(216,236,239,.45)' }}>
            {logs.length === 0
              ? 'Henüz günlük yok. Oyunu başlattığında satırlar burada akmaya başlar.'
              : 'Eşleşen satır yok.'}
          </div>
        ) : (
          visible.map((line, index) => (
            <div key={`${line.at}-${index}`} className="log-line">
              <span className="log-time">{formatTime(line.at)}</span>
              <span className={`log-${line.stream}`}>{line.text}</span>
            </div>
          ))
        )}
      </div>
    </>
  )
}
