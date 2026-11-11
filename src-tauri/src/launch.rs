use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;

use serde_json::{Map, Value};
use tokio::process::{Child, Command};

use crate::model::{Account, JavaInfo, Settings};
use crate::mojang::{library_path, rules_allow, Rule, VersionJson};
use crate::net::is_file;
use crate::paths::LauncherPaths;

const LAUNCHER_NAME: &str = "modlum";
const LAUNCHER_VERSION: &str = "1.0.0";

pub struct LaunchOptions {
    pub shared_root: String,
    pub instance_dir: String,
    pub version_id: String,
    pub account: Account,
    pub java: JavaInfo,
    pub settings: Settings,
}

pub struct LaunchResult {
    pub child: Child,
    pub command: Vec<String>,
    pub pid: Option<u32>,
}

pub fn log_config_file_name(id: &str) -> String {
    if id.to_lowercase().ends_with(".xml") {
        id.to_string()
    } else {
        format!("{id}.xml")
    }
}

fn substitute(template: &str, values: &HashMap<String, String>) -> String {
    let mut out = String::with_capacity(template.len());
    let mut rest = template;
    while let Some(start) = rest.find("${") {
        out.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        match after.find('}') {
            Some(end) => {
                let key = &after[..end];
                if let Some(value) = values.get(key) {
                    out.push_str(value);
                }
                rest = &after[end + 1..];
            }
            None => {
                out.push_str(&rest[start..]);
                rest = "";
            }
        }
    }
    out.push_str(rest);
    out
}

fn flatten_arguments(args: &[Value], features: &Map<String, Value>) -> Vec<String> {
    let mut out = Vec::new();
    for entry in args {
        match entry {
            Value::String(text) => out.push(text.clone()),
            Value::Object(map) => {
                let rules: Option<Vec<Rule>> = map
                    .get("rules")
                    .and_then(|raw| serde_json::from_value(raw.clone()).ok());
                if rules_allow(&rules, features) {
                    match map.get("value") {
                        Some(Value::String(text)) => out.push(text.clone()),
                        Some(Value::Array(items)) => {
                            for item in items {
                                if let Some(text) = item.as_str() {
                                    out.push(text.to_string());
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }
    out
}

pub async fn launch_game(options: LaunchOptions) -> Result<LaunchResult, String> {
    let paths = LauncherPaths::new(&options.shared_root);
    let version_file = paths
        .version_dir(&options.version_id)
        .join(format!("{}.json", options.version_id));
    if !is_file(&version_file) {
        return Err(format!("Sürüm kurulu değil: {}", options.version_id));
    }

    let text = std::fs::read_to_string(&version_file).map_err(|e| e.to_string())?;
    let version: VersionJson = serde_json::from_str(&text).map_err(|e| e.to_string())?;

    let client_jar = paths
        .version_dir(&options.version_id)
        .join(format!("{}.jar", options.version_id));
    if !is_file(&client_jar) {
        return Err(format!("Oyun dosyası eksik: {}.jar", options.version_id));
    }

    let mut features = Map::new();
    features.insert("is_demo_user".to_string(), Value::Bool(false));
    features.insert("has_custom_resolution".to_string(), Value::Bool(false));
    for key in [
        "has_quick_plays_support",
        "is_quick_play_singleplayer",
        "is_quick_play_multiplayer",
        "is_quick_play_realms",
    ] {
        features.insert(key.to_string(), Value::Bool(false));
    }

    let mut classpath_entries: Vec<String> = Vec::new();
    for lib in version.libraries.clone().unwrap_or_default() {
        if !rules_allow(&lib.rules, &features) {
            continue;
        }
        if let Some(artifact_path) = library_path(&lib) {
            classpath_entries.push(
                paths
                    .libraries
                    .join(artifact_path)
                    .to_string_lossy()
                    .to_string(),
            );
        }
    }
    classpath_entries.push(client_jar.to_string_lossy().to_string());

    let separator = if cfg!(windows) { ";" } else { ":" };
    let classpath = classpath_entries.join(separator);

    let log_config = version
        .logging
        .as_ref()
        .and_then(|logging| logging.client.as_ref())
        .cloned();
    let log_config_path = log_config
        .as_ref()
        .map(|client| {
            paths
                .log_configs
                .join(log_config_file_name(&client.file.id))
                .to_string_lossy()
                .to_string()
        })
        .unwrap_or_default();

    let natives_dir = paths.natives(&options.version_id);
    let mut placeholders: HashMap<String, String> = HashMap::new();
    placeholders.insert("auth_player_name".into(), options.account.username.clone());
    placeholders.insert("version_name".into(), options.version_id.clone());
    placeholders.insert("game_directory".into(), options.instance_dir.clone());
    placeholders.insert("assets_root".into(), paths.assets.to_string_lossy().to_string());
    placeholders.insert(
        "assets_index_name".into(),
        version
            .assets
            .clone()
            .or_else(|| version.asset_index.as_ref().map(|index| index.id.clone()))
            .unwrap_or_else(|| "legacy".to_string()),
    );
    placeholders.insert("auth_uuid".into(), options.account.uuid.clone());
    let token = options
        .account
        .access_token
        .clone()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "0".to_string());
    placeholders.insert("auth_access_token".into(), token.clone());
    placeholders.insert("auth_session".into(), token);
    placeholders.insert(
        "user_type".into(),
        if options.account.account_type == "microsoft" {
            "msa".to_string()
        } else {
            "legacy".to_string()
        },
    );
    placeholders.insert("user_properties".into(), "{}".to_string());
    placeholders.insert("version_type".into(), version.kind.clone());
    placeholders.insert("classpath".into(), classpath);
    placeholders.insert(
        "libraries_directory".into(),
        paths.libraries.to_string_lossy().to_string(),
    );
    placeholders.insert(
        "natives_directory".into(),
        natives_dir.to_string_lossy().to_string(),
    );
    placeholders.insert("launcher_name".into(), LAUNCHER_NAME.to_string());
    placeholders.insert("launcher_version".into(), LAUNCHER_VERSION.to_string());
    placeholders.insert("clientid".into(), String::new());
    placeholders.insert(
        "auth_xuid".into(),
        options.account.xuid.clone().unwrap_or_default(),
    );
    placeholders.insert("resolution_width".into(), "1280".to_string());
    placeholders.insert("resolution_height".into(), "720".to_string());
    placeholders.insert(
        "game_assets".into(),
        paths
            .assets_virtual
            .join(version.assets.clone().unwrap_or_else(|| "legacy".to_string()))
            .to_string_lossy()
            .to_string(),
    );
    placeholders.insert("quickPlayPath".into(), String::new());
    placeholders.insert("quickPlaySingleplayer".into(), String::new());
    placeholders.insert("quickPlayMultiplayer".into(), String::new());
    placeholders.insert("quickPlayRealms".into(), String::new());

    let memory = options.settings.memory_mb.max(1024);
    let mut jvm_args: Vec<String> = Vec::new();
    jvm_args.push(format!("-Xmx{memory}M"));
    jvm_args.push(format!(
        "-Xms{}M",
        std::cmp::min(1024, std::cmp::max(512, memory / 2))
    ));
    jvm_args.push("-Dfile.encoding=UTF-8".to_string());

    let default_jvm = vec![
        "-Djava.library.path=${natives_directory}".to_string(),
        "-Dminecraft.launcher.brand=${launcher_name}".to_string(),
        "-Dminecraft.launcher.version=${launcher_version}".to_string(),
        "-cp".to_string(),
        "${classpath}".to_string(),
    ];

    let version_jvm = version
        .arguments
        .as_ref()
        .map(|args| flatten_arguments(&args.jvm, &features))
        .unwrap_or_default();
    jvm_args.extend(if version_jvm.is_empty() {
        default_jvm
    } else {
        version_jvm
    });

    if let Some(client) = &log_config {
        if !log_config_path.is_empty() && is_file(Path::new(&log_config_path)) {
            jvm_args.push(client.argument.replace("${path}", &log_config_path));
        }
    }

    let mut game_args = match &version.arguments {
        Some(args) => flatten_arguments(&args.game, &features),
        None => version
            .minecraft_arguments
            .clone()
            .unwrap_or_default()
            .split(' ')
            .filter(|part| !part.is_empty())
            .map(|part| part.to_string())
            .collect(),
    };
    if game_args.is_empty() {
        game_args = Vec::new();
    }

    let resolved_jvm: Vec<String> = jvm_args
        .iter()
        .map(|arg| substitute(arg, &placeholders))
        .collect();
    let resolved_game: Vec<String> = game_args
        .iter()
        .map(|arg| substitute(arg, &placeholders))
        .collect();

    let _ = std::fs::create_dir_all(&natives_dir);
    let _ = std::fs::create_dir_all(&options.instance_dir);

    let main_class = version.main_class.clone();
    let mut command_vec: Vec<String> = vec![options.java.path.clone()];
    command_vec.extend(resolved_jvm.clone());
    command_vec.push(main_class.clone());
    command_vec.extend(resolved_game.clone());

    let mut command = Command::new(&options.java.path);
    command
        .args(&resolved_jvm)
        .arg(&main_class)
        .args(&resolved_game)
        .current_dir(&options.instance_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.as_std_mut().creation_flags(0x0800_0000);
    }

    let child = command
        .spawn()
        .map_err(|e| format!("Oyun başlatılamadı: {e}"))?;
    let pid = child.id();

    Ok(LaunchResult {
        child,
        command: command_vec,
        pid,
    })
}
