//! The quiet parts that make Nightfall dependable: a local log file, daily library backups and problem reports.
//! Nothing here leaves the PC unless you choose to send it.
use once_cell::sync::OnceCell;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

static LOG: OnceCell<Mutex<PathBuf>> = OnceCell::new();
const LOG_MAX: u64 = 1_000_000;
const KEEP_BACKUPS: usize = 10;

/// logs/nightfall.log inside the data folder; the previous file is kept as nightfall.old.log
pub fn init_log(dir: &Path) {
    let d = dir.join("logs");
    let _ = std::fs::create_dir_all(&d);
    let f = d.join("nightfall.log");
    if std::fs::metadata(&f).map(|m| m.len() > LOG_MAX).unwrap_or(false) { let _ = std::fs::rename(&f, d.join("nightfall.old.log")); }
    let _ = LOG.set(Mutex::new(f));
    let prev = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| { log("panic", &info.to_string()); prev(info) }));
}
pub fn log(level: &str, msg: &str) {
    let Some(m) = LOG.get() else { return };
    let path = m.lock().unwrap();
    let line = format!("{} [{}] {}\n", chrono::Local::now().format("%Y-%m-%d %H:%M:%S"), level, scrub(msg).chars().take(2000).collect::<String>());
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&*path) { let _ = f.write_all(line.as_bytes()); }
}
pub fn log_dir() -> Option<PathBuf> { LOG.get().and_then(|m| m.lock().unwrap().parent().map(|p| p.to_path_buf())) }

/// your Windows user name never ends up in a log or a report
pub fn scrub(s: &str) -> String {
    let mut out = s.to_string();
    if let Ok(home) = std::env::var("USERPROFILE") {
        if home.len() > 3 { out = out.replace(&home, "%USERPROFILE%").replace(&home.replace('\\', "/"), "%USERPROFILE%"); }
    }
    if let Ok(u) = std::env::var("USERNAME") { if u.len() > 2 { out = out.replace(&format!("\\{u}\\"), "\\<user>\\") } }
    out
}

/* ---------------- backups ---------------- */
fn backup_dir(dir: &Path) -> PathBuf { dir.join("backups") }
/// one copy of library.json per day, the last ten kept
pub fn daily_backup(dir: &Path, file: &Path) {
    let d = backup_dir(dir);
    let _ = std::fs::create_dir_all(&d);
    let name = format!("library-{}.json", chrono::Local::now().format("%Y-%m-%d"));
    if !d.join(&name).exists() && file.exists() {
        if std::fs::copy(file, d.join(&name)).is_ok() { log("info", &format!("backup saved: {name}")) }
    }
    let mut all = list(dir);
    all.sort_by(|a, b| b.0.cmp(&a.0));
    for (n, _, _) in all.into_iter().skip(KEEP_BACKUPS) { let _ = std::fs::remove_file(d.join(n)); }
}
pub fn backup_now(dir: &Path, file: &Path) -> Option<String> {
    let d = backup_dir(dir);
    let _ = std::fs::create_dir_all(&d);
    let name = format!("library-{}.json", chrono::Local::now().format("%Y-%m-%d_%H%M%S"));
    std::fs::copy(file, d.join(&name)).ok().map(|_| name)
}
/// (file name, saved at in ms, size in bytes), newest first
pub fn list(dir: &Path) -> Vec<(String, i64, u64)> {
    let mut v: Vec<(String, i64, u64)> = std::fs::read_dir(backup_dir(dir)).into_iter().flatten().flatten()
        .filter_map(|e| {
            let n = e.file_name().to_string_lossy().to_string();
            if !(n.starts_with("library-") && n.ends_with(".json")) { return None }
            let m = e.metadata().ok()?;
            let t = m.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_millis() as i64;
            Some((n, t, m.len()))
        }).collect();
    v.sort_by(|a, b| b.1.cmp(&a.1));
    v
}
pub fn read_backup(dir: &Path, name: &str) -> Option<String> {
    if !regex::Regex::new(r"^library-[\d_-]+\.json$").unwrap().is_match(name) { return None }
    std::fs::read_to_string(backup_dir(dir).join(name)).ok()
}

/* ---------------- problem report ---------------- */
/// a plain-text report (versions, what Nightfall sees, recent log lines). No library contents, no paths with your name.
pub fn report(version: &str, games: usize, stores: &[String], extra: &str) -> String {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    let os = format!("{} {}", sysinfo::System::name().unwrap_or_default(), sysinfo::System::os_version().unwrap_or_default());
    let mut log_tail = String::new();
    if let Some(d) = log_dir() {
        let text = std::fs::read_to_string(d.join("nightfall.log")).unwrap_or_default();
        let lines: Vec<&str> = text.lines().collect();
        log_tail = lines[lines.len().saturating_sub(300)..].join("\n");
    }
    scrub(&format!(
        "Nightfall problem report\n========================\nCreated: {}\nNightfall: {version}\nWindows: {os}\nMemory: {} GB\nGames in library: {games}\nStores found: {}\n\nWhat happened\n-------------\n{}\n\nRecent log\n----------\n{}\n",
        chrono::Local::now().format("%Y-%m-%d %H:%M"), sys.total_memory() / 1_073_741_824, if stores.is_empty() { "none".into() } else { stores.join(", ") },
        if extra.trim().is_empty() { "(not described)" } else { extra.trim() }, if log_tail.is_empty() { "(empty)".into() } else { log_tail }
    ))
}

#[cfg(test)]
mod tests {
    #[test]
    fn reports_never_contain_the_user_folder() {
        let home = std::env::var("USERPROFILE").unwrap_or_default();
        if home.len() > 3 {
            let s = super::scrub(&format!("failed to open {home}{}", r"\AppData\x.json"));
            assert!(!s.contains(&home));
            assert!(s.contains("%USERPROFILE%"));
        }
    }
}
