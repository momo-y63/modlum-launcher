import { useState } from 'react'
import type { Account, DeviceCodeInfo, Settings } from '../../../shared/types'
import { Icon, MicrosoftIcon } from '../components/Icons'
import { Avatar } from '../components/Avatar'
import type { Page } from '../components/Sidebar'

interface Props {
  settings: Settings
  activeAccountId: string | null
  msDevice: DeviceCodeInfo | null
  msState: 'idle' | 'waiting' | 'success' | 'error'
  msError: string | null
  onAddOffline: (username: string) => Promise<void>
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onStartMicrosoft: () => void
  onCancelMicrosoft: () => void
  onNavigate: (page: Page) => void
}

export function AccountsPage({
  settings,
  activeAccountId,
  msDevice,
  msState,
  msError,
  onAddOffline,
  onSelect,
  onRemove,
  onStartMicrosoft,
  onCancelMicrosoft,
  onNavigate
}: Props): React.JSX.Element {
  const [username, setUsername] = useState('')
  const [adding, setAdding] = useState(false)
  const [copied, setCopied] = useState(false)

  const hasClientId = Boolean(settings.microsoftClientId)
  const accounts = settings.accounts

  async function submitOffline(): Promise<void> {
    if (!username.trim()) return
    setAdding(true)
    try {
      await onAddOffline(username.trim())
      setUsername('')
    } finally {
      setAdding(false)
    }
  }

  async function copyCode(): Promise<void> {
    if (!msDevice) return
    try {
      await navigator.clipboard.writeText(msDevice.userCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* pano erişimi yoksa sessizce geç */
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Profiller</div>
          <h1 className="page-title">Hesaplar</h1>
          <p className="page-sub">Microsoft hesabınla giriş yap ya da çevrimdışı bir profil oluştur.</p>
        </div>
      </div>

      <div className="grid two stagger" data-tour="accounts">
        <div className="card">
          <h3 className="card-title">
            <Icon name="user" size={15} />
            Kayıtlı hesaplar · {accounts.length}
          </h3>

          {accounts.length === 0 ? (
            <div className="empty">
              <Icon name="user" size={26} />
              <div className="empty-title">Henüz hesap eklenmedi</div>
              <div className="tiny">Aşağıdan bir Microsoft hesabı bağla ya da çevrimdışı profil oluştur.</div>
            </div>
          ) : (
            <div className="quick-list">
              {accounts.map((account) => (
                <div key={account.id} className={`account-row${account.id === activeAccountId ? ' active' : ''}`}>
                  <Avatar name={account.username} size={40} variant={account.type === 'microsoft' ? 'ms' : 'pink'} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="account-chip-name">{account.username}</span>
                      {account.type === 'microsoft' ? (
                        <span className="badge snapshot">Microsoft</span>
                      ) : (
                        <span className="badge">Çevrimdışı</span>
                      )}
                    </div>
                    <div className="account-chip-sub" style={{ marginTop: 3 }}>
                      {account.type === 'microsoft' ? 'Xbox Live ile doğrulandı' : account.uuid}
                    </div>
                  </div>
                  {account.id === activeAccountId ? (
                    <span className="badge installed">Aktif</span>
                  ) : (
                    <button className="btn outline sm" onClick={() => onSelect(account.id)}>
                      Kullan
                    </button>
                  )}
                  <button
                    className="btn ghost sm"
                    title="Hesabı kaldır"
                    onClick={() => {
                      if (window.confirm(`“${account.username}” hesabı kaldırılsın mı?`)) onRemove(account.id)
                    }}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card veil">
          <h3 className="card-title">
            <Icon name="plus" size={15} />
            Çevrimdışı profil
          </h3>
          <p className="setting-desc" style={{ marginTop: 0 }}>
            Sunucuya giriş yapmadan, tek oyunculu ve çevrimdışı sunucularda oynamak için kullanılır. Oyun
            hesabı gerektirmez.
          </p>
          <div className="field mt-16">
            <label className="field-label">Oyuncu adı</label>
            <div className="row">
              <input
                className="input"
                placeholder="3-16 karakter — örn. Steve"
                value={username}
                maxLength={16}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submitOffline()
                }}
              />
              <button className="btn primary" disabled={adding || username.trim().length < 3} onClick={() => void submitOffline()}>
                {adding ? <span className="spinner" /> : <Icon name="plus" size={15} />}
                Ekle
              </button>
            </div>
            <div className="field-hint">Yalnızca harf, rakam ve alt çizgi kullanılabilir.</div>
          </div>
        </div>
      </div>

      <div className="card mt-16">
        <h3 className="card-title">
          <MicrosoftIcon size={15} />
          Microsoft hesabı
        </h3>

        {!hasClientId ? (
          <div>
            <p className="setting-desc" style={{ marginTop: 0 }}>
              Microsoft girişi için bir Azure uygulama kaydı (client ID) gerekiyor. Bu kimlik yalnızca
              giriş içindir; oyun dosyalarına erişmez.
            </p>
            <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <button className="btn outline" onClick={() => onNavigate('settings')}>
                <Icon name="settings" size={15} />
                Ayarlar'dan client ID gir
              </button>
              <button
                className="btn ghost"
                onClick={() =>
                  window.open('https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade', '_blank')
                }
              >
                <Icon name="external" size={14} />
                Azure portal
              </button>
            </div>
          </div>
        ) : msState === 'waiting' && msDevice ? (
          <div className="device-panel">
            <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div className="setting-name">Tarayıcıda şu kodu gir</div>
                <div className="field-hint">
                  {msDevice.verificationUri} adresine git, kodu yapıştır ve hesabınla giriş yap.
                </div>
              </div>
              <button className="btn ghost sm" onClick={onCancelMicrosoft}>
                İptal
              </button>
            </div>

            <div className="row between" style={{ flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
              <div className="device-code">{msDevice.userCode}</div>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn outline sm" onClick={() => void copyCode()}>
                  <Icon name={copied ? 'check' : 'copy'} size={14} />
                  {copied ? 'Kopyalandı' : 'Kopyala'}
                </button>
                <button className="btn primary sm" onClick={() => window.open(msDevice.verificationUri, '_blank')}>
                  <Icon name="external" size={14} />
                  Tarayıcıda aç
                </button>
              </div>
            </div>

            <div className="row mt-16" style={{ gap: 10 }}>
              <span className="spinner dark" />
              <span className="tiny muted">
                Giriş bekleniyor… Kod {Math.floor(msDevice.expiresIn / 60)} dakika boyunca geçerli.
              </span>
            </div>
          </div>
        ) : (
          <div>
            {msState === 'error' && msError && (
              <div
                className="card"
                style={{ marginBottom: 14, borderColor: 'rgba(212,80,124,.35)', background: 'var(--pink-soft)' }}
              >
                <div className="row" style={{ gap: 10 }}>
                  <span style={{ color: 'var(--pink-deep)', display: 'grid', placeItems: 'center' }}>
                    <Icon name="alert" size={17} />
                  </span>
                  <span className="tiny">{msError}</span>
                </div>
              </div>
            )}
            <p className="setting-desc" style={{ marginTop: 0 }}>
              Xbox Live üzerinden güvenli giriş. Şifren bu uygulamaya girilmez; Microsoft'un cihaz kodu
              akışı kullanılır.
            </p>
            <button className="btn primary mt-16" onClick={onStartMicrosoft} disabled={msState === 'waiting'}>
              <MicrosoftIcon size={15} />
              Microsoft ile giriş yap
            </button>
          </div>
        )}
      </div>

      <p className="tiny" style={{ color: 'var(--muted-2)', marginTop: 16, lineHeight: 1.7 }}>
        Çevrimdışı profiller Mojang ve Microsoft sunucularında doğrulanmaz; yalnızca çevrimdışı mod
        sunucularında çalışır. Orijinal oyun sahipleri için Microsoft girişi önerilir.
      </p>
    </>
  )
}
