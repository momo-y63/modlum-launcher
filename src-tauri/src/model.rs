use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const LOADERS: [&str; 5] = ["vanilla", "fabric", "quilt", "forge", "neoforge"];
pub const ICONS: [&str; 6] = ["grass", "lagoon", "pink", "amber", "violet", "slate"];

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    #[serde(rename = "type")]
    pub account_type: String,
    pub username: String,
    pub uuid: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub access_token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub xuid: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Instance {
    pub id: String,
    pub name: String,
    pub version_id: String,
    pub loader: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub loader_version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub launch_version_id: Option<String>,
    pub dir: String,
    pub icon: String,
    pub created_at: u64,
    #[serde(default)]
    pub last_played_at: Option<u64>,
    #[serde(default)]
    pub playtime_seconds: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SpotifyConnection {
    pub refresh_token: Option<String>,
    pub access_token: Option<String>,
    pub expires_at: u64,
    pub display_name: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub game_dir: String,
    pub java_path: String,
    pub memory_mb: u64,
    pub microsoft_client_id: String,
    pub keep_launcher_open: bool,
    pub last_version_id: Option<String>,
    pub active_account_id: Option<String>,
    pub accounts: Vec<Account>,
    pub show_snapshots: bool,
    pub onboarding_done: bool,
    pub performance_mode: bool,
    pub theme: String,
    pub playtime: HashMap<String, u64>,
    pub instances: Vec<Instance>,
    pub active_instance_id: Option<String>,
    pub spotify_client_id: String,
    pub spotify: SpotifyConnection,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            game_dir: String::new(),
            java_path: String::new(),
            memory_mb: 4096,
            microsoft_client_id: String::new(),
            keep_launcher_open: true,
            last_version_id: None,
            active_account_id: None,
            accounts: Vec::new(),
            show_snapshots: false,
            onboarding_done: false,
            performance_mode: false,
            theme: "light".to_string(),
            playtime: HashMap::new(),
            instances: Vec::new(),
            active_instance_id: None,
            spotify_client_id: String::new(),
            spotify: SpotifyConnection::default(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VersionSummary {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub release_time: String,
    pub url: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstalledVersion {
    pub id: String,
    pub name: String,
    pub installed_at: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstallProgress {
    pub version_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub instance_id: Option<String>,
    pub phase: String,
    pub current: u64,
    pub total: u64,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LaunchState {
    pub running: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub started_at: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    pub stream: String,
    pub text: String,
    pub at: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct JavaInfo {
    pub path: String,
    pub major: u64,
    pub version: String,
    pub source: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCodeInfo {
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub platform: String,
    pub data_dir: String,
    pub default_game_dir: String,
    pub versions: AppVersions,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppVersions {
    pub tauri: String,
    pub rust: String,
    pub webview: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct InstanceContent {
    pub mods: Vec<ContentFile>,
    pub resourcepacks: Vec<ContentFile>,
    pub shaderpacks: Vec<ContentFile>,
    pub datapacks: Vec<ContentFile>,
    pub worlds: Vec<ContentFile>,
    pub screenshots: Vec<ContentFile>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ContentFile {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    pub size: u64,
    pub modified_at: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NewsItem {
    pub title: String,
    pub text: String,
    pub date: String,
    pub image: Option<String>,
    pub link: String,
    pub category: String,
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
