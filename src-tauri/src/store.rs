use std::fs;
use std::path::PathBuf;

use crate::model::{now_ms, Instance, Settings};
use crate::paths::{app_data_dir, default_game_dir, ensure_dir};

pub fn settings_file() -> PathBuf {
    app_data_dir().join("settings.json")
}

pub fn load() -> Settings {
    let mut settings = fs::read_to_string(settings_file())
        .ok()
        .and_then(|text| serde_json::from_str::<Settings>(&text).ok())
        .unwrap_or_default();

    // Eski kurulumdan geçiş: seçili sürüm varsa onu bir instance'a dönüştür.
    if settings.instances.is_empty() {
        if let Some(last) = settings.last_version_id.clone() {
            let playtime = *settings.playtime.get(&last).unwrap_or(&0);
            let instance = Instance {
                id: "default".to_string(),
                name: "Varsayılan".to_string(),
                version_id: last,
                loader: "vanilla".to_string(),
                loader_version: None,
                launch_version_id: None,
                dir: settings.game_dir.clone(),
                icon: "grass".to_string(),
                created_at: now_ms(),
                last_played_at: None,
                playtime_seconds: playtime,
            };
            settings.instances = vec![instance];
            settings.active_instance_id = Some("default".to_string());
        }
    }

    if settings.game_dir.is_empty() {
        settings.game_dir = default_game_dir().to_string_lossy().to_string();
    }
    if settings.theme != "dark" {
        settings.theme = if settings.theme == "light" {
            "light".to_string()
        } else {
            "light".to_string()
        };
    }
    settings
}

pub fn write(settings: &Settings) {
    ensure_dir(&app_data_dir());
    if let Ok(text) = serde_json::to_string_pretty(settings) {
        let _ = fs::write(settings_file(), text);
    }
}

pub fn active_account(settings: &Settings) -> Option<crate::model::Account> {
    let id = settings.active_account_id.clone()?;
    settings.accounts.iter().find(|a| a.id == id).cloned()
}
