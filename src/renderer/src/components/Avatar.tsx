import { useState } from 'react'

export function Avatar({
  name,
  size = 36,
  variant = 'pink'
}: {
  name?: string | null
  size?: number
  variant?: 'pink' | 'ms'
}): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  const label = name ? name.charAt(0).toUpperCase() : '?'

  return (
    <span
      className={`avatar${variant === 'ms' ? ' ms' : ''}`}
      style={{ width: size, height: size, flexBasis: size, fontSize: size * 0.4 }}
    >
      {name && !failed ? (
        <img
          src={`https://mc-heads.net/avatar/${encodeURIComponent(name)}/${Math.round(size * 2)}`}
          alt=""
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{label}</span>
      )}
    </span>
  )
}
