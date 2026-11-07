import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { app } from 'electron'
import type { JavaInfo } from '../shared/types'
import { downloadFile, fetchJson } from './net'

const execFileAsync = promisify(execFile)

interface JavaCandidate {
  path: string
  source: JavaInfo['source']
}

function existsFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

function listJavaInDir(dir: string, source: JavaInfo['source']): JavaCandidate[] {
  const out: JavaCandidate[] = []
  if (!fs.existsSync(dir)) return out
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const exe = path.join(dir, entry.name, 'bin', 'java.exe')
    if (existsFile(exe)) out.push({ path: exe, source })
    const nested = path.join(dir, entry.name)
    try {
      for (const sub of fs.readdirSync(nested, { withFileTypes: true })) {
        if (!sub.isDirectory()) continue
        const exe2 = path.join(nested, sub.name, 'bin', 'java.exe')
        if (existsFile(exe2)) out.push({ path: exe2, source })
      }
    } catch {
      /* yoksay */
    }
  }
  return out
}

async function readJavaVersion(exe: string): Promise<{ version: string; major: number } | null> {
  try {
    const { stderr, stdout } = await execFileAsync(exe, ['-version'], {
      timeout: 15000,
      windowsHide: true
    })
    const text = `${stderr}\n${stdout}`
    const match = text.match(/version "([^"]+)"/)
    if (!match) return null
    const version = match[1]
    const major = version.startsWith('1.') ? Number(version.split('.')[1]) : Number(version.split('.')[0])
    if (!Number.isFinite(major)) return null
    return { version, major }
  } catch {
    return null
  }
}

function findOnPath(): JavaCandidate[] {
  const out: JavaCandidate[] = []
  const pathVar = process.env.PATH ?? ''
  for (const dir of pathVar.split(path.delimiter)) {
    if (!dir) continue
    const exe = path.join(dir, 'java.exe')
    if (existsFile(exe)) out.push({ path: exe, source: 'path' })
  }
  return out
}

export async function detectJava(gameDir: string, javaPathSetting: string): Promise<JavaInfo[]> {
  const candidates: JavaCandidate[] = []

  if (javaPathSetting) {
    if (javaPathSetting.toLowerCase().endsWith('.exe') && existsFile(javaPathSetting)) {
      candidates.push({ path: javaPathSetting, source: 'setting' })
    } else {
      const exe = path.join(javaPathSetting, 'bin', 'java.exe')
      if (existsFile(exe)) candidates.push({ path: exe, source: 'setting' })
    }
  }

  if (process.env.JAVA_HOME) {
    const exe = path.join(process.env.JAVA_HOME, 'bin', 'java.exe')
    if (existsFile(exe)) candidates.push({ path: exe, source: 'java_home' })
  }

  // Launcher'ın kendi indirdiği runtime (Mojang java runtime) veya manuel kurulumlar
  for (const base of [
    path.join(gameDir, 'runtime'),
    path.join(app.getPath('userData'), 'runtime'),
    path.join(process.env.APPDATA ?? '', '.minecraft', 'runtime')
  ]) {
    for (const c of listJavaInDir(base, 'bundled')) candidates.push(c)
  }

  for (const c of findOnPath()) candidates.push(c)

  // Windows'ta yaygın kurulum dizinleri
  for (const dir of [
    'C:\\Program Files\\Java',
    'C:\\Program Files\\Eclipse Adoptium',
    'C:\\Program Files\\Microsoft\\jdk',
    'C:\\Program Files\\Zulu',
    'C:\\Program Files\\BellSoft'
  ]) {
    for (const c of listJavaInDir(dir, 'path')) candidates.push(c)
  }

  const seen = new Set<string>()
  const result: JavaInfo[] = []
  for (const candidate of candidates) {
    const key = candidate.path.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const info = await readJavaVersion(candidate.path)
    if (!info) continue
    result.push({
      path: candidate.path,
      major: info.major,
      version: info.version,
      source: candidate.source
    })
  }

  return result.sort((a, b) => b.major - a.major)
}

export function pickJava(available: JavaInfo[], requiredMajor: number): JavaInfo | null {
  if (available.length === 0) return null
  const exact = available.filter((j) => j.major === requiredMajor)
  if (exact.length > 0) return exact[0]
  // Gereken sürümden küçük Java ile başlatmak oyunu gizemli hatalarla çökertir;
  // yalnızca gereken veya daha yeni bir sürüm kabul edilir.
  const compatible = available.filter((j) => j.major >= requiredMajor).sort((a, b) => a.major - b.major)
  return compatible[0] ?? null
}

export function javaDownloadHint(requiredMajor: number): string {
  return `Java ${requiredMajor} bulunamadı ve otomatik indirme başarısız oldu. https://adoptium.net/temurin/releases/?version=${requiredMajor} adresinden Temurin ${requiredMajor} (JRE) kurup launcher'ı yeniden başlatın veya Ayarlar'dan java.exe yolunu seçin.`
}

interface AdoptiumAsset {
  binary: {
    package: {
      link: string
      name: string
      size: number
      checksum: string
    }
  }
}

/**
 * Gereken Java sürümünü Adoptium Temurin JRE olarak indirir ve launcher'ın
 * runtime klasörüne çıkarır. Böylece kullanıcı elle Java kurmak zorunda kalmaz.
 */
export async function ensureJavaRuntime(
  majorVersion: number,
  onProgress: (current: number, total: number, message: string) => void
): Promise<JavaInfo> {
  const runtimeRoot = path.join(app.getPath('userData'), 'runtime')
  const targetDir = path.join(runtimeRoot, `java-${majorVersion}`)

  const existing = findJavaUnder(targetDir)
  if (existing) {
    const info = await readJavaVersion(existing)
    if (info && info.major >= majorVersion) {
      return { path: existing, major: info.major, version: info.version, source: 'bundled' }
    }
  }

  onProgress(0, 1, `Java ${majorVersion} indiriliyor…`)
  const assets = await fetchJson<AdoptiumAsset[]>(
    `https://api.adoptium.net/v3/assets/latest/${majorVersion}/hotspot?os=windows&architecture=x64&image_type=jre`
  )
  const pkg = assets?.[0]?.binary?.package
  if (!pkg?.link) throw new Error(`Java ${majorVersion} indirme adresi bulunamadı.`)

  const zipPath = path.join(runtimeRoot, `java-${majorVersion}.zip`)
  let downloaded = 0
  await downloadFile(
    { url: pkg.link, dest: zipPath, sha256: pkg.checksum, size: pkg.size },
    (bytes) => {
      downloaded += bytes
      onProgress(downloaded, pkg.size, `Java ${majorVersion} indiriliyor… ${Math.round((downloaded / pkg.size) * 100)}%`)
    }
  )

  onProgress(pkg.size, pkg.size, `Java ${majorVersion} çıkarılıyor…`)
  fs.mkdirSync(targetDir, { recursive: true })
  await execFileAsync('tar', ['-xf', zipPath, '-C', targetDir], { windowsHide: true })
  await fsp.rm(zipPath, { force: true })

  const javaExe = findJavaUnder(targetDir)
  if (!javaExe) throw new Error('Java arşivi çıkarıldı ancak java.exe bulunamadı.')

  const info = await readJavaVersion(javaExe)
  if (!info || info.major < majorVersion) {
    throw new Error(`Java ${majorVersion} kurulumu doğrulanamadı.`)
  }

  return { path: javaExe, major: info.major, version: info.version, source: 'bundled' }
}

function findJavaUnder(root: string): string | null {
  if (!fs.existsSync(root)) return null
  const stack = [root]
  let guard = 0
  while (stack.length > 0 && guard++ < 5000) {
    const current = stack.pop()!
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (entry.name.toLowerCase() === 'java.exe') return full
    }
  }
  return null
}
