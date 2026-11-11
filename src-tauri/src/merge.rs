use std::fs;
use std::path::Path;

use crate::mojang::{Arguments, Library, VersionJson};
use crate::paths::LauncherPaths;

pub fn read_local_version(shared_root: &str, id: &str) -> Option<VersionJson> {
    let file = LauncherPaths::new(shared_root)
        .version_dir(id)
        .join(format!("{id}.json"));
    let text = fs::read_to_string(file).ok()?;
    serde_json::from_str(&text).ok()
}

pub fn write_version_json(shared_root: &str, id: &str, json: &VersionJson) {
    let dir = LauncherPaths::new(shared_root).version_dir(id);
    let _ = fs::create_dir_all(&dir);
    if let Ok(text) = serde_json::to_string_pretty(json) {
        let _ = fs::write(dir.join(format!("{id}.json")), text);
    }
}

fn dedupe_libraries(parent: &[Library], child: &[Library]) -> Vec<Library> {
    let mut out: Vec<Library> = parent.to_vec();
    for library in child {
        // Çocuk sürümün kütüphanesi ebeveyninkini geçersiz kılar
        if let Some(position) = out.iter().position(|entry| entry.name == library.name) {
            out[position] = library.clone();
        } else {
            out.push(library.clone());
        }
    }
    out
}

/// inheritsFrom zincirini çözer: ebeveyn sürümün kütüphaneleri, argümanları ve
/// indirme bilgileriyle birleştirilmiş tek bir sürüm JSON'u üretir.
pub fn merge_version(shared_root: &str, id: &str) -> Result<VersionJson, String> {
    merge_inner(shared_root, id, &mut Vec::new())
}

fn merge_inner(shared_root: &str, id: &str, seen: &mut Vec<String>) -> Result<VersionJson, String> {
    let child = read_local_version(shared_root, id)
        .ok_or_else(|| format!("Sürüm dosyası bulunamadı: {id}"))?;

    let parent_id = match child.inherits_from.clone() {
        Some(parent) => parent,
        None => return Ok(child),
    };

    if seen.iter().any(|entry| entry == id) {
        return Err(format!("Döngüsel inheritsFrom: {id}"));
    }
    seen.push(id.to_string());

    let parent = merge_inner(shared_root, &parent_id, seen)?;

    let merges_arguments = parent.arguments.is_some() || child.arguments.is_some();
    let parent_game = parent
        .arguments
        .as_ref()
        .map(|args| args.game.clone())
        .unwrap_or_default();
    let parent_jvm = parent
        .arguments
        .as_ref()
        .map(|args| args.jvm.clone())
        .unwrap_or_default();
    let child_game = child
        .arguments
        .as_ref()
        .map(|args| args.game.clone())
        .unwrap_or_default();
    let child_jvm = child
        .arguments
        .as_ref()
        .map(|args| args.jvm.clone())
        .unwrap_or_default();
    let merged_arguments = if merges_arguments {
        Some(Arguments {
            game: parent_game.into_iter().chain(child_game).collect(),
            jvm: parent_jvm.into_iter().chain(child_jvm).collect(),
        })
    } else {
        None
    };

    let mut extra = parent.extra.clone();
    for (key, value) in &child.extra {
        extra.insert(key.clone(), value.clone());
    }

    let merged = VersionJson {
        id: id.to_string(),
        kind: if child.kind.is_empty() {
            parent.kind.clone()
        } else {
            child.kind.clone()
        },
        main_class: if child.main_class.is_empty() {
            parent.main_class.clone()
        } else {
            child.main_class.clone()
        },
        release_time: child.release_time.clone().or(parent.release_time.clone()),
        time: child.time.clone().or(parent.time.clone()),
        inherits_from: None,
        asset_index: child.asset_index.clone().or(parent.asset_index.clone()),
        assets: child.assets.clone().or(parent.assets.clone()),
        downloads: match (parent.downloads.clone(), child.downloads.clone()) {
            (Some(mut parent_downloads), Some(child_downloads)) => {
                if child_downloads.client.is_some() {
                    parent_downloads.client = child_downloads.client;
                }
                if child_downloads.server.is_some() {
                    parent_downloads.server = child_downloads.server;
                }
                Some(parent_downloads)
            }
            (parent_downloads, None) => parent_downloads,
            (None, child_downloads) => child_downloads,
        },
        libraries: Some(dedupe_libraries(
            &parent.libraries.clone().unwrap_or_default(),
            &child.libraries.clone().unwrap_or_default(),
        )),
        java_version: child.java_version.clone().or(parent.java_version.clone()),
        logging: child.logging.clone().or(parent.logging.clone()),
        arguments: merged_arguments,
        minecraft_arguments: if merges_arguments {
            None
        } else {
            parent
                .minecraft_arguments
                .clone()
                .or(child.minecraft_arguments.clone())
        },
        extra,
    };

    Ok(merged)
}

pub fn version_dir_exists(shared_root: &str, id: &str) -> bool {
    let dir: &Path = &LauncherPaths::new(shared_root).version_dir(id);
    dir.is_dir()
}
