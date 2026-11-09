import { useState } from 'react'
import type { JavaInfo, Settings } from '../../../shared/types'
import { Icon } from '../components/Icons'
import { formatBytes } from '../lib/format'

interface Props {
  settings: Settings
  javaInfo: { candidates: JavaInfo[]; required: number; selected: JavaInfo | null } | null
  appVersion: string
  onUpdate: (patch: Partial<Settings>) => void
  onChooseFolder: () => Promise<void>
  onDetectJava: () => void
  onRestartTour: () => void
  onStartUiTour: () => void
}

export function SettingsPage({
  settings,
  javaInfo,
  appVersion,
  onUpdate,
  onChooseFolder,
  onDetectJava,
  onRestartTour,
  onStartUiTour
}: Props): React.JSX.Element {
  const [clientId, setClientId] = useState(settings.microsoftClientId)
  const memoryPercent = ((settings.memoryMb - 1024) / (16384 - 1024)) * 100

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Yapılandırma</div>
          <h1 className="page-title">Ayarlar</h1>
          <p className="page-sub">Oyun klasörü, bellek, Java ve hesap ayarlarını buradan yönet.</p>
        </div>
      </div>

      <div className="settings-stack stagger">
        <div className="card">
          <h3 className="card-title">
            <Icon name="palette" size={15} />
            Görünüm
          </h3>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-name">Tema</div>
              <div className="setting-desc">Açık ve koyu tema arasında geçiş yap.</div>
            </div>
            <div className="theme-toggle">
              <button
                className={settings.theme === 'light' ? 'active' : ''}
                onClick={() => onUpdate({ theme: 'light' })}
              >
                <Icon name="sun" size={14} />
                Açık
              </button>
              <button
                className={settings.theme === 'dark' ? 'active' : ''}
                onClick={() => onUpdate({ theme: 'dark' })}
              >
                <Icon name="moon" size={14} />
                Koyu
              </button>
            </div>
          </div>
        </div>
        <div className="card">
          <h3 className="card-title">
            <Icon name="folder" size={15} />
            Veri
          </h3>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-name">Ortak veri klasörü</div>
              <div className="setting-desc" title={settings.gameDir}>
                Sürümler, kütüphaneler ve asset’ler burada tutulur; tüm instance’lar paylaşır.
                <br />
                {settings.gameDir}
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn outline sm" onClick={() => void onChooseFolder()}>
                Değiştir
              </button>
              <button className="btn ghost sm" onClick={() => void window.api.shell.openFolder()}>
                <Icon name="folder" size={14} />
                Aç
              </button>
            </div>
          </div>
        </div>

        <div className="card" data-tour="performance">
          <h3 className="card-title">
            <Icon name="memory" size={15} />
            Performans
          </h3>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-name">Ayrılan bellek</div>
              <div className="setting-desc">
                Oyunun kullanabileceği en fazla RAM. Modlu oyunlarda 4-6 GB önerilir.
              </div>
            </div>
            <div style={{ width: 270, flex: '0 0 auto' }}>
              <input
                type="range"
                min={1024}
                max={16384}
                step={512}
                value={settings.memoryMb}
                style={{ '--fill': `${memoryPercent}%` } as React.CSSProperties}
                onChange={(e) => onUpdate({ memoryMb: Number(e.target.value) })}
              />
              <div className="row between tiny muted" style={{ marginTop: 8 }}>
                <span>1 GB</span>
                <strong style={{ color: 'var(--accent-deep)' }}>
                  {formatBytes(settings.memoryMb * 1024 * 1024)}
                </strong>
                <span>16 GB</span>
              </div>
              <div className="ram-presets">
                {[2048, 4096, 6144, 8192].map((mb) => (
                  <button
                    key={mb}
                    className={`ram-preset${settings.memoryMb === mb ? ' active' : ''}`}
                    onClick={() => onUpdate({ memoryMb: mb })}
                  >
                    {mb / 1024} GB
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">
            <Icon name="cpu" size={15} />
            Java
          </h3>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-name">Java yolu</div>
              <div className="setting-desc">
                Boş bırakılırsa otomatik bulunur; sürümün istediği Java yoksa otomatik indirilir.
              </div>
            </div>
            <button className="btn ghost sm" onClick={onDetectJava}>
              <Icon name="refresh" size={14} />
              Yeniden tara
            </button>
          </div>

          <div className="field" style={{ marginTop: 4 }}>
            <input
              className="input"
              placeholder="C:\Program Files\Java\jdk-21\bin\java.exe"
              value={settings.javaPath}
              onChange={(e) => onUpdate({ javaPath: e.target.value })}
            />
            <div className="field-hint">
              {javaInfo?.selected
                ? `Seçili: Java ${javaInfo.selected.major} Â· ${javaInfo.selected.path}`
                : 'Uygun Java bulunamadı. Oyunu başlattığında gerekli sürüm otomatik indirilecek.'}
            </div>
          </div>

          {javaInfo && javaInfo.candidates.length > 0 && (
            <div className="quick-list" style={{ marginTop: 14 }}>
              {javaInfo.candidates.slice(0, 5).map((java) => (
                <button key={java.path} className="quick-item" onClick={() => onUpdate({ javaPath: java.path })}>
                  <span className="quick-icon">
                    <Icon name="cpu" size={15} />
                  </span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="version-id">Java {java.major}</span>
                    <div
                      className="version-date"
                      style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {java.version} Â· {java.path}
                    </div>
                  </span>
                  {java.path === settings.javaPath || java.path === javaInfo.selected?.path ? (
                    <span className="badge installed">Seçili</span>
                  ) : (
                    <span className="badge">Kullan</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="card-title">
            <Icon name="user" size={15} />
            Microsoft girişi
          </h3>
          <div className="field">
            <label className="field-label">Azure uygulama (client) ID</label>
            <input
              className="input"
              placeholder="00000000-0000-0000-0000-000000000000"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              onBlur={() => {
                if (clientId !== settings.microsoftClientId) onUpdate({ microsoftClientId: clientId.trim() })
              }}
            />
            <div className="field-hint">
              {settings.microsoftClientId
                ? 'Client ID kayıtlı. Hesaplar sayfasından giriş yapabilirsin.'
                : 'Girilmedi — Microsoft girişi devre dışı.'}
            </div>
          </div>

          <div className="card veil" style={{ marginTop: 16 }}>
            <div className="setting-name" style={{ marginBottom: 10 }}>
              5 adımda client ID alma
            </div>
            <ol className="tiny" style={{ margin: 0, paddingLeft: 18, lineHeight: 2, color: 'var(--muted)' }}>
              <li>
                <span className="link" onClick={() => window.open('https://portal.azure.com', '_blank')}>
                  portal.azure.com
                </span>{' '}
                â†’ <b>Microsoft Entra ID</b> â†’ <b>Uygulama kayıtları</b> â†’ <b>Yeni kayıt</b>.
              </li>
              <li>Ad: örn. “Modlum Launcher”. Hesap türü: <b>Yalnızca kişisel Microsoft hesapları</b>.</li>
              <li>Kaydettikten sonra <b>Uygulama (istemci) kimliği</b> değerini buraya yapıştır.</li>
              <li>
                <b>Kimlik doğrulama</b> â†’ <b>Genel istemci akışlarına izin ver</b> â†’ <b>Evet</b> ve kaydet.
              </li>
              <li>Hesaplar sayfasında “Microsoft ile giriş yap”a bas, kodu tarayıcıda onayla.</li>
            </ol>
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">
            <Icon name="settings" size={15} />
            Tercihler
          </h3>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-name">Snapshot sürümlerini göster</div>
              <div className="setting-desc">Deneysel sürümler de listede görünür.</div>
            </div>
            <button
              className={`switch${settings.showSnapshots ? ' on' : ''}`}
              aria-pressed={settings.showSnapshots}
              onClick={() => onUpdate({ showSnapshots: !settings.showSnapshots })}
            >
              <span className="switch-knob" />
            </button>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-name">Oyun açıkken başlatıcı açık kalsın</div>
              <div className="setting-desc">Kapatırsan oyun başladıktan sonra başlatıcı kendini kapatır.</div>
            </div>
            <button
              className={`switch${settings.keepLauncherOpen ? ' on' : ''}`}
              aria-pressed={settings.keepLauncherOpen}
              onClick={() => onUpdate({ keepLauncherOpen: !settings.keepLauncherOpen })}
            >
              <span className="switch-knob" />
            </button>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-name">Performans modu</div>
              <div className="setting-desc">
                Animasyonları, geçişleri ve saydamlık efektlerini azaltır. Yavaş bilgisayarlarda önerilir.
              </div>
            </div>
            <button
              className={`switch${settings.performanceMode ? ' on' : ''}`}
              aria-pressed={settings.performanceMode}
              onClick={() => onUpdate({ performanceMode: !settings.performanceMode })}
            >
              <span className="switch-knob" />
            </button>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-name">Kurulum turu</div>
              <div className="setting-desc">Momo’nun rehberliğindeki tanıtımı baştan izle.</div>
            </div>
            <button className="btn outline sm" onClick={onRestartTour}>
              <Icon name="refresh" size={14} />
              Yeniden başlat
            </button>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-name">Arayüz turu</div>
              <div className="setting-desc">Bölümleri sahne ışığıyla sırayla gösterir.</div>
            </div>
            <button className="btn outline sm" onClick={onStartUiTour}>
              <Icon name="play" size={14} />
              Başlat
            </button>
          </div>
        </div>

        <div className="card ghost">
          <h3 className="card-title">
            <Icon name="info" size={15} />
            Hakkında
          </h3>
          <div className="setting-name">Modlum Launcher Â· sürüm {appVersion}</div>
          <div className="setting-desc" style={{ marginTop: 6 }}>
            Minecraft: Java Edition için bir başlatıcı. Oyun dosyaları Mojang'ın resmî sunucularından
            indirilir. Bu uygulama Mojang veya Microsoft ile bağlantılı değildir.
          </div>
        </div>
      </div>
    </>
  )
}

