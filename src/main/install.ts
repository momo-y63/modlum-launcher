import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import type { InstallProgress, InstalledVersion, VersionSummary } from '../shared/types'
import { launcherPaths, ensureDir } from './paths'
import { downloadFile, fetchJson, fileExists, mapLimit } from './net'
import {
  getVersionJson,
  getVersionManifest,
  libraryPath,
  libraryUrl,
  rulesAllow,
  OS_NAME,
  type VersionJson
} from './mojang'

type ProgressFn = (p: InstallProgress) => void

export async function listVersions(showSnapshots: boolean): Promise<VersionSummary[]> {
  const manifest = await getVersionManifest()
  return manifest.versions
    .filter((v) => showSnapshots || v.type === 'release')
    .map((v) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime, url: v.url }))
}

export async function listInstalled(gameDir: string): Promise<InstalledVersion[]> {
  const dir = launcherPaths(gameDir).versions
  if (!fs.existsSync(dir)) return []
  const entries = await fsp.readdir(dir, { withFileTypes: true })
  const result: InstalledVersion[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const versionJson = path.join(dir, entry.name, `${entry.name}.json`)
    if (!fileExists(versionJson)) continue
    let installedAt = 0
    try {
      installedAt = (await fsp.stat(versionJson)).mtimeMs
    } catch {
      /* yoksay */
    }
    result.push({ id: entry.name, name: entry.name, installedAt })
  }
  return result.sort((a, b) => b.installedAt - a.installedAt)
}

export function isInstalled(gameDir: string, versionId: string): boolean {
  const p = launcherPaths(gameDir)
  return (
    fileExists(path.join(p.versionDir(versionId), `${versionId}.json`)) &&
    fileExists(path.join(p.versionDir(versionId), `${versionId}.jar`))
  )
}

interface AssetIndex {
  objects: Record<string, { hash: string; size: number }>
  virtual?: boolean
  map_to_resources?: boolean
}

export async function installVersion(
  gameDir: string,
  versionId: string,
  versionUrl: string | null,
  onProgress: ProgressFn,
  force = false
): Promise<VersionJson> {
  const p = launcherPaths(gameDir)

  onProgress({ versionId, phase: 'manifest', current: 0, total: 1, message: 'Sürüm bilgisi alınıyor…' })

  let version: VersionJson
  if (versionUrl) {
    version = await getVersionJson(versionUrl)
  } else {
    const localJson = path.join(p.versionDir(versionId), `${versionId}.json`)
    version = JSON.parse(await fsp.readFile(localJson, 'utf8'))
  }

  if (version.inheritsFrom) {
    throw new Error(
      `"${versionId}" bir mod yükleyici sürümü (inheritsFrom). Şimdilik yalnızca vanilla sürümler destekleniyor.`
    )
  }

  const versionDir = ensureDir(p.versionDir(versionId))
  await fsp.writeFile(path.join(versionDir, `${versionId}.json`), JSON.stringify(version, null, 2), 'utf8')

  // 1) Client jar
  const client = version.downloads?.client
  if (!client?.url) throw new Error('Sürümde client indirme adresi yok.')
  const clientJar = path.join(versionDir, `${versionId}.jar`)
  onProgress({ versionId, phase: 'client', current: 0, total: 1, message: 'Oyun dosyası indiriliyor…' })
  await downloadFile({ url: client.url, dest: clientJar, sha1: client.sha1, size: client.size }, (n) => {
    onProgress({
      versionId,
      phase: 'client',
      current: n,
      total: client.size ?? 0,
      message: 'Oyun dosyası indiriliyor…'
    })
  })

  // 2) Kütüphaneler
  const libs = (version.libraries ?? []).filter((lib) => rulesAllow(lib.rules))
  const libTasks: { url: string; dest: string; sha1?: string; size?: number }[] = []
  const nativeJars: { dest: string; exclude: string[] }[] = []

  for (const lib of libs) {
    const artifact = lib.downloads?.artifact
    const artifactPath = libraryPath(lib)
    const artifactUrl = libraryUrl(lib)
    if (artifactPath && artifactUrl) {
      libTasks.push({
        url: artifactUrl,
        dest: path.join(p.libraries, artifactPath),
        sha1: artifact?.sha1,
        size: artifact?.size
      })
    }

    const nativesKey = lib.natives?.[OS_NAME]
    if (nativesKey && lib.downloads?.classifiers) {
      const classifier = nativesKey.replace('${arch}', process.arch === 'ia32' ? '32' : '64')
      const native = lib.downloads.classifiers[classifier]
      if (native?.url && native.path) {
        nativeJars.push({
          dest: path.join(p.libraries, native.path),
          exclude: lib.extract?.exclude ?? ['META-INF/']
        })
        libTasks.push({
          url: native.url,
          dest: path.join(p.libraries, native.path),
          sha1: native.sha1,
          size: native.size
        })
      }
    }
  }

  let libDone = 0
  onProgress({
    versionId,
    phase: 'libraries',
    current: 0,
    total: libTasks.length,
    message: `Kütüphaneler indiriliyor (0/${libTasks.length})…`
  })
  await mapLimit(libTasks, 12, async (task) => {
    await downloadFile(task, () => undefined)
    libDone++
    onProgress({
      versionId,
      phase: 'libraries',
      current: libDone,
      total: libTasks.length,
      message: `Kütüphaneler indiriliyor (${libDone}/${libTasks.length})…`
    })
  })

  if (nativeJars.length > 0) {
    const nativesDir = ensureDir(p.natives(versionId))
    for (const jar of nativeJars) {
      await extractNatives(jar.dest, nativesDir, jar.exclude)
    }
  }

  // 3) Asset index + nesneler
  if (version.assetIndex) {
    const indexFile = path.join(p.assetsIndexes, `${version.assetIndex.id}.json`)
    let index: AssetIndex
    if (force || !fileExists(indexFile)) {
      index = await fetchJson<AssetIndex>(version.assetIndex.url)
      ensureDir(p.assetsIndexes)
      await fsp.writeFile(indexFile, JSON.stringify(index), 'utf8')
    } else {
      index = JSON.parse(await fsp.readFile(indexFile, 'utf8'))
    }

    const objects = Object.values(index.objects)
    let assetsDone = 0
    let bytesDone = 0
    const totalBytes = objects.reduce((sum, o) => sum + (o.size ?? 0), 0)
    onProgress({
      versionId,
      phase: 'assets',
      current: 0,
      total: objects.length,
      message: `Oyun varlıkları indiriliyor (0/${objects.length})…`
    })

    await mapLimit(objects, 24, async (obj) => {
      const sub = obj.hash.slice(0, 2)
      await downloadFile(
        {
          url: `https://resources.download.minecraft.net/${sub}/${obj.hash}`,
          dest: path.join(p.assetsObjects, sub, obj.hash),
          sha1: obj.hash,
          size: obj.size
        },
        (n) => {
          bytesDone += n
          onProgress({
            versionId,
            phase: 'assets',
            current: assetsDone,
            total: objects.length,
            message: `Oyun varlıkları indiriliyor (${assetsDone}/${objects.length}) — ${formatBytes(bytesDone)}/${formatBytes(totalBytes)}`
          })
        }
      )
      const dest = path.join(p.assetsObjects, sub, obj.hash)
      if (fileExists(dest)) assetsDone++
      onProgress({
        versionId,
        phase: 'assets',
        current: assetsDone,
        total: objects.length,
        message: `Oyun varlıkları indiriliyor (${assetsDone}/${objects.length})…`
      })
    })

    if (index.virtual || index.map_to_resources) {
      const virtualDir = path.join(p.assetsVirtual, version.assetIndex.id)
      onProgress({
        versionId,
        phase: 'assets',
        current: objects.length,
        total: objects.length,
        message: 'Eski sürüm varlıkları hazırlanıyor…'
      })
      for (const [name, obj] of Object.entries(index.objects)) {
        const source = path.join(p.assetsObjects, obj.hash.slice(0, 2), obj.hash)
        const target = path.join(virtualDir, name)
        ensureDir(path.dirname(target))
        if (!fileExists(target)) await fsp.copyFile(source, target).catch(() => undefined)
      }
    }
  }

  // 4) Log yapılandırması
  const logFile = version.logging?.client?.file
  if (logFile?.url) {
    const logId = logFile.id.toLowerCase().endsWith('.xml') ? logFile.id : `${logFile.id}.xml`
    await downloadFile({
      url: logFile.url,
      dest: path.join(p.logConfigs, logId),
      sha1: logFile.sha1,
      size: logFile.size
    })
  }

  onProgress({ versionId, phase: 'done', current: 1, total: 1, message: 'Kurulum tamamlandı.' })
  return version
}

async function extractNatives(jarPath: string, destDir: string, exclude: string[]): Promise<void> {
  // Basit zip okuyucu: yalnızca .dll/.so/.dylib dosyalarını çıkarır.
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  await promisify(execFile)('tar', ['-xf', jarPath, '-C', destDir], { windowsHide: true }).catch(
    () => undefined
  )
  void exclude
}

export function offlineUuid(username: string): string {
  const hash = createHash('md5').update(`OfflinePlayer:${username}`, 'utf8').digest()
  hash[6] = (hash[6] & 0x0f) | 0x30 // sürüm 3
  hash[8] = (hash[8] & 0x3f) | 0x80 // varyant
  const hex = hash.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}
