export type AccountType = 'offline' | 'microsoft'

export interface Account {
  id: string
  type: AccountType
  username: string
  uuid: string
  /** Yalnızca microsoft hesapları için */
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  xuid?: string
}

export type Loader = 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge'

export interface Instance {
  id: string
  name: string
  versionId: string
  loader: Loader
  loaderVersion?: string
  /** Loader kurulduktan sonra başlatılacak sürüm kimliği */
  launchVersionId?: string
  dir: string
  icon: string
  createdAt: number
  lastPlayedAt: number | null
  playtimeSeconds: number
}

export interface Settings {
  gameDir: string
  javaPath: string
  memoryMb: number
  microsoftClientId: string
  keepLauncherOpen: boolean
  lastVersionId: string | null
  activeAccountId: string | null
  accounts: Account[]
  showSnapshots: boolean
  onboardingDone: boolean
  performanceMode: boolean
  theme: 'light' | 'dark'
  /** Sürüm kimliği -> toplam saniye */
  playtime: Record<string, number>
  instances: Instance[]
  activeInstanceId: string | null
}

export interface VersionSummary {
  id: string
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha'
  releaseTime: string
  url: string
}

export interface InstalledVersion {
  id: string
  name: string
  installedAt: number
  sizeBytes?: number
}

export interface InstallProgress {
  versionId: string
  instanceId?: string
  phase: 'manifest' | 'client' | 'libraries' | 'assets' | 'java' | 'loader' | 'done' | 'error'
  current: number
  total: number
  message: string
  error?: string
}

export interface LaunchState {
  running: boolean
  versionId?: string
  pid?: number
  startedAt?: number
  exitCode?: number | null
  error?: string
}

export interface LogLine {
  stream: 'stdout' | 'stderr' | 'system'
  text: string
  at: number
}

export interface JavaInfo {
  path: string
  major: number
  version: string
  source: 'setting' | 'java_home' | 'bundled' | 'path'
}

export interface DeviceCodeInfo {
  userCode: string
  verificationUri: string
  expiresIn: number
  message: string
}

export interface AppInfo {
  version: string
  platform: string
  dataDir: string
  defaultGameDir: string
  versions?: { tauri: string; rust: string; webview: string }
}

export interface InstanceContent {
  mods: ContentFile[]
  resourcepacks: ContentFile[]
  shaderpacks: ContentFile[]
  datapacks: ContentFile[]
  worlds: ContentFile[]
  screenshots: ContentFile[]
}

export interface ContentFile {
  name: string
  enabled?: boolean
  size: number
  modifiedAt: number
}

export interface NewsItem {
  title: string
  text: string
  date: string
  image: string | null
  link: string
  category: string
}
