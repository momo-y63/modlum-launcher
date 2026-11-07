export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  } catch {
    return iso
  }
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('tr-TR', { hour12: false })
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 60) return '0 dk'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours} sa ${minutes} dk`
  return `${minutes} dk`
}

export function versionTypeLabel(type: string): string {
  switch (type) {
    case 'release':
      return 'Kararlı'
    case 'snapshot':
      return 'Snapshot'
    case 'old_beta':
      return 'Eski beta'
    case 'old_alpha':
      return 'Eski alpha'
    default:
      return type
  }
}

export function versionTypeClass(type: string): string {
  if (type === 'release') return 'release'
  if (type === 'snapshot') return 'snapshot'
  return 'old'
}
