use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex as StdMutex, OnceLock};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, BufReader};

use crate::auth;
use crate::install::{install_version, is_installed, list_installed, list_versions, offline_uuid, ProgressFn};
use crate::java::{detect_java, ensure_java_runtime, pick_java};
use crate::launch::{launch_game, LaunchOptions};
use crate::loaders::install_loader;
use crate::merge::read_local_version;
use crate::model::*;
use crate::net::fetch_json;
use crate::paths::{app_data_dir, default_game_dir, resolve_path, InstancePaths, LauncherPaths};
use crate::state::{AppState, LaunchHandle};
use crate::store;

type CmdResult<T> = Result<T, String>;

fn system_log(app: &AppHandle, state: &AppState, text: impl Into<String>) {
    let line = LogLine {
        stream: "system".to_string(),
        text: text.into(),
        at: now_ms(),
    };
    state.push_log(line.clone());
    let _ = app.emit("log:line", line);
}

fn get_instance(state: &AppState, id: &str) -> CmdResult<Instance> {
    state
        .settings()
        .instances
        .into_iter()
        .find(|entry| entry.id == id)
        .ok_or_else(|| "Instance bulunamadı.".to_string())
}

fn patch_instance(state: &AppState, id: &str, patch: Value) -> CmdResult<Instance> {
    let mut updated: Option<Instance> = None;
    state.update(|settings| {
        for entry in settings.instances.iter_mut() {
            if entry.id != id {
                continue;
            }
            if let Some(value) = patch.get("name").and_then(|value| value.as_str()) {
                if !value.trim().is_empty() {
                    entry.name = value.trim().to_string();
                }
            }
            if let Some(value) = patch.get("icon").and_then(|value| value.as_str()) {
                entry.icon = value.to_string();
            }
            if let Some(value) = patch.get("loaderVersion").and_then(|value| value.as_str()) {
                entry.loader_version = Some(value.to_string());
            }
            if let Some(value) = patch.get("launchVersionId").and_then(|value| value.as_str()) {
                entry.launch_version_id = Some(value.to_string());
            }
            if let Some(value) = patch.get("lastPlayedAt").and_then(|value| value.as_u64()) {
                entry.last_played_at = Some(value);
            }
            if let Some(value) = patch.get("playtimeSeconds").and_then(|value| value.as_u64()) {
                entry.playtime_seconds = value;
            }
            updated = Some(entry.clone());
        }
    });
    updated.ok_or_else(|| "Instance bulunamadı.".to_string())
}

fn required_java_major(shared_root: &str, version_id: &str) -> u64 {
    read_local_version(shared_root, version_id)
        .and_then(|json| json.java_version.and_then(|version| version.major_version))
        .filter(|major| *major > 0)
        .unwrap_or(8)
}

async fn resolve_java(shared_root: &str, java_path_setting: &str, major: u64) -> CmdResult<JavaInfo> {
    let candidates = detect_java(shared_root, java_path_setting);
    if let Some(found) = pick_java(&candidates, major) {
        return Ok(found);
    }
    ensure_java_runtime(major, Arc::new(|_, _, _| {})).await
}

async fn ensure_shared_installed(
    state: &AppState,
    shared_root: &str,
    version_id: &str,
    on_progress: ProgressFn,
) -> CmdResult<()> {
    if is_installed(shared_root, version_id) {
        return Ok(());
    }
    {
        let mut pending = state
            .installs
            .lock()
            .map_err(|_| "Kurulum durumu kilitli.".to_string())?;
        if pending.contains(version_id) {
            return Ok(());
        }
        pending.insert(version_id.to_string());
    }

    let result = async {
        let versions = list_versions(true).await?;
        let entry = versions
            .into_iter()
            .find(|version| version.id == version_id)
            .ok_or_else(|| format!("Sürüm bulunamadı: {version_id}"))?;
        install_version(shared_root, version_id, Some(&entry.url), on_progress)
            .await
            .map(|_| ())
    }
    .await;

    if let Ok(mut pending) = state.installs.lock() {
        pending.remove(version_id);
    }
    result
}

fn find_installed_loader(shared_root: &str, version_id: &str, loader: &str) -> Option<String> {
    if loader == "vanilla" {
        return Some(version_id.to_string());
    }
    let dir = LauncherPaths::new(shared_root).versions;
    let entries = std::fs::read_dir(dir).ok()?;
    let ids: Vec<String> = entries
        .flatten()
        .filter(|entry| entry.path().is_dir())
        .map(|entry| entry.file_name().to_string_lossy().to_string())
        .collect();
    ids.into_iter().find(|id| {
        let matches = match loader {
            "fabric" => id.starts_with("fabric-loader-") && id.ends_with(&format!("-{version_id}")),
            "quilt" => id.starts_with("quilt-loader-") && id.ends_with(&format!("-{version_id}")),
            "forge" => id.starts_with(&format!("{version_id}-forge-")),
            "neoforge" => id.starts_with("neoforge-"),
            _ => false,
        };
        matches && read_local_version(shared_root, id).is_some() && is_installed(shared_root, id)
    })
}

async fn prepare_instance(
    app: &AppHandle,
    state: &AppState,
    instance_id: &str,
    on_progress: ProgressFn,
) -> CmdResult<(Instance, String)> {
    let settings = state.settings();
    let shared_root = settings.game_dir.clone();
    let mut instance = get_instance(state, instance_id)?;

    on_progress(InstallProgress {
        instance_id: Some(instance_id.to_string()),
        version_id: instance.version_id.clone(),
        phase: "manifest".to_string(),
        current: 0,
        total: 1,
        message: format!("{} kontrol ediliyor…", instance.version_id),
        error: None,
    });

    let base_version = instance.version_id.clone();
    let base_instance = instance_id.to_string();
    let base_progress = on_progress.clone();
    let inner: ProgressFn = Arc::new(move |mut progress: InstallProgress| {
        progress.instance_id = Some(base_instance.clone());
        progress.version_id = base_version.clone();
        base_progress(progress);
    });

    ensure_shared_installed(state, &shared_root, &instance.version_id, inner).await?;

    if instance.loader == "vanilla" {
        if instance.launch_version_id.as_deref() != Some(instance.version_id.as_str()) {
            let target = instance.version_id.clone();
            instance = patch_instance(
                state,
                instance_id,
                serde_json::json!({ "launchVersionId": target }),
            )?;
        }
        let launch_version = instance.version_id.clone();
        return Ok((instance, launch_version));
    }

    let existing = instance
        .launch_version_id
        .clone()
        .filter(|id| read_local_version(&shared_root, id).is_some())
        .or_else(|| {
            find_installed_loader(&shared_root, &instance.version_id, &instance.loader)
        });

    if let Some(existing) = existing {
        if instance.launch_version_id.as_deref() != Some(existing.as_str()) {
            let target = existing.clone();
            instance = patch_instance(
                state,
                instance_id,
                serde_json::json!({ "launchVersionId": target }),
            )?;
        }
        system_log(
            app,
            state,
            format!("Loader zaten kurulu, yeniden kullanılıyor: {existing}"),
        );
        return Ok((instance, existing));
    }

    let major = required_java_major(&shared_root, &instance.version_id);
    let java = resolve_java(&shared_root, &settings.java_path, major).await?;

    let loader_progress: crate::loaders::ProgressFn = {
        let on_progress = on_progress.clone();
        let iid = instance_id.to_string();
        let vid = instance.version_id.clone();
        Arc::new(move |message: &str| {
            on_progress(InstallProgress {
                instance_id: Some(iid.clone()),
                version_id: vid.clone(),
                phase: "loader".to_string(),
                current: 0,
                total: 1,
                message: message.to_string(),
                error: None,
            });
        })
    };

    let result = install_loader(
        &shared_root,
        &instance.version_id,
        &instance.loader,
        &java,
        loader_progress,
    )
    .await?;

    let launch_version_id = result.launch_version_id.clone();
    instance = patch_instance(
        state,
        instance_id,
        serde_json::json!({
            "launchVersionId": result.launch_version_id,
            "loaderVersion": result.loader_version,
        }),
    )?;
    Ok((instance, launch_version_id))
}

async fn resolve_account(state: &AppState) -> CmdResult<Account> {
    let settings = state.settings();
    let account = store::active_account(&settings)
        .ok_or_else(|| "Önce bir hesap eklemelisin (Hesaplar bölümü).".to_string())?;

    if account.account_type == "microsoft" {
        let expires = account.expires_at.unwrap_or(0);
        let missing_token = account
            .access_token
            .clone()
            .filter(|token| !token.is_empty())
            .is_none();
        if missing_token || expires.saturating_sub(now_ms()) < 5 * 60 * 1000 {
            if settings.microsoft_client_id.trim().is_empty() {
                return Err(
                    "Microsoft oturumunun süresi doldu ve client ID tanımlı değil.".to_string()
                );
            }
            let refreshed =
                auth::refresh_microsoft_account(&account, &settings.microsoft_client_id).await?;
            state.update(|settings| {
                for entry in settings.accounts.iter_mut() {
                    if entry.id == refreshed.id {
                        *entry = refreshed.clone();
                    }
                }
            });
            return Ok(refreshed);
        }
    }
    Ok(account)
}

async fn start_game(app: AppHandle, state: &AppState, instance_id: String) -> CmdResult<()> {
    if state
        .launch
        .lock()
        .map(|guard| guard.is_some())
        .unwrap_or(false)
    {
        return Err("Oyun zaten çalışıyor.".to_string());
    }

    let progress_app = app.clone();
    let progress_instance = instance_id.clone();
    let on_progress: ProgressFn = Arc::new(move |mut progress: InstallProgress| {
        progress.instance_id = Some(progress_instance.clone());
        let _ = progress_app.emit("install:progress", progress);
    });

    let (instance, launch_version_id) =
        prepare_instance(&app, state, &instance_id, on_progress).await?;

    let settings = state.settings();
    let account = resolve_account(state).await?;
    let required = required_java_major(&settings.game_dir, &launch_version_id);
    let java = resolve_java(&settings.game_dir, &settings.java_path, required).await?;

    let _ = std::fs::create_dir_all(&instance.dir);

    system_log(
        &app,
        state,
        format!(
            "Instance: {} · {} · {}",
            instance.name, instance.loader, instance.version_id
        ),
    );
    system_log(&app, state, format!("Java: {} ({})", java.path, java.version));
    system_log(
        &app,
        state,
        format!(
            "Hesap: {} ({})",
            account.username,
            if account.account_type == "microsoft" {
                "Microsoft"
            } else {
                "çevrimdışı"
            }
        ),
    );

    let result = launch_game(LaunchOptions {
        shared_root: settings.game_dir.clone(),
        instance_dir: instance.dir.clone(),
        version_id: launch_version_id.clone(),
        account,
        java,
        settings: settings.clone(),
    })
    .await?;

    let started_at = now_ms();
    let pid = result.pid;
    let mut child = result.child;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let child_cell = Arc::new(tokio::sync::Mutex::new(Some(child)));
    {
        let mut guard = state
            .launch
            .lock()
            .map_err(|_| "Oyun durumu kilitli.".to_string())?;
        *guard = Some(LaunchHandle {
            child: child_cell.clone(),
            instance_id: instance_id.clone(),
            started_at,
            version_id: launch_version_id.clone(),
            pid,
        });
    }
    let _ = app.emit(
        "launch:state",
        LaunchState {
            running: true,
            version_id: Some(launch_version_id.clone()),
            pid,
            started_at: Some(started_at),
            exit_code: None,
            error: None,
        },
    );
    system_log(
        &app,
        state,
        format!("Oyun başlatıldı (PID {})", pid.unwrap_or(0)),
    );

    if !settings.keep_launcher_open {
        let handle = app.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(1500)).await;
            handle.exit(0);
        });
    }

    if let Some(stdout) = stdout {
        let handle = app.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(text)) = lines.next_line().await {
                if text.trim().is_empty() {
                    continue;
                }
                let line = LogLine {
                    stream: "stdout".to_string(),
                    text,
                    at: now_ms(),
                };
                if let Some(state) = handle.try_state::<AppState>() {
                    state.push_log(line.clone());
                }
                let _ = handle.emit("log:line", line);
            }
        });
    }

    if let Some(stderr) = stderr {
        let handle = app.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(text)) = lines.next_line().await {
                if text.trim().is_empty() {
                    continue;
                }
                if let Some(state) = handle.try_state::<AppState>() {
                    state.push_log(LogLine {
                        stream: "stderr".to_string(),
                        text: text.clone(),
                        at: now_ms(),
                    });
                    let hint = if text.contains("UnsupportedClassVersionError") {
                        Some("Sürüm daha yeni bir Java istiyor. Ayarlar → Java bölümünden kontrol et.")
                    } else if text.contains("OutOfMemoryError") {
                        Some("Bellek yetersiz. Ayarlar → Performans bölümünden RAM’i artır.")
                    } else {
                        None
                    };
                    if let Some(hint) = hint {
                        system_log(&handle, &state, hint);
                    }
                }
                let _ = handle.emit(
                    "log:line",
                    LogLine {
                        stream: "stderr".to_string(),
                        text,
                        at: now_ms(),
                    },
                );
            }
        });
    }

    let waiter_app = app.clone();
    let waiter_instance = instance_id.clone();
    let waiter_version = launch_version_id.clone();
    tokio::spawn(async move {
        let exit_code = loop {
            {
                let mut guard = child_cell.lock().await;
                if let Some(child) = guard.as_mut() {
                    match child.try_wait() {
                        Ok(Some(status)) => {
                            let code = status.code().map(|value| value as i64).unwrap_or(-1);
                            guard.take();
                            break code;
                        }
                        Ok(None) => {}
                        Err(_) => {
                            guard.take();
                            break -1;
                        }
                    }
                } else {
                    break -1;
                }
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
        };

        let state = waiter_app.state::<AppState>();
        if let Ok(mut launch) = state.launch.lock() {
            *launch = None;
        }

        let seconds = (now_ms().saturating_sub(started_at) / 1000).max(1);
        let instance_id = waiter_instance.clone();
        let played_at = now_ms();
        state.update(|settings| {
            if let Some(entry) = settings.instances.iter_mut().find(|entry| entry.id == instance_id)
            {
                entry.playtime_seconds = entry.playtime_seconds.saturating_add(seconds);
                entry.last_played_at = Some(played_at);
            }
        });

        let note = if exit_code == 0 {
            "Oyun kapandı.".to_string()
        } else {
            format!(
                "Oyun beklenmedik şekilde kapandı (çıkış kodu {exit_code}). Ayrıntılar için Konsol bölümüne bak."
            )
        };
        system_log(&waiter_app, state.inner(), note);
        let _ = waiter_app.emit(
            "launch:state",
            LaunchState {
                running: false,
                version_id: Some(waiter_version),
                pid: None,
                started_at: None,
                exit_code: Some(exit_code),
                error: None,
            },
        );
    });

    Ok(())
}

fn read_files(dir: &Path, extensions: Option<&[&str]>, include_disabled: bool) -> Vec<ContentFile> {
    let _ = std::fs::create_dir_all(dir);
    let mut files: Vec<ContentFile> = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return files;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let raw_name = entry.file_name().to_string_lossy().to_string();
        let modified_at = std::fs::metadata(&path)
            .ok()
            .and_then(|meta| meta.modified().ok())
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis() as u64)
            .unwrap_or(0);
        let size = std::fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0);
        let disabled = include_disabled && raw_name.to_lowercase().ends_with(".disabled");
        let name = if disabled {
            raw_name[..raw_name.len() - ".disabled".len()].to_string()
        } else {
            raw_name
        };
        if let Some(extensions) = extensions {
            let lower = name.to_lowercase();
            if !extensions.iter().any(|ext| lower.ends_with(ext)) {
                continue;
            }
        }
        files.push(ContentFile {
            name,
            enabled: Some(!disabled),
            size,
            modified_at,
        });
    }
    files.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    files
}

fn read_dirs(dir: &Path) -> Vec<ContentFile> {
    let _ = std::fs::create_dir_all(dir);
    let mut dirs: Vec<ContentFile> = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return dirs;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let modified_at = std::fs::metadata(&path)
            .ok()
            .and_then(|meta| meta.modified().ok())
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis() as u64)
            .unwrap_or(0);
        dirs.push(ContentFile {
            name: entry.file_name().to_string_lossy().to_string(),
            enabled: None,
            size: 0,
            modified_at,
        });
    }
    dirs.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    dirs
}

fn instance_content(instance: &Instance) -> InstanceContent {
    let paths = InstancePaths::new(&instance.dir);
    InstanceContent {
        mods: read_files(&paths.mods, Some(&[".jar"]), true),
        resourcepacks: read_files(&paths.resourcepacks, Some(&[".zip", ".jar"]), false),
        shaderpacks: read_files(&paths.shaderpacks, Some(&[".zip", ".jar"]), false),
        datapacks: read_files(&paths.datapacks, Some(&[".zip", ".jar"]), false),
        worlds: read_dirs(&paths.saves),
        screenshots: read_files(&paths.screenshots, Some(&[".png", ".jpg", ".jpeg"]), false),
    }
}

fn is_allowed_path(state: &AppState, target: &str) -> bool {
    let settings = state.settings();
    let roots = [
        settings.game_dir.clone(),
        app_data_dir().join("instances").to_string_lossy().to_string(),
        app_data_dir().to_string_lossy().to_string(),
    ];
    let resolved = resolve_path(target).to_lowercase();
    roots.iter().any(|root| {
        let root = resolve_path(root).to_lowercase();
        resolved == root || resolved.starts_with(&format!("{root}\\")) || resolved.starts_with(&format!("{root}/"))
    })
}

#[derive(Deserialize)]
struct MojangNewsEntry {
    #[serde(default)]
    title: String,
    #[serde(default)]
    text: String,
    #[serde(default)]
    date: String,
    #[serde(default)]
    category: Option<String>,
    #[serde(rename = "playPageImage", default)]
    play_page_image: Option<NewsImage>,
    #[serde(rename = "newsPageImage", default)]
    news_page_image: Option<NewsImage>,
    #[serde(rename = "readMoreLink", default)]
    read_more_link: Option<String>,
}

#[derive(Deserialize)]
struct NewsImage {
    #[serde(default)]
    url: String,
}

#[derive(Deserialize)]
struct MojangNews {
    #[serde(default)]
    entries: Vec<MojangNewsEntry>,
}

static NEWS_CACHE: OnceLock<StdMutex<Option<(Vec<NewsItem>, Instant)>>> = OnceLock::new();

async fn get_news() -> CmdResult<Vec<NewsItem>> {
    let cache = NEWS_CACHE.get_or_init(|| StdMutex::new(None));
    if let Ok(guard) = cache.lock() {
        if let Some((items, at)) = guard.as_ref() {
            if at.elapsed() < Duration::from_secs(10 * 60) {
                return Ok(items.clone());
            }
        }
    }
    let data: MojangNews =
        fetch_json("https://launchercontent.mojang.com/v2/news.json").await?;
    let items: Vec<NewsItem> = data
        .entries
        .into_iter()
        .filter(|entry| {
            entry
                .category
                .clone()
                .unwrap_or_default()
                .contains("Java")
        })
        .take(4)
        .map(|entry| {
            let image = entry
                .news_page_image
                .as_ref()
                .map(|image| format!("https://launchercontent.mojang.com{}", image.url))
                .or_else(|| {
                    entry
                        .play_page_image
                        .as_ref()
                        .map(|image| format!("https://launchercontent.mojang.com{}", image.url))
                });
            NewsItem {
                title: entry.title,
                text: entry.text,
                date: entry.date,
                category: entry.category.unwrap_or_else(|| "Minecraft".to_string()),
                image,
                link: entry
                    .read_more_link
                    .unwrap_or_else(|| "https://www.minecraft.net".to_string()),
            }
        })
        .collect();
    if let Ok(mut guard) = cache.lock() {
        *guard = Some((items.clone(), Instant::now()));
    }
    Ok(items)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionsPayload {
    versions: Vec<VersionSummary>,
    installed: Vec<InstalledVersion>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaPayload {
    candidates: Vec<JavaInfo>,
    required: u64,
    selected: Option<JavaInfo>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInstanceInput {
    #[serde(default)]
    name: String,
    #[serde(default)]
    version_id: String,
    #[serde(default)]
    loader: String,
    #[serde(default)]
    icon: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MsResult {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    account: Option<Account>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[tauri::command]
pub fn app_info(app: AppHandle) -> AppInfo {
    AppInfo {
        version: app.package_info().version.to_string(),
        platform: std::env::consts::OS.to_string(),
        data_dir: app_data_dir().to_string_lossy().to_string(),
        default_game_dir: default_game_dir().to_string_lossy().to_string(),
        versions: AppVersions {
            tauri: "2.x".to_string(),
            rust: "stable".to_string(),
            webview: "WebView2".to_string(),
        },
    }
}

#[tauri::command]
pub fn win_minimize(app: AppHandle) -> CmdResult<()> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Pencere bulunamadı.".to_string())?;
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn win_maximize(app: AppHandle) -> CmdResult<()> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Pencere bulunamadı.".to_string())?;
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn win_close(app: AppHandle) -> CmdResult<()> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.close();
    }
    Ok(())
}

#[tauri::command]
pub fn settings_get(state: State<'_, AppState>) -> Settings {
    state.settings()
}

#[tauri::command]
pub fn settings_set(state: State<'_, AppState>, patch: Value) -> Settings {
    state.update(|settings| {
        if let Some(value) = patch.get("gameDir").and_then(|value| value.as_str()) {
            if !value.trim().is_empty() {
                settings.game_dir = resolve_path(value.trim());
            }
        }
        if let Some(value) = patch.get("javaPath").and_then(|value| value.as_str()) {
            settings.java_path = value.trim().to_string();
        }
        if let Some(value) = patch.get("memoryMb").and_then(|value| value.as_f64()) {
            settings.memory_mb = (value.round() as u64).clamp(1024, 32768);
        }
        if let Some(value) = patch.get("microsoftClientId").and_then(|value| value.as_str()) {
            settings.microsoft_client_id = value.trim().to_string();
        }
        if let Some(value) = patch.get("keepLauncherOpen").and_then(|value| value.as_bool()) {
            settings.keep_launcher_open = value;
        }
        if let Some(value) = patch.get("showSnapshots").and_then(|value| value.as_bool()) {
            settings.show_snapshots = value;
        }
        if let Some(value) = patch.get("onboardingDone").and_then(|value| value.as_bool()) {
            settings.onboarding_done = value;
        }
        if let Some(value) = patch.get("performanceMode").and_then(|value| value.as_bool()) {
            settings.performance_mode = value;
        }
        if let Some(value) = patch.get("theme").and_then(|value| value.as_str()) {
            if value == "light" || value == "dark" {
                settings.theme = value.to_string();
            }
        }
        if let Some(value) = patch.get("activeInstanceId") {
            if value.is_null() {
                settings.active_instance_id = None;
            } else if let Some(id) = value.as_str() {
                settings.active_instance_id = Some(id.to_string());
            }
        }
        if let Some(value) = patch.get("playtime").and_then(|value| value.as_object()) {
            settings.playtime = value
                .iter()
                .filter_map(|(key, value)| value.as_u64().map(|seconds| (key.clone(), seconds)))
                .collect();
        }
    })
}

#[tauri::command]
pub fn pick_folder() -> Option<String> {
    rfd::FileDialog::new()
        .set_title("Ortak veri klasörünü seç")
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_folder(state: State<'_, AppState>, sub: Option<String>) -> CmdResult<()> {
    let settings = state.settings();
    let target = match sub {
        Some(sub) if !sub.is_empty() => PathBuf::from(&settings.game_dir).join(sub),
        _ => PathBuf::from(&settings.game_dir),
    };
    let _ = std::fs::create_dir_all(&target);
    opener::open(&target).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_path(state: State<'_, AppState>, target: String) -> CmdResult<()> {
    if !is_allowed_path(&state, &target) {
        return Err("Bu yola erişim izni yok.".to_string());
    }
    let _ = std::fs::create_dir_all(&target);
    opener::open(&target).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_url(url: String) -> CmdResult<()> {
    if !url.starts_with("https://") {
        return Err("Yalnızca https bağlantıları açılabilir.".to_string());
    }
    opener::open(&url).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn versions_list(state: State<'_, AppState>) -> CmdResult<VersionsPayload> {
    let settings = state.settings();
    let versions = list_versions(settings.show_snapshots).await?;
    let installed = list_installed(&settings.game_dir);
    Ok(VersionsPayload {
        versions,
        installed,
    })
}

#[tauri::command]
pub fn instances_list(state: State<'_, AppState>) -> Vec<Instance> {
    state.settings().instances
}

#[tauri::command]
pub fn instances_create(
    state: State<'_, AppState>,
    input: CreateInstanceInput,
) -> CmdResult<Instance> {
    let name = {
        let trimmed = input.name.trim().to_string();
        if trimmed.is_empty() {
            "Yeni instance".to_string()
        } else {
            trimmed
        }
    };
    let version_id = input.version_id.trim().to_string();
    if version_id.is_empty() {
        return Err("Bir Minecraft sürümü seçmelisin.".to_string());
    }
    let loader = if LOADERS.contains(&input.loader.as_str()) {
        input.loader
    } else {
        "vanilla".to_string()
    };
    let icon = if ICONS.contains(&input.icon.as_str()) {
        input.icon
    } else {
        "grass".to_string()
    };

    let id = uuid::Uuid::new_v4().to_string();
    let dir = app_data_dir().join("instances").join(&id);
    let paths = InstancePaths::new(&dir.to_string_lossy());
    for target in [
        &paths.mods,
        &paths.saves,
        &paths.screenshots,
        &paths.resourcepacks,
        &paths.shaderpacks,
        &paths.datapacks,
    ] {
        let _ = std::fs::create_dir_all(target);
    }

    let instance = Instance {
        id: id.clone(),
        name,
        version_id,
        loader,
        loader_version: None,
        launch_version_id: None,
        dir: dir.to_string_lossy().to_string(),
        icon,
        created_at: now_ms(),
        last_played_at: None,
        playtime_seconds: 0,
    };
    let created = instance.clone();
    state.update(|settings| {
        settings.instances.push(created);
        settings.active_instance_id = Some(id);
    });
    Ok(instance)
}

#[tauri::command]
pub fn instances_update(
    state: State<'_, AppState>,
    id: String,
    patch: Value,
) -> CmdResult<Instance> {
    let mut allowed = serde_json::Map::new();
    if let Some(name) = patch.get("name").and_then(|value| value.as_str()) {
        let trimmed = name.trim();
        if !trimmed.is_empty() {
            allowed.insert(
                "name".to_string(),
                Value::String(trimmed.chars().take(40).collect()),
            );
        }
    }
    if let Some(icon) = patch.get("icon").and_then(|value| value.as_str()) {
        if ICONS.contains(&icon) {
            allowed.insert("icon".to_string(), Value::String(icon.to_string()));
        }
    }
    patch_instance(&state, &id, Value::Object(allowed))
}

#[tauri::command]
pub fn instances_delete(state: State<'_, AppState>, id: String) -> CmdResult<bool> {
    let running = state
        .launch
        .lock()
        .ok()
        .and_then(|guard| guard.as_ref().map(|handle| handle.instance_id.clone()));
    if running.as_deref() == Some(id.as_str()) {
        return Err("Çalışan instance silinemez.".to_string());
    }

    let settings = state.settings();
    let Some(instance) = settings.instances.iter().find(|entry| entry.id == id).cloned() else {
        return Ok(false);
    };
    if resolve_path(&instance.dir).eq_ignore_ascii_case(&resolve_path(&settings.game_dir)) {
        return Err(
            "Varsayılan instance ortak veri klasörünü kullanıyor; silinemez.".to_string()
        );
    }
    let _ = std::fs::remove_dir_all(&instance.dir);

    let fallback = settings
        .instances
        .iter()
        .find(|entry| entry.id != id)
        .map(|entry| entry.id.clone());
    let active = settings.active_instance_id.clone();
    state.update(|settings| {
        settings.instances.retain(|entry| entry.id != id);
        if active.as_deref() == Some(id.as_str()) {
            settings.active_instance_id = fallback;
        }
    });
    Ok(true)
}

#[tauri::command]
pub fn instances_set_active(state: State<'_, AppState>, id: String) -> CmdResult<bool> {
    if !state.settings().instances.iter().any(|entry| entry.id == id) {
        return Err("Instance bulunamadı.".to_string());
    }
    state.update(|settings| {
        settings.active_instance_id = Some(id);
    });
    Ok(true)
}

#[tauri::command]
pub fn instances_content(state: State<'_, AppState>, id: String) -> CmdResult<InstanceContent> {
    Ok(instance_content(&get_instance(&state, &id)?))
}

#[tauri::command]
pub fn instances_toggle_mod(state: State<'_, AppState>, id: String, name: String) -> CmdResult<bool> {
    let instance = get_instance(&state, &id)?;
    let dir = InstancePaths::new(&instance.dir).mods;
    let enabled = dir.join(&name);
    let disabled = PathBuf::from(format!("{}.disabled", enabled.display()));
    if enabled.exists() {
        std::fs::rename(&enabled, &disabled).map_err(|e| e.to_string())?;
        return Ok(true);
    }
    if disabled.exists() {
        std::fs::rename(&disabled, &enabled).map_err(|e| e.to_string())?;
        return Ok(true);
    }
    Ok(false)
}

#[tauri::command]
pub fn instances_delete_file(
    state: State<'_, AppState>,
    id: String,
    kind: String,
    name: String,
) -> CmdResult<bool> {
    let instance = get_instance(&state, &id)?;
    let paths = InstancePaths::new(&instance.dir);
    let mut dirs: HashMap<&str, PathBuf> = HashMap::new();
    dirs.insert("mods", paths.mods.clone());
    dirs.insert("resourcepacks", paths.resourcepacks.clone());
    dirs.insert("shaderpacks", paths.shaderpacks.clone());
    dirs.insert("datapacks", paths.datapacks.clone());
    dirs.insert("screenshots", paths.screenshots.clone());

    let dir = dirs
        .get(kind.as_str())
        .ok_or_else(|| "Geçersiz içerik türü.".to_string())?;
    let target = dir.join(&name);
    if !target.starts_with(dir) {
        return Err("Geçersiz dosya adı.".to_string());
    }
    let _ = std::fs::remove_dir_all(&target);
    let _ = std::fs::remove_file(&target);
    let disabled = PathBuf::from(format!("{}.disabled", target.display()));
    if disabled.exists() {
        let _ = std::fs::remove_file(&disabled);
    }
    Ok(true)
}

#[tauri::command]
pub fn instances_open(state: State<'_, AppState>, id: String, kind: Option<String>) -> CmdResult<()> {
    let instance = get_instance(&state, &id)?;
    let paths = InstancePaths::new(&instance.dir);
    let mut map: HashMap<&str, PathBuf> = HashMap::new();
    map.insert("mods", paths.mods.clone());
    map.insert("saves", paths.saves.clone());
    map.insert("screenshots", paths.screenshots.clone());
    map.insert("resourcepacks", paths.resourcepacks.clone());
    map.insert("shaderpacks", paths.shaderpacks.clone());
    map.insert("datapacks", paths.datapacks.clone());
    map.insert("root", paths.root.clone());
    let target = kind
        .as_deref()
        .and_then(|kind| map.get(kind).cloned())
        .unwrap_or_else(|| paths.root.clone());
    let _ = std::fs::create_dir_all(&target);
    opener::open(&target).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn java_list(state: State<'_, AppState>, version_id: Option<String>) -> JavaPayload {
    let settings = state.settings();
    let required = match version_id.as_deref() {
        Some(id) => required_java_major(&settings.game_dir, id),
        None => 21,
    };
    let candidates = detect_java(&settings.game_dir, &settings.java_path);
    let selected = pick_java(&candidates, required);
    JavaPayload {
        candidates,
        required,
        selected,
    }
}

#[tauri::command]
pub async fn launch_start(app: AppHandle, instance_id: String) -> CmdResult<bool> {
    let state = app.state::<AppState>();
    start_game(app.clone(), state.inner(), instance_id).await?;
    Ok(true)
}

#[tauri::command]
pub fn launch_stop(state: State<'_, AppState>) -> CmdResult<bool> {
    let cell = {
        let guard = state
            .launch
            .lock()
            .map_err(|_| "Oyun durumu kilitli.".to_string())?;
        match guard.as_ref() {
            Some(handle) => handle.child.clone(),
            None => return Ok(false),
        }
    };

    if let Ok(mut child) = cell.try_lock() {
        if let Some(child) = child.as_mut() {
            let _ = child.start_kill();
            return Ok(true);
        }
        return Ok(false);
    }

    tauri::async_runtime::spawn(async move {
        let mut guard = cell.lock().await;
        if let Some(child) = guard.as_mut() {
            let _ = child.start_kill();
        }
    });
    Ok(true)
}

#[tauri::command]
pub fn accounts_add_offline(state: State<'_, AppState>, username: String) -> CmdResult<Account> {
    let username = username.trim().to_string();
    let valid = (3..=16).contains(&username.len())
        && username
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '_');
    if !valid {
        return Err(
            "Kullanıcı adı 3-16 karakter olmalı ve yalnızca harf, rakam, alt çizgi içermeli."
                .to_string(),
        );
    }
    if state
        .settings()
        .accounts
        .iter()
        .any(|entry| entry.account_type == "offline" && entry.username.eq_ignore_ascii_case(&username))
    {
        return Err("Bu isimde bir çevrimdışı hesap zaten var.".to_string());
    }

    let account = Account {
        id: format!("offline-{}", uuid::Uuid::new_v4()),
        account_type: "offline".to_string(),
        username: username.clone(),
        uuid: offline_uuid(&username),
        access_token: None,
        refresh_token: None,
        expires_at: None,
        xuid: None,
    };
    let created = account.clone();
    state.update(|settings| {
        settings.accounts.push(created);
        settings.active_account_id = Some(account.id.clone());
    });
    Ok(account)
}

#[tauri::command]
pub fn accounts_set_active(state: State<'_, AppState>, id: String) -> CmdResult<bool> {
    if !state.settings().accounts.iter().any(|entry| entry.id == id) {
        return Err("Hesap bulunamadı.".to_string());
    }
    state.update(|settings| {
        settings.active_account_id = Some(id);
    });
    Ok(true)
}

#[tauri::command]
pub fn accounts_remove(state: State<'_, AppState>, id: String) -> CmdResult<bool> {
    state.update(|settings| {
        settings.accounts.retain(|entry| entry.id != id);
        if settings.active_account_id.as_deref() == Some(id.as_str()) {
            settings.active_account_id = None;
        }
    });
    Ok(true)
}

#[tauri::command]
pub async fn ms_start(app: AppHandle, state: State<'_, AppState>) -> CmdResult<DeviceCodeInfo> {
    let settings = state.settings();
    state.ms_cancelled.store(false, Ordering::SeqCst);
    let device = auth::request_device_code(&settings.microsoft_client_id).await?;
    let info = auth::to_device_code_info(&device);
    let _ = app.emit("ms:device", info.clone());

    let handle = app.clone();
    let client_id = settings.microsoft_client_id.clone();
    tauri::async_runtime::spawn(async move {
        let state = handle.state::<AppState>();
        let result = auth::complete_device_login(&client_id, &device, &state.ms_cancelled).await;
        match result {
            Ok(account) => {
                if handle.state::<AppState>().ms_cancelled.load(Ordering::SeqCst) {
                    return;
                }
                let saved = account.clone();
                handle.state::<AppState>().update(|settings| {
                    settings.accounts.retain(|entry| entry.id != saved.id);
                    settings.accounts.push(saved);
                    settings.active_account_id = Some(account.id.clone());
                });
                let _ = handle.emit(
                    "ms:result",
                    MsResult {
                        ok: true,
                        account: Some(account),
                        error: None,
                    },
                );
            }
            Err(error) => {
                let _ = handle.emit(
                    "ms:result",
                    MsResult {
                        ok: false,
                        account: None,
                        error: Some(error),
                    },
                );
            }
        }
    });

    Ok(info)
}

#[tauri::command]
pub fn ms_cancel(state: State<'_, AppState>) -> CmdResult<bool> {
    state.ms_cancelled.store(true, Ordering::SeqCst);
    Ok(true)
}

#[tauri::command]
pub fn logs_get(state: State<'_, AppState>) -> Vec<LogLine> {
    state.logs()
}

#[tauri::command]
pub fn logs_clear(state: State<'_, AppState>) -> CmdResult<bool> {
    state.clear_logs();
    Ok(true)
}

#[tauri::command]
pub fn spotify_status() -> crate::spotify::NowPlaying {
    crate::spotify::now_playing()
}

#[tauri::command]
pub fn spotify_control(action: String, position_ms: Option<u64>) -> CmdResult<bool> {
    crate::spotify::control(&action, position_ms)?;
    Ok(true)
}

#[tauri::command]
pub async fn spotify_lyrics(
    artist: String,
    title: String,
    album: String,
    duration_ms: u64,
) -> CmdResult<crate::spotify::Lyrics> {
    crate::spotify::lyrics(&artist, &title, &album, duration_ms).await
}

#[tauri::command]
pub async fn news_list() -> Vec<NewsItem> {
    get_news().await.unwrap_or_default()
}
