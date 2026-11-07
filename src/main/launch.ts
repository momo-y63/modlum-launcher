import fs from 'node:fs'
import path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import type { Account, JavaInfo, Settings } from '../shared/types'
import { launcherPaths } from './paths'
import { fileExists } from './net'
import { libraryPath, rulesAllow, type ArgumentRule, type VersionJson } from './mojang'

export interface LaunchResult {
  process: ChildProcess
  command: string[]
}

export interface LaunchOptions {
  sharedRoot: string
  instanceDir: string
  versionId: string
  account: Account
  java: JavaInfo
  settings: Settings
  width?: number
  height?: number
}

const LAUNCHER_NAME = 'modlum'
const LAUNCHER_VERSION = '1.0.0'

export function logConfigFileName(id: string): string {
  return id.toLowerCase().endsWith('.xml') ? id : `${id}.xml`
}

function substitute(template: string, values: Record<string, string>): string {
  return template.replace(/\$\{([^}]+)\}/g, (_all, key: string) => values[key] ?? '')
}

function flattenArguments(
  args: (string | ArgumentRule)[] | undefined,
  features: Record<string, boolean>
): string[] {
  if (!args) return []
  const out: string[] = []
  for (const entry of args) {
    if (typeof entry === 'string') {
      out.push(entry)
      continue
    }
    if (rulesAllow(entry.rules, features)) {
      if (Array.isArray(entry.value)) out.push(...entry.value)
      else out.push(entry.value)
    }
  }
  return out
}

export async function launchGame(options: LaunchOptions): Promise<LaunchResult> {
  const { sharedRoot, instanceDir, versionId, account, java, settings } = options
  const gameDir = instanceDir
  const paths = launcherPaths(sharedRoot)
  const versionFile = path.join(paths.versionDir(versionId), `${versionId}.json`)
  if (!fileExists(versionFile)) throw new Error(`Sürüm kurulu değil: ${versionId}`)

  const version = JSON.parse(fs.readFileSync(versionFile, 'utf8')) as VersionJson
  const clientJar = path.join(paths.versionDir(versionId), `${versionId}.jar`)
  if (!fileExists(clientJar)) throw new Error(`Oyun dosyası eksik: ${versionId}.jar`)

  const features = {
    is_demo_user: false,
    has_custom_resolution: Boolean(options.width && options.height),
    has_quick_plays_support: false,
    is_quick_play_singleplayer: false,
    is_quick_play_multiplayer: false,
    is_quick_play_realms: false
  }

  const classpathEntries: string[] = []
  const nativesDir = paths.natives(versionId)

  for (const lib of version.libraries ?? []) {
    if (!rulesAllow(lib.rules, features)) continue
    const artifactPath = libraryPath(lib)
    if (!artifactPath) continue
    classpathEntries.push(path.join(paths.libraries, artifactPath))
  }
  classpathEntries.push(clientJar)

  const separator = process.platform === 'win32' ? ';' : ':'
  const classpath = classpathEntries.join(separator)

  const logConfig = version.logging?.client
  const logConfigPath = logConfig ? path.join(paths.logConfigs, logConfigFileName(logConfig.file.id)) : ''

  const placeholders: Record<string, string> = {
    auth_player_name: account.username,
    version_name: versionId,
    game_directory: gameDir,
    assets_root: paths.assets,
    assets_index_name: version.assets ?? version.assetIndex?.id ?? 'legacy',
    auth_uuid: account.uuid,
    auth_access_token: account.accessToken || '0',
    auth_session: account.accessToken || '0',
    user_type: account.type === 'microsoft' ? 'msa' : 'legacy',
    user_properties: '{}',
    version_type: version.type,
    classpath,
    libraries_directory: paths.libraries,
    natives_directory: nativesDir,
    launcher_name: LAUNCHER_NAME,
    launcher_version: LAUNCHER_VERSION,
    clientid: '',
    auth_xuid: account.xuid ?? '',
    resolution_width: String(options.width ?? 1280),
    resolution_height: String(options.height ?? 720),
    game_assets: path.join(paths.assetsVirtual, version.assets ?? 'legacy'),
    quickPlayPath: '',
    quickPlaySingleplayer: '',
    quickPlayMultiplayer: '',
    quickPlayRealms: ''
  }

  const jvmArgs: string[] = []
  jvmArgs.push(`-Xmx${Math.max(1024, settings.memoryMb)}M`)
  jvmArgs.push(`-Xms${Math.min(1024, Math.max(512, Math.floor(settings.memoryMb / 2)))}M`)
  jvmArgs.push('-Dfile.encoding=UTF-8')

  const defaultJvm = [
    '-Djava.library.path=${natives_directory}',
    '-Dminecraft.launcher.brand=${launcher_name}',
    '-Dminecraft.launcher.version=${launcher_version}',
    '-cp',
    '${classpath}'
  ]

  const versionJvm = flattenArguments(version.arguments?.jvm, features)
  jvmArgs.push(...(versionJvm.length > 0 ? versionJvm : defaultJvm))

  if (logConfig && logConfigPath && fileExists(logConfigPath)) {
    jvmArgs.push(logConfig.argument.replace('${path}', logConfigPath))
  }

  let gameArgs: string[]
  if (version.arguments?.game) {
    gameArgs = flattenArguments(version.arguments.game, features)
  } else {
    gameArgs = (version.minecraftArguments ?? '').split(' ').filter(Boolean)
  }

  const classpathIndex = jvmArgs.indexOf('${classpath}')
  const resolvedJvm = jvmArgs.map((arg) => substitute(arg, placeholders))
  if (classpathIndex === -1) {
    // eski sürümlerde -cp ayrı gelir; zaten substitute edildi
  }

  const resolvedGame = gameArgs.map((arg) => substitute(arg, placeholders))

  if (!fs.existsSync(nativesDir)) fs.mkdirSync(nativesDir, { recursive: true })
  if (!fs.existsSync(gameDir)) fs.mkdirSync(gameDir, { recursive: true })

  const command = [java.path, ...resolvedJvm, version.mainClass, ...resolvedGame]

  const child = spawn(java.path, [...resolvedJvm, version.mainClass, ...resolvedGame], {
    cwd: gameDir,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  return { process: child, command }
}
