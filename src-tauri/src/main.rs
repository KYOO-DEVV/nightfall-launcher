#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
//! Nightfall Launcher — Rust backend (Tauri). The interface lives in ../ui and talks to these commands.
mod art;
mod details;
mod extra;
mod libraries;
mod matches;
mod play;
mod presence;
mod pro;
mod scan;
mod social;
mod store;
mod util;

use rand::Rng;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use store::*;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_updater::UpdaterExt;
use util::*;

const TICK_MS: u64 = 5000;
const REPO_URL: &str = "https://github.com/KYOO-DEVV/nightfall-launcher";
const LOGO_URL: &str = "https://raw.githubusercontent.com/KYOO-DEVV/nightfall-launcher/main/src-tauri/icons/128x128@2x.png";
/// Nightfall's own Discord application (its name is what Discord shows above the activity); a pasted ID overrides it
const DEFAULT_DISCORD_ID: &str = "";
const MIN_SESSION_MS: i64 = 30_000; // ignore blips shorter than this (crash-on-start, launcher hand-offs)
const GAP_MS: i64 = 60_000; // a longer gap between ticks (sleep / hibernate) splits the session

pub struct Core {
    app: AppHandle,
    db: Mutex<Db>,
    dirty: AtomicBool,
    file: PathBuf,
    art: PathBuf,
    update: Mutex<Value>,
    pending: Mutex<Option<tauri_plugin_updater::Update>>,
    presence: presence::Presence,
    owned: Mutex<Option<(i64, Vec<libraries::Account>, Vec<libraries::Owned>)>>,
    last_scan: Mutex<Vec<scan::Item>>,
    test_until: Mutex<i64>,
    friends: Mutex<Option<(i64, Value)>>,
    sem: tokio::sync::Semaphore,
    auto_at: Mutex<i64>,
    profile_dir: PathBuf,
    dir: PathBuf,
    owned_busy: AtomicBool,
}
type C<'a> = State<'a, Arc<Core>>;

fn new_id(n: usize) -> String {
    let mut r = rand::thread_rng();
    (0..n).map(|_| format!("{:02x}", r.gen::<u8>())).collect()
}

/* ---------------- storage ---------------- */
impl Core {
    fn mark(&self) { self.dirty.store(true, Ordering::Relaxed) }
    fn flush(&self) {
        let text = { serde_json::to_string(&*self.db.lock().unwrap()).unwrap_or_default() };
        if text.is_empty() { return }
        let tmp = self.file.with_extension("json.tmp");
        if std::fs::write(&tmp, text).is_ok() { let _ = std::fs::rename(&tmp, &self.file); }
        self.dirty.store(false, Ordering::Relaxed);
    }
    fn notify(&self) { let _ = self.app.emit("lib:changed", self.snapshot()); }
    fn snapshot(&self) -> Value {
        let db = self.db.lock().unwrap();
        json!({
            "games": db.games.iter().map(public_game).collect::<Vec<_>>(),
            "settings": db.settings, "collections": db.collections, "now": now_ms(),
            "version": self.app.package_info().version.to_string(),
            "update": *self.update.lock().unwrap(),
            "presence": self.presence.status(),
            "profile": public_profile(&db.profile),
            "portable": false,
            "debug": cfg!(debug_assertions),
        })
    }
}
/// profile with picture URLs; falls back to your Steam name and avatar
fn public_profile(p: &Profile) -> Value {
    let steam = libraries::steam_account();
    let steam_avatar = steam.as_ref().map(|a| scan::steam_root().join("config").join("avatarcache").join(format!("{}.png", a.id64)))
        .filter(|f| f.exists()).map(|f| f.to_string_lossy().to_string());
    let url = |x: &Option<String>| x.as_deref().and_then(|f| asset_url(f, p.ver));
    json!({
        "name": if p.name.trim().is_empty() { steam.as_ref().map(|a| a.persona.clone()).unwrap_or_else(|| "Player".into()) } else { p.name.clone() },
        "bio": p.bio, "showcase": p.showcase, "showcaseOwned": p.showcase_owned, "pronouns": p.pronouns,
        "avatar": url(&p.avatar).or_else(|| steam_avatar.as_deref().and_then(|f| asset_url(f, 0))),
        "banner": url(&p.banner), "customAvatar": p.avatar.is_some(), "customBanner": p.banner.is_some(),
    })
}
fn public_game(g: &Game) -> Value {
    let a = |p: &Option<String>| p.as_deref().and_then(|p| asset_url(p, g.art_ver));
    json!({
        "id": g.id, "name": g.name, "exe": g.exe, "proc": g.proc_, "addedAt": g.added_at, "appid": g.appid,
        "desc": g.desc.clone().unwrap_or_default(), "sessions": g.sessions, "open": g.open, "status": if g.status.is_empty() { "ready" } else { &g.status },
        "source": g.source.clone().unwrap_or_else(|| "manual".into()), "logoMono": g.logo_mono, "tint": g.tint, "fav": g.fav,
        "detail": details::kind_of(g), "steamMin": g.steam_min, "live": g.live, "pinned": g.pinned, "pinOrder": g.pin_order, "hidden": g.hidden,
        "launchArgs": g.launch_args, "runAsAdmin": g.run_as_admin, "hideOnLaunch": g.hide_on_launch, "limitMin": g.limit_min,
        "art": { "cover": a(&g.art.cover), "hero": a(&g.art.hero), "logo": a(&g.art.logo), "header": a(&g.art.header), "icon": a(&g.art.icon) },
    })
}
fn copy_dir(from: &Path, to: &Path) {
    let _ = std::fs::create_dir_all(to);
    if let Ok(rd) = std::fs::read_dir(from) {
        for e in rd.flatten() {
            let t = to.join(e.file_name());
            if e.file_type().map(|x| x.is_dir()).unwrap_or(false) { copy_dir(&e.path(), &t) } else { let _ = std::fs::copy(e.path(), t); }
        }
    }
}
/// first launch of 2.0: bring over the 1.x (Electron) library, art and play history
fn migrate(db: &mut Db, art: &Path) {
    if db.migrated { return }
    db.migrated = true;
    let old_dir = std::env::var("NF_MIGRATE_FROM").map(PathBuf::from).unwrap_or_else(|_| roaming().join("Nightfall Launcher"));
    let Ok(text) = std::fs::read_to_string(old_dir.join("library.json")) else { return };
    let Ok(old) = serde_json::from_str::<Db>(&text) else { return };
    if !db.games.is_empty() { return }
    copy_dir(&old_dir.join("art"), art);
    let mut old = old;
    for g in old.games.iter_mut() {
        // art lives in <art>/<game id>/<file>: rebuild every path inside the new folder
        let gdir = art.join(&g.id);
        let fix = |p: &mut Option<String>| {
            if let Some(x) = p.as_ref() {
                let f = Path::new(x).file_name().map(|s| s.to_os_string());
                *p = f.map(|f| gdir.join(f)).filter(|n| n.exists()).map(|n| n.to_string_lossy().to_string());
            }
        };
        fix(&mut g.art.cover); fix(&mut g.art.hero); fix(&mut g.art.logo); fix(&mut g.art.header); fix(&mut g.art.icon);
        if let Some(o) = g.open.take() { if o.last - o.s >= MIN_SESSION_MS { g.sessions.push(Session { s: o.s, e: o.last }) } }
    }
    db.games = old.games; db.settings = old.settings; db.collections = old.collections; db.ignored = old.ignored; db.caches = old.caches;
}

/* ---------------- adding & enriching games ---------------- */
fn merge_enriched(dst: &mut Game, src: Game, lookup_name: bool) {
    dst.art = src.art; dst.appid = src.appid; dst.desc = src.desc; dst.tint = src.tint; dst.logo_mono = src.logo_mono;
    dst.remote = src.remote; dst.status = src.status; dst.art_ver = src.art_ver;
    if lookup_name { dst.name = src.name }
}
fn queue_enrich(core: Arc<Core>, id: String, lookup_name: bool) {
    tauri::async_runtime::spawn(async move {
        let _permit = core.sem.acquire().await;
        let g = {
            let mut db = core.db.lock().unwrap();
            let Some(g) = db.by_id(&id) else { return };
            g.status = "searching".into();
            g.clone()
        };
        core.notify();
        let out = art::enrich(g, core.art.clone(), lookup_name).await;
        { let mut db = core.db.lock().unwrap(); if let Some(g) = db.by_id(&id) { merge_enriched(g, out, lookup_name) } }
        core.mark(); core.notify();
        let owned = core.owned.lock().unwrap().clone();
        if let Some((_, _, games)) = owned { borrow_covers(&core, &games).await }
    });
}
fn resolve_lnk(p: &str) -> Option<String> {
    let out = powershell(&format!("(New-Object -ComObject WScript.Shell).CreateShortcut('{}').TargetPath", p.replace('\'', "''")));
    let t = out.trim().to_string();
    if t.is_empty() { None } else { Some(t) }
}
fn add_paths(core: &Arc<Core>, paths: Vec<String>) -> Vec<String> {
    let mut added = vec![];
    {
        let mut db = core.db.lock().unwrap();
        for p in paths {
            let p = if p.to_lowercase().ends_with(".lnk") { match resolve_lnk(&p) { Some(t) => t, None => continue } } else { p };
            if !p.to_lowercase().ends_with(".exe") || !Path::new(&p).exists() { continue }
            if db.games.iter().any(|g| g.exe.to_lowercase() == p.to_lowercase()) { continue }
            let stem = Path::new(&p).file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
            let g = Game { id: new_id(6), proc_: Path::new(&p).file_name().map(|s| s.to_string_lossy().to_lowercase()).unwrap_or_default(),
                name: art::tidy(&stem), exe: p, added_at: now_ms(), status: "searching".into(), source: Some("manual".into()), ..Default::default() };
            added.push((g.id.clone(), g.exe.clone()));
            db.games.push(g);
        }
    }
    core.mark(); core.notify();
    for (id, exe) in &added {
        let (c, id, exe) = (core.clone(), id.clone(), exe.clone());
        tauri::async_runtime::spawn(async move {
            let name = tokio::task::spawn_blocking(move || art::guess_name(&exe)).await.unwrap_or_default();
            if !name.is_empty() { if let Some(g) = c.db.lock().unwrap().by_id(&id) { g.name = art::clean_title(&name) } }
            c.notify();
            queue_enrich(c, id, true);
        });
    }
    added.into_iter().map(|x| x.0).collect()
}
fn already_in(db: &Db, it: &scan::Item) -> bool {
    db.games.iter().any(|g| {
        lc(&g.exe) == lc(&it.exe) || (it.appid.is_some() && g.appid == it.appid) || norm(&g.name) == norm(&it.name)
            || (it.dir.is_some() && g.dir.as_ref().map(|d| lc(d)) == it.dir.as_ref().map(|d| lc(d)))
            || it.dir.as_ref().map(|d| lc(&g.exe).starts_with(&format!("{}\\", lc(d)))).unwrap_or(false)
    })
}
fn connect_items(core: &Arc<Core>, items: Vec<scan::Item>) -> Vec<String> {
    let mut ids = vec![];
    {
        let mut db = core.db.lock().unwrap();
        for it in items {
            if already_in(&db, &it) { continue }
            let procs = if it.procs.is_empty() { vec![Path::new(&it.exe).file_name().map(|s| s.to_string_lossy().to_lowercase()).unwrap_or_default()] } else { it.procs.clone() };
            let g = Game { id: new_id(6), exe: it.exe, dir: it.dir, source: Some(it.source), proc_: procs.join(",").to_lowercase(), launch: it.launch, appid: it.appid,
                name: art::clean_title(&it.name), store_icon: it.store_icon, added_at: now_ms(), status: "searching".into(), art_rev: 5, ..Default::default() };
            ids.push(g.id.clone());
            db.games.push(g);
        }
    }
    core.mark(); core.notify();
    for id in &ids { queue_enrich(core.clone(), id.clone(), false) }
    ids
}

/* ---------------- play-time tracking ---------------- */
fn tracker(core: Arc<Core>) {
    tauri::async_runtime::spawn(async move {
        let mut sys = sysinfo::System::new();
        let mut live_at = 0i64;
        let mut heavy_at: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
        loop {
            sys.refresh_processes_specifics(sysinfo::ProcessesToUpdate::All, true, sysinfo::ProcessRefreshKind::new());
            let procs: std::collections::HashSet<String> = sys.processes().values().map(|p| p.name().to_string_lossy().to_lowercase()).collect();
            let now = now_ms();
            let mut changed = false;
            let mut any_open = false;
            {
                let mut db = core.db.lock().unwrap();
                for g in db.games.iter_mut() {
                    let running = g.proc_.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()).any(|p| procs.contains(p));
                    if let Some(o) = g.open.clone() {
                        if now - o.last > GAP_MS { // machine slept: close at last seen
                            if o.last - o.s >= MIN_SESSION_MS { g.sessions.push(Session { s: o.s, e: o.last }) }
                            g.open = None; changed = true;
                        }
                    }
                    if running {
                        match g.open.as_mut() { Some(o) => o.last = now, None => { g.open = Some(Open { s: now, last: now }); changed = true } }
                        any_open = true;
                    } else if let Some(o) = g.open.take() {
                        if o.last - o.s >= MIN_SESSION_MS { g.sessions.push(Session { s: o.s, e: o.last }) }
                        changed = true;
                    }
                }
            }
            // what you're doing inside a running game (Roblox experience, Minecraft instance)
            if now - live_at >= 15_000 {
                live_at = now;
                let open: Vec<Game> = { core.db.lock().unwrap().games.iter().filter(|g| g.open.is_some() || g.live.is_some()).cloned().collect() };
                for g in open {
                    // Fortnite / Valorant logs are big: re-read them once a minute
                    let heavy = matches!(details::kind_of(&g), Some("fortnite" | "valorant"));
                    if heavy && g.open.is_some() && now - heavy_at.get(&g.id).cloned().unwrap_or(0) < 60_000 { continue }
                    if heavy { heavy_at.insert(g.id.clone(), now); }
                    let live = if g.open.is_some() && details::kind_of(&g).is_some() {
                        let caches = core.db.lock().unwrap().caches.clone();
                        let (d, caches) = details::details_for(&g, caches).await;
                        core.db.lock().unwrap().caches = caches;
                        d.and_then(|d| d.live)
                    } else { None };
                    let mut db = core.db.lock().unwrap();
                    if let Some(x) = db.by_id(&g.id) {
                        if serde_json::to_string(&x.live).ok() != serde_json::to_string(&live).ok() { changed = true }
                        x.live = live;
                    }
                }
            }
            if changed || any_open { core.mark() }
            if changed { core.notify(); update_tray_tip(&core); sync_widget(&core, any_open) }
            check_limits(&core, now);
            weekly_recap(&core, now);
            push_presence(&core);
            tokio::time::sleep(Duration::from_millis(TICK_MS)).await;
        }
    });
}

/* ---------------- reminders, recap, session widget ---------------- */
fn french(core: &Arc<Core>) -> bool {
    let l = core.db.lock().unwrap().settings.language.clone();
    l == "fr" || (l == "auto" && reg_value(r"HKCU\Control Panel\International", "LocaleName").map(|v| v.to_lowercase().starts_with("fr")).unwrap_or(false))
}
fn os_notice(core: &Arc<Core>, title: &str, body: &str) {
    let _ = core.app.notification().builder().title(title).body(body).show();
}
/// a gentle reminder, once a day, when a game passes the daily time you set
fn check_limits(core: &Arc<Core>, now: i64) {
    let day = play::local_midnight(now);
    let hit: Vec<(String, i64)> = {
        let mut db = core.db.lock().unwrap();
        let mut v = vec![];
        for g in db.games.iter_mut().filter(|g| g.open.is_some() && g.limit_min > 0 && g.limit_day != day) {
            let today = play::played_between(g, day, i64::MAX, now);
            if today >= g.limit_min * 60_000 { g.limit_day = day; v.push((g.name.clone(), today)); }
        }
        v
    };
    for (name, ms) in hit {
        core.mark();
        if french(core) { os_notice(core, &format!("{name} · limite atteinte"), &format!("Tu as joué {} aujourd'hui. Pense à faire une pause.", play::hm(ms))) }
        else { os_notice(core, &format!("{name} · daily limit reached"), &format!("You've played {} today. Time for a break?", play::hm(ms))) }
    }
}
/// on the first start of a new week: how last week went
fn weekly_recap(core: &Arc<Core>, now: i64) {
    let week = play::iso_week(now);
    let games = {
        let mut db = core.db.lock().unwrap();
        if db.settings.last_recap_week == week { return }
        let first = db.settings.last_recap_week.is_empty();
        db.settings.last_recap_week = week;
        if first || !db.settings.weekly_recap { drop(db); core.mark(); return }
        db.games.clone()
    };
    core.mark();
    if let Some((t, b)) = play::recap(&games, now, french(core)) { os_notice(core, &t, &b) }
}
/// the little session timer window, open only while a game runs
fn sync_widget(core: &Arc<Core>, playing: bool) {
    let want = playing && core.db.lock().unwrap().settings.widget;
    let have = core.app.get_webview_window("widget");
    match (want, have) {
        (true, None) => {
            let (mut x, mut y) = (1600.0, 24.0);
            if let Ok(Some(m)) = core.app.primary_monitor() { let s = m.size().to_logical::<f64>(m.scale_factor()); x = s.width - 276.0; y = 24.0; }
            let _ = tauri::WebviewWindowBuilder::new(&core.app, "widget", tauri::WebviewUrl::App("widget.html".into()))
                .title("Nightfall session").inner_size(252.0, 64.0).position(x, y).decorations(false).resizable(false)
                .always_on_top(true).skip_taskbar(true).focused(false).shadow(true).build();
        }
        (false, Some(w)) => { let _ = w.destroy(); }
        _ => {}
    }
}
#[tauri::command]
fn widget_close(core: C<'_>) {
    { core.db.lock().unwrap().settings.widget = false; }
    core.mark(); core.notify();
    if let Some(w) = core.app.get_webview_window("widget") { let _ = w.destroy(); }
}
#[tauri::command]
fn os_notify(core: C<'_>, title: String, body: String) {
    os_notice(core.inner(), &title.chars().take(120).collect::<String>(), &body.chars().take(300).collect::<String>());
}
/// YouTube videos for a game's trailer, best match first (the page shows them with youtube-nocookie)
#[tauri::command]
async fn trailer_find(name: String) -> R<Vec<String>> {
    let q = format!("{} official trailer", name.chars().take(80).collect::<String>());
    let url = format!("https://www.youtube.com/results?search_query={}", urlencoding::encode(&q));
    let html = HTTP.get(&url).header("Accept-Language", "en").send().await.map_err(|e| e.to_string())?.text().await.map_err(|e| e.to_string())?;
    let mut ids: Vec<String> = vec![];
    for c in regex::Regex::new(r#""videoId":"([A-Za-z0-9_-]{11})""#).unwrap().captures_iter(&html) {
        let id = c[1].to_string();
        if !ids.contains(&id) { ids.push(id) }
        if ids.len() >= 5 { break }
    }
    if ids.is_empty() { pro::log("warn", &format!("no trailer found for {name}")) }
    Ok(ids)
}
/// achievements from Steam's cache on this PC
#[tauri::command]
fn achievements_get(core: C<'_>, appid: i64) -> Option<Value> {
    let acct = libraries::steam_account()?;
    play::achievements(&scan::steam_root(), &acct.account_id, appid, french(core.inner()))
}
/// a game's own screenshots: Steam, Xbox Game Bar and NVIDIA folders
#[tauri::command]
fn game_screenshots(core: C<'_>, id: String) -> Value {
    let Some(g) = core.db.lock().unwrap().by_id(&id).cloned() else { return json!([]) };
    let videos = core.app.path().video_dir().unwrap_or_else(|_| home().join("Videos"));
    let (dirs, files) = play::screenshots(&g, &scan::steam_root(), &videos);
    for d in &dirs { let _ = core.app.asset_protocol_scope().allow_directory(d, false); }
    json!(files.into_iter().filter_map(|(p, at)| asset_url(&p.to_string_lossy(), 0).map(|u| json!({ "url": u, "at": at }))).collect::<Vec<_>>())
}

/* ---------------- Discord ---------------- */
fn push_presence(core: &Arc<Core>) {
    let (settings, game) = {
        let db = core.db.lock().unwrap();
        let g = db.games.iter().filter(|g| g.open.is_some()).max_by_key(|g| g.open.as_ref().map(|o| o.s).unwrap_or(0)).cloned();
        (db.settings.clone(), g)
    };
    let before = core.presence.status();
    let test = *core.test_until.lock().unwrap() > now_ms();
    // shows on your Discord profile under Activity: "Playing <game>" with Nightfall's logo and a GitHub button
    let github = json!({ "label": "View on GitHub", "url": REPO_URL });
    let small = json!({ "small_image": LOGO_URL, "small_text": format!("Nightfall Launcher {}", core.app.package_info().version) });
    let activity = if test {
        Some(json!({ "type": 0, "details": "Nightfall Launcher", "state": "Rich Presence test", "status_display_type": 2, "timestamps": { "start": now_ms() / 1000 },
            "assets": { "large_image": LOGO_URL, "large_text": "Nightfall Launcher" }, "buttons": [github], "instance": false }))
    } else if let Some(g) = game {
        let img = g.appid.map(|a| format!("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/header.jpg", a))
            .or(g.remote.icon.clone()).or(g.remote.hero.clone());
        let live = g.live.clone();
        let mut assets = serde_json::Map::new();
        match (&live, &img) {
            (Some(l), _) if l.icon.is_some() => { assets.insert("large_image".into(), json!(l.icon)); assets.insert("large_text".into(), json!(presence::line(&l.name))); }
            (_, Some(i)) => { assets.insert("large_image".into(), json!(i)); assets.insert("large_text".into(), json!(presence::line(&g.name))); }
            _ => { assets.insert("large_image".into(), json!(LOGO_URL)); }
        }
        for (k, v) in small.as_object().unwrap() { assets.insert(k.clone(), v.clone()); }
        let game_url = live.as_ref().and_then(|l| l.url.clone()).or(g.appid.map(|a| format!("https://store.steampowered.com/app/{}", a)));
        let mut buttons = vec![github];
        if let Some(u) = game_url { buttons.push(json!({ "label": if live.is_some() { "Open experience" } else { "View game" }, "url": u })) }
        Some(json!({
            "type": 0,
            "details": presence::line(&g.name),
            "state": presence::line(&live.as_ref().map(|l| l.name.clone()).unwrap_or_else(|| "Playing with Nightfall".into())),
            "status_display_type": 2,
            "timestamps": { "start": live.as_ref().map(|l| l.since).unwrap_or(g.open.as_ref().map(|o| o.s).unwrap_or(now_ms())) / 1000 },
            "assets": assets, "buttons": buttons, "instance": false,
        }))
    } else if settings.discord_idle {
        Some(json!({ "type": 0, "details": "Browsing the library", "state": "In Nightfall", "assets": { "large_image": LOGO_URL, "large_text": "Nightfall Launcher" }, "buttons": [github] }))
    } else { None };
    let id = settings.discord_client_id.trim();
    let client_id = if id.is_empty() { DEFAULT_DISCORD_ID.to_string() } else { id.to_string() };
    core.presence.send(presence::Desired { enabled: settings.discord_enabled, client_id, activity });
    if core.presence.status() != before { core.notify() }
}

/* ---------------- tray ---------------- */
fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.unminimize(); let _ = w.set_focus(); }
}
fn update_tray_tip(core: &Arc<Core>) {
    let playing: Vec<String> = core.db.lock().unwrap().games.iter().filter(|g| g.open.is_some()).map(|g| g.name.clone()).collect();
    if let Some(t) = core.app.tray_by_id("main") {
        let _ = t.set_tooltip(Some(if playing.is_empty() { "Nightfall Launcher".to_string() } else { format!("Nightfall — playing {}", playing.join(", ")) }));
    }
}
fn quit(core: &Arc<Core>) {
    let now = now_ms();
    {
        let mut db = core.db.lock().unwrap();
        for g in db.games.iter_mut() { if let Some(o) = g.open.take() { if now - o.s >= MIN_SESSION_MS { g.sessions.push(Session { s: o.s, e: now }) } } }
    }
    core.presence.send(presence::Desired::default());
    core.flush();
    std::thread::sleep(Duration::from_millis(150));
    core.app.exit(0);
}
fn build_tray(app: &AppHandle, core: Arc<Core>) -> tauri::Result<()> {
    let login_on = app.autolaunch().is_enabled().unwrap_or(false);
    let keep_on = core.db.lock().unwrap().settings.close_to_tray;
    let open = MenuItem::with_id(app, "open", "Open Nightfall", true, None::<&str>)?;
    let login = CheckMenuItem::with_id(app, "login", "Start with Windows", true, login_on, None::<&str>)?;
    let keep = CheckMenuItem::with_id(app, "keep", "Keep tracking when closed", true, keep_on, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &PredefinedMenuItem::separator(app)?, &login, &keep, &PredefinedMenuItem::separator(app)?, &quit_i])?;
    let (c1, c2) = (core.clone(), core.clone());
    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().cloned().unwrap())
        .tooltip("Nightfall Launcher")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, ev| match ev.id().as_ref() {
            "open" => show_main(app),
            "login" => { let on = login.is_checked().unwrap_or(false); let _ = if on { app.autolaunch().enable() } else { app.autolaunch().disable() }; c1.notify(); }
            "keep" => { c1.db.lock().unwrap().settings.close_to_tray = keep.is_checked().unwrap_or(true); c1.mark(); c1.notify(); }
            "quit" => quit(&c1),
            _ => {}
        })
        .on_tray_icon_event(move |t, ev| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev { show_main(t.app_handle()); let _ = &c2; }
        })
        .build(app)?;
    Ok(())
}

/* ---------------- updates (installed app; signed releases on GitHub) ---------------- */
fn set_update(core: &Arc<Core>, v: Value) { *core.update.lock().unwrap() = v; core.notify(); }
async fn check_update(core: Arc<Core>) -> R<()> {
    if cfg!(debug_assertions) { set_update(&core, json!({ "state": "dev" })); return Ok(()) }
    set_update(&core, json!({ "state": "checking" }));
    let up = core.app.updater().map_err(|e| e.to_string())?;
    match up.check().await {
        Ok(Some(u)) => { set_update(&core, json!({ "state": "available", "version": u.version })); *core.pending.lock().unwrap() = Some(u); }
        Ok(None) => set_update(&core, json!({ "state": "latest", "at": now_ms() })),
        Err(e) => { pro::log("warn", &format!("update check failed: {e}")); set_update(&core, json!({ "state": "error", "message": e.to_string() })); return Err(e.to_string()) }
    }
    Ok(())
}

/* ================= commands ================= */
#[tauri::command]
fn lib_get(core: C<'_>) -> Value { core.snapshot() }

#[tauri::command]
async fn lib_add_dialog(core: C<'_>) -> R<Vec<String>> {
    let core = core.inner().clone();
    let app = core.app.clone();
    let picked = tokio::task::spawn_blocking(move || app.dialog().file().set_title("Add games").add_filter("Games", &["exe", "lnk"]).blocking_pick_files()).await.map_err(|e| e.to_string())?;
    let paths: Vec<String> = picked.unwrap_or_default().into_iter().filter_map(|f| f.into_path().ok()).map(|p| p.to_string_lossy().to_string()).collect();
    Ok(add_paths(&core, paths))
}
#[tauri::command]
fn lib_add_paths(core: C<'_>, paths: Vec<String>) -> Vec<String> { add_paths(core.inner(), paths) }

#[tauri::command]
async fn lib_scan(core: C<'_>) -> R<Value> {
    let core = core.inner().clone();
    let items = tokio::task::spawn_blocking(scan::scan_all).await.map_err(|e| e.to_string())?;
    let out: Vec<Value> = { let db = core.db.lock().unwrap(); items.iter().enumerate().map(|(i, it)| json!({ "i": i, "name": it.name, "source": it.source, "exe": it.exe, "connected": already_in(&db, it) })).collect() };
    *core.last_scan.lock().unwrap() = items;
    Ok(json!(out))
}
#[tauri::command]
fn lib_connect(core: C<'_>, indexes: Vec<usize>) -> Vec<String> {
    let items: Vec<scan::Item> = { let s = core.last_scan.lock().unwrap(); indexes.iter().filter_map(|i| s.get(*i).cloned()).collect() };
    connect_items(core.inner(), items)
}

#[tauri::command]
fn game_launch(core: C<'_>, id: String) -> Option<String> {
    let err = launch_game(core.inner(), &id);
    if let Some(e) = &err { pro::log("warn", &format!("launch failed: {e}")) }
    err
}
fn launch_game(core: &Arc<Core>, id: &str) -> Option<String> {
    let g = { core.db.lock().unwrap().by_id(id).cloned() }?;
    let err = start_game(&g);
    if err.is_none() && g.hide_on_launch { if let Some(w) = core.app.get_webview_window("main") { let _ = w.hide(); } }
    err
}
fn start_game(g: &Game) -> Option<String> {
    let args = play::split_args(&g.launch_args);
    if let Some(l) = &g.launch {
        if let Some(u) = &l.uri { return tauri_plugin_opener::open_url(u, None::<&str>).err().map(|e| e.to_string()) }
        if let Some(c) = l.cmd.as_ref().filter(|c| Path::new(c).exists()) {
            return std::process::Command::new(c).args(&l.args).args(&args).spawn().err().map(|e| e.to_string());
        }
    }
    if !Path::new(&g.exe).exists() { return Some("The game file was moved or deleted. Remove it and add it again.".into()) }
    let dir = Path::new(&g.exe).parent().map(|p| p.to_path_buf());
    if g.run_as_admin {
        // Windows asks for permission (UAC) itself
        let q = |s: &str| format!("'{}'", s.replace('\'', "''"));
        let list = if args.is_empty() { String::new() } else { format!(" -ArgumentList {}", args.iter().map(|a| q(&format!("\"{a}\""))).collect::<Vec<_>>().join(",")) };
        let wd = dir.as_ref().map(|d| format!(" -WorkingDirectory {}", q(&d.to_string_lossy()))).unwrap_or_default();
        let cmd = format!("Start-Process -FilePath {} -Verb RunAs{}{}", q(&g.exe), list, wd);
        return std::process::Command::new("powershell").args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &cmd]).spawn().err().map(|e| e.to_string());
    }
    if !args.is_empty() {
        let mut c = std::process::Command::new(&g.exe);
        c.args(&args); if let Some(d) = &dir { c.current_dir(d); }
        return c.spawn().err().map(|e| e.to_string());
    }
    tauri_plugin_opener::open_path(&g.exe, None::<&str>).err().map(|e| e.to_string())
}
#[tauri::command]
fn game_update(core: C<'_>, id: String, patch: Value) {
    {
        let mut db = core.db.lock().unwrap();
        let Some(g) = db.by_id(&id) else { return };
        if let Some(n) = patch["name"].as_str().map(str::trim).filter(|s| !s.is_empty()) { g.name = n.chars().take(120).collect() }
        if let Some(p) = patch["proc"].as_str().map(str::trim).filter(|s| !s.is_empty()) { g.proc_ = p.to_lowercase().chars().take(300).collect() }
        if let Some(f) = patch["fav"].as_bool() { g.fav = f }
        if let Some(f) = patch["pinned"].as_bool() { g.pinned = f; if !f { g.pin_order = 0 } }
        if let Some(f) = patch["hidden"].as_bool() { g.hidden = f }
        if let Some(s) = patch["launchArgs"].as_str() { g.launch_args = s.chars().take(500).collect() }
        if let Some(f) = patch["runAsAdmin"].as_bool() { g.run_as_admin = f }
        if let Some(f) = patch["hideOnLaunch"].as_bool() { g.hide_on_launch = f }
        if let Some(n) = patch["limitMin"].as_i64() { g.limit_min = n.clamp(0, 24 * 60); g.limit_day = 0 }
    }
    core.mark(); core.notify();
}
/// the sidebar order you dragged the pinned games into
#[tauri::command]
fn pins_order(core: C<'_>, ids: Vec<String>) {
    {
        let mut db = core.db.lock().unwrap();
        for g in db.games.iter_mut() { if let Some(i) = ids.iter().position(|x| x == &g.id) { g.pin_order = i as i64 + 1 } }
    }
    core.mark(); core.notify();
}
#[tauri::command]
fn game_remove(core: C<'_>, id: String) {
    {
        let mut db = core.db.lock().unwrap();
        let Some(i) = db.games.iter().position(|g| g.id == id) else { return };
        let g = db.games.remove(i);
        db.ignored.push(Ignored { exe: lc(&g.exe), appid: g.appid }); // don't auto-add it back
        for c in db.collections.iter_mut() { c.games.retain(|x| x != &id) }
    }
    let _ = std::fs::remove_dir_all(core.art.join(&id));
    core.mark(); core.notify();
}
#[tauri::command]
fn game_show_file(core: C<'_>, id: String) {
    if let Some(g) = core.db.lock().unwrap().by_id(&id) {
        let _ = std::process::Command::new("explorer.exe").arg(format!("/select,{}", g.exe)).spawn();
    }
}
#[tauri::command]
async fn art_search(q: String) -> Option<Vec<Value>> { art::steam_search(&q.chars().take(100).collect::<String>()).await.ok() }
#[tauri::command]
async fn art_apply(core: C<'_>, id: String, appid: i64, name: Option<String>) -> R<()> {
    let core = core.inner().clone();
    let g = {
        let mut db = core.db.lock().unwrap();
        let Some(g) = db.by_id(&id) else { return Ok(()) };
        g.appid = Some(appid); g.custom = Custom::default(); g.status = "searching".into();
        if let Some(n) = name { g.name = n.chars().take(120).collect() }
        g.clone()
    };
    core.notify();
    let mut g2 = g.clone();
    art::steam_art(&mut g2, &core.art.join(&id)).await;
    g2.status = "ready".into(); g2.art_ver = now_ms();
    { let mut db = core.db.lock().unwrap(); if let Some(x) = db.by_id(&id) { merge_enriched(x, g2, false) } }
    core.mark(); core.notify();
    Ok(())
}
#[tauri::command]
fn art_refetch(core: C<'_>, id: String) {
    if let Some(g) = core.db.lock().unwrap().by_id(&id) { g.custom = Custom::default() }
    queue_enrich(core.inner().clone(), id, false);
}
#[tauri::command]
async fn art_custom(core: C<'_>, id: String, kind: String) -> R<()> {
    if !["cover", "hero", "logo"].contains(&kind.as_str()) { return Ok(()) }
    let core = core.inner().clone();
    let app = core.app.clone();
    let picked = tokio::task::spawn_blocking(move || app.dialog().file().set_title("Choose an image").add_filter("Images", &["png", "jpg", "jpeg", "webp", "gif"]).blocking_pick_file()).await.map_err(|e| e.to_string())?;
    let Some(src) = picked.and_then(|f| f.into_path().ok()) else { return Ok(()) };
    let dir = core.art.join(&id);
    let _ = std::fs::create_dir_all(&dir);
    let ext = src.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_else(|| "png".into());
    let dest = dir.join(format!("custom-{}.{}", kind, ext));
    std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    {
        let mut db = core.db.lock().unwrap();
        if let Some(g) = db.by_id(&id) {
            let d = Some(dest.to_string_lossy().to_string());
            match kind.as_str() { "cover" => { g.art.cover = d; g.custom.cover = true } "hero" => { g.art.hero = d; g.custom.hero = true } _ => { g.art.logo = d; g.custom.logo = true; g.logo_mono = false } }
            g.art_ver = now_ms();
        }
    }
    core.mark(); core.notify();
    Ok(())
}
#[tauri::command]
async fn stats_screenshots(since: i64) -> usize {
    tokio::task::spawn_blocking(move || {
        let h = home();
        let mut dirs = vec![h.join("Pictures").join("Screenshots"), h.join("OneDrive").join("Pictures").join("Screenshots"), h.join("Videos").join("Captures")];
        let ud = scan::steam_root().join("userdata");
        for u in std::fs::read_dir(&ud).into_iter().flatten().flatten() {
            for a in std::fs::read_dir(u.path().join("760").join("remote")).into_iter().flatten().flatten() { dirs.push(a.path().join("screenshots")) }
        }
        fn count(d: &Path, since: i64, depth: u32) -> usize {
            let mut n = 0;
            for e in std::fs::read_dir(d).into_iter().flatten().flatten() {
                let p = e.path();
                if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    if depth < 2 && e.file_name().to_string_lossy().to_lowercase() != "thumbnails" { n += count(&p, since, depth + 1) }
                } else if matches!(p.extension().map(|x| x.to_string_lossy().to_lowercase()).as_deref(), Some("png" | "jpg" | "jpeg" | "jxr" | "webp")) {
                    let m = e.metadata().ok().and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as i64).unwrap_or(0);
                    if m >= since { n += 1 }
                }
            }
            n
        }
        dirs.iter().map(|d| count(d, since, 0)).sum()
    }).await.unwrap_or(0)
}
#[tauri::command]
fn app_settings(core: C<'_>) -> Value {
    let mut v = json!(core.db.lock().unwrap().settings);
    v["startWithWindows"] = json!(core.app.autolaunch().is_enabled().unwrap_or(false));
    v
}
#[tauri::command]
fn app_set(core: C<'_>, key: String, val: Value) {
    {
        let mut db = core.db.lock().unwrap();
        let s = &mut db.settings;
        match key.as_str() {
            "startWithWindows" => { let _ = if val.as_bool().unwrap_or(false) { core.app.autolaunch().enable() } else { core.app.autolaunch().disable() }; }
            "closeToTray" => s.close_to_tray = val.as_bool().unwrap_or(true),
            "discordEnabled" => s.discord_enabled = val.as_bool().unwrap_or(false),
            "discordIdle" => s.discord_idle = val.as_bool().unwrap_or(false),
            "autoAddInstalled" => s.auto_add_installed = val.as_bool().unwrap_or(true),
            "discordClientId" => s.discord_client_id = val.as_str().unwrap_or("").chars().filter(|c| c.is_ascii_digit()).take(22).collect(),
            "showFilters" => s.show_filters = val.as_bool().unwrap_or(false),
            "onboarded" => s.onboarded = val.as_bool().unwrap_or(true),
            "lastSeenVersion" => s.last_seen_version = val.as_str().unwrap_or("").chars().take(20).collect(),
            "reduceMotion" => { let v = val.as_str().unwrap_or("system"); if ["system", "on", "off"].contains(&v) { s.reduce_motion = v.into() } }
            "sounds" => s.sounds = val.as_bool().unwrap_or(false),
            "accent" => { let v = val.as_str().unwrap_or("white"); if ["white", "violet", "blue", "green", "pink", "orange"].contains(&v) { s.accent = v.into() } }
            "language" => { let v = val.as_str().unwrap_or("auto"); if ["auto", "en", "fr"].contains(&v) { s.language = v.into() } }
            "widget" => s.widget = val.as_bool().unwrap_or(false),
            "notifyDownloads" => s.notify_downloads = val.as_bool().unwrap_or(true),
            "weeklyRecap" => s.weekly_recap = val.as_bool().unwrap_or(true),
            "libView" => { let v = val.as_str().unwrap_or("grid"); if ["grid", "list"].contains(&v) { s.lib_view = v.into() } }
            "cardSize" => s.card_size = val.as_i64().unwrap_or(150).clamp(110, 230),
            "settingsIcon" => { let v = val.as_str().unwrap_or("cog"); if ["cog", "sliders", "dots", "pencil", "none"].contains(&v) { s.settings_icon = v.into() } }
            "steamApiKey" => { s.steam_api_key = val.as_str().unwrap_or("").chars().filter(|c| c.is_ascii_alphanumeric()).take(40).collect(); *core.friends.lock().unwrap() = None; }
            _ => {}
        }
    }
    core.mark(); core.notify();
    push_presence(core.inner());
}
#[tauri::command]
fn presence_test(core: C<'_>) {
    *core.test_until.lock().unwrap() = now_ms() + 20_000;
    push_presence(core.inner());
}
#[tauri::command]
async fn details_get(core: C<'_>, id: String) -> R<Option<Value>> {
    let core = core.inner().clone();
    let Some((g, caches)) = ({ let mut db = core.db.lock().unwrap(); let caches = db.caches.clone(); db.by_id(&id).cloned().map(|g| (g, caches)) }) else { return Ok(None) };
    let (d, caches) = details::details_for(&g, caches).await;
    core.db.lock().unwrap().caches = caches;
    core.mark();
    Ok(d.map(|d| json!(d)))
}
#[tauri::command]
fn col_create(core: C<'_>, name: String, game_id: Option<String>) -> Option<String> {
    let n: String = name.trim().chars().take(40).collect();
    if n.is_empty() { return None }
    let id = new_id(4);
    core.db.lock().unwrap().collections.push(Collection { id: id.clone(), name: n, games: game_id.into_iter().collect() });
    core.mark(); core.notify();
    Some(id)
}
#[tauri::command]
fn col_rename(core: C<'_>, id: String, name: String) {
    let n: String = name.trim().chars().take(40).collect();
    if n.is_empty() { return }
    if let Some(c) = core.db.lock().unwrap().collections.iter_mut().find(|c| c.id == id) { c.name = n }
    core.mark(); core.notify();
}
#[tauri::command]
fn col_delete(core: C<'_>, id: String) { core.db.lock().unwrap().collections.retain(|c| c.id != id); core.mark(); core.notify(); }
#[tauri::command]
fn col_toggle(core: C<'_>, id: String, game_id: String) {
    {
        let mut db = core.db.lock().unwrap();
        if !db.games.iter().any(|g| g.id == game_id) { return }
        if let Some(c) = db.collections.iter_mut().find(|c| c.id == id) {
            if c.games.contains(&game_id) { c.games.retain(|x| x != &game_id) } else { c.games.push(game_id) }
        }
    }
    core.mark(); core.notify();
}

async fn refresh_owned(core: &Arc<Core>, force: bool) -> (Vec<libraries::Account>, Vec<libraries::Owned>) {
    if let Some((at, a, g)) = core.owned.lock().unwrap().clone() { if !force && now_ms() - at < 10 * 60_000 { return (a, g) } }
    let mut cache = core.db.lock().unwrap().caches.steam.clone();
    let (accounts, games) = libraries::owned_all(&mut cache).await;
    {
        let mut db = core.db.lock().unwrap();
        db.caches.steam = cache;
        // Steam's own all-time playtime, shown on connected Steam games
        for g in db.games.iter_mut() {
            if let Some(o) = g.appid.and_then(|a| games.iter().find(|x| x.appid == Some(a))) { g.steam_min = o.play_min }
        }
    }
    borrow_covers(core, &games).await;
    let at = now_ms();
    core.db.lock().unwrap().owned_cache = Some((at, accounts.clone(), games.clone()));
    core.mark();
    *core.owned.lock().unwrap() = Some((at, accounts.clone(), games.clone()));
    (accounts, games)
}
/// games without a portrait cover (HoYoverse, launchers…) borrow the one from your Steam / Epic library
async fn borrow_covers(core: &Arc<Core>, games: &[libraries::Owned]) {
    let need: Vec<(String, String)> = {
        let db = core.db.lock().unwrap();
        db.games.iter().filter(|g| g.art.cover.is_none() && !g.custom.cover)
            .filter_map(|g| games.iter().find(|o| o.cover.is_some() && (norm(&o.name) == norm(&g.name) || (o.appid.is_some() && o.appid == g.appid))).map(|o| (g.id.clone(), o.cover.clone().unwrap()))).collect()
    };
    for (id, url) in need {
        let url = if url.contains("epicgames.com") { format!("{}{}h=900&w=600&resize=1", url, if url.contains('?') { "&" } else { "?" }) } else { url };
        if let Some(f) = download_as(&url, &core.art.join(&id), "cover").await {
            if let Some(g) = core.db.lock().unwrap().by_id(&id) { g.art.cover = Some(f); g.art_ver = now_ms(); }
            core.notify();
        }
    }
}
#[tauri::command]
async fn owned_get(core: C<'_>, force: bool) -> R<Value> {
    let core = core.inner().clone();
    let cached = core.owned.lock().unwrap().clone();
    let (accounts, mut games) = match cached {
        // show what we had straight away; fetch the fresh list behind it
        Some((at, a, g)) if !force => {
            if now_ms() - at > 10 * 60_000 && !core.owned_busy.swap(true, Ordering::SeqCst) {
                let c = core.clone();
                tauri::async_runtime::spawn(async move { refresh_owned(&c, true).await; c.owned_busy.store(false, Ordering::SeqCst); let _ = c.app.emit("owned:changed", ()); });
            }
            (a, g)
        }
        _ => refresh_owned(&core, force).await,
    };
    {
        let db = core.db.lock().unwrap();
        for o in games.iter_mut() {
            o.game_id = db.games.iter().find(|g| (o.appid.is_some() && g.appid == o.appid) || norm(&g.name) == norm(&o.name)
                || o.ns.as_ref().map(|ns| g.launch.as_ref().and_then(|l| l.uri.as_ref()).map(|u| u.contains(ns.as_str())).unwrap_or(false)).unwrap_or(false)).map(|g| g.id.clone());
        }
    }
    Ok(json!({ "accounts": accounts, "games": games }))
}
#[tauri::command]
fn owned_open(core: C<'_>, uri: String) -> Option<String> {
    if !libraries::allowed_store_link(&uri) { return Some("That isn't a store install link.".into()) }
    *core.auto_at.lock().unwrap() = now_ms() + 90_000; // pick the game up once it finishes installing
    tauri_plugin_opener::open_url(&uri, None::<&str>).err().map(|e| e.to_string())
}
#[tauri::command]
async fn friends_get(core: C<'_>, force: bool) -> R<Value> {
    let core = core.inner().clone();
    if let Some((at, v)) = core.friends.lock().unwrap().clone() { if !force && now_ms() - at < 60_000 { return Ok(v) } }
    let key = core.db.lock().unwrap().settings.steam_api_key.clone();
    let v = match social::steam_friends(&key).await { Ok((f, via)) => json!({ "friends": f, "via": via }), Err(e) => json!({ "error": e }) };
    *core.friends.lock().unwrap() = Some((now_ms(), v.clone()));
    Ok(v)
}
#[tauri::command]
async fn save_card(core: C<'_>, png_base64: String, name: String) -> R<Option<String>> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD.decode(png_base64.trim_start_matches("data:image/png;base64,")).map_err(|e| e.to_string())?;
    let app = core.app.clone();
    let file = tokio::task::spawn_blocking(move || app.dialog().file().set_title("Save card").set_file_name(&name).add_filter("PNG image", &["png"]).blocking_save_file()).await.map_err(|e| e.to_string())?;
    let Some(path) = file.and_then(|f| f.into_path().ok()) else { return Ok(None) };
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}
/// web pages the UI may open: help pages, store pages and Roblox experiences only
#[tauri::command]
fn open_link(url: String) -> Option<String> {
    let ok = regex::Regex::new(r"^https://(steamcommunity\.com/(dev/apikey|profiles/\d+|id/[\w-]+)/?|discord\.com/developers/applications/?|www\.roblox\.com/games/\d+[\w/-]*|store\.steampowered\.com/app/\d+/?|github\.com/KYOO-DEVV/nightfall-launcher[\w/.-]*)$").unwrap();
    if !ok.is_match(&url) && !extra::allowed_news_link(&url) { return Some("That link can't be opened from Nightfall.".into()) }
    tauri_plugin_opener::open_url(&url, None::<&str>).err().map(|e| e.to_string())
}
/// an image as a data: URL, so share cards can draw it without tainting the canvas
#[tauri::command]
async fn image_data(src: String) -> R<Option<String>> {
    use base64::Engine;
    let (bytes, mime) = if let Some(rest) = src.strip_prefix("http://asset.localhost/") {
        let path = urlencoding::decode(rest.split('?').next().unwrap_or("")).map_err(|e| e.to_string())?.to_string();
        let b = std::fs::read(&path).map_err(|e| e.to_string())?;
        let ext = Path::new(&path).extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
        (b, match ext.as_str() { "png" => "image/png", "webp" => "image/webp", "gif" => "image/gif", _ => "image/jpeg" }.to_string())
    } else if src.starts_with("https://") {
        let r = HTTP.get(&src).send().await.map_err(|e| e.to_string())?;
        let ct = r.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
        if !ct.starts_with("image") { return Ok(None) }
        let b = r.bytes().await.map_err(|e| e.to_string())?;
        if b.len() > 12 * 1024 * 1024 { return Ok(None) }
        (b.to_vec(), ct)
    } else { return Ok(None) };
    Ok(Some(format!("data:{};base64,{}", mime, base64::engine::general_purpose::STANDARD.encode(bytes))))
}
/* ---------- news, downloads, store pages, profile ---------- */
#[tauri::command]
async fn news_get(core: C<'_>, id: Option<String>, name: Option<String>, appid: Option<i64>) -> R<Option<Value>> {
    let found = id.and_then(|id| core.db.lock().unwrap().by_id(&id).map(|g| (g.name.clone(), g.appid)));
    let (n, a) = found.unwrap_or((name.unwrap_or_default(), appid));
    let Some(key) = extra::news_key(&n, a) else { return Ok(None) };
    Ok(extra::news(&key).await.ok().map(|f| json!(f)))
}
#[tauri::command]
async fn downloads_get() -> R<Value> {
    Ok(json!(tokio::task::spawn_blocking(extra::downloads).await.unwrap_or_default()))
}
#[tauri::command]
async fn store_info_get(store: String, id: String, appid: Option<i64>) -> R<Value> {
    Ok(extra::store_info(&store, &id, appid).await)
}
#[tauri::command]
fn profile_set(core: C<'_>, patch: Value) {
    {
        let mut db = core.db.lock().unwrap();
        let ids: Vec<String> = db.games.iter().map(|g| g.id.clone()).collect();
        let p = &mut db.profile;
        if let Some(n) = patch["name"].as_str() { p.name = n.trim().chars().take(32).collect() }
        if let Some(b) = patch["bio"].as_str() { p.bio = b.trim().chars().take(160).collect() }
        if let Some(b) = patch["pronouns"].as_str() { p.pronouns = b.trim().chars().take(24).collect() }
        if let Some(m) = patch["ownedMeta"].as_object() {
            for (k, v) in m {
                if !k.starts_with("own:") || k.len() > 80 { continue }
                let s = |f: &str| v[f].as_str().map(|x| x.chars().take(400).collect::<String>());
                p.showcase_owned.insert(k.clone(), json!({ "name": s("name"), "cover": s("cover"), "header": s("header"), "store": s("store"), "id": s("id") }));
            }
        }
        if let Some(sc) = patch["showcase"].as_array() {
            let mut v: Vec<String> = vec![];
            for x in sc.iter().filter_map(|x| x.as_str()) {
                let ok = ids.iter().any(|i| i == x) || p.showcase_owned.contains_key(x);
                if ok && !v.iter().any(|y| y == x) { v.push(x.to_string()) }
            }
            v.truncate(12);
            p.showcase_owned.retain(|k, _| v.contains(k));
            p.showcase = v;
        }
    }
    core.mark(); core.notify();
}
#[tauri::command]
async fn profile_pick(core: C<'_>, kind: String) -> R<bool> {
    if kind != "avatar" && kind != "banner" { return Ok(false) }
    let core = core.inner().clone();
    let app = core.app.clone();
    let title = if kind == "avatar" { "Choose a profile picture" } else { "Choose a banner" };
    let picked = tokio::task::spawn_blocking(move || app.dialog().file().set_title(title).add_filter("Images", &["png", "jpg", "jpeg", "webp", "gif"]).blocking_pick_file()).await.map_err(|e| e.to_string())?;
    let Some(src) = picked.and_then(|f| f.into_path().ok()) else { return Ok(false) };
    let _ = std::fs::create_dir_all(&core.profile_dir);
    let ext = src.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_else(|| "png".into());
    // replace the previous picture of this kind
    for e in std::fs::read_dir(&core.profile_dir).into_iter().flatten().flatten() {
        if e.file_name().to_string_lossy().starts_with(&format!("{}.", kind)) { let _ = std::fs::remove_file(e.path()); }
    }
    let dest = core.profile_dir.join(format!("{}.{}", kind, ext));
    std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    {
        let mut db = core.db.lock().unwrap();
        let d = Some(dest.to_string_lossy().to_string());
        if kind == "avatar" { db.profile.avatar = d } else { db.profile.banner = d }
        db.profile.ver = now_ms();
    }
    core.mark(); core.notify();
    Ok(true)
}
#[tauri::command]
fn profile_clear(core: C<'_>, kind: String) {
    {
        let mut db = core.db.lock().unwrap();
        let f = match kind.as_str() { "avatar" => db.profile.avatar.take(), "banner" => db.profile.banner.take(), _ => None };
        if let Some(f) = f { let _ = std::fs::remove_file(f); }
        db.profile.ver = now_ms();
    }
    core.mark(); core.notify();
}
#[tauri::command]
async fn update_check(core: C<'_>) -> R<Option<String>> { Ok(check_update(core.inner().clone()).await.err()) }
#[tauri::command]
async fn update_install(core: C<'_>) -> R<()> {
    let core = core.inner().clone();
    let Some(u) = core.pending.lock().unwrap().take() else { return Ok(()) };
    let version = u.version.clone();
    set_update(&core, json!({ "state": "downloading", "version": version, "percent": 0 }));
    core.flush();
    let (c2, mut got, mut last_pct) = (core.clone(), 0usize, 0i64);
    let res = u.download_and_install(move |chunk, total| {
        got += chunk;
        if let Some(t) = total { let p = (got as f64 / t as f64 * 100.0) as i64; if p - last_pct >= 5 { last_pct = p; set_update(&c2, json!({ "state": "downloading", "version": version, "percent": p })) } }
    }, || {}).await;
    // on Windows the installer takes over and closes the app; reaching here means it failed
    if let Err(e) = res { set_update(&core, json!({ "state": "error", "message": e.to_string() })); return Err(e.to_string()) }
    Ok(())
}

/* ---------------- reliability: logs, backups, reports ---------------- */
/// errors from the interface go to the same log file
#[tauri::command]
fn log_write(level: String, msg: String) {
    let level = if ["info", "warn", "error"].contains(&level.as_str()) { level } else { "info".into() };
    pro::log(&format!("ui-{level}"), &msg);
}
#[tauri::command]
fn backups_list(core: C<'_>) -> Value {
    json!(pro::list(&core.dir).into_iter().map(|(n, t, size)| json!({ "name": n, "at": t, "size": size })).collect::<Vec<_>>())
}
#[tauri::command]
fn backup_create(core: C<'_>) -> Option<String> {
    core.flush();
    let r = pro::backup_now(&core.dir, &core.file);
    if let Some(n) = &r { pro::log("info", &format!("backup saved by hand: {n}")) }
    r
}
/// puts a backup back; what you have now is saved as a backup first, so a restore can always be undone
#[tauri::command]
fn backup_restore(core: C<'_>, name: String) -> R<()> {
    let text = pro::read_backup(&core.dir, &name).ok_or("That backup no longer exists.")?;
    let mut back: Db = serde_json::from_str(&text).map_err(|_| "That backup is damaged and can't be restored.".to_string())?;
    core.flush();
    pro::backup_now(&core.dir, &core.file);
    {
        let mut db = core.db.lock().unwrap();
        back.settings.onboarded = true;
        back.caches = std::mem::take(&mut db.caches);
        *db = back;
    }
    pro::log("info", &format!("restored backup {name}"));
    core.mark(); core.notify();
    Ok(())
}
/// writes a problem report to Downloads and shows it in Explorer
#[tauri::command]
fn report_problem(core: C<'_>, text: String) -> R<String> {
    let (games, stores) = {
        let db = core.db.lock().unwrap();
        let mut s: Vec<String> = db.games.iter().filter_map(|g| g.source.clone()).collect();
        s.sort(); s.dedup();
        (db.games.len(), s)
    };
    let body = pro::report(&core.app.package_info().version.to_string(), games, &stores, &text.chars().take(4000).collect::<String>());
    let dl = core.app.path().download_dir().unwrap_or_else(|_| core.dir.clone());
    let path = dl.join(format!("Nightfall-report-{}.txt", chrono::Local::now().format("%Y-%m-%d_%H%M")));
    std::fs::write(&path, body).map_err(|e| e.to_string())?;
    let _ = std::process::Command::new("explorer.exe").arg(format!("/select,{}", path.display())).spawn();
    pro::log("info", "problem report created");
    Ok(path.file_name().unwrap_or_default().to_string_lossy().to_string())
}
/// a new GitHub issue with only the version filled in; you attach the report yourself
#[tauri::command]
fn open_issue(core: C<'_>) {
    let v = core.app.package_info().version.to_string();
    let body = format!("**What happened?**


**What did you expect?**


**Steps to reproduce**
1. 

---
Nightfall {v}. Drag the report file from your Downloads folder here (Settings → Help → Create a report).");
    let url = format!("https://github.com/KYOO-DEVV/nightfall-launcher/issues/new?title={}&body={}", urlencoding::encode("Problem: "), urlencoding::encode(&body));
    let _ = tauri_plugin_opener::open_url(url, None::<&str>);
}
#[tauri::command]
fn open_logs(core: C<'_>) {
    let d = pro::log_dir().unwrap_or_else(|| core.dir.clone());
    let _ = std::process::Command::new("explorer.exe").arg(d).spawn();
}
/// the interface has drawn its first frame
#[tauri::command]
fn app_ready() { pro::log("info", "interface ready"); }

/* ================= start-up ================= */
fn main() {
    let mut builder = tauri::Builder::default();
    // a test copy pointed at its own data folder (NF_USERDATA) may run next to the installed app
    if std::env::var("NF_USERDATA").is_err() { builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app))) }
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
        .setup(|app| {
            let dir = std::env::var("NF_USERDATA").map(PathBuf::from).unwrap_or(app.path().app_data_dir()?);
            std::fs::create_dir_all(&dir)?;
            pro::init_log(&dir);
            pro::log("info", &format!("Nightfall {} starting", app.package_info().version));
            let file = dir.join("library.json");
            let art = dir.join("art");
            let mut db: Db = match std::fs::read_to_string(&file) {
                Err(_) => Db::default(),
                Ok(t) => match serde_json::from_str(&t) {
                    Ok(d) => d,
                    Err(e) => {
                        // a damaged library file is set aside (never overwritten) and the newest backup takes its place
                        pro::log("error", &format!("library.json could not be read ({e}); restoring the newest backup"));
                        let _ = std::fs::copy(&file, dir.join(format!("library.damaged-{}.json", now_ms())));
                        pro::list(&dir).iter().find_map(|(n, _, _)| pro::read_backup(&dir, n).and_then(|t| serde_json::from_str(&t).ok())).unwrap_or_default()
                    }
                },
            };
            pro::daily_backup(&dir, &file);
            migrate(&mut db, &art);
            // people who used Nightfall before the welcome existed skip it (they still get What's new)
            if !db.settings.onboarded && !db.games.is_empty() { db.settings.onboarded = true }
            // close sessions left open by a crash / shutdown at their last confirmed moment
            for g in db.games.iter_mut() { if let Some(o) = g.open.take() { if o.last - o.s >= MIN_SESSION_MS { g.sessions.push(Session { s: o.s, e: o.last }) } } }
            let core = Arc::new(Core {
                app: app.handle().clone(), db: Mutex::new(db), dirty: AtomicBool::new(true), file, art,
                update: Mutex::new(json!({ "state": "idle" })), pending: Mutex::new(None), presence: presence::Presence::start(),
                owned: Mutex::new(None), last_scan: Mutex::new(vec![]), test_until: Mutex::new(0), friends: Mutex::new(None),
                sem: tokio::sync::Semaphore::new(3), auto_at: Mutex::new(now_ms() + 20_000), profile_dir: dir.join("profile"), dir: dir.clone(),
                owned_busy: AtomicBool::new(false),
            });
            { let oc = core.db.lock().unwrap().owned_cache.clone(); *core.owned.lock().unwrap() = oc; }
            // let the webview load this library's art wherever the data folder lives
            let _ = app.asset_protocol_scope().allow_directory(&core.art, true);
            let _ = std::fs::create_dir_all(&core.profile_dir);
            let _ = app.asset_protocol_scope().allow_directory(&core.profile_dir, true);
            let _ = app.asset_protocol_scope().allow_directory(scan::steam_root().join("config").join("avatarcache"), false);
            app.manage(core.clone());
            core.flush();
            pro::daily_backup(&core.dir, &core.file);
            build_tray(app.handle(), core.clone())?;
            if !std::env::args().any(|a| a == "--hidden") { show_main(app.handle()) }

            // save loop
            let c = core.clone();
            tauri::async_runtime::spawn(async move {
                let mut n = 0u32;
                loop {
                    tokio::time::sleep(Duration::from_secs(2)).await;
                    if c.dirty.load(Ordering::Relaxed) { c.flush() }
                    n += 1; if n % 1800 == 0 { pro::daily_backup(&c.dir, &c.file) } // about once an hour
                }
            });
            tracker(core.clone());
            // re-fetch art for games added offline, and once for games from 1.x so they get the newest sources
            let ids: Vec<String> = {
                let mut db = core.db.lock().unwrap();
                // art_rev 5: sharp icons, store covers kept over Wikipedia's, tidier names ("Roblox Player" → "Roblox")
                db.games.iter_mut().filter(|g| g.status == "offline" || g.status == "searching" || g.art_rev < 5)
                    .map(|g| { if g.art_rev < 5 { g.name = art::clean_title(&g.name) } g.art_rev = 5; g.id.clone() }).collect()
            };
            for id in ids { queue_enrich(core.clone(), id, false) }
            // updates: shortly after start, then every 6 hours
            let c = core.clone();
            tauri::async_runtime::spawn(async move { tokio::time::sleep(Duration::from_secs(8)).await; loop { let _ = check_update(c.clone()).await; tokio::time::sleep(Duration::from_secs(6 * 3600)).await; } });
            // owned libraries in the background; newly installed Steam / Epic games join by themselves
            let c = core.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_secs(6)).await;
                refresh_owned(&c, false).await;
                c.notify();
                loop {
                    tokio::time::sleep(Duration::from_secs(15)).await;
                    if now_ms() < *c.auto_at.lock().unwrap() { continue }
                    *c.auto_at.lock().unwrap() = now_ms() + 10 * 60_000;
                    if !c.db.lock().unwrap().settings.auto_add_installed { continue }
                    let items = tokio::task::spawn_blocking(scan::scan_all).await.unwrap_or_default();
                    let pick: Vec<scan::Item> = {
                        let db = c.db.lock().unwrap();
                        items.into_iter().filter(|it| (it.source == "steam" || it.source == "epic") && !already_in(&db, it)
                            && !db.ignored.iter().any(|x| x.exe == lc(&it.exe) || (it.appid.is_some() && x.appid == it.appid))).collect()
                    };
                    if !pick.is_empty() { connect_items(&c, pick); }
                }
            });
            Ok(())
        })
        .on_window_event(|w, ev| {
            if let WindowEvent::CloseRequested { api, .. } = ev {
                if w.label() != "main" { return } // the session widget just closes
                let core = w.app_handle().state::<Arc<Core>>().inner().clone();
                if core.db.lock().unwrap().settings.close_to_tray { api.prevent_close(); let _ = w.hide(); } else { quit(&core) }
            }
        })
        .invoke_handler(tauri::generate_handler![
            lib_get, lib_add_dialog, lib_add_paths, lib_scan, lib_connect, game_launch, game_update, game_remove, game_show_file,
            art_search, art_apply, art_refetch, art_custom, stats_screenshots, app_settings, app_set, presence_test, details_get,
            col_create, col_rename, col_delete, col_toggle, owned_get, owned_open, friends_get, save_card, update_check, update_install, open_link, image_data,
            news_get, downloads_get, store_info_get, profile_set, profile_pick, profile_clear,
            log_write, backups_list, backup_create, backup_restore, report_problem, open_issue, open_logs, app_ready,
            pins_order, achievements_get, game_screenshots, os_notify, widget_close, trailer_find
        ])
        .run(tauri::generate_context!())
        .expect("error while running Nightfall");
}
