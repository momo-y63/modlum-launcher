use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::model::VersionSummary;
use crate::net::fetch_json;

pub const VERSION_MANIFEST_URL: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
pub const RESOURCES_URL: &str = "https://resources.download.minecraft.net";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VersionManifestEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub url: String,
    #[serde(default)]
    pub time: String,
    #[serde(default)]
    pub release_time: String,
    #[serde(default)]
    pub sha1: String,
}

impl VersionManifestEntry {
    pub fn summary(&self) -> VersionSummary {
        VersionSummary {
            id: self.id.clone(),
            kind: self.kind.clone(),
            release_time: self.release_time.clone(),
            url: self.url.clone(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VersionManifest {
    pub latest: LatestVersions,
    pub versions: Vec<VersionManifestEntry>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LatestVersions {
    pub release: String,
    pub snapshot: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DownloadInfo {
    pub url: String,
    pub sha1: Option<String>,
    pub size: Option<u64>,
    pub path: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub struct LibraryDownloads {
    pub artifact: Option<DownloadInfo>,
    pub classifiers: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Rule {
    pub action: String,
    pub os: Option<RuleOs>,
    pub features: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub struct RuleOs {
    pub name: Option<String>,
    pub arch: Option<String>,
    pub version: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Library {
    pub name: String,
    pub url: Option<String>,
    pub downloads: Option<LibraryDownloads>,
    pub natives: Option<serde_json::Map<String, serde_json::Value>>,
    pub extract: Option<ExtractRules>,
    pub rules: Option<Vec<Rule>>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub struct ExtractRules {
    pub exclude: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ArgumentRule {
    pub rules: Vec<Rule>,
    pub value: serde_json::Value,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub struct Arguments {
    pub game: Vec<serde_json::Value>,
    pub jvm: Vec<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct AssetIndexRef {
    pub id: String,
    pub sha1: Option<String>,
    pub size: Option<u64>,
    pub total_size: Option<u64>,
    pub url: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub struct DownloadsBlock {
    pub client: Option<DownloadInfo>,
    pub server: Option<DownloadInfo>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct JavaVersion {
    pub component: Option<String>,
    pub major_version: Option<u64>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub struct LoggingFile {
    pub id: String,
    pub url: Option<String>,
    pub sha1: Option<String>,
    pub size: Option<u64>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub struct LoggingClient {
    pub argument: String,
    pub file: LoggingFile,
    #[serde(rename = "type")]
    pub kind: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub struct Logging {
    pub client: Option<LoggingClient>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct VersionJson {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub main_class: String,
    pub release_time: Option<String>,
    pub time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inherits_from: Option<String>,
    pub asset_index: Option<AssetIndexRef>,
    pub assets: Option<String>,
    pub downloads: Option<DownloadsBlock>,
    pub libraries: Option<Vec<Library>>,
    pub java_version: Option<JavaVersion>,
    pub logging: Option<Logging>,
    pub arguments: Option<Arguments>,
    pub minecraft_arguments: Option<String>,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

pub fn os_name() -> &'static str {
    if cfg!(windows) {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    }
}

pub fn os_arch() -> &'static str {
    match std::env::consts::ARCH {
        "x86" => "x86",
        "aarch64" => "arm64",
        _ => "x86_64",
    }
}

fn feature_bool(features: &serde_json::Map<String, serde_json::Value>, key: &str) -> bool {
    features.get(key).and_then(|v| v.as_bool()).unwrap_or(false)
}

pub fn rules_allow(rules: &Option<Vec<Rule>>, features: &serde_json::Map<String, serde_json::Value>) -> bool {
    let rules = match rules {
        Some(list) if !list.is_empty() => list,
        _ => return true,
    };
    let mut allowed = false;
    for rule in rules {
        let mut matches = true;
        if let Some(os) = &rule.os {
            if let Some(name) = &os.name {
                if name != os_name() {
                    matches = false;
                }
            }
            if let Some(arch) = &os.arch {
                let ok = (arch == "x86" && os_arch() == "x86")
                    || (arch == "x86_64" && os_arch() == "x86_64")
                    || arch == os_arch();
                if !ok {
                    matches = false;
                }
            }
        }
        if let Some(features_rule) = &rule.features {
            for (key, value) in features_rule {
                let expected = value.as_bool().unwrap_or(false);
                if feature_bool(features, key) != expected {
                    matches = false;
                }
            }
        }
        if matches {
            allowed = rule.action == "allow";
        }
    }
    allowed
}

pub fn library_path(lib: &Library) -> Option<String> {
    if let Some(artifact) = lib.downloads.as_ref().and_then(|d| d.artifact.as_ref()) {
        if let Some(path) = &artifact.path {
            return Some(path.clone());
        }
    }

    let mut name = lib.name.clone();
    let mut extension = "jar".to_string();
    if let Some(at) = name.find('@') {
        extension = name[at + 1..].to_string();
        name.truncate(at);
    }

    let parts: Vec<&str> = name.split(':').collect();
    if parts.len() < 3 {
        return None;
    }
    let group = parts[0];
    let artifact = parts[1];
    let version = parts[2];
    let classifier = if parts.len() > 3 { Some(parts[3]) } else { None };

    let jar = match classifier {
        Some(classifier) => format!("{artifact}-{version}-{classifier}.{extension}"),
        None => format!("{artifact}-{version}.{extension}"),
    };
    Some(format!(
        "{}/{}/{}/{}",
        group.replace('.', "/"),
        artifact,
        version,
        jar
    ))
}

pub fn library_url(lib: &Library) -> Option<String> {
    if let Some(artifact) = lib.downloads.as_ref().and_then(|d| d.artifact.as_ref()) {
        if !artifact.url.is_empty() {
            return Some(artifact.url.clone());
        }
    }
    let file = library_path(lib)?;
    let base = lib
        .url
        .clone()
        .unwrap_or_else(|| "https://libraries.minecraft.net/".to_string());
    Some(format!("{}/{}", base.trim_end_matches('/'), file))
}

static MANIFEST_CACHE: OnceLock<Mutex<Option<(VersionManifest, Instant)>>> = OnceLock::new();

pub async fn get_version_manifest() -> Result<VersionManifest, String> {
    let cache = MANIFEST_CACHE.get_or_init(|| Mutex::new(None));
    if let Ok(guard) = cache.lock() {
        if let Some((data, at)) = guard.as_ref() {
            if at.elapsed() < Duration::from_secs(5 * 60) {
                return Ok(data.clone());
            }
        }
    }
    let data: VersionManifest = fetch_json(VERSION_MANIFEST_URL).await?;
    if let Ok(mut guard) = cache.lock() {
        *guard = Some((data.clone(), Instant::now()));
    }
    Ok(data)
}

pub async fn get_version_json(url: &str) -> Result<VersionJson, String> {
    fetch_json(url).await
}
