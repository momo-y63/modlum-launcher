import fs from 'node:fs'
import path from 'node:path'
import type { ArgumentRule, Library, VersionJson } from './mojang'
import { launcherPaths } from './paths'

export function readLocalVersion(sharedRoot: string, id: string): VersionJson | null {
  const file = path.join(launcherPaths(sharedRoot).versionDir(id), `${id}.json`)
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as VersionJson
  } catch {
    return null
  }
}

export function writeVersionJson(sharedRoot: string, id: string, json: VersionJson): void {
  const dir = launcherPaths(sharedRoot).versionDir(id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(json, null, 2), 'utf8')
}

function dedupeLibraries(libraries: Library[]): Library[] {
  const map = new Map<string, Library>()
  for (const library of libraries) {
    const key = library.name
    // Çocuk sürümün kütüphanesi ebeveyninkini geçersiz kılar
    map.set(key, library)
  }
  return [...map.values()]
}

/**
 * inheritsFrom zincirini çözer: ebeveyn sürümün kütüphaneleri, argümanları ve
 * indirme bilgileriyle birleştirilmiş tek bir sürüm JSON'u üretir.
 */
export function mergeVersion(sharedRoot: string, id: string, seen = new Set<string>()): VersionJson {
  const child = readLocalVersion(sharedRoot, id)
  if (!child) throw new Error(`Sürüm dosyası bulunamadı: ${id}`)

  if (!child.inheritsFrom) return child
  if (seen.has(id)) throw new Error(`Döngüsel inheritsFrom: ${id}`)
  seen.add(id)

  const parent = mergeVersion(sharedRoot, child.inheritsFrom, seen)

  const merged: VersionJson = {
    ...parent,
    ...child,
    id,
    inheritsFrom: undefined,
    downloads: { ...(parent.downloads ?? {}), ...(child.downloads ?? {}) },
    assetIndex: child.assetIndex ?? parent.assetIndex,
    assets: child.assets ?? parent.assets,
    javaVersion: child.javaVersion ?? parent.javaVersion,
    mainClass: child.mainClass ?? parent.mainClass,
    libraries: dedupeLibraries([...(parent.libraries ?? []), ...(child.libraries ?? [])])
  }

  const parentArgs = parent.arguments
  const childArgs = child.arguments
  if (parentArgs || childArgs) {
    const game: (string | ArgumentRule)[] = [...(parentArgs?.game ?? []), ...(childArgs?.game ?? [])]
    const jvm: (string | ArgumentRule)[] = [...(parentArgs?.jvm ?? []), ...(childArgs?.jvm ?? [])]
    merged.arguments = { game, jvm }
    delete merged.minecraftArguments
  } else if (parent.minecraftArguments) {
    merged.minecraftArguments = parent.minecraftArguments
  }

  delete (merged as { inheritsFrom?: string }).inheritsFrom
  return merged
}
