import momo from '../assets/guide/momo.png'

/**
 * Kurulum rehberi karakteri (CC0 / Openclipart).
 * Animasyonlar CSS ile: nefes/süzülme, yumuşak salınım, pembe taç yaprakları.
 */
export function GuideCharacter({ mood = 'idle' }: { mood?: 'idle' | 'happy' }): React.JSX.Element {
  return (
    <div className={`guide-wrap guide-${mood}`}>
      <span className="guide-shadow" />
      <div className="petal-field" aria-hidden="true">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <span key={n} className={`petal petal-${n}`} />
        ))}
      </div>
      <img className="guide-img" src={momo} alt="Momo — kurulum rehberi" draggable={false} />
    </div>
  )
}

