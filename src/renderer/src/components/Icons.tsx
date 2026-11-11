import type { ReactNode } from 'react'

const paths: Record<string, ReactNode> = {
  play: (
    <path
      d="M9 6.2c0-.9 1-1.5 1.8-1l9 5.8c.7.5.7 1.5 0 2l-9 5.8c-.8.5-1.8-.1-1.8-1V6.2z"
      fill="currentColor"
      stroke="none"
    />
  ),
  stop: <rect x="6.6" y="6.6" width="10.8" height="10.8" rx="3" fill="currentColor" stroke="none" />,
  layers: (
    <>
      <path d="M12 3.9 4.2 7.9l7.8 4 7.8-4-7.8-4z" />
      <path d="m4.2 12.3 7.8 4 7.8-4" />
      <path d="m4.2 16.4 7.8 4 7.8-4" opacity=".5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.7" />
      <path d="M4.9 19.9c.6-3.6 3.4-5.7 7.1-5.7s6.5 2.1 7.1 5.7" />
    </>
  ),
  settings: (
    <>
      <path d="M4 8h7.5M16.5 8H20" />
      <circle cx="14" cy="8" r="2.3" />
      <path d="M4 16h3.5M12.5 16H20" />
      <circle cx="10" cy="16" r="2.3" />
    </>
  ),
  terminal: (
    <>
      <rect x="3.2" y="4.6" width="17.6" height="14.8" rx="3.6" />
      <path d="m7.6 9.6 2.9 2.6-2.9 2.6" />
      <path d="M13.2 15.2h3.9" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.4" />
      <path d="m20 20-3.6-3.6" />
    </>
  ),
  download: (
    <>
      <path d="M12 4.2v9.6" />
      <path d="m7.6 10 4.4 4.4L16.4 10" />
      <path d="M5 19.4h14" />
    </>
  ),
  trash: (
    <>
      <path d="M4.6 7.1h14.8" />
      <path d="M9.6 7.1V5.4c0-.7.5-1.2 1.2-1.2h2.4c.7 0 1.2.5 1.2 1.2v1.7" />
      <path d="M6.7 7.1 7.4 19c0 .9.8 1.6 1.7 1.6h5.8c.9 0 1.7-.7 1.7-1.6l.7-11.9" />
    </>
  ),
  folder: (
    <path d="M3.6 7.4c0-1 .8-1.8 1.8-1.8h3.2c.5 0 1 .2 1.3.6l1.2 1.4h7.5c1 0 1.8.8 1.8 1.8v8.4c0 1-.8 1.8-1.8 1.8H5.4c-1 0-1.8-.8-1.8-1.8V7.4z" />
  ),
  check: <path d="m4.6 12.4 4.7 4.7L19.6 6.8" />,
  x: (
    <>
      <path d="m6.2 6.2 11.6 11.6" />
      <path d="m17.8 6.2-11.6 11.6" />
    </>
  ),
  minus: <path d="M5.4 12h13.2" />,
  square: <rect x="5.6" y="5.6" width="12.8" height="12.8" rx="2.4" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="3" />
      <path d="M5.6 14.6V6.8c0-.9.7-1.6 1.6-1.6h7.8" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.5-5.8" />
      <path d="M20 4.6V10h-5.4" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 11v5.2" />
      <path d="M12 7.9h.01" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.9 3.4 19.4c-.4.7.1 1.6.9 1.6h15.4c.8 0 1.3-.9.9-1.6L12 3.9z" />
      <path d="M12 9.4v4.8" />
      <path d="M12 17.3h.01" />
    </>
  ),
  external: (
    <>
      <path d="M14 4.5h5.5V10" />
      <path d="M19.5 4.5 10.4 13.6" />
      <path d="M18 13.6v4.2c0 1-.8 1.7-1.7 1.7H5.7c-1 0-1.7-.8-1.7-1.7V7.2c0-1 .8-1.7 1.7-1.7h4.2" />
    </>
  ),
  cpu: (
    <>
      <rect x="6.2" y="6.2" width="11.6" height="11.6" rx="3.2" />
      <rect x="9.8" y="9.8" width="4.4" height="4.4" rx="1.2" />
      <path d="M9.4 3.4v2.8M14.6 3.4v2.8M9.4 17.8v2.8M14.6 17.8v2.8M3.4 9.4h2.8M3.4 14.6h2.8M17.8 9.4h2.8M17.8 14.6h2.8" opacity=".6" />
    </>
  ),
  memory: (
    <>
      <rect x="3.4" y="7.2" width="17.2" height="9.6" rx="2.6" />
      <path d="M7.4 16.8v2.6M12 16.8v2.6M16.6 16.8v2.6" opacity=".6" />
      <path d="M7.4 11.2h9.2" opacity=".5" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5.2v13.6" />
      <path d="M5.2 12h13.6" />
    </>
  ),
  sparkles: (
    <path d="M12 3.4c.6 3.9 2.3 5.6 6.2 6.2-3.9.6-5.6 2.3-6.2 6.2-.6-3.9-2.3-5.6-6.2-6.2 3.9-.6 5.6-2.3 6.2-6.2zM18.4 14.6c.3 1.9 1.1 2.7 3 3-1.9.3-2.7 1.1-3 3-.3-1.9-1.1-2.7-3-3 1.9-.3 2.7-1.1 3-3z" />
  ),
  chevronRight: <path d="m9.2 5.4 6.6 6.6-6.6 6.6" />,
  chevronLeft: <path d="M14.8 5.4 8.2 12l6.6 6.6" />,
  monitor: (
    <>
      <rect x="3.2" y="4.8" width="17.6" height="12.2" rx="2.8" />
      <path d="M9 20.2h6" />
      <path d="M12 17v3.2" />
    </>
  ),
  gamepad: (
    <>
      <path d="M7.4 8.4h9.2c2.7 0 4.6 2.1 5 4.8l.6 3.4c.2 1.3-.8 2.4-2.1 2.4-.8 0-1.5-.4-1.9-1.1l-1.2-1.9H7l-1.2 1.9c-.4.7-1.1 1.1-1.9 1.1-1.3 0-2.3-1.1-2.1-2.4l.6-3.4c.4-2.7 2.3-4.8 5-4.8z" />
      <path d="M8.2 11.6v2.6M6.9 12.9h2.6" />
      <path d="M15.6 12.4h.01M17.4 14.1h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.6V12l3 1.8" />
    </>
  ),
  image: (
    <>
      <rect x="3.4" y="4.8" width="17.2" height="14.4" rx="3" />
      <circle cx="8.6" cy="9.7" r="1.6" />
      <path d="m4.6 17 4.7-5 3.6 3.6 2.3-2.4 4.4 4.4" />
    </>
  ),
  zap: <path d="M13.2 3.4 5.4 13h5.4l-1 7.6L18.6 11h-5.4l1-7.6z" />,
  palette: (
    <>
      <path d="M12 3.4a8.6 8.6 0 0 0 0 17.2c1.3 0 2-.8 2-1.8 0-.6-.3-1-.6-1.5-.3-.4-.6-.8-.6-1.4 0-1 .8-1.7 1.8-1.7h1.5c2.4 0 4.1-1.6 4.1-3.9 0-3.9-3.7-6.9-8.2-6.9z" />
      <path d="M7.4 9.4h.01M10.4 7h.01M14.6 7.2h.01M17.2 10h.01" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" />
    </>
  ),
  moon: <path d="M20 14.2A8.2 8.2 0 1 1 9.8 4a6.6 6.6 0 0 0 10.2 10.2z" />,
  home: (
    <>
      <path d="m4.4 10.4 7.6-6.2 7.6 6.2" />
      <path d="M6.4 9.2v9.1c0 .8.7 1.5 1.5 1.5h8.2c.8 0 1.5-.7 1.5-1.5V9.2" />
    </>
  ),
  music: (
    <>
      <circle cx="7.4" cy="17.2" r="2.6" />
      <circle cx="17.4" cy="15" r="2.6" />
      <path d="M10 17.2V7.6l9.4-2.2V15" />
    </>
  ),
  pause: (
    <>
      <rect x="8" y="6.4" width="2.6" height="11.2" rx="1.1" fill="currentColor" stroke="none" />
      <rect x="13.4" y="6.4" width="2.6" height="11.2" rx="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  skipBack: (
    <>
      <path d="M7.2 6.2v11.6" />
      <path d="M18.2 6.9c0-.8-.9-1.3-1.6-.9l-7.4 4.6c-.6.4-.6 1.3 0 1.7l7.4 4.6c.7.4 1.6-.1 1.6-.9V6.9z" fill="currentColor" stroke="none" />
    </>
  ),
  skipForward: (
    <>
      <path d="M16.8 6.2v11.6" />
      <path d="M5.8 6.9c0-.8.9-1.3 1.6-.9l7.4 4.6c.6.4.6 1.3 0 1.7l-7.4 4.6c-.7.4-1.6-.1-1.6-.9V6.9z" fill="currentColor" stroke="none" />
    </>
  ),
  quote: (
    <>
      <path d="M5.4 11.4h4.2v4.6c0 .7-.6 1.3-1.3 1.3H6.7c-.7 0-1.3-.6-1.3-1.3v-4.6z" />
      <path d="M14.4 11.4h4.2v4.6c0 .7-.6 1.3-1.3 1.3h-1.6c-.7 0-1.3-.6-1.3-1.3v-4.6z" />
      <path d="M5.4 11.4c0-3 1.4-5 4-5.8M14.4 11.4c0-3 1.4-5 4-5.8" opacity=".6" />
    </>
  )
}

export function Icon({
  name,
  size = 18,
  className
}: {
  name: keyof typeof paths | string
  size?: number
  className?: string
}): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.35}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name] ?? paths.info}
    </svg>
  )
}

export function MicrosoftIcon({ size = 16 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="2" width="9" height="9" fill="#f25022" />
      <rect x="13" y="2" width="9" height="9" fill="#7fba00" />
      <rect x="2" y="13" width="9" height="9" fill="#00a4ef" />
      <rect x="13" y="13" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}
