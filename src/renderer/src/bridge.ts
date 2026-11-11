import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
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
  Lyrics,
  NewsItem,
  NowPlaying,
  Settings,
  SpotifyConnection,
  VersionSummary
} from '../../shared/types'

const call = <T>(command: string, args?: Record<string, unknown>): Promise<T> =>
  args ? invoke<T>(command, args) : invoke<T>(command)

export const api = {
  app: {
    info: (): Promise<AppInfo> => call('app_info'),
    minimize: (): Promise<void> => call('win_minimize'),
    maximize: (): Promise<void> => call('win_maximize'),
    close: (): Promise<void> => call('win_close')
  },
  settings: {
    get: (): Promise<Settings> => call('settings_get'),
    set: (patch: Partial<Settings>): Promise<Settings> => call('settings_set', { patch })
  },
  dialog: {
    pickFolder: (): Promise<string | null> => call('pick_folder')
  },
  shell: {
    openFolder: (sub?: string): Promise<void> => call('open_folder', { sub }),
    openPath: (target: string): Promise<void> => call('open_path', { target }),
    openUrl: (url: string): Promise<void> => call('open_url', { url })
  },
  versions: {
    list: (): Promise<{ versions: VersionSummary[]; installed: InstalledVersion[] }> =>
      call('versions_list')
  },
  instances: {
    list: (): Promise<Instance[]> => call('instances_list'),
    create: (input: { name: string; versionId: string; loader: Loader; icon: string }): Promise<Instance> =>
      call('instances_create', { input }),
    update: (id: string, patch: Partial<Instance>): Promise<Instance> =>
      call('instances_update', { id, patch }),
    remove: (id: string): Promise<boolean> => call('instances_delete', { id }),
    setActive: (id: string): Promise<boolean> => call('instances_set_active', { id }),
    content: (id: string): Promise<InstanceContent> => call('instances_content', { id }),
    toggleMod: (id: string, name: string): Promise<boolean> =>
      call('instances_toggle_mod', { id, name }),
    deleteFile: (id: string, kind: string, name: string): Promise<boolean> =>
      call('instances_delete_file', { id, kind, name }),
    open: (id: string, kind?: string): Promise<void> => call('instances_open', { id, kind })
  },
  java: {
    list: (versionId?: string): Promise<{ candidates: JavaInfo[]; required: number; selected: JavaInfo | null }> =>
      call('java_list', { versionId })
  },
  launch: {
    start: (instanceId: string): Promise<boolean> => call('launch_start', { instanceId }),
    stop: (): Promise<boolean> => call('launch_stop')
  },
  accounts: {
    addOffline: (username: string): Promise<Account> => call('accounts_add_offline', { username }),
    setActive: (id: string): Promise<boolean> => call('accounts_set_active', { id }),
    remove: (id: string): Promise<boolean> => call('accounts_remove', { id })
  },
  microsoft: {
    start: (): Promise<DeviceCodeInfo> => call('ms_start'),
    cancel: (): Promise<boolean> => call('ms_cancel')
  },
  logs: {
    get: (): Promise<LogLine[]> => call('logs_get'),
    clear: (): Promise<boolean> => call('logs_clear')
  },
  news: {
    list: (): Promise<NewsItem[]> => call('news_list')
  },
  spotify: {
    login: (): Promise<SpotifyConnection> => call('spotify_login'),
    logout: (): Promise<boolean> => call('spotify_logout'),
    status: (): Promise<NowPlaying> => call('spotify_status'),
    control: (action: string, positionMs?: number): Promise<boolean> =>
      call('spotify_control', { action, positionMs }),
    lyrics: (input: { artist: string; title: string; album: string; durationMs: number }): Promise<Lyrics> =>
      call('spotify_lyrics', {
        artist: input.artist,
        title: input.title,
        album: input.album,
        durationMs: input.durationMs
      })
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

function subscribe<T>(event: string, cb: (payload: T) => void): () => void {
  let unlisten: UnlistenFn | null = null
  let disposed = false
  void listen<T>(event, (payload) => cb(payload.payload)).then((off) => {
    if (disposed) off()
    else unlisten = off
  })
  return () => {
    disposed = true
    unlisten?.()
    unlisten = null
  }
}

export type Api = typeof api

declare global {
  interface Window {
    api: Api
  }
}

// Electron'daki contextBridge karşılığı: mevcut `window.api` kullanımları çalışmaya devam etsin.
if (typeof window !== 'undefined') {
  window.api = api
}
