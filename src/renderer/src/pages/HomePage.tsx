import { useState } from 'react'
import type {
  Account,
  ContentFile,
  Instance,
  InstanceContent,
  InstallProgress,
  LaunchState,
  NewsItem,
  Settings
} from '../../../shared/types'
import { Icon } from '../components/Icons'
import { InstanceIcon } from '../components/InstanceIcon'
import { formatBytes, formatDate, formatDuration } from '../lib/format'

type Tab = 'content' | 'worlds' | 'gallery' | 'files'
type ContentKind = 'mods' | 'resourcepacks' | 'shaderpacks' | 'datapacks'

const LOADER_LABEL: Record<string, string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  quilt: 'Quilt',
  forge: 'Forge',
  neoforge: 'NeoForge'
}

const KIND_LABEL: Record<ContentKind, string> = {
  mods: 'Modlar',
  resourcepacks: 'Resource Packs',
  shaderpacks: 'Shaderlar',
  datapacks: 'Datapackler'
}

interface Props {
  instance: Instance | null
  settings: Settings
  account: Account | null
  launch: LaunchState
  progress: InstallProgress | null
  busy: boolean
  content: InstanceContent | null
  news: NewsItem[]
  onCreateInstance: () => void
  onPlay: () => void
  onStop: () => void
  onOpenFolder: (kind?: string) => void
  onToggleMod: (name: string) => void
  onDeleteFile: (kind: string, name: string) => void
  onRefreshContent: () => void
  onDeleteInstance: () => void
}

export function HomePage({
  instance,
  account,
  launch,
  progress,
  busy,
  content,
  news,
  onCreateInstance,
  onPlay,
  onStop,
  onOpenFolder,
  onToggleMod,
  onDeleteFile,
  onRefreshContent,
  onDeleteInstance
}: Props): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('content')
  const [kind, setKind] = useState<ContentKind>('mods')

  if (!instance) {
    return (
      <>
        <div className="page-head">
          <div>
            <div className="eyebrow">Başlangıç</div>
            <h1 className="page-title">Hoş geldin{account ? `, ${account.username}` : ''}</h1>
            <p className="page-sub">Başlamak için ilk instance’ını oluştur.</p>
          </div>
        </div>
        <div className="card ghost empty-card">
          <Icon name="gamepad" size={30} />
          <div className="empty-title">Henüz instance yok</div>
          <div className="tiny">Her instance kendi sürümünü, modlarını ve dünyalarını taşır.</div>
          <button className="btn primary mt-16" onClick={onCreateInstance}>
            <Icon name="plus" size={15} />
            Instance oluştur
          </button>
        </div>
      </>
    )
  }

  const runningThis = launch.running && launch.versionId !== undefined
  const installingThis = progress?.instanceId === instance.id && progress.phase !== 'done' && progress.phase !== 'error'

  const currentList = content ? content[kind] : []
  const totalMods = content?.mods.length ?? 0

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Instance</div>
          <h1 className="page-title">{instance.name}</h1>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn ghost sm" onClick={() => onOpenFolder('root')}>
            <Icon name="folder" size={14} />
            Klasör
          </button>
          <button
            className="btn ghost sm"
            onClick={() => {
              if (window.confirm(`“${instance.name}” instance’ı ve tüm dosyaları silinsin mi?`)) onDeleteInstance()
            }}
          >
            <Icon name="trash" size={14} />
          </button>
        </div>
      </div>

      <section className="instance-hero" data-tour="instance">
        <div className="instance-hero-main">
          <div className="instance-icon-wrap">
            <InstanceIcon icon={instance.icon} size={64} />
          </div>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <span className="badge snapshot">{LOADER_LABEL[instance.loader]}</span>
              <span className="badge">MC {instance.versionId}</span>
              {instance.loaderVersion && instance.loader !== 'vanilla' && (
                <span className="badge">Loader {instance.loaderVersion}</span>
              )}
            </div>
            <div className="instance-sub">
              {instance.loader === 'vanilla'
                ? 'Vanilla · modsuz oyun'
                : `${LOADER_LABEL[instance.loader]} ile modlanabilir`}
            </div>
          </div>
          {runningThis ? (
            <button className="btn primary lg" onClick={onStop}>
              <Icon name="stop" size={16} />
              Oyunu durdur
            </button>
          ) : (
            <button className="btn primary lg" disabled={!account || busy} onClick={onPlay}>
              {busy || installingThis ? <span className="spinner" /> : <Icon name="play" size={16} />}
              Oyna
            </button>
          )}
        </div>

        {installingThis && progress && (
          <div className="instance-progress">
            <div className="progress">
              <div
                className="progress-fill"
                style={{
                  width:
                    progress.total > 0 ? `${Math.min(100, Math.max(2, (progress.current / progress.total) * 100))}%` : '20%'
                }}
              />
            </div>
            <div className="progress-text">
              <span>{progress.message}</span>
              {progress.total > 0 && <span>{Math.round((progress.current / progress.total) * 100)}%</span>}
            </div>
          </div>
        )}

        <div className="instance-stats">
          <div className="instance-stat">
            <span className="stat-label">Durum</span>
            <span className="instance-stat-value">
              {runningThis ? 'Çalışıyor' : installingThis ? 'Kuruluyor' : 'Oynamaya hazır'}
            </span>
          </div>
          <div className="instance-stat">
            <span className="stat-label">Son oynama</span>
            <span className="instance-stat-value">
              {instance.lastPlayedAt ? formatDate(new Date(instance.lastPlayedAt).toISOString()) : 'Hiç'}
            </span>
          </div>
          <div className="instance-stat">
            <span className="stat-label">Oyun süresi</span>
            <span className="instance-stat-value">{formatDuration(instance.playtimeSeconds)}</span>
          </div>
          <div className="instance-stat">
            <span className="stat-label">İçerik</span>
            <span className="instance-stat-value">{totalMods} mod</span>
          </div>
        </div>
      </section>

      {!account && (
        <div className="card veil" style={{ marginTop: 16, borderColor: 'rgba(255,122,26,.35)' }}>
          <div className="row between" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div className="row" style={{ gap: 10 }}>
              <span style={{ color: 'var(--warm-deep)' }}>
                <Icon name="alert" size={18} />
              </span>
              <span className="setting-desc">Oynamak için önce bir hesap eklemelisin.</span>
            </div>
            <span className="badge snapshot">Hesaplar</span>
          </div>
        </div>
      )}

      <div className="tabs" data-tour="tabs">
        {(
          [
            ['content', 'İçerik'],
            ['worlds', 'Dünyalar'],
            ['gallery', 'Galeri'],
            ['files', 'Dosyalar']
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} className={`tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
        <button className="tab-icon" title="Yenile" onClick={onRefreshContent}>
          <Icon name="refresh" size={15} />
        </button>
      </div>

      <div className="tab-panel" key={tab}>
        {tab === 'content' && (
          <>
            <div className="content-toolbar">
              <div className="chips">
                {(Object.keys(KIND_LABEL) as ContentKind[]).map((entry) => (
                  <button key={entry} className={`chip${kind === entry ? ' active' : ''}`} onClick={() => setKind(entry)}>
                    {KIND_LABEL[entry]} {content ? `(${content[entry].length})` : ''}
                  </button>
                ))}
              </div>
              <button className="btn outline sm" onClick={() => onOpenFolder(kind)}>
                <Icon name="folder" size={14} />
                {KIND_LABEL[kind]} klasörü
              </button>
            </div>

            {currentList.length === 0 ? (
              <div className="card ghost">
                <div className="empty">
                  <Icon name="layers" size={26} />
                  <div className="empty-title">{KIND_LABEL[kind]} boş</div>
                  <div className="tiny">
                    {kind === 'mods'
                      ? 'Bu instance’a mod eklemek için modlar klasörüne .jar dosyaları at.'
                      : 'İçerik eklemek için ilgili klasörü aç.'}
                  </div>
                  <button className="btn outline sm mt-16" onClick={() => onOpenFolder(kind)}>
                    <Icon name="folder" size={14} />
                    Klasörü aç
                  </button>
                </div>
              </div>
            ) : (
              <div className="content-list">
                {currentList.map((file) => (
                  <div key={file.name} className="content-row">
                    <span className="content-icon">
                      <Icon name="layers" size={16} />
                    </span>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="content-name" title={file.name}>
                        {file.name}
                      </span>
                      <span className="content-meta">
                        {formatBytes(file.size)} · {formatDate(new Date(file.modifiedAt).toISOString())}
                      </span>
                    </span>
                    {(kind === 'mods' || kind === 'resourcepacks' || kind === 'shaderpacks') && (
                      <button
                        className={`switch${file.enabled ? ' on' : ''}`}
                        title={file.enabled ? 'Devre dışı bırak' : 'Etkinleştir'}
                        onClick={() => {
                          if (kind === 'mods') onToggleMod(file.name)
                          else onOpenFolder(kind)
                        }}
                      >
                        <span className="switch-knob" />
                      </button>
                    )}
                    <button
                      className="btn ghost sm"
                      title="Sil"
                      onClick={() => {
                        if (window.confirm(`“${file.name}” silinsin mi?`)) onDeleteFile(kind, file.name)
                      }}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'worlds' && (
          <div className="content-list">
            {content && content.worlds.length > 0 ? (
              content.worlds.map((world) => (
                <div key={world.name} className="content-row">
                  <span className="content-icon">
                    <Icon name="image" size={16} />
                  </span>
                  <span className="grow">
                    <span className="content-name">{world.name}</span>
                    <span className="content-meta">{formatDate(new Date(world.modifiedAt).toISOString())}</span>
                  </span>
                </div>
              ))
            ) : (
              <div className="card ghost">
                <div className="empty">
                  <Icon name="image" size={26} />
                  <div className="empty-title">Henüz dünya yok</div>
                  <div className="tiny">Oyunu açıp yeni bir dünya oluşturduğunda burada görünür.</div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'gallery' && (
          <div className="content-list">
            {content && content.screenshots.length > 0 ? (
              content.screenshots.map((shot) => (
                <div key={shot.name} className="content-row">
                  <span className="content-icon">
                    <Icon name="image" size={16} />
                  </span>
                  <span className="grow">
                    <span className="content-name">{shot.name}</span>
                    <span className="content-meta">
                      {formatBytes(shot.size)} · {formatDate(new Date(shot.modifiedAt).toISOString())}
                    </span>
                  </span>
                  <button className="btn ghost sm" onClick={() => onOpenFolder('screenshots')}>
                    <Icon name="folder" size={14} />
                  </button>
                </div>
              ))
            ) : (
              <div className="card ghost">
                <div className="empty">
                  <Icon name="image" size={26} />
                  <div className="empty-title">Henüz ekran görüntüsü yok</div>
                  <div className="tiny">Oyun içinde F2 ile aldığın görüntüler burada listelenir.</div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'files' && (
          <div className="file-grid">
            {[
              ['root', 'Instance klasörü'],
              ['mods', 'Modlar'],
              ['saves', 'Dünyalar'],
              ['screenshots', 'Ekran görüntüleri'],
              ['resourcepacks', 'Resource Pack'],
              ['shaderpacks', 'Shaderlar'],
              ['datapacks', 'Datapackler']
            ].map(([id, label]) => (
              <button key={id} className="file-card" onClick={() => onOpenFolder(id)}>
                <span className="quick-icon">
                  <Icon name="folder" size={16} />
                </span>
                <span className="grow">
                  <span className="content-name">{label}</span>
                  <span className="content-meta">Klasörü aç</span>
                </span>
                <Icon name="external" size={14} />
              </button>
            ))}
          </div>
        )}
      </div>

      {news.length > 0 && (
        <section className="news-section" data-tour="news">
          <div className="news-head">
            <div>
              <div className="eyebrow">Minecraft dünyasından</div>
              <h3 className="news-title-main">Haberler</h3>
            </div>
            <button
              className="btn ghost sm"
              onClick={() => window.open('https://www.minecraft.net/tr-tr/news', '_blank')}
            >
              Tümünü gör
              <Icon name="external" size={13} />
            </button>
          </div>
          <div className="news-grid">
            {news.slice(0, 3).map((item) => (
              <button key={item.link} className="news-card" onClick={() => window.open(item.link, '_blank')}>
                {item.image && (
                  <div className="news-image">
                    <img src={item.image} alt="" loading="lazy" draggable={false} />
                  </div>
                )}
                <div className="news-body">
                  <div className="news-tag">{item.category}</div>
                  <div className="news-card-title">{item.title}</div>
                  <div className="news-date">{formatDate(item.date)}</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="tiny" style={{ color: 'var(--muted-2)', marginTop: 16 }}>
        {instance.loader === 'vanilla'
          ? 'Vanilla instance’lara mod kurulamaz; modlu oynamak için Fabric/Forge/NeoForge/Quilt ile yeni bir instance oluştur.'
          : 'Loader ilk oyunda otomatik kurulur; modları İçerik sekmesinden yönetebilirsin.'}
      </div>
    </>
  )
}
