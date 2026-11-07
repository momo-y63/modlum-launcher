import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { ensureDir } from './paths'

const USER_AGENT = 'ModlumLauncher/1.0 (Minecraft launcher)'

export class HttpError extends Error {
  status: number
  constructor(status: number, url: string) {
    super(`HTTP ${status}: ${url}`)
    this.status = status
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit, retries = 3): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
          ...(init?.headers ?? {})
        }
      })
      if (!res.ok) throw new HttpError(res.status, url)
      return (await res.json()) as T
    } catch (err) {
      lastError = err
      if (err instanceof HttpError && err.status < 500 && err.status !== 429) throw err
      if (attempt < retries) await sleep(600 * 2 ** attempt)
    }
  }
  throw lastError
}

export async function fetchText(url: string, retries = 3): Promise<string> {
  const res = await fetchWithRetry(url, retries)
  return await res.text()
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
      if (!res.ok) throw new HttpError(res.status, url)
      return res
    } catch (err) {
      lastError = err
      if (err instanceof HttpError && err.status < 500 && err.status !== 429) throw err
      if (attempt < retries) await sleep(600 * 2 ** attempt)
    }
  }
  throw lastError
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function sha1File(file: string): Promise<string> {
  const hash = crypto.createHash('sha1')
  await pipeline(fs.createReadStream(file), hash)
  return hash.digest('hex')
}

export async function sha256File(file: string): Promise<string> {
  const hash = crypto.createHash('sha256')
  await pipeline(fs.createReadStream(file), hash)
  return hash.digest('hex')
}

export interface DownloadTask {
  url: string
  dest: string
  sha1?: string
  sha256?: string
  size?: number
}

/**
 * Tek dosya indirir; sha1 verilmişse ve mevcut dosya doğruysa atlar.
 * Dönüş: atlandı mı?
 */
export async function downloadFile(task: DownloadTask, onBytes?: (n: number) => void): Promise<boolean> {
  ensureDir(path.dirname(task.dest))

  if (task.sha1 || task.sha256) {
    try {
      const stat = await fsp.stat(task.dest)
      if (stat.isFile() && stat.size > 0 && (stat.size === task.size || !task.size)) {
        const ok = task.sha1
          ? (await sha1File(task.dest)) === task.sha1
          : (await sha256File(task.dest)) === task.sha256
        if (ok) {
          onBytes?.(stat.size)
          return true
        }
      }
    } catch {
      /* dosya yok */
    }
  } else {
    try {
      const stat = await fsp.stat(task.dest)
      if (stat.isFile() && stat.size > 0) return true
    } catch {
      /* dosya yok */
    }
  }

  const tmp = `${task.dest}.part`
  const res = await fetchWithRetry(task.url)
  if (!res.body) throw new Error(`Boş yanıt: ${task.url}`)

  let received = 0
  const stream = Readable.fromWeb(res.body as any)
  stream.on('data', (chunk: Buffer) => {
    received += chunk.length
    onBytes?.(chunk.length)
  })

  await pipeline(stream, fs.createWriteStream(tmp))

  if (task.sha1) {
    const digest = await sha1File(tmp)
    if (digest !== task.sha1) {
      await fsp.rm(tmp, { force: true })
      throw new Error(`Dosya bütünlüğü bozuk: ${path.basename(task.dest)}`)
    }
  } else if (task.sha256) {
    const digest = await sha256File(tmp)
    if (digest.toLowerCase() !== task.sha256.toLowerCase()) {
      await fsp.rm(tmp, { force: true })
      throw new Error(`Dosya bütünlüğü bozuk: ${path.basename(task.dest)}`)
    }
  }
  await fsp.rename(tmp, task.dest)
  return false
}

/** Basit eşzamanlılık havuzu */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const index = next++
      if (index >= items.length) return
      results[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

export function fileExists(p: string): boolean {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}
