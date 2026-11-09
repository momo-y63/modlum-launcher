import { Icon } from './Icons'

export interface Toast {
  id: string
  kind: 'success' | 'error' | 'info'
  title: string
  body?: string
}

const ICON_COLOR: Record<Toast['kind'], string> = {
  success: 'var(--accent)',
  error: 'var(--warm-deep)',
  info: 'var(--ink-soft)'
}

export function Toasts({
  toasts,
  onDismiss
}: {
  toasts: Toast[]
  onDismiss: (id: string) => void
}): React.JSX.Element {
  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind}`}>
          <span style={{ color: ICON_COLOR[toast.kind], marginTop: 1, display: 'grid', placeItems: 'center' }}>
            <Icon
              name={toast.kind === 'error' ? 'alert' : toast.kind === 'success' ? 'check' : 'info'}
              size={17}
            />
          </span>
          <div className="grow">
            <div className="toast-title">{toast.title}</div>
            {toast.body && <div className="toast-body">{toast.body}</div>}
          </div>
          <button className="win-btn" style={{ width: 26, height: 26 }} onClick={() => onDismiss(toast.id)}>
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}
