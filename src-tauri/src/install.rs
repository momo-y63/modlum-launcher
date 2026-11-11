use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;

use serde::Deserialize;

use crate::merge::{merge_version, write_version_json};
use crate::model::{InstallProgress, InstalledVersion, VersionSummary};
use crate::mojang::{get_version_json, get_version_manifest, library_path, library_url, rules_allow, VersionJson};
use crate::net::{download_file, fetch_json, is_file, map_limit, DownloadTask};
use crate::paths::{ensure_dir, LauncherPaths};

pub type ProgressFn = Arc<dyn Fn(InstallProgress) + Send + Sync>;

pub async fn list_versions(show_snapshots: bool) -> Result<Vec<VersionSummary>, String> {
    let manifest = get_version_manifest().await?;
    Ok(manifest
        .versions
        .iter()
        .filter(|version| show_snapshots || version.kind == "release")
        .map(|version| version.summary())
        .collect())
}

pub fn list_installed(game_dir: &str) -> Vec<InstalledVersion> {
    let paths = LauncherPaths::new(game_dir);
    let mut result = Vec::new();
    let entries = match fs::read_dir(&paths.versions) {
        Ok(entries) => entries,
        Err(_) => return result,
    };
    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let Some(name) = dir.file_name().map(|n| n.to_string_lossy().to_string()) else {
            continue;
        };
        let version_json = dir.join(format!("{name}.json"));
        if !is_file(&version_json) {
            continue;
        }
        let installed_at = fs::metadata(&version_json)
            .ok()
            .and_then(|meta| meta.modified().ok())
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        result.push(InstalledVersion {
            id: name.clone(),
            name,
            installed_at,
            size_bytes: None,
        });
    }
    result.sort_by(|a, b| b.installed_at.cmp(&a.installed_at));
    result
}

pub fn is_installed(game_dir: &str, version_id: &str) -> bool {
    let paths = LauncherPaths::new(game_dir);
    is_file(&paths.version_dir(version_id).join(format!("{version_id}.json")))
        && is_file(&paths.version_dir(version_id).join(format!("{version_id}.jar")))
}

#[derive(Deserialize)]
struct AssetObject {
    hash: String,
    #[serde(default)]
    size: u64,
}

#[derive(Deserialize)]
struct AssetIndex {
    objects: HashMap<String, AssetObject>,
    #[serde(default)]
    r#virtual: bool,
    #[serde(default)]
    map_to_resources: bool,
}

fn progress(
    on_progress: &ProgressFn,
    version_id: &str,
    phase: &str,
    current: u64,
    total: u64,
    message: String,
) {
    on_progress(InstallProgress {
        version_id: version_id.to_string(),
        instance_id: None,
        phase: phase.to_string(),
        current,
        total,
        message,
        error: None,
    });
}

pub async fn install_version(
    game_dir: &str,
    version_id: &str,
    version_url: Option<&str>,
    on_progress: ProgressFn,
) -> Result<VersionJson, String> {
    let paths = LauncherPaths::new(game_dir);

    progress(
        &on_progress,
        version_id,
        "manifest",
        0,
        1,
        "Sürüm bilgisi alınıyor…".to_string(),
    );

    let mut version = match version_url {
        Some(url) => get_version_json(url).await?,
        None => {
            let local_json = paths.version_dir(version_id).join(format!("{version_id}.json"));
            let text = fs::read_to_string(&local_json)
                .map_err(|_| format!("Sürüm dosyası bulunamadı: {version_id}"))?;
            serde_json::from_str(&text).map_err(|e| e.to_string())?
        }
    };

    if version.inherits_from.is_some() {
        return Err(format!(
            "\"{version_id}\" bir mod yükleyici sürümü (inheritsFrom). Şimdilik yalnızca vanilla sürümler destekleniyor."
        ));
    }

    let version_dir = ensure_dir(&paths.version_dir(version_id));
    version.id = version_id.to_string();
    write_version_json(game_dir, version_id, &version);

    // 1) Client jar
    let client = version
        .downloads
        .as_ref()
        .and_then(|d| d.client.clone())
        .ok_or_else(|| "Sürümde client indirme adresi yok.".to_string())?;
    if client.url.is_empty() {
        return Err("Sürümde client indirme adresi yok.".to_string());
    }
    let client_jar = version_dir.join(format!("{version_id}.jar"));
    progress(
        &on_progress,
        version_id,
        "client",
        0,
        1,
        "Oyun dosyası indiriliyor…".to_string(),
    );
    let cb_progress = on_progress.clone();
    let client_size = client.size.unwrap_or(0);
    let client_version = version_id.to_string();
    let cb: Arc<dyn Fn(u64) + Send + Sync> = Arc::new(move |bytes: u64| {
        progress(
            &cb_progress,
            &client_version,
            "client",
            bytes,
            client_size,
            "Oyun dosyası indiriliyor…".to_string(),
        );
    });
    download_file(
        &DownloadTask {
            url: client.url.clone(),
            dest: client_jar,
            sha1: client.sha1.clone(),
            sha256: None,
            size: client.size,
        },
        Some(cb),
    )
    .await?;

    // 2) Kütüphaneler
    let features = serde_json::Map::new();
    let libraries: Vec<_> = version
        .libraries
        .clone()
        .unwrap_or_default()
        .into_iter()
        .filter(|lib| rules_allow(&lib.rules, &features))
        .collect();

    let mut lib_tasks: Vec<DownloadTask> = Vec::new();
    let mut native_jars: Vec<(PathBuf, Vec<String>)> = Vec::new();

    for lib in &libraries {
        let artifact = lib.downloads.as_ref().and_then(|d| d.artifact.clone());
        if let (Some(artifact_path), Some(artifact_url)) = (library_path(lib), library_url(lib)) {
            lib_tasks.push(DownloadTask {
                url: artifact_url,
                dest: paths.libraries.join(&artifact_path),
                sha1: artifact.as_ref().and_then(|a| a.sha1.clone()),
                sha256: None,
                size: artifact.as_ref().and_then(|a| a.size),
            });
        }

        let natives_key = lib
            .natives
            .as_ref()
            .and_then(|natives| natives.get(crate::mojang::os_name()))
            .and_then(|value| value.as_str())
            .map(|value| value.to_string());
        if let (Some(classifier_key), Some(classifiers)) = (natives_key, lib.downloads.as_ref().and_then(|d| d.classifiers.clone())) {
            let arch = if std::env::consts::ARCH == "x86" { "32" } else { "64" };
            let classifier = classifier_key.replace("${arch}", arch);
            if let Some(raw) = classifiers.get(&classifier) {
                if let Ok(info) = serde_json::from_value::<crate::mojang::DownloadInfo>(raw.clone()) {
                    if !info.url.is_empty() {
                        if let Some(path) = &info.path {
                            let dest = paths.libraries.join(path);
                            native_jars.push((
                                dest.clone(),
                                lib.extract
                                    .as_ref()
                                    .and_then(|ex| ex.exclude.clone())
                                    .unwrap_or_else(|| vec!["META-INF/".to_string()]),
                            ));
                            lib_tasks.push(DownloadTask {
                                url: info.url.clone(),
                                dest,
                                sha1: info.sha1.clone(),
                                sha256: None,
                                size: info.size,
                            });
                        }
                    }
                }
            }
        }
    }

    let total_libs = lib_tasks.len() as u64;
    let done_libs = Arc::new(AtomicUsize::new(0));
    progress(
        &on_progress,
        version_id,
        "libraries",
        0,
        total_libs,
        format!("Kütüphaneler indiriliyor (0/{total_libs})…"),
    );
    let results = {
        let on_progress = on_progress.clone();
        let done_libs = done_libs.clone();
        map_limit(lib_tasks, 12, move |task: DownloadTask| {
            let on_progress = on_progress.clone();
            let done_libs = done_libs.clone();
            async move {
                let result = download_file(&task, None).await;
                let done = done_libs.fetch_add(1, Ordering::SeqCst) + 1;
                progress(
                    &on_progress,
                    version_id,
                    "libraries",
                    done as u64,
                    total_libs,
                    format!("Kütüphaneler indiriliyor ({done}/{total_libs})…"),
                );
                result.map(|_| ())
            }
        })
        .await
    };
    for result in results {
        result?;
    }

    if !native_jars.is_empty() {
        let natives_dir = ensure_dir(&paths.natives(version_id));
        for (jar, exclude) in native_jars {
            extract_natives(&jar, &natives_dir, &exclude);
        }
    }

    // 3) Asset index + nesneler
    if let Some(asset_index) = version.asset_index.clone() {
        let index_file = paths.assets_indexes.join(format!("{}.json", asset_index.id));
        let index: AssetIndex = if is_file(&index_file) {
            fs::read_to_string(&index_file)
                .ok()
                .and_then(|text| serde_json::from_str::<AssetIndex>(&text).ok())
                .unwrap_or_else(|| AssetIndex {
                    objects: HashMap::new(),
                    r#virtual: false,
                    map_to_resources: false,
                })
        } else {
            let fetched: AssetIndex = fetch_json(&asset_index.url).await?;
            ensure_dir(&paths.assets_indexes);
            if let Ok(text) = serde_json::to_string(&serde_json::json!({
                "objects": fetched.objects.iter().map(|(name, obj)| (name.clone(), serde_json::json!({"hash": obj.hash, "size": obj.size}))).collect::<HashMap<_, _>>(),
                "virtual": fetched.r#virtual,
                "map_to_resources": fetched.map_to_resources,
            })) {
                let _ = fs::write(&index_file, text);
            }
            fetched
        };

        let objects: Vec<(String, AssetObject)> = index
            .objects
            .iter()
            .map(|(name, obj)| {
                (
                    name.clone(),
                    AssetObject {
                        hash: obj.hash.clone(),
                        size: obj.size,
                    },
                )
            })
            .collect();
        let total_objects = objects.len() as u64;
        let total_bytes: u64 = objects.iter().map(|(_, obj)| obj.size).sum();
        let assets_done = Arc::new(AtomicUsize::new(0));
        let bytes_done = Arc::new(AtomicU64::new(0));

        let file_list: Vec<(String, String, u64)> = objects
            .iter()
            .map(|(_, obj)| {
                let sub = obj.hash.chars().take(2).collect::<String>();
                (sub, obj.hash.clone(), obj.size)
            })
            .collect();

        progress(
            &on_progress,
            version_id,
            "assets",
            0,
            total_objects,
            format!("Oyun varlıkları indiriliyor (0/{total_objects})…"),
        );

        let version_key = version_id.to_string();
        let results = {
            let on_progress = on_progress.clone();
            let assets_done = assets_done.clone();
            let bytes_done = bytes_done.clone();
            let objects_dir = paths.assets_objects.clone();
            map_limit(file_list, 24, move |(sub, hash, size)| {
                let on_progress = on_progress.clone();
                let assets_done = assets_done.clone();
                let bytes_done = bytes_done.clone();
                let objects_dir = objects_dir.clone();
                let version_key = version_key.clone();
                async move {
                    let bytes_cb = {
                        let on_progress = on_progress.clone();
                        let bytes_done = bytes_done.clone();
                        let assets_done = assets_done.clone();
                        let version_key = version_key.clone();
                        Arc::new(move |n: u64| {
                            let total = bytes_done.fetch_add(n, Ordering::SeqCst) + n;
                            let done = assets_done.load(Ordering::SeqCst) as u64;
                            progress(
                                &on_progress,
                                &version_key,
                                "assets",
                                done,
                                total_objects,
                                format!(
                                    "Oyun varlıkları indiriliyor ({done}/{total_objects}) — {}/{}",
                                    format_bytes(total),
                                    format_bytes(total_bytes)
                                ),
                            );
                        }) as Arc<dyn Fn(u64) + Send + Sync>
                    };
                    let dest = objects_dir.join(&sub).join(&hash);
                    download_file(
                        &DownloadTask {
                            url: format!("https://resources.download.minecraft.net/{sub}/{hash}"),
                            dest: dest.clone(),
                            sha1: Some(hash.clone()),
                            sha256: None,
                            size: Some(size),
                        },
                        Some(bytes_cb),
                    )
                    .await?;
                    if is_file(&dest) {
                        assets_done.fetch_add(1, Ordering::SeqCst);
                    }
                    Ok(())
                }
            })
            .await
        };
        for result in results {
            result?;
        }

        if index.r#virtual || index.map_to_resources {
            let virtual_dir = paths.assets_virtual.join(&asset_index.id);
            progress(
                &on_progress,
                version_id,
                "assets",
                total_objects,
                total_objects,
                "Eski sürüm varlıkları hazırlanıyor…".to_string(),
            );
            for (name, obj) in &index.objects {
                let source = paths
                    .assets_objects
                    .join(obj.hash.chars().take(2).collect::<String>())
                    .join(&obj.hash);
                let target = virtual_dir.join(name);
                if let Some(parent) = target.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                if !is_file(&target) {
                    let _ = fs::copy(&source, &target);
                }
            }
        }
    }

    // 4) Log yapılandırması
    if let Some(log_file) = version
        .logging
        .as_ref()
        .and_then(|logging| logging.client.as_ref())
        .map(|client| client.file.clone())
    {
        if let Some(url) = log_file.url.clone() {
            let id = if log_file.id.to_lowercase().ends_with(".xml") {
                log_file.id.clone()
            } else {
                format!("{}.xml", log_file.id)
            };
            download_file(
                &DownloadTask {
                    url,
                    dest: paths.log_configs.join(id),
                    sha1: log_file.sha1.clone(),
                    sha256: None,
                    size: log_file.size,
                },
                None,
            )
            .await?;
        }
    }

    progress(
        &on_progress,
        version_id,
        "done",
        1,
        1,
        "Kurulum tamamlandı.".to_string(),
    );

    // Yükleyici sürümlerinde birleştirilmiş profili de tazele.
    if let Ok(merged) = merge_version(game_dir, version_id) {
        write_version_json(game_dir, version_id, &merged);
        version = merged;
    }

    Ok(version)
}

fn extract_natives(jar_path: &Path, dest_dir: &Path, exclude: &[String]) {
    let Ok(file) = fs::File::open(jar_path) else {
        return;
    };
    let Ok(mut archive) = zip::ZipArchive::new(file) else {
        return;
    };
    for index in 0..archive.len() {
        let Ok(mut entry) = archive.by_index(index) else {
            continue;
        };
        let Some(name) = entry.enclosed_name().map(|p| p.to_path_buf()) else {
            continue;
        };
        let name_str = name.to_string_lossy().replace('\\', "/");
        if entry.is_dir() || exclude.iter().any(|prefix| name_str.starts_with(prefix.as_str())) {
            continue;
        }
        let Some(file_name) = name.file_name() else {
            continue;
        };
        let target = dest_dir.join(file_name);
        if let Ok(mut out) = fs::File::create(&target) {
            let _ = std::io::copy(&mut entry, &mut out);
        }
    }
}

pub fn offline_uuid(username: &str) -> String {
    let mut hash = md5::compute(format!("OfflinePlayer:{username}")).0;
    hash[6] = (hash[6] & 0x0f) | 0x30;
    hash[8] = (hash[8] & 0x3f) | 0x80;
    let hex = crate::net::hex(&hash);
    format!(
        "{}-{}-{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..]
    )
}

pub fn format_bytes(bytes: u64) -> String {
    if bytes == 0 {
        return "0 B".to_string();
    }
    let units = ["B", "KB", "MB", "GB"];
    let mut value = bytes as f64;
    let mut index = 0;
    while value >= 1024.0 && index < units.len() - 1 {
        value /= 1024.0;
        index += 1;
    }
    if index == 0 {
        format!("{} {}", bytes, units[index])
    } else {
        format!("{:.1} {}", value, units[index])
    }
}

