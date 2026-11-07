import { contextBridge, ipcRenderer } from 'electron'
import type {
  Account,
  AppInfo,
  DeviceCodeInfo,
  Instance,
  InstanceContent,
  InstalledVersion,
  InstallProgress,
  JavaInfo,
  LaunchState,
  Loader,
  LogLine,
  NewsItem,
  Settings,
  VersionSummary
} from '../shared/types'

const api = {
  app: {
    info: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),
    minimize: (): Promise<void> => ipcRenderer.invoke('win:minimize'),
    maximize: (): Promise<void> => ipcRenderer.invoke('win:maximize'),
    close: (): Promise<void> => ipcRenderer.invoke('win:close')
  },
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
    set: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:set', patch)
  },
  dialog: {
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:pick-folder')
  },
  shell: {
    openFolder: (sub?: string): Promise<void> => ipcRenderer.invoke('shell:open-folder', sub),
    openPath: (target: string): Promise<void> => ipcRenderer.invoke('shell:open-path', target)
  },
  versions: {
    list: (): Promise<{ versions: VersionSummary[]; installed: InstalledVersion[] }> =>
      ipcRenderer.invoke('versions:list')
  },
  instances: {
    list: (): Promise<Instance[]> => ipcRenderer.invoke('instances:list'),
    create: (input: { name: string; versionId: string; loader: Loader; icon: string }): Promise<Instance> =>
      ipcRenderer.invoke('instances:create', input),
    update: (id: string, patch: Partial<Instance>): Promise<Instance> =>
      ipcRenderer.invoke('instances:update', id, patch),
    remove: (id: string): Promise<boolean> => ipcRenderer.invoke('instances:delete', id),
    setActive: (id: string): Promise<boolean> => ipcRenderer.invoke('instances:set-active', id),
    content: (id: string): Promise<InstanceContent> => ipcRenderer.invoke('instances:content', id),
    toggleMod: (id: string, name: string): Promise<boolean> => ipcRenderer.invoke('instances:toggle-mod', id, name),
    deleteFile: (id: string, kind: string, name: string): Promise<boolean> =>
      ipcRenderer.invoke('instances:delete-file', id, kind, name),
    open: (id: string, kind?: string): Promise<void> => ipcRenderer.invoke('instances:open', id, kind)
  },
  java: {
    list: (versionId?: string): Promise<{ candidates: JavaInfo[]; required: number; selected: JavaInfo | null }> =>
      ipcRenderer.invoke('java:list', versionId)
  },
  launch: {
    start: (instanceId: string): Promise<boolean> => ipcRenderer.invoke('launch:start', instanceId),
    stop: (): Promise<boolean> => ipcRenderer.invoke('launch:stop')
  },
  accounts: {
    addOffline: (username: string): Promise<Account> => ipcRenderer.invoke('accounts:add-offline', username),
    setActive: (id: string): Promise<boolean> => ipcRenderer.invoke('accounts:set-active', id),
    remove: (id: string): Promise<boolean> => ipcRenderer.invoke('accounts:remove', id)
  },
  microsoft: {
    start: (): Promise<DeviceCodeInfo> => ipcRenderer.invoke('ms:start'),
    cancel: (): Promise<boolean> => ipcRenderer.invoke('ms:cancel')
  },
  logs: {
    get: (): Promise<LogLine[]> => ipcRenderer.invoke('logs:get'),
    clear: (): Promise<boolean> => ipcRenderer.invoke('logs:clear')
  },
  news: {
    list: (): Promise<NewsItem[]> => ipcRenderer.invoke('news:list')
  },
  on: {
    installProgress: (cb: (progress: InstallProgress) => void) => subscribe('install:progress', cb),
    launchState: (cb: (state: LaunchState) => void) => subscribe('launch:state', cb),
    logLine: (cb: (line: LogLine) => void) => subscribe('log:line', cb),
    msDevice: (cb: (device: DeviceCodeInfo) => void) => subscribe('ms:device', cb),
    msResult: (cb: (result: { ok: boolean; account?: Account; error?: string }) => void) =>
      subscribe('ms:result', cb)
  }
}

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
