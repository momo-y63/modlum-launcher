const COLORS: Record<string, [string, string, string]> = {
  grass: ['#B9E39A', '#6DBE6B', '#4E9F5A'],
  lagoon: ['#CFC4FF', '#7B61FF', '#4527D9'],
  pink: ['#FBC3D6', '#F07BA4', '#D4507C'],
  amber: ['#FBE3A6', '#F3C14B', '#D99A2B'],
  violet: ['#D9CCF7', '#A78BFA', '#7C5CD6'],
  slate: ['#D6E0E4', '#93A9B0', '#5F7880']
}

export function InstanceIcon({
  icon,
  size = 40
}: {
  icon: string
  size?: number
}): React.JSX.Element {
  const [top, left, right] = COLORS[icon] ?? COLORS.grass
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="13" fill={left} opacity="0.18" />
      <g transform="translate(24 24) scale(1.2) translate(-24 -24)">
        <path d="M24 8 40 16 24 24 8 16Z" fill={top} stroke={right} strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M8 16 24 24v16L8 32Z" fill={left} stroke={right} strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M40 16 24 24v16l16-8Z" fill={right} stroke={right} strokeWidth="1.3" strokeLinejoin="round" opacity="0.92" />
      </g>
    </svg>
  )
}

export const INSTANCE_ICONS = Object.keys(COLORS)
