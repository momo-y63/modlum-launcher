import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { JavaInfo, Loader } from '../shared/types'
import type { VersionJson } from './mojang'
import { launcherPaths } from './paths'
import { downloadFile, fetchJson, fetchText } from './net'
import { mergeVersion, readLocalVersion, writeVersionJson } from './merge'
import { installVersion } from './install'

const execFileAsync = promisify(execFile)

export interface LoaderResult {
  launchVersionId: string
  loaderVersion?: string
}

type Progress = (message: string) => void

interface FabricLoaderEntry {
  loader: { version: string; stable: boolean }
}

interface ForgePromotions {
  promos: Record<string, string>
}

function findVersionDir(sharedRoot: string, predicate: (id: string) => boolean): string | null {
  const dir = launcherPaths(sharedRoot).versions
  if (!fs.existsSync(dir)) return null
  const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  const match = entries
    .map((entry) => entry.name)
    .filter(predicate)
    .sort((a, b) => b.length - a.length)
  return match[0] ?? null
}

async function installProfileJson(
  sharedRoot: string,
  profile: VersionJson,
  progress: Progress
): Promise<LoaderResult> {
  const id = profile.id
  const parent = profile.inheritsFrom
  if (parent && !readLocalVersion(sharedRoot, parent)) {
    progress(`Önce ${parent} sürümü kuruluyor…`)
    await installVersion(sharedRoot, parent, null, () => undefined)
  }

  writeVersionJson(sharedRoot, id, profile)
  const merged = mergeVersion(sharedRoot, id)
  writeVersionJson(sharedRoot, id, merged)

  progress(`${id} dosyaları indiriliyor…`)
  await installVersion(sharedRoot, id, null, () => undefined)
  return { launchVersionId: id, loaderVersion: profile.id }
}

async function installFabric(sharedRoot: string, versionId: string, progress: Progress): Promise<LoaderResult> {
  progress('Fabric sürümleri alınıyor…')
  const loaders = await fetchJson<FabricLoaderEntry[]>(
    `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(versionId)}`
  )
  if (!loaders.length) throw new Error(`Fabric, Minecraft ${versionId} için sürüm bulamadı.`)
  const chosen = loaders.find((entry) => entry.loader.stable) ?? loaders[0]
  progress(`Fabric ${chosen.loader.version} hazırlanıyor…`)
  const profile = await fetchJson<VersionJson>(
    `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(versionId)}/${encodeURIComponent(
      chosen.loader.version
    )}/profile/json`
  )
  profile.id = `fabric-loader-${chosen.loader.version}-${versionId}`
  profile.inheritsFrom = versionId
  const result = await installProfileJson(sharedRoot, profile, progress)
  return { ...result, loaderVersion: chosen.loader.version }
}

async function installQuilt(sharedRoot: string, versionId: string, progress: Progress): Promise<LoaderResult> {
  progress('Quilt sürümleri alınıyor…')
  const loaders = await fetchJson<{ loader: { version: string } }[]>(
    `https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(versionId)}`
  )
  if (!loaders.length) throw new Error(`Quilt, Minecraft ${versionId} için sürüm bulamadı.`)
  const chosen = loaders[0]
  progress(`Quilt ${chosen.loader.version} hazırlanıyor…`)
  const profile = await fetchJson<VersionJson>(
    `https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(versionId)}/${encodeURIComponent(
      chosen.loader.version
    )}/profile/json`
  )
  profile.id = `quilt-loader-${chosen.loader.version}-${versionId}`
  profile.inheritsFrom = versionId
  const result = await installProfileJson(sharedRoot, profile, progress)
  return { ...result, loaderVersion: chosen.loader.version }
}

async function findForgeVersion(versionId: string): Promise<string> {
  progressless()
  const data = await fetchJson<ForgePromotions>(
    'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'
  )
  const recommended = data.promos[`${versionId}-recommended`]
  const latest = data.promos[`${versionId}-latest`]
  const found = recommended ?? latest
  if (!found) throw new Error(`Forge, Minecraft ${versionId} için sürüm bulamadı.`)
  return found
}

function progressless(): void {
  /* yardımcı: sessiz */
}

async function runInstaller(
  java: JavaInfo,
  jarPath: string,
  sharedRoot: string,
  progress: Progress
): Promise<void> {
  const profilesFile = path.join(sharedRoot, 'launcher_profiles.json')
  if (!fs.existsSync(profilesFile)) {
    fs.writeFileSync(
      profilesFile,
      JSON.stringify({ profiles: {}, settings: {}, version: 3, launcherVersion: { name: 'modlum', format: 21 } }, null, 2),
      'utf8'
    )
  }

  progress('Loader yükleyicisi çalıştırılıyor… (birkaç dakika sürebilir)')
  try {
    await execFileAsync(java.path, ['-jar', jarPath, '--installClient', sharedRoot], {
      cwd: sharedRoot,
      windowsHide: true,
      timeout: 15 * 60 * 1000,
      maxBuffer: 10 * 1024 * 1024
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Loader yükleyicisi başarısız oldu: ${message.slice(0, 400)}`)
  }
}

async function installForge(
  sharedRoot: string,
  versionId: string,
  java: JavaInfo,
  progress: Progress
): Promise<LoaderResult> {
  const forgeVersion = await findForgeVersion(versionId)
  const id = `${versionId}-forge-${forgeVersion}`
  const existing = findVersionDir(sharedRoot, (entry) => entry === id)
  if (existing) return { launchVersionId: existing, loaderVersion: forgeVersion }

  progress(`Forge ${forgeVersion} indiriliyor…`)
  const installerName = `forge-${versionId}-${forgeVersion}-installer.jar`
  const installerPath = path.join(sharedRoot, 'installers', installerName)
  await downloadFile({
    url: `https://maven.minecraftforge.net/net/minecraftforge/forge/${versionId}-${forgeVersion}/${installerName}`,
    dest: installerPath
  })

  await runInstaller(java, installerPath, sharedRoot, progress)
  fs.rmSync(installerPath, { force: true })

  const created = findVersionDir(sharedRoot, (entry) => entry.includes('-forge-') && entry.startsWith(versionId))
  if (!created) throw new Error('Forge kurulumu tamamlandı ancak sürüm dosyası bulunamadı.')
  return { launchVersionId: created, loaderVersion: forgeVersion }
}

async function findNeoForgeVersion(versionId: string): Promise<string> {
  const parts = versionId.split('.')
  const prefix = `${parts.slice(1).join('.')}.`
  const xml = await fetchText('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml')
  const versions = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((match) => match[1])
  const candidates = versions.filter((version) => version.startsWith(prefix) && !version.includes('-'))
  if (candidates.length === 0) throw new Error(`NeoForge, Minecraft ${versionId} için sürüm bulamadı.`)
  return candidates[candidates.length - 1]
}

async function installNeoForge(
  sharedRoot: string,
  versionId: string,
  java: JavaInfo,
  progress: Progress
): Promise<LoaderResult> {
  const neoVersion = await findNeoForgeVersion(versionId)
  const id = `neoforge-${neoVersion}`
  const existing = findVersionDir(sharedRoot, (entry) => entry === id)
  if (existing) return { launchVersionId: existing, loaderVersion: neoVersion }

  progress(`NeoForge ${neoVersion} indiriliyor…`)
  const installerName = `neoforge-${neoVersion}-installer.jar`
  const installerPath = path.join(sharedRoot, 'installers', installerName)
  await downloadFile({
    url: `https://maven.neoforged.net/releases/net/neoforged/neoforge/${neoVersion}/${installerName}`,
    dest: installerPath
  })

  await runInstaller(java, installerPath, sharedRoot, progress)
  fs.rmSync(installerPath, { force: true })

  const created = findVersionDir(sharedRoot, (entry) => entry === id || entry.startsWith(`neoforge-${neoVersion}`))
  if (!created) throw new Error('NeoForge kurulumu tamamlandı ancak sürüm dosyası bulunamadı.')
  return { launchVersionId: created, loaderVersion: neoVersion }
}

export async function installLoader(
  sharedRoot: string,
  versionId: string,
  loader: Loader,
  java: JavaInfo,
  progress: Progress,
  knownLoaderVersion?: string
): Promise<LoaderResult> {
  switch (loader) {
    case 'vanilla':
      return { launchVersionId: versionId }
    case 'fabric':
      return installFabric(sharedRoot, versionId, progress)
    case 'quilt':
      return installQuilt(sharedRoot, versionId, progress)
    case 'forge':
      return installForge(sharedRoot, versionId, java, progress)
    case 'neoforge':
      return installNeoForge(sharedRoot, versionId, java, progress)
    default:
      throw new Error(`Bilinmeyen loader: ${String(loader)}`)
  }
}

export function loaderLabel(loader: Loader): string {
  switch (loader) {
    case 'fabric':
      return 'Fabric'
    case 'quilt':
      return 'Quilt'
    case 'forge':
      return 'Forge'
    case 'neoforge':
      return 'NeoForge'
    default:
      return 'Vanilla'
  }
}

export function knownLoaderVersion(sharedRoot: string, versionId: string, loader: Loader): string | null {
  if (loader === 'vanilla') return null
  const match = findVersionDir(sharedRoot, (entry) => entry.includes(`-${loader}-`) || entry.startsWith(`${loader}-`))
  if (!match) return null
  void versionId
  return match
}
