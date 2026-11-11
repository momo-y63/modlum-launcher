use std::path::{Component, Path, PathBuf};

/// Electron'daki `app.getPath('userData')` karşılığı: %APPDATA%/modlum-launcher
pub fn app_data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("modlum-launcher")
}

/// Electron'daki `app.getPath('appData') + '/.modlum'` karşılığı
pub fn default_game_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".modlum")
}

pub fn ensure_dir(dir: &Path) -> PathBuf {
    let _ = std::fs::create_dir_all(dir);
    dir.to_path_buf()
}

pub fn resolve_path(value: &str) -> String {
    let path = Path::new(value);
    if path.is_absolute() {
        normalize(path).to_string_lossy().to_string()
    } else {
        let base = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        normalize(&base.join(path)).to_string_lossy().to_string()
    }
}

fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

pub struct LauncherPaths {
    pub root: PathBuf,
    pub versions: PathBuf,
    pub libraries: PathBuf,
    pub assets: PathBuf,
    pub assets_objects: PathBuf,
    pub assets_indexes: PathBuf,
    pub assets_virtual: PathBuf,
    pub log_configs: PathBuf,
}

impl LauncherPaths {
    pub fn new(root: &str) -> Self {
        let root_path = PathBuf::from(root);
        let assets = root_path.join("assets");
        Self {
            versions: root_path.join("versions"),
            libraries: root_path.join("libraries"),
            assets_objects: assets.join("objects"),
            assets_indexes: assets.join("indexes"),
            assets_virtual: assets.join("virtual"),
            log_configs: assets.join("log_configs"),
            assets,
            root: root_path,
        }
    }

    pub fn natives(&self, version_id: &str) -> PathBuf {
        self.root.join("versions").join(version_id).join("natives")
    }

    pub fn version_dir(&self, version_id: &str) -> PathBuf {
        self.root.join("versions").join(version_id)
    }
}

pub struct InstancePaths {
    pub root: PathBuf,
    pub mods: PathBuf,
    pub saves: PathBuf,
    pub screenshots: PathBuf,
    pub resourcepacks: PathBuf,
    pub shaderpacks: PathBuf,
    pub datapacks: PathBuf,
    pub logs: PathBuf,
}

impl InstancePaths {
    pub fn new(dir: &str) -> Self {
        let root = PathBuf::from(dir);
        Self {
            mods: root.join("mods"),
            saves: root.join("saves"),
            screenshots: root.join("screenshots"),
            resourcepacks: root.join("resourcepacks"),
            shaderpacks: root.join("shaderpacks"),
            datapacks: root.join("datapacks"),
            logs: root.join("logs"),
            root,
        }
    }
}
