import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { Account, Instance, Settings } from '../shared/types'
import { defaultGameDir, ensureDir } from './paths'

const DEFAULTS: Settings = {
  gameDir: '',
  javaPath: '',
  memoryMb: 4096,
  microsoftClientId: '',
  keepLauncherOpen: true,
  lastVersionId: null,
  activeAccountId: null,
  accounts: [],
  showSnapshots: false,
  onboardingDone: false,
  performanceMode: false,
  theme: 'light',
  playtime: {},
  instances: [],
  activeInstanceId: null
}

let cached: Settings | null = null
let writeTimer: NodeJS.Timeout | null = null

function settingsFile(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): Settings {
  if (cached) return cached
  let loaded: Partial<Settings> = {}
  try {
    loaded = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'))
  } catch {
    loaded = {}
  }
  cached = {
    ...DEFAULTS,
    ...loaded,
    accounts: Array.isArray(loaded.accounts) ? loaded.accounts : [],
    playtime: loaded.playtime && typeof loaded.playtime === 'object' ? loaded.playtime : {},
    instances: Array.isArray(loaded.instances) ? loaded.instances : []
  }

  // Eski kurulumdan geçiş: seçili sürüm varsa onu bir instance'a dönüştür.
  if (cached.instances.length === 0 && cached.lastVersionId) {
    const migrated: Instance = {
      id: 'default',
      name: 'Varsayılan',
      versionId: cached.lastVersionId,
      loader: 'vanilla',
      dir: cached.gameDir,
      icon: 'grass',
      createdAt: Date.now(),
      lastPlayedAt: null,
      playtimeSeconds: cached.playtime[cached.lastVersionId] ?? 0
    }
    cached.instances = [migrated]
    cached.activeInstanceId = migrated.id
  }
  if (!cached.gameDir) cached.gameDir = defaultGameDir()
  return cached
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const current = loadSettings()
  cached = { ...current, ...patch }
  if (Array.isArray(cached.accounts)) {
    // aynı id'li hesap varsa son hali geçerli
    const map = new Map<string, Account>()
    for (const acc of cached.accounts) map.set(acc.id, acc)
    cached.accounts = [...map.values()]
  }
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(flushSettings, 150)
  return cached
}

export function flushSettings(): void {
  if (!cached) return
  ensureDir(app.getPath('userData'))
  fs.writeFileSync(settingsFile(), JSON.stringify(cached, null, 2), 'utf8')
}

export function getActiveAccount(): Account | null {
  const s = loadSettings()
  return s.accounts.find((a) => a.id === s.activeAccountId) ?? null
}
