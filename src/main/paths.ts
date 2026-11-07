import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

export function dataDir(): string {
  return app.getPath('userData')
}

export function defaultGameDir(): string {
  return path.join(app.getPath('appData'), '.modlum')
}

export function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function launcherPaths(root: string) {
  return {
    root,
    versions: path.join(root, 'versions'),
    libraries: path.join(root, 'libraries'),
    assets: path.join(root, 'assets'),
    assetsObjects: path.join(root, 'assets', 'objects'),
    assetsIndexes: path.join(root, 'assets', 'indexes'),
    assetsVirtual: path.join(root, 'assets', 'virtual'),
    logConfigs: path.join(root, 'assets', 'log_configs'),
    natives: (versionId: string) => path.join(root, 'versions', versionId, 'natives'),
    versionDir: (versionId: string) => path.join(root, 'versions', versionId)
  }
}

export type LauncherPaths = ReturnType<typeof launcherPaths>

export function instancePaths(dir: string) {
  return {
    root: dir,
    mods: path.join(dir, 'mods'),
    saves: path.join(dir, 'saves'),
    screenshots: path.join(dir, 'screenshots'),
    resourcepacks: path.join(dir, 'resourcepacks'),
    shaderpacks: path.join(dir, 'shaderpacks'),
    datapacks: path.join(dir, 'datapacks'),
    logs: path.join(dir, 'logs')
  }
}

export type InstancePaths = ReturnType<typeof instancePaths>
