import { useEffect, useState } from 'react'
import type { Account, DeviceCodeInfo, Settings, VersionSummary } from '../../../shared/types'
import { GuideCharacter } from './GuideCharacter'
import { Icon } from './Icons'
import { formatDate } from '../lib/format'

interface Props {
  settings: Settings
  account: Account | null
  latestRelease: VersionSummary | null
  installedCount: number
  msDevice: DeviceCodeInfo | null
  onUpdate: (patch: Partial<Settings>) => void
  onAddOffline: (username: string) => Promise<void>
  onStartMicrosoft: () => void
  onFinish: () => void
}

const LINES = [
  'Önce görünüm: açık mı olsun koyu mu? Sonra her şeyi anlatacağım.',
  'Selam! Ben Momo. İlk kurulumda sana eşlik edeceğim — 30 saniye sürer, söz.',
  'Önce hesap. Microsoft hesabını bağlayabilir ya da çevrimdışı bir profil oluşturabilirsin.',
  'Sırada sürüm var. İstersen en son kararlı sürümü senin için seçeyim.',
  'Bellek ve performans. Bilgisayarın yavaşsa performans modunu aç; animasyonlar sadeleşir.',
  'Hepsi tamam! İyi oyunlar. Bu turu istediğin an Ayarlar’dan yeniden başlatabilirsin.'
]

const RAM_PRESETS = [2048, 4096, 6144, 8192]

export function Onboarding({
  settings,
  account,
  latestRelease,
  installedCount,
  msDevice,
  onUpdate,
  onAddOffline,
  onStartMicrosoft,
  onFinish
}: Props): React.JSX.Element {
  const [step, setStep] = useState(0)
  const [typed, setTyped] = useState('')
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)

  const line = LINES[step] ?? LINES[0]

  useEffect(() => {
    setTyped('')
    if (settings.performanceMode) {
      setTyped(line)
      return
    }
    let index = 0
    const timer = window.setInterval(() => {
      index += 1
      setTyped(line.slice(0, index))
      if (index >= line.length) window.clearInterval(timer)
    }, 16)
    return () => window.clearInterval(timer)
  }, [line, settings.performanceMode])

  const last = step === LINES.length - 1

  async function createProfile(): Promise<void> {
    if (username.trim().length < 3) return
    setBusy(true)
    try {
      await onAddOffline(username.trim())
      setUsername('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="onboarding">
      <div className="tour-art">
        <div className="tour-art-ring ring-1" />
        <div className="tour-art-ring ring-2" />
        <div className="tour-art-ring ring-3" />

        <div className="speech">
          <div className="speech-name">
            <span className="speech-dot" />
            Momo
          </div>
          <p className="speech-text">
            {typed}
            {typed.length < line.length && <span className="caret" />}
          </p>
          <div className="speech-tail" />
        </div>

        <GuideCharacter mood={last ? 'happy' : 'idle'} />
      </div>

      <div className="tour-panel">
        <div className="tour-top">
          <div className="tour-brand">
            <span className="tour-brand-mark">
              <Icon name="play" size={14} />
            </span>
            Modlum
          </div>
          <button className="btn ghost sm" onClick={onFinish}>
            Atla
            <Icon name="chevronRight" size={14} />
          </button>
        </div>

        <div className="tour-content" key={step}>
          {step === 0 && (
            <>
              <div className="eyebrow">Görünüm</div>
              <h1 className="tour-title">Açık mı, koyu mu?</h1>
              <p className="tour-lead">
                İlk ayarı sen seç; istediğin an Ayarlar bölümünden değiştirebilirsin.
              </p>

              <div className="theme-choices">
                <button
                  className={`theme-choice${settings.theme === 'light' ? ' active' : ''}`}
                  onClick={() => onUpdate({ theme: 'light' })}
                >
                  <span className="theme-preview theme-preview-light">
                    <span className="tp-side" />
                    <span className="tp-main">
                      <span className="tp-card" />
                      <span className="tp-card short" />
                    </span>
                  </span>
                  <span className="theme-choice-name">
                    <Icon name="sun" size={16} />
                    Açık tema
                  </span>
                  <span className="theme-choice-hint">Cloud white · gündüz</span>
                </button>

                <button
                  className={`theme-choice${settings.theme === 'dark' ? ' active' : ''}`}
                  onClick={() => onUpdate({ theme: 'dark' })}
                >
                  <span className="theme-preview theme-preview-dark">
                    <span className="tp-side" />
                    <span className="tp-main">
                      <span className="tp-card" />
                      <span className="tp-card short" />
                    </span>
                  </span>
                  <span className="theme-choice-name">
                    <Icon name="moon" size={16} />
                    Koyu tema
                  </span>
                  <span className="theme-choice-hint">Gece · göz yormaz</span>
                </button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="eyebrow">Tanışma</div>
              <h1 className="tour-title">Minecraft’a hoş geldin.</h1>
              <p className="tour-lead">
                Modlum; sürüm indirmeyi, Java’yı ve hesapları senin yerine halleder. Sen sadece oyna.
              </p>
              <div className="tour-features">
                <div className="tour-feature">
                  <span className="tour-feature-icon">
                    <Icon name="download" size={18} />
                  </span>
                  <div>
                    <div className="setting-name">Tek tıkla kurulum</div>
                    <div className="setting-desc">Sürüm, kütüphane ve varlıklar otomatik iner.</div>
                  </div>
                </div>
                <div className="tour-feature">
                  <span className="tour-feature-icon">
                    <Icon name="user" size={18} />
                  </span>
                  <div>
                    <div className="setting-name">İki tür hesap</div>
                    <div className="setting-desc">Microsoft girişi ya da çevrimdışı profil.</div>
                  </div>
                </div>
                <div className="tour-feature">
                  <span className="tour-feature-icon">
                    <Icon name="cpu" size={18} />
                  </span>
                  <div>
                    <div className="setting-name">Kendi Java’sını indirir</div>
                    <div className="setting-desc">Eksik Java sürümünü bulur ve kurar.</div>
                  </div>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="eyebrow">2. adım · Hesap</div>
              <h1 className="tour-title">Nasıl giriş yapmak istersin?</h1>
              <p className="tour-lead">Dilediğin zaman Hesaplar sayfasından değiştirebilirsin.</p>

              {account ? (
                <div className="tour-done">
                  <span className="tour-done-icon">
                    <Icon name="check" size={18} />
                  </span>
                  <div>
                    <div className="setting-name">{account.username} hazır</div>
                    <div className="setting-desc">
                      {account.type === 'microsoft' ? 'Microsoft hesabı bağlandı.' : 'Çevrimdışı profil oluşturuldu.'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="tour-choice">
                  <div className="field">
                    <label className="field-label">Çevrimdışı profil</label>
                    <div className="row">
                      <input
                        className="input"
                        placeholder="Oyuncu adı — örn. Steve"
                        maxLength={16}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void createProfile()
                        }}
                      />
                      <button
                        className="btn primary"
                        disabled={busy || username.trim().length < 3}
                        onClick={() => void createProfile()}
                      >
                        {busy ? <span className="spinner" /> : 'Oluştur'}
                      </button>
                    </div>
                    <div className="field-hint">
                      Hesap gerektirmez; tek oyunculu ve çevrimdışı sunucular için.
                    </div>
                  </div>

                  <div className="tour-or">
                    <span>veya</span>
                  </div>

                  <button className="btn outline" onClick={onStartMicrosoft}>
                    <Icon name="user" size={15} />
                    Microsoft ile giriş yap
                  </button>

                  {msDevice && (
                    <div className="tour-device">
                      <div className="tiny muted">{msDevice.verificationUri} adresinde şu kodu gir:</div>
                      <div className="device-code">{msDevice.userCode}</div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <div className="eyebrow">3. adım · Sürüm</div>
              <h1 className="tour-title">Hangi sürümle başlıyoruz?</h1>
              <p className="tour-lead">
                En son kararlı sürümü seçebilir ya da sürüm listesinden dilediğini indirebilirsin.
              </p>

              {latestRelease && (
                <div className={`tour-version${settings.lastVersionId === latestRelease.id ? ' picked' : ''}`}>
                  <div>
                    <div className="tour-version-id">{latestRelease.id}</div>
                    <div className="version-date">Kararlı · {formatDate(latestRelease.releaseTime)}</div>
                  </div>
                  {settings.lastVersionId === latestRelease.id ? (
                    <span className="badge installed">Seçildi</span>
                  ) : (
                    <button className="btn primary sm" onClick={() => onUpdate({ lastVersionId: latestRelease.id })}>
                      Bunu seç
                    </button>
                  )}
                </div>
              )}

              <div className="tour-note">
                <Icon name="info" size={15} />
                <span>
                  {installedCount > 0
                    ? `${installedCount} sürüm zaten kurulu. İstediğin an Sürümler sayfasından değiştirebilirsin.`
                    : 'Sürüm, oyunu ilk kez başlattığında otomatik olarak indirilecek.'}
                </span>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="eyebrow">4. adım · Ayarlar</div>
              <h1 className="tour-title">Bilgisayarına göre ayarla.</h1>
              <p className="tour-lead">Bu ayarları sonra Ayarlar sayfasından değiştirebilirsin.</p>

              <div className="tour-setting">
                <div className="setting-name">Ayrılan bellek</div>
                <div className="setting-desc">Modlu oyunlarda daha fazlası gerekir.</div>
                <div className="tour-rams">
                  {RAM_PRESETS.map((mb) => (
                    <button
                      key={mb}
                      className={`tour-ram${settings.memoryMb === mb ? ' active' : ''}`}
                      onClick={() => onUpdate({ memoryMb: mb })}
                    >
                      {mb / 1024} GB
                    </button>
                  ))}
                </div>
              </div>

              <div className="tour-setting row between">
                <div>
                  <div className="setting-name">Performans modu</div>
                  <div className="setting-desc">Animasyonları ve saydamlık efektlerini azaltır.</div>
                </div>
                <button
                  className={`switch${settings.performanceMode ? ' on' : ''}`}
                  aria-pressed={settings.performanceMode}
                  onClick={() => onUpdate({ performanceMode: !settings.performanceMode })}
                >
                  <span className="switch-knob" />
                </button>
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <div className="eyebrow">Hazır</div>
              <h1 className="tour-title">Her şey hazır.</h1>
              <p className="tour-lead">Kısa bir özet, sonra oyun ekranına geçiyoruz.</p>

              <div className="tour-summary">
                <div className="tour-summary-row">
                  <span className="stat-label">Hesap</span>
                  <span>{account ? account.username : 'Henüz yok'}</span>
                </div>
                <div className="tour-summary-row">
                  <span className="stat-label">Sürüm</span>
                  <span>{settings.lastVersionId ?? 'Seçilmedi'}</span>
                </div>
                <div className="tour-summary-row">
                  <span className="stat-label">Bellek</span>
                  <span>{(settings.memoryMb / 1024).toFixed(1)} GB</span>
                </div>
                <div className="tour-summary-row">
                  <span className="stat-label">Performans modu</span>
                  <span>{settings.performanceMode ? 'Açık' : 'Kapalı'}</span>
                </div>
              </div>

              <div className="tour-note">
                <Icon name="sparkles" size={15} />
                <span>İpucu: Oyun açıkken launcher penceresini kapatabilirsin, oyun etkilenmez.</span>
              </div>
            </>
          )}
        </div>

        <div className="tour-bottom">
          <div className="tour-dots">
            {LINES.map((_, index) => (
              <button
                key={index}
                className={`tour-dot${index === step ? ' active' : ''}${index < step ? ' done' : ''}`}
                aria-label={`${index + 1}. adım`}
                onClick={() => setStep(index)}
              />
            ))}
          </div>

          <div className="row" style={{ gap: 8 }}>
            {step > 0 && (
              <button className="btn ghost" onClick={() => setStep(step - 1)}>
                <Icon name="chevronLeft" size={15} />
                Geri
              </button>
            )}
            <button
              className="btn primary"
              onClick={() => {
                if (last) onFinish()
                else setStep(step + 1)
              }}
            >
              {last ? 'Oyna ekranına git' : 'Devam'}
              <Icon name="chevronRight" size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
