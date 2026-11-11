use std::fs;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use serde::Deserialize;

use crate::install::install_version;
use crate::merge::{merge_version, read_local_version, write_version_json};
use crate::model::JavaInfo;
use crate::mojang::VersionJson;
use crate::net::{download_file, fetch_json, fetch_text, DownloadTask};
use crate::paths::LauncherPaths;

pub struct LoaderResult {
    pub launch_version_id: String,
    pub loader_version: Option<String>,
}

pub type ProgressFn = Arc<dyn Fn(&str) + Send + Sync>;

fn find_version_dir<F: Fn(&str) -> bool>(shared_root: &str, predicate: F) -> Option<String> {
    let dir = LauncherPaths::new(shared_root).versions;
    let entries = fs::read_dir(dir).ok()?;
    let mut matches: Vec<String> = entries
        .flatten()
        .filter(|entry| entry.path().is_dir())
        .map(|entry| entry.file_name().to_string_lossy().to_string())
        .filter(|name| predicate(name))
        .collect();
    matches.sort_by(|a, b| b.len().cmp(&a.len()));
    matches.into_iter().next()
}

async fn install_profile_json(
    shared_root: &str,
    profile: VersionJson,
    progress: ProgressFn,
) -> Result<LoaderResult, String> {
    let id = profile.id.clone();
    if let Some(parent) = profile.inherits_from.clone() {
        if read_local_version(shared_root, &parent).is_none() {
            progress(&format!("Önce {parent} sürümü kuruluyor…"));
            install_version(shared_root, &parent, None, Arc::new(|_| {})).await?;
        }
    }

    write_version_json(shared_root, &id, &profile);
    let merged = merge_version(shared_root, &id)?;
    write_version_json(shared_root, &id, &merged);

    progress(&format!("{id} dosyaları indiriliyor…"));
    install_version(shared_root, &id, None, Arc::new(|_| {})).await?;
    Ok(LoaderResult {
        launch_version_id: profile.id.clone(),
        loader_version: Some(profile.id.clone()),
    })
}

#[derive(Deserialize)]
struct FabricLoaderEntry {
    loader: FabricLoaderVersion,
}

#[derive(Deserialize)]
struct FabricLoaderVersion {
    version: String,
    #[serde(default)]
    stable: bool,
}

async fn install_fabric(
    shared_root: &str,
    version_id: &str,
    progress: ProgressFn,
) -> Result<LoaderResult, String> {
    progress("Fabric sürümleri alınıyor…");
    let url = format!(
        "https://meta.fabricmc.net/v2/versions/loader/{}",
        version_id
    );
    let loaders: Vec<FabricLoaderEntry> = fetch_json(&url).await?;
    let chosen = loaders
        .iter()
        .find(|entry| entry.loader.stable)
        .or_else(|| loaders.first())
        .ok_or_else(|| format!("Fabric, Minecraft {version_id} için sürüm bulamadı."))?;
    let loader_version = chosen.loader.version.clone();
    progress(&format!("Fabric {loader_version} hazırlanıyor…"));
    let profile_url = format!(
        "https://meta.fabricmc.net/v2/versions/loader/{}/{}/profile/json",
        version_id, loader_version
    );
    let mut profile: VersionJson = fetch_json(&profile_url).await?;
    profile.id = format!("fabric-loader-{loader_version}-{version_id}");
    profile.inherits_from = Some(version_id.to_string());
    let mut result = install_profile_json(shared_root, profile, progress).await?;
    result.loader_version = Some(loader_version);
    Ok(result)
}

#[derive(Deserialize)]
struct QuiltLoaderEntry {
    loader: QuiltLoaderVersion,
}

#[derive(Deserialize)]
struct QuiltLoaderVersion {
    version: String,
}

async fn install_quilt(
    shared_root: &str,
    version_id: &str,
    progress: ProgressFn,
) -> Result<LoaderResult, String> {
    progress("Quilt sürümleri alınıyor…");
    let url = format!(
        "https://meta.quiltmc.org/v3/versions/loader/{}",
        version_id
    );
    let loaders: Vec<QuiltLoaderEntry> = fetch_json(&url).await?;
    let chosen = loaders
        .first()
        .ok_or_else(|| format!("Quilt, Minecraft {version_id} için sürüm bulamadı."))?;
    let loader_version = chosen.loader.version.clone();
    progress(&format!("Quilt {loader_version} hazırlanıyor…"));
    let profile_url = format!(
        "https://meta.quiltmc.org/v3/versions/loader/{}/{}/profile/json",
        version_id, loader_version
    );
    let mut profile: VersionJson = fetch_json(&profile_url).await?;
    profile.id = format!("quilt-loader-{loader_version}-{version_id}");
    profile.inherits_from = Some(version_id.to_string());
    let mut result = install_profile_json(shared_root, profile, progress).await?;
    result.loader_version = Some(loader_version);
    Ok(result)
}

#[derive(Deserialize)]
struct ForgePromotions {
    #[serde(default)]
    promos: std::collections::HashMap<String, String>,
}

async fn find_forge_version(version_id: &str) -> Result<String, String> {
    let data: ForgePromotions = fetch_json(
        "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json",
    )
    .await?;
    data.promos
        .get(&format!("{version_id}-recommended"))
        .or_else(|| data.promos.get(&format!("{version_id}-latest")))
        .cloned()
        .ok_or_else(|| format!("Forge, Minecraft {version_id} için sürüm bulamadı."))
}

async fn run_installer(
    java: &JavaInfo,
    jar_path: &str,
    shared_root: &str,
    progress: ProgressFn,
) -> Result<(), String> {
    let profiles_file = std::path::Path::new(shared_root).join("launcher_profiles.json");
    if !profiles_file.exists() {
        let content = serde_json::json!({
            "profiles": {},
            "settings": {},
            "version": 3,
            "launcherVersion": { "name": "modlum", "format": 21 }
        });
        if let Ok(text) = serde_json::to_string_pretty(&content) {
            let _ = fs::write(&profiles_file, text);
        }
    }

    progress("Loader yükleyicisi çalıştırılıyor… (birkaç dakika sürebilir)");
    let mut command = tokio::process::Command::new(&java.path);
    command
        .arg("-jar")
        .arg(jar_path)
        .arg("--installClient")
        .arg(shared_root)
        .current_dir(shared_root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.as_std_mut().creation_flags(0x0800_0000);
    }

    let output = tokio::time::timeout(Duration::from_secs(15 * 60), command.output())
        .await
        .map_err(|_| "Loader yükleyicisi zaman aşımına uğradı.".to_string())?
        .map_err(|error| format!("Loader yükleyicisi başarısız oldu: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let message = if stderr.trim().is_empty() { stdout } else { stderr };
        return Err(format!(
            "Loader yükleyicisi başarısız oldu: {}",
            message.chars().take(400).collect::<String>()
        ));
    }
    Ok(())
}

async fn install_forge(
    shared_root: &str,
    version_id: &str,
    java: &JavaInfo,
    progress: ProgressFn,
) -> Result<LoaderResult, String> {
    let forge_version = find_forge_version(version_id).await?;
    let id = format!("{version_id}-forge-{forge_version}");
    if let Some(existing) = find_version_dir(shared_root, |entry| entry == id) {
        return Ok(LoaderResult {
            launch_version_id: existing,
            loader_version: Some(forge_version),
        });
    }

    progress(&format!("Forge {forge_version} indiriliyor…"));
    let installer_name = format!("forge-{version_id}-{forge_version}-installer.jar");
    let installer_path = std::path::Path::new(shared_root)
        .join("installers")
        .join(&installer_name);
    download_file(
        &DownloadTask {
            url: format!(
                "https://maven.minecraftforge.net/net/minecraftforge/forge/{version_id}-{forge_version}/{installer_name}"
            ),
            dest: installer_path.clone(),
            sha1: None,
            sha256: None,
            size: None,
        },
        None,
    )
    .await?;

    run_installer(
        java,
        &installer_path.to_string_lossy(),
        shared_root,
        progress.clone(),
    )
    .await?;
    let _ = fs::remove_file(&installer_path);

    let created = find_version_dir(shared_root, |entry| {
        entry.contains("-forge-") && entry.starts_with(version_id)
    })
    .ok_or_else(|| "Forge kurulumu tamamlandı ancak sürüm dosyası bulunamadı.".to_string())?;
    Ok(LoaderResult {
        launch_version_id: created,
        loader_version: Some(forge_version),
    })
}

async fn find_neoforge_version(version_id: &str) -> Result<String, String> {
    let parts: Vec<&str> = version_id.split('.').collect();
    let prefix = format!("{}.", parts.iter().skip(1).cloned().collect::<Vec<_>>().join("."));
    let xml = fetch_text(
        "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml",
    )
    .await?;
    let mut candidates: Vec<String> = Vec::new();
    let mut rest = xml.as_str();
    while let Some(start) = rest.find("<version>") {
        let after = &rest[start + "<version>".len()..];
        if let Some(end) = after.find("</version>") {
            let version = after[..end].to_string();
            if version.starts_with(&prefix) && !version.contains('-') {
                candidates.push(version);
            }
            rest = &after[end + "</version>".len()..];
        } else {
            break;
        }
    }
    candidates
        .pop()
        .ok_or_else(|| format!("NeoForge, Minecraft {version_id} için sürüm bulamadı."))
}

async fn install_neoforge(
    shared_root: &str,
    version_id: &str,
    java: &JavaInfo,
    progress: ProgressFn,
) -> Result<LoaderResult, String> {
    let neo_version = find_neoforge_version(version_id).await?;
    let id = format!("neoforge-{neo_version}");
    if let Some(existing) = find_version_dir(shared_root, |entry| entry == id) {
        return Ok(LoaderResult {
            launch_version_id: existing,
            loader_version: Some(neo_version),
        });
    }

    progress(&format!("NeoForge {neo_version} indiriliyor…"));
    let installer_name = format!("neoforge-{neo_version}-installer.jar");
    let installer_path = std::path::Path::new(shared_root)
        .join("installers")
        .join(&installer_name);
    download_file(
        &DownloadTask {
            url: format!(
                "https://maven.neoforged.net/releases/net/neoforged/neoforge/{neo_version}/{installer_name}"
            ),
            dest: installer_path.clone(),
            sha1: None,
            sha256: None,
            size: None,
        },
        None,
    )
    .await?;

    run_installer(
        java,
        &installer_path.to_string_lossy(),
        shared_root,
        progress.clone(),
    )
    .await?;
    let _ = fs::remove_file(&installer_path);

    let created = find_version_dir(shared_root, |entry| {
        entry == id || entry.starts_with(&format!("neoforge-{neo_version}"))
    })
    .ok_or_else(|| "NeoForge kurulumu tamamlandı ancak sürüm dosyası bulunamadı.".to_string())?;
    Ok(LoaderResult {
        launch_version_id: created,
        loader_version: Some(neo_version),
    })
}

pub async fn install_loader(
    shared_root: &str,
    version_id: &str,
    loader: &str,
    java: &JavaInfo,
    progress: ProgressFn,
) -> Result<LoaderResult, String> {
    match loader {
        "vanilla" => Ok(LoaderResult {
            launch_version_id: version_id.to_string(),
            loader_version: None,
        }),
        "fabric" => install_fabric(shared_root, version_id, progress).await,
        "quilt" => install_quilt(shared_root, version_id, progress).await,
        "forge" => install_forge(shared_root, version_id, java, progress).await,
        "neoforge" => install_neoforge(shared_root, version_id, java, progress).await,
        other => Err(format!("Bilinmeyen loader: {other}")),
    }
}

pub fn loader_label(loader: &str) -> &'static str {
    match loader {
        "fabric" => "Fabric",
        "quilt" => "Quilt",
        "forge" => "Forge",
        "neoforge" => "NeoForge",
        _ => "Vanilla",
    }
}
