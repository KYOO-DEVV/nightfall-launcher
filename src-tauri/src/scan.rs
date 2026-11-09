//! Finds installed games across the PC, the way GeForce Experience's scan does:
//! launcher records first (exact), then Windows registrations, shortcuts and game-engine folders (heuristic).
use crate::store::Launch;
use crate::util::*;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub source: String,
    pub name: String,
    pub dir: Option<String>,
    pub exe: String,
    pub procs: Vec<String>,
    pub appid: Option<i64>,
    pub launch: Option<Launch>,
    pub store_icon: bool,
}

fn rx(s: &str) -> Regex {
    Regex::new(s).unwrap()
}
fn file_stem_lc(p: &Path) -> String {
    p.file_stem().map(|s| s.to_string_lossy().to_lowercase()).unwrap_or_default()
}
fn file_name_lc(p: &Path) -> String {
    p.file_name().map(|s| s.to_string_lossy().to_lowercase()).unwrap_or_default()
}
fn uri(u: String) -> Option<Launch> {
    Some(Launch { uri: Some(u), ..Default::default() })
}

/* ---------- is this folder a game? (engine fingerprints) ---------- */
static STRONG_FILE: Lazy<Regex> = Lazy::new(|| rx(r"(?i)^(unityplayer\.dll|gameassembly\.dll|steam_api(64)?\.dll|eossdk-win(32|64)-shipping\.dll|bink2?w(32|64)\.dll|fmod(studio|_event)?(64)?\.dll|physx(3)?_?(x)?64\.dll|physx3common_x64\.dll|galaxy(64)?\.dll|.+\.pck|.+\.rgss3a|.+\.rpa|package\.nw|data\.win)$"));
static WEAK_FILE: Lazy<Regex> = Lazy::new(|| rx(r"(?i)^(xinput1_3\.dll|openal32\.dll|sdl2\.dll|d3dx9_43\.dll|nw\.exe|.+\.pak|game\.ini)$"));
static STRONG_DIR: Lazy<Regex> = Lazy::new(|| rx(r"(?i)^(.+_data|renpy|paks)$"));
static WEAK_DIR: Lazy<Regex> = Lazy::new(|| rx(r"(?i)^(engine|www|gamedata|maps|baseq3)$"));
static APP_FILE: Lazy<Regex> = Lazy::new(|| rx(r"(?i)^(resources\.pak|chrome_100_percent\.pak|libcef\.dll|icudtl\.dat|v8_context_snapshot\.bin|qt[56]core\.dll|qt[56]widgets\.dll|ffmpeg\.dll)$"));

pub fn is_game_dir(dir: &Path) -> bool {
    let Ok(rd) = fs::read_dir(dir) else { return false };
    let (mut strong, mut weak, mut app, mut unity) = (0, 0, false, false);
    for e in rd.flatten() {
        let n = e.file_name().to_string_lossy().to_string();
        let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if is_dir {
            if STRONG_DIR.is_match(&n) { strong += 1 } else if WEAK_DIR.is_match(&n) { weak += 1 }
        } else {
            let l = n.to_lowercase();
            if l == "unityplayer.dll" || l == "gameassembly.dll" { unity = true }
            if APP_FILE.is_match(&n) { app = true } else if STRONG_FILE.is_match(&n) { strong += 1 } else if WEAK_FILE.is_match(&n) { weak += 1 }
        }
    }
    if app && !unity {
        return false;
    }
    strong >= 1 && strong + weak >= 2
}

/* ---------- picking the game's .exe inside an install folder ---------- */
static BAD_EXE: Lazy<Regex> = Lazy::new(|| rx(r"(?i)(crash|unins|redist|setup|install|updat|report|helper|anti.?cheat|easyanti|^eac|battleye|^be_?service|start_protected|dxsetup|vc_?redist|dotnet|^cef|webhelper|overlay|prereq|dump|bugsplat|patcher|service|server|benchmark|sdk|python|java|^node|7za?$|crs-|elevate|notification|uploader|downloader|repair|cleanup|touchup|activation|register|unitycrashhandler|shadercache|cmd$|console|^nw$|notifu|dxwebsetup|oalinst|physxupdate)"));
static SKIP_WALK: Lazy<Regex> = Lazy::new(|| rx(r"(?i)^(_commonredist|redist|redistributables|directx|vcredist|support|__installer|installers?|tools|crashreport|crashpad|logs|saved|mods|.+_data|shadercache|cache)$"));

struct Exe { p: PathBuf, size: u64, depth: u32 }
fn walk_exes(dir: &Path) -> Vec<Exe> {
    let mut out = vec![];
    let mut seen = 0u32;
    fn walk(d: &Path, depth: u32, seen: &mut u32, out: &mut Vec<Exe>) {
        if depth > 4 || *seen > 4000 { return; }
        let Ok(rd) = fs::read_dir(d) else { return };
        for e in rd.flatten() {
            *seen += 1;
            if *seen > 4000 { return; }
            let p = e.path();
            let n = e.file_name().to_string_lossy().to_string();
            if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                if !SKIP_WALK.is_match(&n) { walk(&p, depth + 1, seen, out); }
            } else if n.to_lowercase().ends_with(".exe") && !BAD_EXE.is_match(&file_stem_lc(&p)) {
                let size = e.metadata().map(|m| m.len()).unwrap_or(0);
                out.push(Exe { p, size, depth });
            }
        }
    }
    walk(dir, 0, &mut seen, &mut out);
    out
}
pub fn pick_exes(dir: &Path, name: &str, prefer: &[&str]) -> (Option<String>, Vec<String>) {
    let mut list = walk_exes(dir);
    if list.is_empty() { return (None, vec![]); }
    let n = norm(name);
    let score = |x: &Exe| -> f64 {
        let stem = norm(&file_stem_lc(&x.p));
        let mut s = ((x.size + 1) as f64).log10() - x.depth as f64 * 0.6;
        if prefer.iter().any(|p| norm(p) == stem) { s += 20.0 }
        if stem.len() >= 3 && (n.contains(&stem) || stem.contains(&n)) { s += 6.0 }
        if stem.contains("shipping") { s += 3.0 }
        if x.p.to_string_lossy().to_lowercase().contains("binaries\\win64") { s += 1.0 }
        if stem.contains("launcher") { s -= 2.0 }
        s
    };
    list.sort_by(|a, b| score(b).partial_cmp(&score(a)).unwrap_or(std::cmp::Ordering::Equal));
    let mut procs: Vec<String> = vec![];
    for x in list.iter().take(10) {
        let f = file_name_lc(&x.p);
        if !procs.contains(&f) { procs.push(f) }
    }
    (Some(list[0].p.to_string_lossy().to_string()), procs)
}

/* ================= exact sources ================= */
static STEAM_SKIP: Lazy<Regex> = Lazy::new(|| rx(r"(?i)redistributable|^proton|steam linux runtime|steamvr|soundtrack|dedicated server|\bsdk\b|steamworks|benchmark|playtest$|wallpaper engine"));
pub fn steam_root() -> PathBuf {
    reg_value("HKCU\\Software\\Valve\\Steam", "SteamPath").map(|s| PathBuf::from(s.replace('/', "\\"))).unwrap_or_else(|| program_files_x86().join("Steam"))
}
pub fn steam_libs() -> Vec<PathBuf> {
    let root = steam_root();
    let mut libs = vec![root.clone()];
    if let Ok(v) = fs::read_to_string(root.join("steamapps").join("libraryfolders.vdf")) {
        for c in rx(r#""path"\s+"([^"]+)""#).captures_iter(&v) {
            let p = PathBuf::from(c[1].replace("\\\\", "\\"));
            if !libs.iter().any(|l| lc(&l.to_string_lossy()) == lc(&p.to_string_lossy())) { libs.push(p) }
        }
    }
    for d in drives() {
        for n in ["SteamLibrary", "Steam", "Games\\SteamLibrary", "Games\\Steam"] {
            let p = d.join(n);
            if p.join("steamapps").exists() && !libs.iter().any(|l| lc(&l.to_string_lossy()) == lc(&p.to_string_lossy())) { libs.push(p) }
        }
    }
    libs
}
fn acf_field(t: &str, k: &str) -> Option<String> {
    Regex::new(&format!(r#"(?i)"{}"\s+"([^"]+)""#, k)).ok()?.captures(t).map(|c| c[1].to_string())
}
fn steam() -> Vec<Item> {
    let mut items = vec![];
    for lib in steam_libs() {
        let sa = lib.join("steamapps");
        let Ok(rd) = fs::read_dir(&sa) else { continue };
        for e in rd.flatten() {
            let f = e.file_name().to_string_lossy().to_string();
            if !f.starts_with("appmanifest_") || !f.ends_with(".acf") { continue }
            let t = fs::read_to_string(e.path()).unwrap_or_default();
            let (Some(appid), Some(name), Some(inst)) = (acf_field(&t, "appid").and_then(|x| x.parse::<i64>().ok()), acf_field(&t, "name"), acf_field(&t, "installdir")) else { continue };
            if STEAM_SKIP.is_match(&name) { continue }
            let dir = sa.join("common").join(&inst);
            if !dir.exists() { continue }
            let (Some(main), procs) = pick_exes(&dir, &name, &[]) else { continue };
            items.push(Item { source: "steam".into(), name, dir: Some(dir.to_string_lossy().into()), exe: main, procs, appid: Some(appid), launch: uri(format!("steam://rungameid/{}", appid)), ..Default::default() });
        }
    }
    items
}

fn epic() -> Vec<Item> {
    let dir = program_data().join("Epic").join("EpicGamesLauncher").join("Data").join("Manifests");
    let mut items = vec![];
    let Ok(rd) = fs::read_dir(&dir) else { return items };
    for e in rd.flatten() {
        if !file_name_lc(&e.path()).ends_with(".item") { continue }
        let Ok(j) = serde_json::from_str::<serde_json::Value>(&fs::read_to_string(e.path()).unwrap_or_default()) else { continue };
        if j["bIsIncompleteInstall"].as_bool() == Some(true) { continue }
        let loc = j["InstallLocation"].as_str().unwrap_or("");
        if loc.is_empty() || !Path::new(loc).exists() { continue }
        if let Some(cats) = j["AppCategories"].as_array() {
            if !cats.iter().any(|c| c.as_str() == Some("games")) { continue }
        }
        let name = j["DisplayName"].as_str().unwrap_or("").to_string();
        let exe = j["LaunchExecutable"].as_str().filter(|s| !s.is_empty()).map(|s| Path::new(loc).join(s));
        let prefer_stem = exe.as_ref().map(|p| file_stem_lc(p)).unwrap_or_default();
        let (pick, mut procs) = pick_exes(Path::new(loc), &name, &[prefer_stem.as_str()]);
        let main = match &exe { Some(p) if p.exists() => p.to_string_lossy().to_string(), _ => match pick { Some(m) => m, None => continue } };
        let f = file_name_lc(Path::new(&main));
        if !procs.contains(&f) { procs.insert(0, f) }
        let l = format!("com.epicgames.launcher://apps/{}%3A{}%3A{}?action=launch&silent=true", j["CatalogNamespace"].as_str().unwrap_or(""), j["CatalogItemId"].as_str().unwrap_or(""), j["AppName"].as_str().unwrap_or(""));
        items.push(Item { source: "epic".into(), name, dir: Some(loc.into()), exe: main, procs, launch: uri(l), ..Default::default() });
    }
    items
}

fn gog() -> Vec<Item> {
    let mut items = vec![];
    for (_, v) in reg_tree("HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games") {
        let (Some(name), Some(exe)) = (v.get("gameName"), v.get("exe")) else { continue };
        if !Path::new(exe).exists() { continue }
        let dir = v.get("path").cloned().unwrap_or_else(|| Path::new(exe).parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default());
        let (_, mut procs) = pick_exes(Path::new(&dir), name, &[]);
        let f = file_name_lc(Path::new(exe));
        if !procs.contains(&f) { procs.insert(0, f) }
        items.push(Item { source: "gog".into(), name: name.clone(), dir: Some(dir), exe: exe.clone(), procs, ..Default::default() });
    }
    items
}

fn ubisoft() -> Vec<Item> {
    let mut items = vec![];
    let idre = rx(r"(?i)\\Installs\\(\d+)$");
    for (k, v) in reg_tree("HKLM\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs") {
        let Some(id) = idre.captures(&k).map(|c| c[1].to_string()) else { continue };
        let Some(dir) = v.get("InstallDir").map(|d| d.replace('/', "\\")) else { continue };
        if !Path::new(&dir).exists() { continue }
        let name = Path::new(dir.trim_end_matches('\\')).file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        let (Some(main), procs) = pick_exes(Path::new(&dir), &name, &[]) else { continue };
        items.push(Item { source: "ubisoft".into(), name, dir: Some(dir), exe: main, procs, launch: uri(format!("uplay://launch/{}/0", id)), ..Default::default() });
    }
    items
}

fn publisher_keys(source: &str, keys: &[&str], field: &str, skip: &Regex) -> Vec<Item> {
    let mut items = vec![];
    for key in keys {
        for (k, v) in reg_tree(key) {
            let Some(dir) = v.get(field).map(|d| d.replace('"', "")) else { continue };
            if dir.is_empty() || !Path::new(&dir).exists() { continue }
            let name = k.rsplit('\\').next().unwrap_or("").to_string();
            if skip.is_match(&name) { continue }
            let (Some(main), procs) = pick_exes(Path::new(&dir), &name, &[]) else { continue };
            items.push(Item { source: source.into(), name, dir: Some(dir), exe: main, procs, ..Default::default() });
        }
    }
    items
}
fn ea() -> Vec<Item> {
    publisher_keys("ea", &["HKLM\\SOFTWARE\\WOW6432Node\\EA Games", "HKLM\\SOFTWARE\\WOW6432Node\\Electronic Arts", "HKLM\\SOFTWARE\\EA Games"], "Install Dir", &rx(r"(?i)^(ea|ea app|ea desktop|origin|ea core|ea games|electronic arts|ea installer)$"))
}
fn rockstar() -> Vec<Item> {
    publisher_keys("rockstar", &["HKLM\\SOFTWARE\\WOW6432Node\\Rockstar Games"], "InstallFolder", &rx(r"(?i)launcher|social club|rockstar games$"))
}

fn riot() -> Vec<Item> {
    let base = program_data().join("Riot Games");
    let rcs = fs::read_to_string(base.join("RiotClientInstalls.json")).ok()
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
        .and_then(|j| j["rc_default"].as_str().or(j["rc_live"].as_str()).map(|s| s.to_string()));
    let names = [("league_of_legends", "League of Legends", vec!["LeagueClient", "League of Legends"]), ("valorant", "VALORANT", vec!["VALORANT-Win64-Shipping", "VALORANT"]), ("bacon", "Legends of Runeterra", vec!["LoR"]), ("lion", "2XKO", vec![]), ("teamfighttactics", "Teamfight Tactics", vec![])];
    let mut items = vec![];
    let Ok(rd) = fs::read_dir(base.join("Metadata")) else { return items };
    let path_re = rx(r#"product_install_full_path:\s*"?([^"\r\n]+)"?"#);
    for e in rd.flatten() {
        let d = e.file_name().to_string_lossy().to_string();
        let Some(prod) = d.strip_suffix(".live").map(|s| s.to_lowercase()) else { continue };
        let mut dir = None;
        if let Ok(files) = fs::read_dir(e.path()) {
            for f in files.flatten() {
                if f.file_name().to_string_lossy().ends_with(".product_settings.yaml") {
                    dir = path_re.captures(&fs::read_to_string(f.path()).unwrap_or_default()).map(|c| c[1].trim().to_string());
                }
            }
        }
        let Some(dir) = dir.filter(|d| Path::new(d).exists()) else { continue };
        let (name, prefer) = names.iter().find(|n| n.0 == prod).map(|n| (n.1.to_string(), n.2.clone())).unwrap_or((prod.replace('_', " "), vec![]));
        let (Some(main), procs) = pick_exes(Path::new(&dir), &name, &prefer) else { continue };
        let launch = rcs.as_ref().filter(|r| Path::new(r).exists()).map(|r| Launch { cmd: Some(r.clone()), args: vec![format!("--launch-product={}", prod), "--launch-patchline=live".into()], ..Default::default() });
        items.push(Item { source: "riot".into(), name, dir: Some(dir.replace('/', "\\")), exe: main, procs, launch, ..Default::default() });
    }
    items
}

fn hoyo() -> Vec<Item> {
    let known = [("starrail", "Honkai: Star Rail"), ("genshinimpact", "Genshin Impact"), ("yuanshen", "Genshin Impact"), ("zenlesszonezero", "Zenless Zone Zero"), ("bh3", "Honkai Impact 3rd")];
    let prefer: Vec<&str> = known.iter().map(|k| k.0).collect();
    let mut roots: Vec<PathBuf> = vec![program_files().join("HoYoPlay").join("games")];
    for d in drives() {
        for n in ["HoYoPlay\\games", "Program Files\\HoYoPlay\\games", "Games\\HoYoPlay\\games"] {
            let p = d.join(n);
            if !roots.iter().any(|r| lc(&r.to_string_lossy()) == lc(&p.to_string_lossy())) { roots.push(p) }
        }
    }
    let mut items = vec![];
    for root in roots {
        let Ok(rd) = fs::read_dir(&root) else { continue };
        for e in rd.flatten() {
            let d = e.file_name().to_string_lossy().to_string();
            let (Some(main), procs) = pick_exes(&e.path(), &d, &prefer) else { continue };
            let stem = norm(&file_stem_lc(Path::new(&main)));
            let name = known.iter().find(|k| k.0 == stem).map(|k| k.1.to_string()).unwrap_or_else(|| rx(r"(?i)\s*games?$").replace(&d, "").to_string());
            items.push(Item { source: "hoyo".into(), name, dir: Some(e.path().to_string_lossy().into()), exe: main, procs, ..Default::default() });
        }
    }
    items
}

fn minecraft() -> Vec<Item> {
    let launchers = [
        program_files_x86().join("Minecraft Launcher").join("MinecraftLauncher.exe"),
        local_appdata().join("Modrinth App").join("Modrinth App.exe"),
        local_appdata().join("Programs").join("PrismLauncher").join("prismlauncher.exe"),
        local_appdata().join("Programs").join("CurseForge Windows").join("CurseForge.exe"),
        local_appdata().join("Programs").join("launcher").join("Lunar Client.exe"),
        local_appdata().join("labymodlauncher").join("LabyModLauncher.exe"),
        local_appdata().join("Programs").join("Feather Launcher").join("Feather Launcher.exe"),
        roaming().join(".minecraft").join("TLauncher.exe"),
    ];
    let Some(exe) = launchers.iter().find(|p| p.exists()) else { return vec![] };
    vec![Item { source: "minecraft".into(), name: "Minecraft".into(), dir: Some(roaming().join(".minecraft").to_string_lossy().into()), exe: exe.to_string_lossy().into(),
        procs: vec!["javaw.exe".into(), "minecraft.windows.exe".into()], store_icon: true, ..Default::default() }]
}

fn xbox() -> Vec<Item> {
    let rows = powershell_json("Get-AppxPackage | Where-Object { $_.SignatureKind -eq 'Store' -and $_.InstallLocation -and ((Test-Path (Join-Path $_.InstallLocation 'MicrosoftGame.config')) -or $_.Name -eq 'Microsoft.MinecraftUWP') } | ForEach-Object { $c = Join-Path $_.InstallLocation 'MicrosoftGame.config'; [pscustomobject]@{ n=$_.Name; pfn=$_.PackageFamilyName; loc=$_.InstallLocation; cfg=$(if (Test-Path $c) { Get-Content -Raw $c } else { '' }) } } | ConvertTo-Json -Depth 3");
    let explorer = PathBuf::from(env_or("SystemRoot", "C:\\Windows")).join("explorer.exe").to_string_lossy().to_string();
    let (dn, en, id_re) = (rx(r#"(?i)DefaultDisplayName="([^"]+)""#), rx(r#"(?i)<Executable\s+Name="([^"]+)""#), rx(r#"(?i)<Executable[^>]*\sId="([^"]+)""#));
    let mut items = vec![];
    for r in rows {
        let (n, pfn, loc, cfg) = (r["n"].as_str().unwrap_or(""), r["pfn"].as_str().unwrap_or(""), r["loc"].as_str().unwrap_or(""), r["cfg"].as_str().unwrap_or(""));
        let mut name = dn.captures(cfg).map(|c| c[1].to_string()).unwrap_or_default();
        if n == "Microsoft.MinecraftUWP" { name = "Minecraft for Windows".into() }
        if name.is_empty() || name.starts_with("ms-resource:") { name = n.split_once('.').map(|x| x.1).unwrap_or(n).to_string() }
        let exe_name = en.captures(cfg).map(|c| c[1].to_string()).unwrap_or_else(|| "Minecraft.Windows.exe".into());
        let app_id = id_re.captures(cfg).map(|c| c[1].to_string()).unwrap_or_else(|| "App".into());
        let exe = Path::new(loc).join(&exe_name);
        items.push(Item { source: "xbox".into(), name, dir: Some(loc.into()), procs: vec![file_name_lc(&exe)], exe: exe.to_string_lossy().into(),
            launch: Some(Launch { cmd: Some(explorer.clone()), args: vec![format!("shell:AppsFolder\\{}!{}", pfn, app_id)], ..Default::default() }), ..Default::default() });
    }
    items
}

/* ================= heuristic sources ================= */
static NOT_GAME: Lazy<Regex> = Lazy::new(|| rx(r"(?i)launcher$|^launcher|client|\bsdk\b|vanguard|service|redist|runtime|anti.?cheat|studio|ivcam|driver|overlay|online services|intellisense|update|helper|hoyoplay|battle\.net|desktop app|^ea app|^ea$|origin|social club|uninstall|tools?$|editor|server|voicemod|discord|spotify|medal|obs|nvidia|geforce|blender|unity hub|unreal engine|epic games|steam$|^steam |google play|bluestacks|crash|benchmark|installer|setup|documentation|manual|readme|website|support"));
static GAME_PUBS: Lazy<Regex> = Lazy::new(|| rx(r"(?i)blizzard|rockstar|electronic arts|\bea\b|mojang|roblox|bethesda|bandai|square enix|capcom|\bsega\b|krafton|nexon|garena|wargaming|kuro games|hoyoverse|mihoyo|cognosphere|ubisoft|riot|2k games|activision|cd projekt|smilegate|ncsoft|pearl abyss|gaijin|innersloth|re-logic|mediatonic|epic games|valve|paradox|focus|devolver|team17|konami|nintendo|level-5|netease|tencent|perfect world|gearbox|bungie|digital extremes|grinding gear|jagex|amazon games|kakao|xbox game studios|microsoft studios"));

fn registry() -> Vec<Item> {
    let mut items = vec![];
    let icon_idx = rx(r",-?\d+$");
    for h in ["HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall", "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall"] {
        for (_, v) in reg_tree(h) {
            let Some(dn) = v.get("DisplayName") else { continue };
            if v.get("SystemComponent").map(|s| s == "0x1").unwrap_or(false) || NOT_GAME.is_match(dn) { continue }
            let name = rx(r"(?i)\s+for\s+\S+$").replace(dn, "").trim().to_string();
            let mut exe = v.get("DisplayIcon").map(|s| icon_idx.replace(&s.replace('"', ""), "").to_string()).filter(|s| {
                let l = s.to_lowercase();
                l.ends_with(".exe") && !rx(r"unins|setup|install").is_match(&file_name_lc(Path::new(&l))) && Path::new(s).exists()
            });
            let dir = v.get("InstallLocation").filter(|d| !d.is_empty() && Path::new(d.as_str()).exists()).cloned()
                .or_else(|| exe.as_ref().and_then(|e| Path::new(e).parent().map(|p| p.to_string_lossy().to_string())));
            let Some(dir) = dir else { continue };
            if !GAME_PUBS.is_match(v.get("Publisher").map(|s| s.as_str()).unwrap_or("")) && !is_game_dir(Path::new(&dir)) { continue }
            let mut procs: Vec<String> = vec![];
            if exe.is_none() || exe.as_ref().map(|e| file_name_lc(Path::new(e)).contains("launcher")).unwrap_or(false) {
                let (m, p) = pick_exes(Path::new(&dir), &name, &[]);
                if exe.is_none() { exe = m }
                procs = p;
            }
            let Some(exe) = exe else { continue };
            let roblox = rx(r"(?i)^roblox( player)?$").is_match(&name);
            if roblox { procs = vec!["robloxplayerbeta.exe".into()] }
            let f = file_name_lc(Path::new(&exe));
            if !procs.contains(&f) { procs.insert(0, f) }
            procs.truncate(10);
            items.push(Item { source: "other".into(), name: if roblox { "Roblox".into() } else { name }, dir: Some(dir), exe, procs,
                // Roblox moves its exe on every update, so open the Roblox home page instead
                launch: if roblox { uri("https://www.roblox.com/home".into()) } else { None }, ..Default::default() });
        }
    }
    items
}

fn shortcuts() -> Vec<Item> {
    let rows = powershell_json("$sh=New-Object -ComObject WScript.Shell; $d=@([Environment]::GetFolderPath('Programs'),[Environment]::GetFolderPath('CommonPrograms'),[Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('CommonDesktopDirectory')); $d | Where-Object { $_ -and (Test-Path $_) } | ForEach-Object { Get-ChildItem $_ -Recurse -Include *.lnk -ErrorAction SilentlyContinue } | ForEach-Object { [pscustomobject]@{ n=$_.BaseName; t=$sh.CreateShortcut($_.FullName).TargetPath } } | ConvertTo-Json");
    let mut items = vec![];
    for r in rows {
        let (n, t) = (r["n"].as_str().unwrap_or(""), r["t"].as_str().unwrap_or(""));
        if n.is_empty() || NOT_GAME.is_match(n) || !t.to_lowercase().ends_with(".exe") || !Path::new(t).exists() { continue }
        let tl = t.to_lowercase();
        if tl.contains("\\windows\\") || tl.contains("\\windowsapps\\") { continue }
        let Some(dir) = Path::new(t).parent() else { continue };
        if !is_game_dir(dir) && !dir.parent().map(is_game_dir).unwrap_or(false) { continue }
        let (_, mut procs) = pick_exes(dir, n, &[]);
        let f = file_name_lc(Path::new(t));
        if !procs.contains(&f) { procs.insert(0, f) }
        procs.truncate(10);
        items.push(Item { source: "other".into(), name: n.into(), dir: Some(dir.to_string_lossy().into()), exe: t.into(), procs, ..Default::default() });
    }
    items
}

static SKIP_DIR: Lazy<Regex> = Lazy::new(|| rx(r"(?i)^(microsoft|windows|common files|internet explorer|nvidia|amd|intel|realtek|steam|epic games|hoyoplay|riot games|ubisoft|gog galaxy|ea|electronic arts|origin|rockstar games|battle\.net|google|mozilla|git|nodejs|python|java|jdk|obs-studio|blender foundation|dotnet|reference assemblies|msbuild|windowsapps|modifiablewindowsapps|package cache|uninstall information|installshield|application verifier|windows kits|cisco|malwarebytes|voicemod|softdeluxe|e2esoft|crystaldiskinfo|laragon|exm|saturne music|unity|unreal|godot|.+\.tmp)$"));
fn folders() -> Vec<Item> {
    let mut roots = vec![program_files(), program_files_x86(), local_appdata().join("Programs")];
    for d in drives() {
        for n in ["Games", "Jeux", "Juegos", "Spiele", "Giochi", "Program Files\\Games"] { roots.push(d.join(n)) }
    }
    let mut items = vec![];
    for root in roots {
        let Ok(rd) = fs::read_dir(&root) else { continue };
        for e in rd.flatten() {
            if !e.file_type().map(|t| t.is_dir()).unwrap_or(false) { continue }
            let n = e.file_name().to_string_lossy().to_string();
            if SKIP_DIR.is_match(&n) || NOT_GAME.is_match(&n) { continue }
            let dir = e.path();
            let mut found = is_game_dir(&dir);
            if !found {
                if let Ok(sub) = fs::read_dir(&dir) {
                    found = sub.flatten().any(|s| s.file_type().map(|t| t.is_dir()).unwrap_or(false) && is_game_dir(&s.path()));
                }
            }
            if !found { continue }
            let (Some(main), procs) = pick_exes(&dir, &n, &[]) else { continue };
            items.push(Item { source: "other".into(), name: rx(r"[_.]+").replace_all(&n, " ").trim().to_string(), dir: Some(dir.to_string_lossy().into()), exe: main, procs, ..Default::default() });
        }
    }
    items
}

/// every source, exact ones first so they win de-duplication
pub fn scan_all() -> Vec<Item> {
    let sources: Vec<fn() -> Vec<Item>> = vec![steam, epic, gog, ubisoft, riot, hoyo, ea, rockstar, xbox, minecraft, registry, shortcuts, folders];
    let results: Vec<Vec<Item>> = std::thread::scope(|s| {
        let hs: Vec<_> = sources.into_iter().map(|f| s.spawn(move || f())).collect();
        hs.into_iter().map(|h| h.join().unwrap_or_default()).collect()
    });
    let mut seen: HashSet<String> = HashSet::new();
    let mut dirs: Vec<String> = vec![];
    let mut out = vec![];
    for it in results.into_iter().flatten() {
        if it.exe.is_empty() { continue }
        let dir = it.dir.as_ref().map(|d| lc(d));
        let mut keys = vec![norm(&it.name), it.exe.to_lowercase()];
        if let Some(d) = &dir { keys.push(d.clone()) }
        if let Some(a) = it.appid { keys.push(format!("steam{}", a)) }
        if keys.iter().any(|k| seen.contains(k)) { continue }
        // a heuristic hit inside a folder an exact source already claimed is the same game
        if let Some(d) = &dir {
            if dirs.iter().any(|k| d.starts_with(&format!("{}\\", k)) || k.starts_with(&format!("{}\\", d))) { continue }
            dirs.push(d.clone());
        }
        for k in keys { seen.insert(k); }
        out.push(it);
    }
    out
}
