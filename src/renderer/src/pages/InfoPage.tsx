import type { Account, AppInfo, Settings } from '../../../shared/types'
import { Icon } from '../components/Icons'
import momo from '../assets/guide/momo.png'
import { OFL_TEXT } from '../lib/licenses'

interface Props {
  appInfo: AppInfo | null
  settings: Settings
  account: Account | null
  installedCount: number
}

const LICENSES: { name: string; license: string; href: string; note: string }[] = [
  {
    name: 'Momo karakter görseli',
    license: 'CC0 1.0',
    href: 'https://openclipart.org/detail/160326/girl',
    note: 'Openclipart · kamu malı, atıf gerekmez'
  },
  {
    name: 'Fraunces',
    license: 'SIL OFL 1.1',
    href: 'https://fonts.google.com/specimen/Fraunces',
    note: 'Başlık ve sürüm numaraları'
  },
  {
    name: 'Plus Jakarta Sans',
    license: 'SIL OFL 1.1',
    href: 'https://fonts.google.com/specimen/Plus+Jakarta+Sans',
    note: 'Arayüz metinleri'
  },
  {
    name: 'Electron',
    license: 'MIT',
    href: 'https://github.com/electron/electron/blob/main/LICENSE',
    note: 'Masaüstü çatısı'
  },
  {
    name: 'React',
    license: 'MIT',
    href: 'https://github.com/facebook/react/blob/main/LICENSE',
    note: 'Arayüz kütüphanesi'
  },
  {
    name: 'Vite',
    license: 'MIT',
    href: 'https://github.com/vitejs/vite/blob/main/LICENSE',
    note: 'Derleme aracı'
  }
]

const CHANGELOG: { version: string; date: string; items: string[] }[] = [
  {
    version: '1.0',
    date: 'Kasım 2026',
    items: [
      'Yeni açık tema: lagoon blue, cloud white ve bubblegum pink',
      'Anime rehber Momo ile 5 adımlı kurulum turu',
      'Sahne ışıklı arayüz turu: 7 bölüm, otomatik geçiş',
      'Performans modu: animasyonları ve saydamlığı azaltır',
      'Eksik Java sürümünü otomatik indirme',
      'Mojang’ın resmî haber akışı ve gerçek oyuncu avatarları',
      'Oyun süresi takibi ve RAM hazır ayarları',
      'Instance mimarisi: sürüm başına mod, dünya ve ayar',
      'Açık / koyu tema (ilk açılışta Momo sorar)',
      'Fabric / Quilt / Forge / NeoForge destekli oluşturma sihirbazı'
    ]
  }
]

function platformLabel(platform?: string): string {
  if (platform === 'win32') return 'Windows'
  if (platform === 'darwin') return 'macOS'
  if (platform === 'linux') return 'Linux'
  return platform ?? '—'
}

export function InfoPage({ appInfo, settings, account, installedCount }: Props): React.JSX.Element {
  const tip = !account
    ? 'Henüz hesabın yok. Hesaplar bölümünden bir profil ekleyerek başlayabilirsin.'
    : installedCount === 0
      ? `Merhaba ${account.username}! Yeni bir instance oluşturup hemen oynayabilirsin.`
      : `Her şey hazır görünüyor, ${account.username}. Burada lisansları ve yenilikleri bulabilirsin.`

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Hakkında</div>
          <h1 className="page-title">Bilgi</h1>
          <p className="page-sub">Lisanslar, yenilikler ve sistem bilgileri tek yerde.</p>
        </div>
      </div>

      <div className="grid two stagger">
        <div className="card info-momo-card" data-tour="info-momo">
          <div className="info-speech">
            <div className="speech-name">
              <span className="speech-dot" />
              Momo
            </div>
            <p className="info-speech-text">{tip}</p>
            <div className="info-speech-tail" />
          </div>
          <img className="info-momo" src={momo} alt="Momo" draggable={false} />
        </div>

        <div className="card">
          <h3 className="card-title">
            <Icon name="sparkles" size={15} />
            Yenilikler
          </h3>
          {CHANGELOG.map((entry) => (
            <div key={entry.version} className="changelog">
              <div className="changelog-head">
                <span className="badge installed">v{entry.version}</span>
                <span className="tiny muted">{entry.date}</span>
              </div>
              <ul className="changelog-list">
                {entry.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="grid two stagger mt-16">
        <div className="card">
          <h3 className="card-title">
            <Icon name="info" size={15} />
            Lisanslar
          </h3>
          <div className="license-list">
            {LICENSES.map((license) => (
              <button
                key={license.name}
                className="license-row"
                onClick={() => window.open(license.href, '_blank')}
              >
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="license-name">{license.name}</span>
                  <span className="license-note">{license.note}</span>
                </span>
                <span className="badge">{license.license}</span>
                <Icon name="external" size={13} />
              </button>
            ))}
          </div>

          <details className="license-details">
            <summary>SIL Open Font License 1.1 — tam metin</summary>
            <pre>{OFL_TEXT}</pre>
          </details>
        </div>

        <div className="card ghost">
          <h3 className="card-title">
            <Icon name="monitor" size={15} />
            Sistem
          </h3>
          <div className="sys-list">
            <div className="sys-row">
              <span className="stat-label">Uygulama</span>
              <span>Modlum Launcher {appInfo?.version ?? '1.0.0'}</span>
            </div>
            <div className="sys-row">
              <span className="stat-label">Platform</span>
              <span>{platformLabel(appInfo?.platform)}</span>
            </div>
            <div className="sys-row">
              <span className="stat-label">Tauri</span>
              <span>{appInfo?.versions?.tauri ?? '—'}</span>
            </div>
            <div className="sys-row">
              <span className="stat-label">Rust</span>
              <span>{appInfo?.versions?.rust ?? '—'}</span>
            </div>
            <div className="sys-row">
              <span className="stat-label">WebView</span>
              <span>{appInfo?.versions?.webview ?? '—'}</span>
            </div>
            <div className="sys-row">
              <span className="stat-label">Bellek</span>
              <span>{settings.memoryMb} MB</span>
            </div>
            <div className="sys-row">
              <span className="stat-label">Veri klasörü</span>
              <span className="sys-path" title={appInfo?.dataDir}>
                {appInfo?.dataDir ?? '—'}
              </span>
            </div>
          </div>
          <div className="row mt-16" style={{ gap: 8 }}>
            <button className="btn ghost sm" onClick={() => void window.api.shell.openFolder()}>
              <Icon name="folder" size={14} />
              Oyun klasörünü aç
            </button>
          </div>
        </div>
      </div>

      <div className="card ghost mt-16">
        <div className="setting-name">Yasal</div>
        <div className="setting-desc" style={{ marginTop: 6, lineHeight: 1.7 }}>
          Modlum Launcher bağımsız bir projedir; Mojang Studios veya Microsoft ile bağlantılı değildir.
          “Minecraft” ilgili hak sahiplerinin tescilli markasıdır. Oyun dosyaları yalnızca resmî Mojang
          sunucularından indirilir.
        </div>
      </div>
    </>
  )
}
