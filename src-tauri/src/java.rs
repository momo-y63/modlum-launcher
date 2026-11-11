use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use crate::model::JavaInfo;
use crate::net::{download_file, fetch_json, is_file, DownloadTask};
use crate::paths::{app_data_dir, ensure_dir};

#[derive(Clone, Debug)]
pub struct JavaCandidate {
    pub path: PathBuf,
    pub source: String,
}

pub fn java_exe_name() -> &'static str {
    if cfg!(windows) {
        "java.exe"
    } else {
        "java"
    }
}

fn hidden(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let _ = command.stdin(Stdio::null());
}

fn list_java_in_dir(dir: &Path, source: &str) -> Vec<JavaCandidate> {
    let mut out = Vec::new();
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return out,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let exe = path.join("bin").join(java_exe_name());
        if is_file(&exe) {
            out.push(JavaCandidate {
                path: exe,
                source: source.to_string(),
            });
        }
        if let Ok(subs) = fs::read_dir(&path) {
            for sub in subs.flatten() {
                let sub_path = sub.path();
                if !sub_path.is_dir() {
                    continue;
                }
                let exe2 = sub_path.join("bin").join(java_exe_name());
                if is_file(&exe2) {
                    out.push(JavaCandidate {
                        path: exe2,
                        source: source.to_string(),
                    });
                }
            }
        }
    }
    out
}

pub fn read_java_version(exe: &Path) -> Option<(String, u64)> {
    let mut command = Command::new(exe);
    command.arg("-version");
    hidden(&mut command);
    let output = command.output().ok()?;
    let mut text = String::from_utf8_lossy(&output.stderr).to_string();
    text.push('\n');
    text.push_str(&String::from_utf8_lossy(&output.stdout));

    let start = text.find("version \"")? + "version \"".len();
    let rest = &text[start..];
    let end = rest.find('"')?;
    let version = rest[..end].to_string();
    let major = if let Some(stripped) = version.strip_prefix("1.") {
        stripped.split('.').next()?.parse::<u64>().ok()?
    } else {
        version.split('.').next()?.parse::<u64>().ok()?
    };
    Some((version, major))
}

fn find_on_path() -> Vec<JavaCandidate> {
    let mut out = Vec::new();
    if let Some(path_var) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path_var) {
            let exe = dir.join(java_exe_name());
            if is_file(&exe) {
                out.push(JavaCandidate {
                    path: exe,
                    source: "path".to_string(),
                });
            }
        }
    }
    out
}

pub fn detect_java(game_dir: &str, java_path_setting: &str) -> Vec<JavaInfo> {
    let mut candidates: Vec<JavaCandidate> = Vec::new();

    if !java_path_setting.trim().is_empty() {
        let setting = PathBuf::from(java_path_setting.trim());
        if setting
            .extension()
            .map(|ext| ext.eq_ignore_ascii_case("exe"))
            .unwrap_or(false)
            && is_file(&setting)
        {
            candidates.push(JavaCandidate {
                path: setting,
                source: "setting".to_string(),
            });
        } else {
            let exe = setting.join("bin").join(java_exe_name());
            if is_file(&exe) {
                candidates.push(JavaCandidate {
                    path: exe,
                    source: "setting".to_string(),
                });
            }
        }
    }

    if let Some(java_home) = std::env::var_os("JAVA_HOME") {
        let exe = PathBuf::from(java_home)
            .join("bin")
            .join(java_exe_name());
        if is_file(&exe) {
            candidates.push(JavaCandidate {
                path: exe,
                source: "java_home".to_string(),
            });
        }
    }

    let mut runtime_roots = vec![PathBuf::from(game_dir).join("runtime"), app_data_dir().join("runtime")];
    if let Some(appdata) = std::env::var_os("APPDATA") {
        runtime_roots.push(PathBuf::from(appdata).join(".minecraft").join("runtime"));
    }
    for base in runtime_roots {
        candidates.extend(list_java_in_dir(&base, "bundled"));
    }

    candidates.extend(find_on_path());

    for dir in [
        "C:\\Program Files\\Java",
        "C:\\Program Files\\Eclipse Adoptium",
        "C:\\Program Files\\Microsoft\\jdk",
        "C:\\Program Files\\Zulu",
        "C:\\Program Files\\BellSoft",
    ] {
        candidates.extend(list_java_in_dir(Path::new(dir), "path"));
    }

    let mut seen: Vec<String> = Vec::new();
    let mut result: Vec<JavaInfo> = Vec::new();
    for candidate in candidates {
        let key = candidate.path.to_string_lossy().to_lowercase();
        if seen.contains(&key) {
            continue;
        }
        seen.push(key);
        let Some((version, major)) = read_java_version(&candidate.path) else {
            continue;
        };
        result.push(JavaInfo {
            path: candidate.path.to_string_lossy().to_string(),
            major,
            version,
            source: candidate.source,
        });
    }

    result.sort_by(|a, b| b.major.cmp(&a.major));
    result
}

pub fn pick_java(available: &[JavaInfo], required_major: u64) -> Option<JavaInfo> {
    if available.is_empty() {
        return None;
    }
    if let Some(exact) = available.iter().find(|j| j.major == required_major) {
        return Some(exact.clone());
    }
    // Gereken sürümden küçük Java ile başlatmak oyunu gizemli hatalarla çökertir;
    // yalnızca gereken veya daha yeni bir sürüm kabul edilir.
    available
        .iter()
        .filter(|j| j.major >= required_major)
        .min_by_key(|j| j.major)
        .cloned()
}

pub fn java_download_hint(required_major: u64) -> String {
    format!(
        "Java {required_major} bulunamadı ve otomatik indirme başarısız oldu. https://adoptium.net/temurin/releases/?version={required_major} adresinden Temurin {required_major} (JRE) kurup launcher'ı yeniden başlatın veya Ayarlar'dan java.exe yolunu seçin."
    )
}

fn find_java_under(root: &Path) -> Option<PathBuf> {
    if !root.exists() {
        return None;
    }
    let mut stack = vec![root.to_path_buf()];
    let mut guard = 0;
    while let Some(current) = stack.pop() {
        guard += 1;
        if guard > 5000 {
            break;
        }
        let entries = match fs::read_dir(&current) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if let Some(name) = path.file_name() {
                if name.to_string_lossy().eq_ignore_ascii_case("java.exe")
                    || name.to_string_lossy().eq_ignore_ascii_case("java")
                {
                    return Some(path);
                }
            }
        }
    }
    None
}

fn extract_zip(zip_path: &Path, target: &Path) -> Result<(), String> {
    let file = fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|e| e.to_string())?;
        let Some(name) = entry.enclosed_name().map(|p| p.to_path_buf()) else {
            continue;
        };
        let out_path = target.join(name);
        if entry.is_dir() {
            let _ = fs::create_dir_all(&out_path);
            continue;
        }
        if let Some(parent) = out_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let mut out = fs::File::create(&out_path).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(serde::Deserialize)]
struct AdoptiumPackage {
    link: String,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    checksum: String,
}

#[derive(serde::Deserialize)]
struct AdoptiumBinary {
    package: AdoptiumPackage,
}

#[derive(serde::Deserialize)]
struct AdoptiumAsset {
    binary: AdoptiumBinary,
}

pub type JavaProgress = std::sync::Arc<dyn Fn(u64, u64, String) + Send + Sync>;

/// Gereken Java sürümünü Adoptium Temurin JRE olarak indirir ve launcher'ın
/// runtime klasörüne çıkarır. Böylece kullanıcı elle Java kurmak zorunda kalmaz.
pub async fn ensure_java_runtime(
    major_version: u64,
    on_progress: JavaProgress,
) -> Result<JavaInfo, String> {
    let runtime_root = app_data_dir().join("runtime");
    let target_dir = runtime_root.join(format!("java-{major_version}"));

    if let Some(existing) = find_java_under(&target_dir) {
        if let Some((version, major)) = read_java_version(&existing) {
            if major >= major_version {
                return Ok(JavaInfo {
                    path: existing.to_string_lossy().to_string(),
                    major,
                    version,
                    source: "bundled".to_string(),
                });
            }
        }
    }

    (on_progress)(0, 1, format!("Java {major_version} indiriliyor…"));
    let url = format!(
        "https://api.adoptium.net/v3/assets/latest/{major_version}/hotspot?os=windows&architecture=x64&image_type=jre"
    );
    let assets: Vec<AdoptiumAsset> = fetch_json(&url).await?;
    let package = assets
        .into_iter()
        .next()
        .map(|asset| asset.binary.package)
        .ok_or_else(|| format!("Java {major_version} indirme adresi bulunamadı."))?;
    if package.link.is_empty() {
        return Err(format!("Java {major_version} indirme adresi bulunamadı."));
    }

    ensure_dir(&runtime_root);
    let zip_path = runtime_root.join(format!("java-{major_version}.zip"));
    let total = package.size.max(1);
    let downloaded = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0));
    let downloaded_cb = downloaded.clone();
    let progress = on_progress.clone();

    let task = DownloadTask {
        url: package.link.clone(),
        dest: zip_path.clone(),
        sha1: None,
        sha256: if package.checksum.is_empty() {
            None
        } else {
            Some(package.checksum.clone())
        },
        size: if package.size > 0 {
            Some(package.size)
        } else {
            None
        },
    };

    let cb_handle = {
        let progress = progress.clone();
        std::sync::Arc::new(move |bytes: u64| {
            let done = downloaded_cb.fetch_add(bytes, std::sync::atomic::Ordering::SeqCst) + bytes;
            let percent = ((done as f64 / total as f64) * 100.0).round() as u64;
            progress(
                done,
                total,
                format!("Java {major_version} indiriliyor… {percent}%"),
            );
        }) as std::sync::Arc<dyn Fn(u64) + Send + Sync>
    };

    download_file(&task, Some(cb_handle)).await?;

    (progress)(package.size, total, format!("Java {major_version} çıkarılıyor…"));
    ensure_dir(&target_dir);
    extract_zip(&zip_path, &target_dir)?;
    let _ = fs::remove_file(&zip_path);

    let java_exe = find_java_under(&target_dir)
        .ok_or_else(|| "Java arşivi çıkarıldı ancak java.exe bulunamadı.".to_string())?;
    let (version, major) = read_java_version(&java_exe)
        .ok_or_else(|| format!("Java {major_version} kurulumu doğrulanamadı."))?;
    if major < major_version {
        return Err(format!("Java {major_version} kurulumu doğrulanamadı."));
    }
    Ok(JavaInfo {
        path: java_exe.to_string_lossy().to_string(),
        major,
        version,
        source: "bundled".to_string(),
    })
}
