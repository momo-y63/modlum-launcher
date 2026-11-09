import type { Account, Instance } from '../../../shared/types'
import { Icon } from './Icons'
import { Avatar } from './Avatar'
import { InstanceIcon } from './InstanceIcon'
import brandIcon from '../assets/brand/momo-icon.png'

export type Page = 'home' | 'accounts' | 'settings' | 'console' | 'info'

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'home', label: 'Oyun', icon: 'home' },
  { id: 'settings', label: 'Ayarlar', icon: 'settings' },
  { id: 'console', label: 'Konsol', icon: 'terminal' },
  { id: 'info', label: 'Bilgi', icon: 'info' }
]

export function Sidebar({
  page,
  onNavigate,
  account,
  running,
  instances,
  activeInstanceId,
  onSelectInstance,
  onCreateInstance
}: {
  page: Page
  onNavigate: (page: Page) => void
  account: Account | null
  running: boolean
  instances: Instance[]
  activeInstanceId: string | null
  onSelectInstance: (id: string) => void
  onCreateInstance: () => void
}): React.JSX.Element {
  return (
    <aside className="dock" data-tour="dock">
      <div className="dock-logo" data-label="Modlum Launcher">
        <img src={brandIcon} alt="Modlum" draggable={false} />
      </div>

      <nav className="dock-nav">
        {NAV.map((item) => (
          <button
            key={item.id}
            className={`dock-item${page === item.id ? ' active' : ''}`}
            data-label={item.label}
            aria-label={item.label}
            onClick={() => onNavigate(item.id)}
          >
            <Icon name={item.icon} size={27} />
            {item.id === 'console' && running && <span className="dock-live" />}
          </button>
        ))}
      </nav>

      <div className="dock-divider" />

      <div className="dock-instances" data-tour="instances">
        {instances.map((instance) => (
          <button
            key={instance.id}
            className={`dock-instance${instance.id === activeInstanceId ? ' active' : ''}`}
            data-label={`${instance.name} · ${instance.versionId}`}
            aria-label={instance.name}
            onClick={() => onSelectInstance(instance.id)}
          >
            <InstanceIcon icon={instance.icon} size={42} />
            {instance.id === activeInstanceId && <span className="dock-instance-dot" />}
          </button>
        ))}
        <button className="dock-instance dock-add" data-label="Yeni instance" aria-label="Yeni instance" onClick={onCreateInstance}>
          <Icon name="plus" size={24} />
        </button>
      </div>

      <div className="dock-spacer" />

      <button
        className={`dock-account${page === 'accounts' ? ' active' : ''}`}
        data-label={account ? `${account.username} · hesap` : 'Hesap ekle'}
        aria-label="Hesap"
        onClick={() => onNavigate('accounts')}
      >
        <Avatar name={account?.username} size={44} variant={account?.type === 'microsoft' ? 'ms' : 'pink'} />
        {running && <span className="dock-live" />}
      </button>
    </aside>
  )
}
