import { fetchJson } from './net'

export const VERSION_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
export const RESOURCES_URL = 'https://resources.download.minecraft.net'

export interface VersionManifestEntry {
  id: string
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha'
  url: string
  time: string
  releaseTime: string
  sha1: string
  complianceLevel: number
}

export interface VersionManifest {
  latest: { release: string; snapshot: string }
  versions: VersionManifestEntry[]
}

export interface VersionJson {
  id: string
  type: string
  mainClass: string
  releaseTime?: string
  time?: string
  inheritsFrom?: string
  assetIndex?: { id: string; sha1: string; size: number; totalSize: number; url: string }
  assets?: string
  downloads?: {
    client?: DownloadInfo
    server?: DownloadInfo
  }
  libraries?: Library[]
  javaVersion?: { component: string; majorVersion: number }
  logging?: {
    client?: {
      argument: string
      file: DownloadInfo & { id: string }
      type: string
    }
  }
  arguments?: {
    game: (string | ArgumentRule)[]
    jvm: (string | ArgumentRule)[]
  }
  minecraftArguments?: string
}

export interface DownloadInfo {
  url: string
  sha1?: string
  size?: number
  path?: string
}

export interface Library {
  name: string
  url?: string
  downloads?: {
    artifact?: DownloadInfo
    classifiers?: Record<string, DownloadInfo>
  }
  natives?: Record<string, string>
  extract?: { exclude?: string[] }
  rules?: Rule[]
}

export interface Rule {
  action: 'allow' | 'disallow'
  os?: { name?: string; arch?: string; version?: string }
  features?: Record<string, boolean>
}

export interface ArgumentRule {
  rules: Rule[]
  value: string | string[]
}

export function libraryPath(lib: Library): string | null {
  const artifact = lib.downloads?.artifact
  if (artifact?.path) return artifact.path
  const match = lib.name.match(/^([^:]+):([^:]+):([^:@]+)(?::([^@]+))?(?:@(.+))?$/)
  if (!match) return null
  const [, group, artifactId, version, classifier, ext] = match
  const extension = ext ?? 'jar'
  const jar = `${artifactId}-${version}${classifier ? `-${classifier}` : ''}.${extension}`
  return `${group.replace(/\./g, '/')}/${artifactId}/${version}/${jar}`
}

export function libraryUrl(lib: Library): string | null {
  const artifact = lib.downloads?.artifact
  if (artifact?.url) return artifact.url
  const file = libraryPath(lib)
  if (!file) return null
  const base = lib.url ?? 'https://libraries.minecraft.net/'
  return `${base.replace(/\/$/, '')}/${file}`
}

export const OS_NAME =
  process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux'

export function osArch(): string {
  return process.arch === 'ia32' ? 'x86' : process.arch === 'arm64' ? 'arm64' : 'x86_64'
}

export function rulesAllow(rules?: Rule[], features: Record<string, boolean> = {}): boolean {
  if (!rules || rules.length === 0) return true
  let allowed = false
  for (const rule of rules) {
    let matches = true
    if (rule.os) {
      if (rule.os.name && rule.os.name !== OS_NAME) matches = false
      if (rule.os.arch) {
        const arch = rule.os.arch
        const ok =
          (arch === 'x86' && process.arch === 'ia32') ||
          (arch === 'x86_64' && process.arch === 'x64') ||
          arch === process.arch
        if (!ok) matches = false
      }
    }
    if (rule.features) {
      for (const [key, value] of Object.entries(rule.features)) {
        if ((features[key] ?? false) !== value) matches = false
      }
    }
    if (matches) allowed = rule.action === 'allow'
  }
  return allowed
}

let manifestCache: { data: VersionManifest; at: number } | null = null

export async function getVersionManifest(force = false): Promise<VersionManifest> {
  const ttl = 5 * 60 * 1000
  if (!force && manifestCache && Date.now() - manifestCache.at < ttl) return manifestCache.data
  const data = await fetchJson<VersionManifest>(VERSION_MANIFEST_URL)
  manifestCache = { data, at: Date.now() }
  return data
}

export async function getVersionJson(url: string): Promise<VersionJson> {
  return fetchJson<VersionJson>(url)
}
