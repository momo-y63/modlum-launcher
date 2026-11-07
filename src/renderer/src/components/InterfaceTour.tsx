import { useEffect, useState } from 'react'
import type { Page } from './Sidebar'
import { Icon } from './Icons'
import momo from '../assets/guide/momo.png'

interface TourStep {
  page: Page
  target: string
  title: string
  text: string
}

const STEPS: TourStep[] = [
  {
    page: 'home',
    target: '[data-tour="dock"]',
    title: 'Ana menü',
    text: 'Soldaki simgeler ana bölümler: Oyun, Hesaplar, Ayarlar, Konsol ve Bilgi. Üzerine gelince isimleri görünür.'
  },
  {
    page: 'home',
    target: '[data-tour="instances"]',
    title: 'Instance’lar',
    text: 'Her instance kendi sürümünü ve modlarını taşır. Alttaki + ile yenisini oluşturabilirsin.'
  },
  {
    page: 'home',
    target: '[data-tour="instance"]',
    title: 'Seçili instance',
    text: 'Burada instance’ın sürümü, loader’ı, oyun süresi ve Oyna düğmesi var.'
  },
  {
    page: 'home',
    target: '[data-tour="tabs"]',
    title: 'İçerik sekmeleri',
    text: 'Modlar, dünyalar, ekran görüntüleri ve dosyalar bu sekmelerden yönetilir.'
  },
  {
    page: 'accounts',
    target: '[data-tour="accounts"]',
    title: 'Hesaplar',
    text: 'Microsoft hesabı bağla ya da çevrimdışı profil oluştur; aktif hesabı dilediğin an değiştir.'
  },
  {
    page: 'settings',
    target: '[data-tour="performance"]',
    title: 'Ayarlar',
    text: 'Bellek, Java ve performans modu burada. Yavaş bilgisayarda performans modunu aç.'
  },
  {
    page: 'console',
    target: '[data-tour="console"]',
    title: 'Konsol',
    text: 'Oyun ve başlatıcı günlükleri burada akar; sorun olursa ilk buraya bak.'
  },
  {
    page: 'info',
    target: '[data-tour="info-momo"]',
    title: 'Bilgi',
    text: 'Lisanslar, yenilikler ve sistem bilgileri burada. Momo da burada seni bekliyor.'
  }
]

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

const TW = 340
const TH = 250
const GAP = 18

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function computeTip(rect: Rect): { x: number; y: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight

  if (rect.left + rect.width + GAP + TW < vw) {
    return {
      x: rect.left + rect.width + GAP,
      y: clamp(rect.top + rect.height / 2 - TH / 2, 16, vh - TH - 16)
    }
  }
  if (rect.top + rect.height + GAP + TH < vh) {
    return {
      x: clamp(rect.left + rect.width / 2 - TW / 2, 16, vw - TW - 16),
      y: rect.top + rect.height + GAP
    }
  }
  if (rect.top - GAP - TH > 0) {
    return {
      x: clamp(rect.left + rect.width / 2 - TW / 2, 16, vw - TW - 16),
      y: rect.top - GAP - TH
    }
  }
  return { x: vw - TW - 24, y: vh - TH - 24 }
}

export function InterfaceTour({
  step,
  onStep,
  onClose,
  onNavigate,
  performanceMode
}: {
  step: number
  onStep: (step: number) => void
  onClose: () => void
  onNavigate: (page: Page) => void
  performanceMode: boolean
}): React.JSX.Element {
  const [rect, setRect] = useState<Rect | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)

  const current = STEPS[step] ?? STEPS[0]
  const last = step === STEPS.length - 1

  useEffect(() => {
    onNavigate(current.page)
    let cancelled = false

    const measure = (): void => {
      const element = document.querySelector(current.target)
      if (!element) return
      const box = element.getBoundingClientRect()
      const top = Math.max(box.top - 8, 8)
      const padded: Rect = {
        top,
        left: Math.max(box.left - 8, 8),
        width: Math.min(box.width + 16, window.innerWidth - 16),
        height: Math.min(box.height + 16, window.innerHeight - top - 10)
      }
      if (cancelled) return
      setRect(padded)
      setTip(computeTip(padded))
    }

    const timer = window.setTimeout(() => {
      const element = document.querySelector(current.target)
      if (element) {
        const tall = element.getBoundingClientRect().height > window.innerHeight * 0.6
        element.scrollIntoView({
          block: tall ? 'start' : 'center',
          behavior: performanceMode ? 'auto' : 'smooth'
        })
      }
      window.setTimeout(measure, performanceMode ? 40 : 120)
      window.setTimeout(measure, performanceMode ? 80 : 460)
    }, performanceMode ? 40 : 90)

    const onResize = (): void => {
      window.setTimeout(measure, 60)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [step, current.page, current.target, onNavigate, performanceMode])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight') {
        if (last) onClose()
        else onStep(step + 1)
      }
      if (event.key === 'ArrowLeft' && step > 0) onStep(step - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, last, onStep, onClose])

  return (
    <div className="tour-overlay">
      {rect && (
        <div
          className="tour-hole"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      )}

      {tip && (
        <div className="tour-tip" style={{ left: tip.x, top: tip.y, width: TW }}>
          <div className="tour-tip-body" key={step}>
            <div className="tour-tip-head">
            <div className="tour-tip-avatar">
              <img src={momo} alt="" draggable={false} />
            </div>
            <div className="grow">
              <div className="tour-tip-name">Momo · rehber</div>
              <div className="tour-tip-title">{current.title}</div>
            </div>
            <button className="btn ghost sm" onClick={onClose}>
              Atla
            </button>
          </div>

          <p className="tour-tip-text">{current.text}</p>

          <div className="tour-tip-bottom">
            <div className="tour-tip-dots">
              {STEPS.map((_, index) => (
                <button
                  key={index}
                  className={`tour-dot${index === step ? ' active' : ''}${index < step ? ' done' : ''}`}
                  aria-label={`${index + 1}. bölüm`}
                  onClick={() => onStep(index)}
                />
              ))}
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn ghost sm" disabled={step === 0} onClick={() => onStep(step - 1)}>
                <Icon name="chevronLeft" size={14} />
                Geri
              </button>
              <button
                className="btn primary sm"
                onClick={() => {
                  if (last) onClose()
                  else onStep(step + 1)
                }}
              >
                {last ? 'Bitir' : 'İleri'}
                <Icon name="chevronRight" size={14} />
              </button>
            </div>
          </div>
          </div>
        </div>
      )}
    </div>
  )
}
