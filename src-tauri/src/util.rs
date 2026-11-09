//! Small shared helpers: HTTP client, paths, registry, PowerShell, downloads.
use once_cell::sync::Lazy;
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

pub type R<T> = Result<T, String>;

pub static HTTP: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .user_agent("Mozilla/5.0 NightfallLauncher/2.0 (desktop game library)")
        .timeout(Duration::from_secs(25))
        .build()
        .expect("http client")
});

pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// lower-case letters and digits only — used to compare game names across stores
pub fn norm(s: &str) -> String {
    s.to_lowercase().chars().filter(|c| c.is_ascii_alphanumeric()).collect()
}

pub fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}
pub fn local_appdata() -> PathBuf {
    PathBuf::from(env_or("LOCALAPPDATA", &format!("{}\\AppData\\Local", env_or("USERPROFILE", "C:\\Users\\Default"))))
}
pub fn roaming() -> PathBuf {
    PathBuf::from(env_or("APPDATA", &format!("{}\\AppData\\Roaming", env_or("USERPROFILE", "C:\\Users\\Default"))))
}
pub fn home() -> PathBuf {
    PathBuf::from(env_or("USERPROFILE", "C:\\Users\\Default"))
}
pub fn program_files() -> PathBuf {
    PathBuf::from(env_or("ProgramFiles", "C:\\Program Files"))
}
pub fn program_files_x86() -> PathBuf {
    PathBuf::from(env_or("ProgramFiles(x86)", "C:\\Program Files (x86)"))
}
pub fn program_data() -> PathBuf {
    PathBuf::from(env_or("ProgramData", "C:\\ProgramData"))
}
pub fn drives() -> Vec<PathBuf> {
    ('C'..='Z').map(|c| PathBuf::from(format!("{}:\\", c))).filter(|p| p.exists()).collect()
}
pub fn lc(s: &str) -> String {
    s.to_lowercase().trim_end_matches(['\\', '/']).to_string()
}

/// URL the webview can load a local file from (Tauri asset protocol)
pub fn asset_url(path: &str, ver: i64) -> Option<String> {
    if path.is_empty() || !Path::new(path).exists() {
        return None;
    }
    Some(format!("http://asset.localhost/{}?v={}", urlencoding::encode(path), ver))
}

pub async fn get_json(url: &str) -> R<Value> {
    let r = HTTP.get(url).send().await.map_err(|e| e.to_string())?;
    if !r.status().is_success() {
        return Err(format!("HTTP {}", r.status().as_u16()));
    }
    r.json::<Value>().await.map_err(|e| e.to_string())
}

/// download an image to `<dir>/<base>.<ext from content-type>`; replaces older copies with other extensions
pub async fn download_as(url: &str, dir: &Path, base: &str) -> Option<String> {
    let r = HTTP.get(url).send().await.ok()?;
    if !r.status().is_success() {
        return None;
    }
    let ct = r.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    if !ct.starts_with("image") {
        return None;
    }
    let bytes = r.bytes().await.ok()?;
    if bytes.len() < 1500 {
        return None;
    }
    let ext = if ct.contains("png") { "png" } else if ct.contains("webp") { "webp" } else if ct.contains("gif") { "gif" } else { "jpg" };
    std::fs::create_dir_all(dir).ok()?;
    for e in ["png", "jpg", "webp", "gif"] {
        let _ = std::fs::remove_file(dir.join(format!("{}.{}", base, e)));
    }
    let dest = dir.join(format!("{}.{}", base, ext));
    std::fs::write(&dest, &bytes).ok()?;
    Some(dest.to_string_lossy().to_string())
}

/// read a registry key and all its sub-keys: (full key path, values as strings)
pub fn reg_tree(path: &str) -> Vec<(String, HashMap<String, String>)> {
    use winreg::enums::*;
    use winreg::types::FromRegValue;
    use winreg::RegKey;
    let (hive, sub) = match path.split_once('\\') {
        Some(("HKLM", s)) => (RegKey::predef(HKEY_LOCAL_MACHINE), s),
        Some(("HKCU", s)) => (RegKey::predef(HKEY_CURRENT_USER), s),
        _ => return vec![],
    };
    let mut out = vec![];
    fn walk(k: &RegKey, name: String, depth: u32, out: &mut Vec<(String, HashMap<String, String>)>) {
        let mut vals = HashMap::new();
        for (n, v) in k.enum_values().flatten() {
            let s = match v.vtype {
                REG_SZ | REG_EXPAND_SZ => String::from_reg_value(&v).ok(),
                REG_DWORD => u32::from_reg_value(&v).ok().map(|x| format!("0x{:x}", x)),
                _ => None,
            };
            if let Some(s) = s {
                vals.insert(n, s.trim_end_matches('\0').trim().to_string());
            }
        }
        out.push((name.clone(), vals));
        if depth == 0 {
            return;
        }
        for c in k.enum_keys().flatten() {
            if let Ok(ck) = k.open_subkey(&c) {
                walk(&ck, format!("{}\\{}", name, c), depth - 1, out);
            }
        }
    }
    if let Ok(k) = hive.open_subkey(sub) {
        walk(&k, path.to_string(), 2, &mut out);
    }
    out
}
pub fn reg_value(path: &str, name: &str) -> Option<String> {
    reg_tree(path).into_iter().find_map(|(_, v)| v.get(name).cloned())
}

/// run a PowerShell snippet with no window and return stdout
pub fn powershell(script: &str) -> String {
    use std::os::windows::process::CommandExt;
    let out = std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command"])
        .arg(format!("[Console]::OutputEncoding=[Text.Encoding]::UTF8;{}", script))
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
        .output();
    match out {
        Ok(o) => String::from_utf8_lossy(&o.stdout).to_string(),
        Err(_) => String::new(),
    }
}
/// PowerShell that returns JSON (one object or an array)
pub fn powershell_json(script: &str) -> Vec<Value> {
    match serde_json::from_str::<Value>(powershell(script).trim()) {
        Ok(Value::Array(a)) => a,
        Ok(v @ Value::Object(_)) => vec![v],
        _ => vec![],
    }
}

pub fn shorten(s: &str, max: usize) -> String {
    let s = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if s.chars().count() <= max {
        return s;
    }
    let cut: String = s.chars().take(max - 1).collect();
    let cut = match cut.rfind(' ') { Some(i) if i > max / 2 => cut[..i].to_string(), _ => cut };
    format!("{}…", cut.trim_end_matches([',', '.', ';', ':']))
}
