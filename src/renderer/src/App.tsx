import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AppInfo,
  DeviceCodeInfo,
  Instance,
  InstanceContent,
  InstallProgress,
  JavaInfo,
  LaunchState,
  LogLine,
  NewsItem,
  Settings,
  VersionSummary
} from '../../shared/types'
import { api, errorMessage } from './api'
import { Sidebar, type Page } from './components/Sidebar'
import { TitleBar } from './components/TitleBar'
import { Toasts, type Toast } from './components/Toasts'
import { Onboarding } from './components/Onboarding'
import { InterfaceTour } from './components/InterfaceTour'
import { CreateInstanceDialog } from './components/CreateInstanceDialog'
import { HomePage } from './pages/HomePage'
import { AccountsPage } from './pages/AccountsPage'
import { SettingsPage } from './pages/SettingsPage'
import { ConsolePage } from './pages/ConsolePage'
import { InfoPage } from './pages/InfoPage'
import { SpotifyPage } from './pages/SpotifyPage'

type MsState = 'idle' | 'waiting' | 'success' | 'error'

interface JavaState {
  candidates: JavaInfo[]
  required: number
  selected: JavaInfo | null
}

export default function App(): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [page, setPage] = useState<Page>('home')
  const [versions, setVersions] = useState<VersionSummary[]>([])
  const [progress, setProgress] = useState<InstallProgress | null>(null)
  const [launch, setLaunch] = useState<LaunchState>({ running: false })
  const [logs, setLogs] = useState<LogLine[]>([])
  const logBuffer = useRef<LogLine[]>([])
  const logTimer = useRef<number | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [javaInfo, setJavaInfo] = useState<JavaState | null>(null)
  const [content, setContent] = useState<InstanceContent | null>(null)
  const [msDevice, setMsDevice] = useState<DeviceCodeInfo | null>(null)
  const [msState, setMsState] = useState<MsState>('idle')
  const [msError, setMsError] = useState<string | null>(null)
  const [news, setNews] = useState<NewsItem[]>([])
  const [tourStep, setTourStep] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [themeSwitching, setThemeSwitching] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const ensured = useRef(false)
  const themeRef = useRef<string | null>(null)

  const toast = useCallback((input: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev.slice(-3), { ...input, id }])
    window.setTimeout(() => setToasts((prev) => prev.filter((entry) => entry.id !== id)), 6000)
  }, [])

  const refreshSettings = useCallback(async (): Promise<Settings> => {
    const loaded = await api.settings.get()
    setSettings(loaded)
    return loaded
  }, [])

  const updateSettings = useCallback(async (patch: Partial<Settings>): Promise<Settings> => {
    const updated = await api.settings.set(patch)
    setSettings(updated)
    return updated
  }, [])

  const refreshContent = useCallback(async (instance: Instance | null): Promise<void> => {
    if (!instance) {
      setContent(null)
      return
    }
    try {
      setContent(await api.instances.content(instance.id))
    } catch {
      setContent(null)
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = settings?.theme ?? 'light'
  }, [settings?.theme])

  useEffect(() => {
    if (!settings) return
    if (themeRef.current === null) {
      themeRef.current = settings.theme
      return
    }
    if (themeRef.current === settings.theme) return
    themeRef.current = settings.theme
    setThemeSwitching(true)
    const timer = window.setTimeout(() => setThemeSwitching(false), 560)
    return () => window.clearTimeout(timer)
  }, [settings])

  useEffect(() => {
    if (tourStep !== null) return
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [page, tourStep])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [loaded, info, savedLogs, versionData] = await Promise.all([
          api.settings.get(),
          api.app.info(),
          api.logs.get(),
          api.versions.list()
        ])
        if (cancelled) return
        setSettings(loaded)
        setAppInfo(info)
        setLogs(savedLogs)
        setVersions(versionData.versions)
        setJavaInfo(await api.java.list(loaded.instances[0]?.versionId).catch(() => null))
      } catch (error) {
        if (!cancelled) toast({ kind: 'error', title: 'Başlatılamadı', body: errorMessage(error) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [toast])

  useEffect(() => {
    const offs = [
      api.on.installProgress((entry) => setProgress(entry)),
      api.on.launchState((state) => {
        setLaunch(state)
        if (state.running) setProgress(null)
        if (!state.running) {
          setBusy(null)
          void refreshSettings().then((loaded) => {
            const active = loaded.instances.find((entry) => entry.id === loaded.activeInstanceId)
            void refreshContent(active ?? null)
          })
        }
      }),
      api.on.logLine((line) => {
        // Satırları biriktirip 200 ms'de bir tek seferde işle (her satırda tüm arayüz yeniden çizilmesin)
        logBuffer.current.push(line)
        if (logTimer.current === null) {
          logTimer.current = window.setTimeout(() => {
            logTimer.current = null
            const batch = logBuffer.current
            logBuffer.current = []
            setLogs((prev) => [...prev, ...batch].slice(-2000))
          }, 200)
        }
      }),
      api.on.msDevice((device) => setMsDevice(device)),
      api.on.msResult(async (result) => {
        if (result.ok) {
          setMsState('success')
          setMsDevice(null)
          setSettings(await api.settings.get())
          toast({ kind: 'success', title: 'Microsoft hesabı bağlandı' })
        } else {
          setMsState('error')
          setMsError(result.error ?? 'Giriş başarısız.')
        }
      })
    ]
    return () => {
      offs.forEach((off) => off())
      if (logTimer.current !== null) window.clearTimeout(logTimer.current)
      logTimer.current = null
    }
  }, [refreshContent, refreshSettings, toast])

  useEffect(() => {
    let cancelled = false
    void api.news
      .list()
      .then((items) => {
        if (!cancelled) setNews(items)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const latestRelease = useMemo(() => versions.find((version) => version.type === 'release') ?? null, [versions])
  const activeInstance = useMemo(() => {
    if (!settings) return null
    return (
      settings.instances.find((instance) => instance.id === settings.activeInstanceId) ??
      settings.instances[0] ??
      null
    )
  }, [settings])
  const account = useMemo(
    () => settings?.accounts.find((entry) => entry.id === settings.activeAccountId) ?? null,
    [settings]
  )

  // Instance yoksa varsayılan bir tane oluştur
  useEffect(() => {
    if (!settings || versions.length === 0 || ensured.current) return
    if (settings.instances.length > 0) return
    const versionId = settings.lastVersionId ?? latestRelease?.id
    if (!versionId) return
    ensured.current = true
    void api.instances
      .create({ name: 'Varsayılan', versionId, loader: 'vanilla', icon: 'grass' })
      .then(() => refreshSettings())
      .catch(() => undefined)
  }, [settings, versions, latestRelease, refreshSettings])

  useEffect(() => {
    if (!activeInstance) {
      setContent(null)
      return
    }
    void refreshContent(activeInstance)
    void api.java
      .list(activeInstance.versionId)
      .then(setJavaInfo)
      .catch(() => undefined)
  }, [activeInstance?.id, refreshContent])

  const handleSelectInstance = useCallback(
    async (id: string): Promise<void> => {
      await api.instances.setActive(id)
      await refreshSettings()
      setPage('home')
    },
    [refreshSettings]
  )

  const handleCreateInstance = useCallback(
    async (input: { name: string; versionId: string; loader: Instance['loader']; icon: string }): Promise<void> => {
      try {
        await api.instances.create(input)
        await refreshSettings()
        setCreating(false)
        setPage('home')
        toast({ kind: 'success', title: 'Instance oluşturuldu', body: input.name })
      } catch (error) {
        toast({ kind: 'error', title: 'Instance oluşturulamadı', body: errorMessage(error) })
      }
    },
    [refreshSettings, toast]
  )

  const handleDeleteInstance = useCallback(async (): Promise<void> => {
    if (!activeInstance) return
    try {
      await api.instances.remove(activeInstance.id)
      await refreshSettings()
      toast({ kind: 'info', title: 'Instance silindi' })
    } catch (error) {
      toast({ kind: 'error', title: 'Silinemedi', body: errorMessage(error) })
    }
  }, [activeInstance, refreshSettings, toast])

  const handlePlay = useCallback(async (): Promise<void> => {
    if (!activeInstance) return
    setBusy(activeInstance.id)
    try {
      await api.launch.start(activeInstance.id)
      setProgress(null)
      const loaded = await refreshSettings()
      setJavaInfo(await api.java.list(activeInstance.versionId).catch(() => null))
      void loaded
    } catch (error) {
      setBusy(null)
      toast({ kind: 'error', title: 'Oyun başlatılamadı', body: errorMessage(error) })
    }
  }, [activeInstance, refreshSettings, toast])

  const handleStop = useCallback((): void => {
    void api.launch.stop()
  }, [])

  const handleOpenFolder = useCallback(
    (kind?: string): void => {
      if (!activeInstance) return
      void api.instances.open(activeInstance.id, kind)
    },
    [activeInstance]
  )

  const handleToggleMod = useCallback(
    async (name: string): Promise<void> => {
      if (!activeInstance) return
      await api.instances.toggleMod(activeInstance.id, name)
      await refreshContent(activeInstance)
    },
    [activeInstance, refreshContent]
  )

  const handleDeleteFile = useCallback(
    async (kind: string, name: string): Promise<void> => {
      if (!activeInstance) return
      await api.instances.deleteFile(activeInstance.id, kind, name)
      await refreshContent(activeInstance)
    },
    [activeInstance, refreshContent]
  )

  const handleChooseFolder = useCallback(async (): Promise<void> => {
    const dir = await api.dialog.pickFolder()
    if (dir) {
      await updateSettings({ gameDir: dir })
      toast({ kind: 'success', title: 'Ortak veri klasörü değiştirildi' })
    }
  }, [toast, updateSettings])

  const handleDetectJava = useCallback((): void => {
    void api.java
      .list(activeInstance?.versionId)
      .then(setJavaInfo)
      .catch(() => undefined)
  }, [activeInstance?.versionId])

  const handleAddOffline = useCallback(
    async (username: string): Promise<void> => {
      try {
        await api.accounts.addOffline(username)
        await refreshSettings()
        toast({ kind: 'success', title: 'Profil oluşturuldu', body: username })
      } catch (error) {
        toast({ kind: 'error', title: 'Profil eklenemedi', body: errorMessage(error) })
      }
    },
    [refreshSettings, toast]
  )

  const handleSelectAccount = useCallback(
    async (id: string): Promise<void> => {
      await api.accounts.setActive(id)
      await refreshSettings()
    },
    [refreshSettings]
  )

  const handleRemoveAccount = useCallback(
    async (id: string): Promise<void> => {
      await api.accounts.remove(id)
      await refreshSettings()
    },
    [refreshSettings]
  )

  const handleStartMicrosoft = useCallback(async (): Promise<void> => {
    setMsState('waiting')
    setMsError(null)
    setMsDevice(null)
    try {
      setMsDevice(await api.microsoft.start())
    } catch (error) {
      setMsState('error')
      setMsError(errorMessage(error))
    }
  }, [])

  const handleCancelMicrosoft = useCallback((): void => {
    void api.microsoft.cancel()
    setMsState('idle')
    setMsDevice(null)
  }, [])

  if (!settings) {
    return (
      <div className="app" style={{ display: 'grid', placeItems: 'center' }}>
        <div className="empty">
          <span className="spinner dark" />
          <div className="tiny mt-8">Launcher yükleniyor…</div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`app${settings.performanceMode ? ' perf' : ''}${themeSwitching ? ' theme-switching' : ''}`}
    >
      <TitleBar running={launch.running} />
      <div className="shell">
        <Sidebar
          page={page}
          onNavigate={setPage}
          account={account}
          running={launch.running}
          instances={settings.instances}
          activeInstanceId={activeInstance?.id ?? null}
          onSelectInstance={(id) => void handleSelectInstance(id)}
          onCreateInstance={() => setCreating(true)}
        />

        <main className="main" ref={mainRef}>
          <div className="page" key={page}>
            {page === 'home' && (
              <HomePage
                instance={activeInstance}
                settings={settings}
                account={account}
                launch={launch}
                progress={progress}
                busy={busy === activeInstance?.id}
                content={content}
                news={news}
                onCreateInstance={() => setCreating(true)}
                onPlay={() => void handlePlay()}
                onStop={handleStop}
                onOpenFolder={handleOpenFolder}
                onToggleMod={(name) => void handleToggleMod(name)}
                onDeleteFile={(kind, name) => void handleDeleteFile(kind, name)}
                onRefreshContent={() => void refreshContent(activeInstance)}
                onDeleteInstance={() => void handleDeleteInstance()}
              />
            )}

            {page === 'accounts' && (
              <AccountsPage
                settings={settings}
                activeAccountId={settings.activeAccountId}
                msDevice={msDevice}
                msState={msState}
                msError={msError}
                onAddOffline={handleAddOffline}
                onSelect={(id) => void handleSelectAccount(id)}
                onRemove={(id) => void handleRemoveAccount(id)}
                onStartMicrosoft={() => void handleStartMicrosoft()}
                onCancelMicrosoft={handleCancelMicrosoft}
                onNavigate={setPage}
              />
            )}

            {page === 'spotify' && <SpotifyPage onToast={(input) => toast(input)} />}

            {page === 'settings' && (
              <SettingsPage
                settings={settings}
                javaInfo={javaInfo}
                appVersion={appInfo?.version ?? '1.0.0'}
                onUpdate={(patch) => void updateSettings(patch)}
                onChooseFolder={handleChooseFolder}
                onDetectJava={handleDetectJava}
                onRestartTour={() => void updateSettings({ onboardingDone: false })}
                onStartUiTour={() => {
                  setPage('home')
                  setTourStep(0)
                }}
              />
            )}

            {page === 'console' && (
              <ConsolePage
                logs={logs}
                running={launch.running}
                onClear={() => {
                  void api.logs.clear().then(() => setLogs([]))
                }}
              />
            )}

            {page === 'info' && (
              <InfoPage
                appInfo={appInfo}
                settings={settings}
                account={account}
                installedCount={settings.instances.length}
              />
            )}
          </div>
        </main>
      </div>

      {!settings.onboardingDone && (
        <Onboarding
          settings={settings}
          account={account}
          latestRelease={latestRelease}
          installedCount={settings.instances.length}
          msDevice={msDevice}
          onUpdate={(patch) => void updateSettings(patch)}
          onAddOffline={handleAddOffline}
          onStartMicrosoft={() => void handleStartMicrosoft()}
          onFinish={() => {
            void updateSettings({ onboardingDone: true })
            setTourStep(0)
          }}
        />
      )}

      {creating && (
        <CreateInstanceDialog
          versions={versions}
          onClose={() => setCreating(false)}
          onCreate={handleCreateInstance}
        />
      )}

      {tourStep !== null && (
        <InterfaceTour
          step={tourStep}
          onStep={setTourStep}
          onClose={() => setTourStep(null)}
          onNavigate={setPage}
          performanceMode={settings.performanceMode}
        />
      )}

      <Toasts toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((entry) => entry.id !== id))} />
    </div>
  )
}
