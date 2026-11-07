import { useMemo, useState } from 'react'
import type { Loader, VersionSummary } from '../../../shared/types'
import { Icon } from './Icons'
import { INSTANCE_ICONS, InstanceIcon } from './InstanceIcon'
import { formatDate } from '../lib/format'

const LOADERS: { id: Loader; label: string; hint: string }[] = [
  { id: 'vanilla', label: 'Vanilla', hint: 'Modsuz, saf Minecraft' },
  { id: 'fabric', label: 'Fabric', hint: 'Hafif ve hızlı mod yükleyici' },
  { id: 'forge', label: 'Forge', hint: 'Klasik mod ekosistemi' },
  { id: 'neoforge', label: 'NeoForge', hint: 'Modern Forge çatalı' },
  { id: 'quilt', label: 'Quilt', hint: 'Fabric uyumlu yükleyici' }
]

export function CreateInstanceDialog({
  versions,
  onClose,
  onCreate
}: {
  versions: VersionSummary[]
  onClose: () => void
  onCreate: (input: { name: string; versionId: string; loader: Loader; icon: string }) => Promise<void>
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [versionId, setVersionId] = useState('')
  const [loader, setLoader] = useState<Loader>('vanilla')
  const [icon, setIcon] = useState('grass')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')

  const releases = useMemo(() => versions.filter((version) => version.type === 'release'), [versions])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return releases.slice(0, 60)
    return releases.filter((version) => version.id.toLowerCase().includes(q)).slice(0, 60)
  }, [releases, query])

  const selected = versions.find((version) => version.id === versionId)

  async function submit(): Promise<void> {
    if (!versionId || busy) return
    setBusy(true)
    try {
      await onCreate({ name: name.trim() || `${loader === 'vanilla' ? 'Vanilla' : LOADERS.find((l) => l.id === loader)?.label} ${versionId}`, versionId, loader, icon })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">Yeni</div>
            <h2 className="modal-title">Instance oluştur</h2>
          </div>
          <button className="win-btn" onClick={onClose}>
            <Icon name="x" size={15} />
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label className="field-label">İsim</label>
            <input
              className="input"
              placeholder="Örn. Modlu Macera"
              value={name}
              maxLength={40}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="field">
            <label className="field-label">İkon</label>
            <div className="icon-picker">
              {INSTANCE_ICONS.map((key) => (
                <button
                  key={key}
                  className={`icon-choice${icon === key ? ' active' : ''}`}
                  onClick={() => setIcon(key)}
                  aria-label={key}
                >
                  <InstanceIcon icon={key} size={34} />
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="field-label">Minecraft sürümü</label>
            <input
              className="input"
              placeholder="Sürüm ara…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="version-picker">
              {filtered.map((version) => (
                <button
                  key={version.id}
                  className={`version-choice${versionId === version.id ? ' active' : ''}`}
                  onClick={() => setVersionId(version.id)}
                >
                  <span className="version-id">{version.id}</span>
                  <span className="version-date">{formatDate(version.releaseTime)}</span>
                </button>
              ))}
            </div>
            {selected && (
              <div className="field-hint">Seçili: {selected.id} · Kararlı</div>
            )}
          </div>

          <div className="field">
            <label className="field-label">Mod yükleyici</label>
            <div className="loader-picker">
              {LOADERS.map((entry) => (
                <button
                  key={entry.id}
                  className={`loader-choice${loader === entry.id ? ' active' : ''}`}
                  onClick={() => setLoader(entry.id)}
                >
                  <span className="loader-name">{entry.label}</span>
                  <span className="loader-hint">{entry.hint}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>
            İptal
          </button>
          <button className="btn primary" disabled={!versionId || busy} onClick={() => void submit()}>
            {busy ? <span className="spinner" /> : <Icon name="plus" size={15} />}
            Instance oluştur
          </button>
        </div>
      </div>
    </div>
  )
}
