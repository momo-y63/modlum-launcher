import { BrowserWindow, dialog, ipcMain, shell, app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  Account,
  AppInfo,
  ContentFile,
  Instance,
  InstanceContent,
  InstallProgress,
  LaunchState,
  Loader,
  LogLine,
  NewsItem,
  Settings
} from '../shared/types'
import { loadSettings, saveSettings, flushSettings, getActiveAccount } from './store'
import { dataDir, defaultGameDir, instancePaths, launcherPaths } from './paths'
import { installVersion, isInstalled, listInstalled, listVersions, offlineUuid } from './install'
import { detectJava, ensureJavaRuntime, javaDownloadHint, pickJava } from './java'
import { launchGame } from './launch'
import { installLoader } from './loaders'
import { readLocalVersion } from './merge'
import { fetchJson } from './net'
import { AuthError, completeDeviceLogin, refreshMicrosoftAccount, requestDeviceCode, toDeviceCodeInfo } from './auth/microsoft'

let mainWindow: BrowserWindow | null = null
let currentLaunch: { process: import('node:child_process').ChildProcess; instanceId: string; startedAt: number } | null =
  null
let logs: LogLine[] = []
let msLoginCancelled = false
let pendingRefresh: Promise<Account | null> | null = null
const installing = new Map<string, Promise<void>>()

const LOADERS: Loader[] = ['vanilla', 'fabric', 'quilt', 'forge', 'neoforge']
const ICONS = ['grass', 'lagoon', 'pink', 'amber', 'violet', 'slate']

export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win
}

function send(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

function pushLog(line: LogLine): void {
  logs.push(line)
  if (logs.length > 4000) logs.splice(0, logs.length - 4000)
}

function systemLog(text: string): void {
  const line: LogLine = { stream: 'system', text, at: Date.now() }
  pushLog(line)
  send('log:line', line)
}

function launchState(state: LaunchState): void {
  send('launch:state', state)
}

function sanitizeSettings(patch: Partial<Settings>): Partial<Settings> {
  const clean: Partial<Settings> = {}
  if (typeof patch.gameDir === 'string' && patch.gameDir.trim()) clean.gameDir = path.resolve(patch.gameDir.trim())
  if (typeof patch.javaPath === 'string') clean.javaPath = patch.javaPath.trim()
  if (typeof patch.memoryMb === 'number' && Number.isFinite(patch.memoryMb)) {
    clean.memoryMb = Math.min(32768, Math.max(1024, Math.round(patch.memoryMb)))
  }
  if (typeof patch.microsoftClientId === 'string') clean.microsoftClientId = patch.microsoftClientId.trim()
  if (typeof patch.keepLauncherOpen === 'boolean') clean.keepLauncherOpen = patch.keepLauncherOpen
  if (typeof patch.showSnapshots === 'boolean') clean.showSnapshots = patch.showSnapshots
  if (typeof patch.onboardingDone === 'boolean') clean.onboardingDone = patch.onboardingDone
  if (typeof patch.performanceMode === 'boolean') clean.performanceMode = patch.performanceMode
  if (patch.theme === 'light' || patch.theme === 'dark') clean.theme = patch.theme
  if (typeof patch.activeInstanceId === 'string' || patch.activeInstanceId === null) {
    clean.activeInstanceId = patch.activeInstanceId
  }
  if (patch.playtime && typeof patch.playtime === 'object') clean.playtime = patch.playtime
  return clean
}

function getInstance(id: string): Instance {
  const instance = loadSettings().instances.find((entry) => entry.id === id)
  if (!instance) throw new Error('Instance bulunamadı.')
  return instance
}

function updateInstance(id: string, patch: Partial<Instance>): Instance {
  const settings = loadSettings()
  let updated: Instance | null = null
  const instances = settings.instances.map((entry) => {
    if (entry.id !== id) return entry
    updated = { ...entry, ...patch }
    return updated
  })
  if (!updated) throw new Error('Instance bulunamadı.')
  saveSettings({ instances })
  flushSettings()
  return updated
}

function requiredJavaMajor(sharedRoot: string, versionId: string): number {
  const json = readLocalVersion(sharedRoot, versionId)
  const major = Math.trunc(Number(json?.javaVersion?.majorVersion ?? 8))
  return Number.isFinite(major) && major > 0 ? major : 8
}

async function resolveJava(sharedRoot: string, major: number) {
  const settings = loadSettings()
  const candidates = await detectJava(sharedRoot, settings.javaPath)
  const found = pickJava(candidates, major)
  if (found) return found
  return ensureJavaRuntime(major, () => undefined)
}

async function ensureSharedInstalled(
  sharedRoot: string,
  versionId: string,
  onProgress: (progress: InstallProgress) => void
): Promise<void> {
  if (isInstalled(sharedRoot, versionId)) return
  const existing = installing.get(versionId)
  if (existing) return existing

  const job = (async () => {
    const versions = await listVersions(true)
    const entry = versions.find((version) => version.id === versionId)
    if (!entry) throw new Error(`Sürüm bulunamadı: ${versionId}`)
    await installVersion(sharedRoot, versionId, entry.url, onProgress)
  })().finally(() => installing.delete(versionId))

  installing.set(versionId, job)
  return job
}


function findInstalledLoader(sharedRoot: string, versionId: string, loader: Loader): string | null {
  if (loader === 'vanilla') return versionId
  const dir = launcherPaths(sharedRoot).versions
  if (!fs.existsSync(dir)) return null
  const ids = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  const candidates = ids.filter((id) => {
    if (loader === 'fabric') return id.startsWith('fabric-loader-') && id.endsWith(`-${versionId}`)
    if (loader === 'quilt') return id.startsWith('quilt-loader-') && id.endsWith(`-${versionId}`)
    if (loader === 'forge') return id.startsWith(`${versionId}-forge-`)
    if (loader === 'neoforge') return id.startsWith('neoforge-')
    return false
  })
  const found = candidates.find((id) => readLocalVersion(sharedRoot, id) && isInstalled(sharedRoot, id))
  return found ?? null
}

async function prepareInstance(
  instanceId: string,
  onProgress: (progress: InstallProgress) => void
): Promise<{ instance: Instance; launchVersionId: string }> {
  const settings = loadSettings()
  const sharedRoot = settings.gameDir
  let instance = getInstance(instanceId)

  onProgress({
    instanceId,
    versionId: instance.versionId,
    phase: 'manifest',
    current: 0,
    total: 1,
    message: `${instance.versionId} kontrol ediliyor…`
  })

  await ensureSharedInstalled(sharedRoot, instance.versionId, (progress) =>
    onProgress({ ...progress, instanceId, versionId: instance.versionId })
  )

  if (instance.loader === 'vanilla') {
    if (instance.launchVersionId !== instance.versionId) {
      instance = updateInstance(instance.id, { launchVersionId: instance.versionId })
    }
    return { instance, launchVersionId: instance.versionId }
  }

  const existing =
    instance.launchVersionId && readLocalVersion(sharedRoot, instance.launchVersionId)
      ? instance.launchVersionId
      : findInstalledLoader(sharedRoot, instance.versionId, instance.loader)
  if (existing) {
    if (instance.launchVersionId !== existing) {
      instance = updateInstance(instance.id, { launchVersionId: existing })
    }
    systemLog(`Loader zaten kurulu, yeniden kullanılıyor: ${existing}`)
    return { instance, launchVersionId: existing }
  }

  const java = await resolveJava(sharedRoot, requiredJavaMajor(sharedRoot, instance.versionId))
  const result = await installLoader(sharedRoot, instance.versionId, instance.loader, java, (message) => {
    onProgress({
      instanceId,
      versionId: instance.versionId,
      phase: 'loader',
      current: 0,
      total: 1,
      message
    })
  })

  instance = updateInstance(instance.id, {
    launchVersionId: result.launchVersionId,
    loaderVersion: result.loaderVersion
  })
  return { instance, launchVersionId: result.launchVersionId }
}

async function resolveAccount(): Promise<Account> {
  const settings = loadSettings()
  const account = getActiveAccount()
  if (!account) throw new Error('Önce bir hesap eklemelisin (Hesaplar bölümü).')

  if (account.type === 'microsoft') {
    const expiresAt = account.expiresAt ?? 0
    if (!account.accessToken || expiresAt - Date.now() < 5 * 60 * 1000) {
      if (!settings.microsoftClientId) {
        throw new Error('Microsoft oturumunun süresi doldu ve client ID tanımlı değil.')
      }
      pendingRefresh ??= refreshMicrosoftAccount(account, settings.microsoftClientId).finally(() => {
        pendingRefresh = null
      })
      const refreshed = await pendingRefresh
      if (refreshed) {
        const accounts = loadSettings().accounts.map((entry) => (entry.id === refreshed.id ? refreshed : entry))
        saveSettings({ accounts })
        flushSettings()
        return refreshed
      }
    }
  }
  return account
}

async function startGame(instanceId: string): Promise<void> {
  if (currentLaunch) throw new Error('Oyun zaten çalışıyor.')

  const onProgress = (progress: InstallProgress): void => send('install:progress', progress)
  const { instance, launchVersionId } = await prepareInstance(instanceId, onProgress)

  const settings = loadSettings()
  const account = await resolveAccount()
  const required = requiredJavaMajor(settings.gameDir, launchVersionId)
  const java = await resolveJava(settings.gameDir, required)

  fs.mkdirSync(instance.dir, { recursive: true })

  systemLog(`Instance: ${instance.name} · ${instance.loader} · ${instance.versionId}`)
  systemLog(`Java: ${java.path} (${java.version})`)
  systemLog(`Hesap: ${account.username} (${account.type === 'microsoft' ? 'Microsoft' : 'çevrimdışı'})`)

  const { process: child } = await launchGame({
    sharedRoot: settings.gameDir,
    instanceDir: instance.dir,
    versionId: launchVersionId,
    account,
    java,
    settings
  })

  currentLaunch = { process: child, instanceId, startedAt: Date.now() }
  updateInstance(instanceId, { lastPlayedAt: Date.now() })
  launchState({ running: true, versionId: launchVersionId, startedAt: currentLaunch.startedAt, pid: child.pid })
  systemLog(`Oyun başlatıldı (PID ${child.pid})`)

  if (!settings.keepLauncherOpen) {
    setTimeout(() => app.quit(), 1500)
  }

  child.stdout?.on('data', (chunk: Buffer) => {
    for (const text of chunk.toString('utf8').split(/\r?\n/)) {
      if (!text.trim()) continue
      const line: LogLine = { stream: 'stdout', text, at: Date.now() }
      pushLog(line)
      send('log:line', line)
    }
  })

  child.stderr?.on('data', (chunk: Buffer) => {
    for (const text of chunk.toString('utf8').split(/\r?\n/)) {
      if (!text.trim()) continue
      const line: LogLine = { stream: 'stderr', text, at: Date.now() }
      pushLog(line)
      send('log:line', line)
      if (text.includes('UnsupportedClassVersionError')) {
        systemLog('Sürüm daha yeni bir Java istiyor. Ayarlar → Java bölümünden kontrol et.')
      } else if (text.includes('OutOfMemoryError')) {
        systemLog('Bellek yetersiz. Ayarlar → Performans bölümünden RAM’i artır.')
      }
    }
  })

  child.on('error', (error) => {
    systemLog(`Süreç hatası: ${error.message}`)
  })

  child.on('exit', (code) => {
    const started = currentLaunch?.startedAt
    if (started) {
      const seconds = Math.max(1, Math.round((Date.now() - started) / 1000))
      const target = getInstance(instanceId)
      updateInstance(instanceId, {
        playtimeSeconds: (target.playtimeSeconds ?? 0) + seconds,
        lastPlayedAt: Date.now()
      })
    }
    currentLaunch = null
    const note =
      code === 0
        ? 'Oyun kapandı.'
        : `Oyun beklenmedik şekilde kapandı (çıkış kodu ${code}). Ayrıntılar için Konsol bölümüne bak.`
    systemLog(note)
    launchState({ running: false, versionId: launchVersionId, exitCode: code })
  })
}

function readFiles(dir: string, extensions: string[] | null, includeDisabled = false): ContentFile[] {
  try {
    fs.mkdirSync(dir, { recursive: true })
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const full = path.join(dir, entry.name)
        const stat = fs.statSync(full)
        const disabled = includeDisabled && entry.name.toLowerCase().endsWith('.disabled')
        const cleanName = disabled ? entry.name.slice(0, -'.disabled'.length) : entry.name
        return {
          name: cleanName,
          enabled: !disabled,
          size: stat.size,
          modifiedAt: stat.mtimeMs
        }
      })
      .filter((file) => {
        const name = file.name.toLowerCase()
        if (extensions) return extensions.some((ext) => name.endsWith(ext))
        return true
      })
      .sort((a, b) => b.modifiedAt - a.modifiedAt)
  } catch {
    return []
  }
}

function readDirs(dir: string): ContentFile[] {
  try {
    fs.mkdirSync(dir, { recursive: true })
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const stat = fs.statSync(path.join(dir, entry.name))
        return { name: entry.name, size: 0, modifiedAt: stat.mtimeMs }
      })
      .sort((a, b) => b.modifiedAt - a.modifiedAt)
  } catch {
    return []
  }
}

function instanceContent(instance: Instance): InstanceContent {
  const paths = instancePaths(instance.dir)
  return {
    mods: readFiles(paths.mods, ['.jar'], true),
    resourcepacks: readFiles(paths.resourcepacks, ['.zip', '.jar']),
    shaderpacks: readFiles(paths.shaderpacks, ['.zip', '.jar']),
    datapacks: readFiles(paths.datapacks, ['.zip', '.jar']),
    worlds: readDirs(paths.saves),
    screenshots: readFiles(paths.screenshots, ['.png', '.jpg', '.jpeg'])
  }
}

function isAllowedPath(target: string): boolean {
  const settings = loadSettings()
  const roots = [settings.gameDir, path.join(dataDir(), 'instances'), dataDir()]
  const resolved = path.resolve(target)
  return roots.some((root) => resolved === path.resolve(root) || resolved.startsWith(path.resolve(root) + path.sep))
}

interface MojangNewsEntry {
  title: string
  text: string
  date: string
  category?: string
  playPageImage?: { url: string }
  newsPageImage?: { url: string }
  readMoreLink?: string
}

let newsCache: { items: NewsItem[]; at: number } | null = null

async function getNews(): Promise<NewsItem[]> {
  if (newsCache && Date.now() - newsCache.at < 10 * 60 * 1000) return newsCache.items
  const data = await fetchJson<{ entries: MojangNewsEntry[] }>('https://launchercontent.mojang.com/v2/news.json')
  const items = (data.entries ?? [])
    .filter((entry) => (entry.category ?? '').includes('Java'))
    .slice(0, 4)
    .map((entry) => ({
      title: entry.title,
      text: entry.text,
      date: entry.date,
      category: entry.category ?? 'Minecraft',
      image: entry.newsPageImage?.url
        ? `https://launchercontent.mojang.com${entry.newsPageImage.url}`
        : entry.playPageImage?.url
          ? `https://launchercontent.mojang.com${entry.playPageImage.url}`
          : null,
      link: entry.readMoreLink ?? 'https://www.minecraft.net'
    }))
  newsCache = { items, at: Date.now() }
  return items
}

export function registerIpc(): void {
  ipcMain.handle('app:info', (): AppInfo => ({
    version: app.getVersion(),
    platform: process.platform,
    dataDir: dataDir(),
    defaultGameDir: defaultGameDir(),
    versions: {
      electron: process.versions.electron ?? '',
      chrome: process.versions.chrome ?? '',
      node: process.versions.node ?? ''
    }
  }))

  ipcMain.handle('win:minimize', () => mainWindow?.minimize())
  ipcMain.handle('win:maximize', () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.handle('win:close', () => mainWindow?.close())

  ipcMain.handle('settings:get', (): Settings => loadSettings())
  ipcMain.handle('settings:set', (_event, patch: Partial<Settings>): Settings => {
    const updated = saveSettings(sanitizeSettings(patch))
    flushSettings()
    return updated
  })

  ipcMain.handle('dialog:pick-folder', async (): Promise<string | null> => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Ortak veri klasörünü seç',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('shell:open-folder', async (_event, sub?: string): Promise<void> => {
    const settings = loadSettings()
    const target = sub ? path.join(settings.gameDir, sub) : settings.gameDir
    fs.mkdirSync(target, { recursive: true })
    await shell.openPath(target)
  })

  ipcMain.handle('shell:open-path', async (_event, target: string): Promise<void> => {
    if (!isAllowedPath(target)) throw new Error('Bu yola erişim izni yok.')
    fs.mkdirSync(target, { recursive: true })
    await shell.openPath(target)
  })

  ipcMain.handle('versions:list', async () => {
    const settings = loadSettings()
    const versions = await listVersions(settings.showSnapshots)
    const installed = await listInstalled(settings.gameDir)
    return { versions, installed }
  })

  ipcMain.handle('instances:list', (): Instance[] => loadSettings().instances)

  ipcMain.handle(
    'instances:create',
    (
      _event,
      input: { name: string; versionId: string; loader: Loader; icon: string }
    ): Instance => {
      const name = String(input.name ?? '').trim() || 'Yeni instance'
      const versionId = String(input.versionId ?? '').trim()
      if (!versionId) throw new Error('Bir Minecraft sürümü seçmelisin.')
      const loader = LOADERS.includes(input.loader) ? input.loader : 'vanilla'
      const icon = ICONS.includes(input.icon) ? input.icon : 'grass'

      const settings = loadSettings()
      const id = randomUUID()
      const dir = path.join(dataDir(), 'instances', id)
      const paths = instancePaths(dir)
      for (const target of [paths.mods, paths.saves, paths.screenshots, paths.resourcepacks, paths.shaderpacks, paths.datapacks]) {
        fs.mkdirSync(target, { recursive: true })
      }

      const instance: Instance = {
        id,
        name,
        versionId,
        loader,
        dir,
        icon,
        createdAt: Date.now(),
        lastPlayedAt: null,
        playtimeSeconds: 0
      }
      saveSettings({
        instances: [...settings.instances, instance],
        activeInstanceId: id
      })
      flushSettings()
      return instance
    }
  )

  ipcMain.handle('instances:update', (_event, id: string, patch: Partial<Instance>): Instance => {
    const allowed: Partial<Instance> = {}
    if (typeof patch.name === 'string' && patch.name.trim()) allowed.name = patch.name.trim().slice(0, 40)
    if (typeof patch.icon === 'string' && ICONS.includes(patch.icon)) allowed.icon = patch.icon
    return updateInstance(id, allowed)
  })

  ipcMain.handle('instances:set-active', (_event, id: string): boolean => {
    const settings = loadSettings()
    if (!settings.instances.some((entry) => entry.id === id)) throw new Error('Instance bulunamadı.')
    saveSettings({ activeInstanceId: id })
    flushSettings()
    return true
  })

  ipcMain.handle('instances:delete', (_event, id: string): boolean => {
    if (currentLaunch?.instanceId === id) throw new Error('Çalışan instance silinemez.')
    const settings = loadSettings()
    const instance = settings.instances.find((entry) => entry.id === id)
    if (!instance) return false
    if (path.resolve(instance.dir) === path.resolve(settings.gameDir)) {
      throw new Error('Varsayılan instance ortak veri klasörünü kullanıyor; silinemez.')
    }
    try {
      fs.rmSync(instance.dir, { recursive: true, force: true })
    } catch {
      /* dosyalar kilitliyse sessizce devam */
    }
    const instances = settings.instances.filter((entry) => entry.id !== id)
    saveSettings({
      instances,
      activeInstanceId: settings.activeInstanceId === id ? (instances[0]?.id ?? null) : settings.activeInstanceId
    })
    flushSettings()
    return true
  })

  ipcMain.handle('instances:content', (_event, id: string): InstanceContent => instanceContent(getInstance(id)))

  ipcMain.handle('instances:toggle-mod', (_event, id: string, name: string): boolean => {
    const instance = getInstance(id)
    const dir = instancePaths(instance.dir).mods
    const enabledPath = path.join(dir, name)
    const disabledPath = `${enabledPath}.disabled`
    if (fs.existsSync(enabledPath)) {
      fs.renameSync(enabledPath, disabledPath)
      return true
    }
    if (fs.existsSync(disabledPath)) {
      fs.renameSync(disabledPath, enabledPath)
      return true
    }
    return false
  })

  ipcMain.handle('instances:delete-file', (_event, id: string, kind: string, name: string): boolean => {
    const instance = getInstance(id)
    const paths = instancePaths(instance.dir)
    const dirs: Record<string, string> = {
      mods: paths.mods,
      resourcepacks: paths.resourcepacks,
      shaderpacks: paths.shaderpacks,
      datapacks: paths.datapacks,
      screenshots: paths.screenshots
    }
    const dir = dirs[kind]
    if (!dir) throw new Error('Geçersiz içerik türü.')
    const target = path.join(dir, name)
    if (!target.startsWith(dir + path.sep)) throw new Error('Geçersiz dosya adı.')
    fs.rmSync(target, { recursive: true, force: true })
    if (fs.existsSync(`${target}.disabled`)) fs.rmSync(`${target}.disabled`, { force: true })
    return true
  })

  ipcMain.handle('instances:open', async (_event, id: string, kind?: string): Promise<void> => {
    const instance = getInstance(id)
    const paths = instancePaths(instance.dir)
    const map: Record<string, string> = {
      mods: paths.mods,
      saves: paths.saves,
      screenshots: paths.screenshots,
      resourcepacks: paths.resourcepacks,
      shaderpacks: paths.shaderpacks,
      datapacks: paths.datapacks,
      root: paths.root
    }
    const target = kind ? (map[kind] ?? paths.root) : paths.root
    fs.mkdirSync(target, { recursive: true })
    await shell.openPath(target)
  })

  ipcMain.handle('java:list', async (_event, versionId?: string) => {
    const settings = loadSettings()
    const required = versionId ? requiredJavaMajor(settings.gameDir, versionId) : 21
    const candidates = await detectJava(settings.gameDir, settings.javaPath)
    const selected = pickJava(candidates, required)
    return { candidates, required, selected }
  })

  ipcMain.handle('launch:start', async (_event, instanceId: string) => {
    await startGame(instanceId)
    return true
  })

  ipcMain.handle('launch:stop', () => {
    if (!currentLaunch) return false
    currentLaunch.process.kill()
    return true
  })

  ipcMain.handle('accounts:add-offline', (_event, usernameRaw: string): Account => {
    const username = String(usernameRaw ?? '').trim()
    if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) {
      throw new Error('Kullanıcı adı 3-16 karakter olmalı ve yalnızca harf, rakam, alt çizgi içermeli.')
    }
    const settings = loadSettings()
    if (settings.accounts.some((entry) => entry.type === 'offline' && entry.username.toLowerCase() === username.toLowerCase())) {
      throw new Error('Bu isimde bir çevrimdışı hesap zaten var.')
    }
    const account: Account = {
      id: `offline-${randomUUID()}`,
      type: 'offline',
      username,
      uuid: offlineUuid(username)
    }
    saveSettings({ accounts: [...loadSettings().accounts, account], activeAccountId: account.id })
    flushSettings()
    return account
  })

  ipcMain.handle('accounts:set-active', (_event, id: string) => {
    const settings = loadSettings()
    if (!settings.accounts.some((entry) => entry.id === id)) throw new Error('Hesap bulunamadı.')
    saveSettings({ activeAccountId: id })
    flushSettings()
    return true
  })

  ipcMain.handle('accounts:remove', (_event, id: string) => {
    const settings = loadSettings()
    const accounts = settings.accounts.filter((entry) => entry.id !== id)
    const activeAccountId = settings.activeAccountId === id ? null : settings.activeAccountId
    saveSettings({ accounts, activeAccountId })
    flushSettings()
    return true
  })

  ipcMain.handle('ms:start', async () => {
    const settings = loadSettings()
    msLoginCancelled = false
    const device = await requestDeviceCode(settings.microsoftClientId)
    const info = toDeviceCodeInfo(device)
    send('ms:device', info)

    void (async () => {
      try {
        const account = await completeDeviceLogin(settings.microsoftClientId, device)
        if (msLoginCancelled) return
        const current = loadSettings()
        const accounts = current.accounts.filter((entry) => entry.id !== account.id)
        saveSettings({ accounts: [...accounts, account], activeAccountId: account.id })
        flushSettings()
        send('ms:result', { ok: true, account })
      } catch (error) {
        const message = error instanceof AuthError || error instanceof Error ? error.message : String(error)
        send('ms:result', { ok: false, error: message })
      }
    })()

    return info
  })

  ipcMain.handle('ms:cancel', () => {
    msLoginCancelled = true
    return true
  })

  ipcMain.handle('logs:get', () => logs)
  ipcMain.handle('logs:clear', () => {
    logs = []
    return true
  })

  ipcMain.handle('news:list', async (): Promise<NewsItem[]> => {
    try {
      return await getNews()
    } catch {
      return []
    }
  })
}
