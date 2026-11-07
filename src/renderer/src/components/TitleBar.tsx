import { Icon } from './Icons'
import { api } from '../api'

export function TitleBar({ running }: { running: boolean }): React.JSX.Element {
  return (
    <div className="titlebar">
      <div className="titlebar-brand">
        <span className={`titlebar-dot${running ? ' running' : ''}`} />
        <span>{running ? 'Oyun çalışıyor' : 'Modlum Launcher'}</span>
      </div>
      <div className="titlebar-spacer" />
      <div className="win-controls">
        <button className="win-btn" title="Küçült" onClick={() => void api.app.minimize()}>
          <Icon name="minus" size={14} />
        </button>
        <button className="win-btn" title="Büyüt / Küçült" onClick={() => void api.app.maximize()}>
          <Icon name="square" size={12} />
        </button>
        <button className="win-btn close" title="Kapat" onClick={() => void api.app.close()}>
          <Icon name="x" size={15} />
        </button>
      </div>
    </div>
  )
}
