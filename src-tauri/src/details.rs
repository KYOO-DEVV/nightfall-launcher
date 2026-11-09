//! Per-game detail from the games' own logs: Roblox experiences, Minecraft instances.
//! History from before Nightfall shows up too.
use crate::store::{Caches, Game, GameMatch, Live, RbxInfo};
use crate::util::*;
use chrono::{Local, TimeZone};
use once_cell::sync::Lazy;
use regex::Regex;
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const LIVE_MS: i64 = 3 * 60 * 1000;

#[derive(Serialize, Clone, Default, Debug)]
pub struct Play { pub s: i64, pub e: i64, pub key: String }

#[derive(Serialize, Clone, Default, Debug)]
pub struct DItem {
    pub key: String, pub name: String, pub sub: String, pub icon: Option<String>, pub thumb: Option<String>,
    pub url: Option<String>, pub ms: i64, pub sessions: i64, pub last: i64, pub live: bool,
}

#[derive(Serialize, Clone, Default, Debug)]
pub struct Details {
    pub kind: String, pub title: String, pub source: String,
    pub items: Vec<DItem>, pub plays: Vec<Play>, pub live: Option<Live>,
    /// newest first; Fortnite / Valorant
    pub matches: Vec<GameMatch>,
    pub stats: Vec<(String, String)>,
}

pub fn kind_of(g: &Game) -> Option<&'static str> {
    let p = g.proc_.to_lowercase();
    if p.contains("robloxplayerbeta") || g.name.to_lowercase().starts_with("roblox") { return Some("roblox") }
    if g.source.as_deref() == Some("minecraft") || p.contains("javaw.exe") { return Some("minecraft") }
    let n = g.name.to_lowercase();
    if p.contains("fortniteclient") || p.contains("fortnitelauncher") || n == "fortnite" { return Some("fortnite") }
    if p.contains("valorant") || n == "valorant" { return Some("valorant") }
    None
}

/* =================== Roblox =================== */
#[derive(Clone, Debug)]
struct Seg { u: String, s: i64, e: Option<i64> }
static RBX_CACHE: Lazy<Mutex<HashMap<PathBuf, (String, Vec<Seg>)>>> = Lazy::new(|| Mutex::new(HashMap::new()));
static JOIN: Lazy<Regex> = Lazy::new(|| Regex::new(r"game_join_loadtime: placeid:(\d+),.*?universeid:(\d+)").unwrap());
static LEAVE: Lazy<Regex> = Lazy::new(|| Regex::new(r"Disconnected from server for reason|\[FLog::Network\] Connection lost").unwrap());

fn parse_roblox(text: &str, live: bool) -> Vec<Seg> {
    let mut segs: Vec<Seg> = vec![];
    let mut cur: Option<Seg> = None;
    let mut last = 0i64;
    for line in text.lines() {
        if !line.starts_with('2') || line.len() < 24 { continue }
        let Ok(ts) = chrono::DateTime::parse_from_rfc3339(&line[..24]) else { continue };
        let ts = ts.timestamp_millis();
        last = ts;
        if let Some(c) = JOIN.captures(line) {
            if cur.as_ref().map(|x| x.u == c[2]).unwrap_or(false) { continue } // teleport inside the same experience
            if let Some(mut x) = cur.take() { x.e = Some(ts); segs.push(x) }
            cur = Some(Seg { u: c[2].to_string(), s: ts, e: None });
            continue;
        }
        if cur.is_some() && LEAVE.is_match(line) {
            let mut x = cur.take().unwrap(); x.e = Some(ts); segs.push(x);
        }
    }
    if let Some(mut x) = cur { x.e = if live { None } else { Some(last) }; segs.push(x) }
    // merge reconnects / teleports of the same experience that are less than 2 minutes apart
    let mut out: Vec<Seg> = vec![];
    for s in segs {
        if let Some(p) = out.last_mut() {
            if p.u == s.u && p.e.map(|e| s.s - e < 120_000).unwrap_or(false) { p.e = s.e; continue }
        }
        out.push(s);
    }
    out.into_iter().filter(|s| s.e.map(|e| e - s.s >= 20_000).unwrap_or(true)).collect()
}
fn roblox_segments() -> Vec<Seg> {
    let dir = local_appdata().join("Roblox").join("logs");
    let now = now_ms();
    let mut all = vec![];
    let Ok(rd) = fs::read_dir(&dir) else { return all };
    let mut cache = RBX_CACHE.lock().unwrap();
    for e in rd.flatten() {
        let f = e.file_name().to_string_lossy().to_lowercase();
        if !f.contains("player") || f.contains("crash") || f.contains("studio") || !f.ends_with(".log") { continue }
        let Ok(meta) = e.metadata() else { continue };
        let mtime = meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as i64).unwrap_or(0);
        let live = now - mtime < LIVE_MS;
        let key = format!("{}:{}:{}", meta.len(), mtime, live);
        let p = e.path();
        if cache.get(&p).map(|c| c.0 != key).unwrap_or(true) {
            let mut text = String::new();
            if let Ok(mut fh) = fs::File::open(&p) { let mut b = vec![]; let _ = fh.read_to_end(&mut b); text = String::from_utf8_lossy(&b).to_string(); }
            cache.insert(p.clone(), (key, parse_roblox(&text, live)));
        }
        all.extend(cache[&p].1.iter().cloned());
    }
    all.sort_by_key(|s| s.s);
    all
}
/// experience names / icons from Roblox's public API
pub async fn resolve_universes(ids: Vec<String>, mut cache: HashMap<String, RbxInfo>) -> HashMap<String, RbxInfo> {
    let mut need: Vec<String> = ids.into_iter().filter(|u| cache.get(u).map(|c| now_ms() - c.t > 7 * 86_400_000).unwrap_or(true)).collect();
    need.sort(); need.dedup();
    for batch in need.chunks(50) {
        let ids = batch.join(",");
        let Ok(g) = get_json(&format!("https://games.roblox.com/v1/games?universeIds={}", ids)).await else { break };
        for x in g["data"].as_array().cloned().unwrap_or_default() {
            let id = x["id"].as_i64().unwrap_or(0).to_string();
            let c = cache.entry(id).or_default();
            c.name = x["name"].as_str().map(String::from);
            c.creator = x["creator"]["name"].as_str().map(String::from);
            c.place = x["rootPlaceId"].as_i64();
            c.t = now_ms();
        }
        if let Ok(ic) = get_json(&format!("https://thumbnails.roblox.com/v1/games/icons?universeIds={}&returnPolicy=PlaceHolder&size=256x256&format=Png&isCircular=false", ids)).await {
            for x in ic["data"].as_array().cloned().unwrap_or_default() {
                if let Some(c) = cache.get_mut(&x["targetId"].as_i64().unwrap_or(0).to_string()) { c.icon = x["imageUrl"].as_str().map(String::from) }
            }
        }
        if let Ok(th) = get_json(&format!("https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds={}&countPerUniverse=1&size=768x432&format=Png", ids)).await {
            for x in th["data"].as_array().cloned().unwrap_or_default() {
                if let Some(c) = cache.get_mut(&x["universeId"].as_i64().unwrap_or(0).to_string()) { c.thumb = x["thumbnails"][0]["imageUrl"].as_str().map(String::from) }
            }
        }
    }
    cache
}
pub async fn roblox_details(rbx: HashMap<String, RbxInfo>) -> (Details, HashMap<String, RbxInfo>) {
    let segs = tokio::task::spawn_blocking(roblox_segments).await.unwrap_or_default();
    let cache = resolve_universes(segs.iter().map(|s| s.u.clone()).collect(), rbx).await;
    let now = now_ms();
    let mut by: HashMap<String, DItem> = HashMap::new();
    for s in &segs {
        let e = s.e.unwrap_or(now);
        let it = by.entry(s.u.clone()).or_insert_with(|| DItem { key: s.u.clone(), ..Default::default() });
        it.ms += e - s.s; it.sessions += 1; it.last = it.last.max(e);
        if s.e.is_none() { it.live = true }
    }
    let mut items: Vec<DItem> = by.into_values().map(|mut it| {
        let c = cache.get(&it.key).cloned().unwrap_or_default();
        it.name = c.name.unwrap_or_else(|| format!("Experience {}", it.key));
        it.sub = c.creator.map(|x| format!("by {}", x)).unwrap_or_default();
        it.icon = c.icon; it.thumb = c.thumb;
        it.url = c.place.map(|p| format!("https://www.roblox.com/games/{}", p));
        it
    }).collect();
    items.sort_by_key(|i| -i.last);
    let live = items.iter().find(|i| i.live).map(|i| Live { name: i.name.clone(), icon: i.icon.clone(), since: segs.iter().find(|s| s.e.is_none()).map(|s| s.s).unwrap_or(now), url: i.url.clone() });
    let plays = segs.iter().map(|s| Play { s: s.s, e: s.e.unwrap_or(now), key: s.u.clone() }).collect();
    (Details { kind: "roblox".into(), title: "Experiences".into(), source: "Roblox's logs".into(), items, plays, live, ..Default::default() }, cache)
}

/* =================== Minecraft =================== */
struct Inst { name: String, dir: PathBuf, launcher: &'static str }
fn instances() -> Vec<Inst> {
    let mut out = vec![];
    let mut add = |name: String, dir: PathBuf, launcher: &'static str| { if dir.join("logs").exists() { out.push(Inst { name, dir, launcher }) } };
    let list = |root: &Path| -> Vec<String> { fs::read_dir(root).map(|rd| rd.flatten().filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false)).map(|e| e.file_name().to_string_lossy().to_string()).collect()).unwrap_or_default() };
    let r = roaming();
    for n in list(&r.join("ModrinthApp").join("profiles")) { add(n.clone(), r.join("ModrinthApp").join("profiles").join(&n), "Modrinth") }
    for n in list(&r.join("PrismLauncher").join("instances")) {
        let base = r.join("PrismLauncher").join("instances").join(&n);
        let d = if base.join(".minecraft").exists() { base.join(".minecraft") } else { base.join("minecraft") };
        add(n, d, "Prism");
    }
    let cf = home().join("curseforge").join("minecraft").join("Instances");
    for n in list(&cf) { add(n.clone(), cf.join(&n), "CurseForge") }
    add("Minecraft (default)".into(), r.join(".minecraft"), "Minecraft Launcher");
    out
}
static TIME: Lazy<Regex> = Lazy::new(|| Regex::new(r"^\[(\d\d):(\d\d):(\d\d)").unwrap());
static SERVER: Lazy<Regex> = Lazy::new(|| Regex::new(r"Connecting to ([^,\s]+),").unwrap());
static GZ: Lazy<Regex> = Lazy::new(|| Regex::new(r"^(\d{4})-(\d\d)-(\d\d)-\d+\.log\.gz$").unwrap());
fn local_midnight(y: i32, m: u32, d: u32) -> i64 {
    Local.with_ymd_and_hms(y, m, d, 0, 0, 0).single().map(|t| t.timestamp_millis()).unwrap_or(0)
}
/// first / last [HH:MM:SS] of a log; a session that crosses midnight wraps to the next day
fn span_of(text: &str, day: i64) -> Option<serde_json::Value> {
    let (mut first, mut last) = (None::<i64>, 0i64);
    let mut servers: Vec<String> = vec![];
    let mut single = false;
    for line in text.lines() {
        let Some(c) = TIME.captures(line) else { continue };
        let t = c[1].parse::<i64>().ok()? * 3600 + c[2].parse::<i64>().ok()? * 60 + c[3].parse::<i64>().ok()?;
        if first.is_none() { first = Some(t) }
        last = t;
        if let Some(s) = SERVER.captures(line) { let s = s[1].to_string(); if !servers.contains(&s) { servers.push(s) } }
        if line.contains("Starting integrated minecraft server") { single = true }
    }
    let first = first?;
    let s = day + first * 1000;
    let mut e = day + last * 1000;
    if e < s { e += 86_400_000 }
    Some(serde_json::json!({ "s": s, "e": e, "servers": servers, "single": single }))
}
pub fn minecraft_details(cache: &mut HashMap<String, serde_json::Value>) -> Details {
    let now = now_ms();
    let mut plays: Vec<Play> = vec![];
    let mut items: Vec<DItem> = vec![];
    let mut live_since = None;
    for inst in instances() {
        let logs = inst.dir.join("logs");
        let key = inst.dir.to_string_lossy().to_string();
        let mut it = DItem { key: key.clone(), name: inst.name.clone(), sub: inst.launcher.into(), ..Default::default() };
        let mut servers: HashMap<String, i64> = HashMap::new();
        let Ok(rd) = fs::read_dir(&logs) else { continue };
        for e in rd.flatten() {
            let f = e.file_name().to_string_lossy().to_string();
            let p = e.path().to_string_lossy().to_string();
            let mut span: Option<serde_json::Value> = None;
            let mut is_live = false;
            if let Some(c) = GZ.captures(&f) {
                if let Some(v) = cache.get(&p) { if v.is_object() { span = Some(v.clone()) } }
                else {
                    let day = local_midnight(c[1].parse().unwrap_or(1970), c[2].parse().unwrap_or(1), c[3].parse().unwrap_or(1));
                    let mut text = String::new();
                    if let Ok(fh) = fs::File::open(&p) { let _ = flate2::read::GzDecoder::new(fh).read_to_string(&mut text); }
                    span = span_of(&text, day);
                    cache.insert(p.clone(), span.clone().unwrap_or(serde_json::json!(0))); // gz logs never change
                }
            } else if f == "latest.log" {
                let Ok(meta) = e.metadata() else { continue };
                let mtime = meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as i64).unwrap_or(0);
                let text = fs::read(&p).map(|b| String::from_utf8_lossy(&b).to_string()).unwrap_or_default();
                let dt = Local.timestamp_millis_opt(mtime).single().unwrap_or_else(Local::now);
                let day = local_midnight(dt.format("%Y").to_string().parse().unwrap_or(1970), dt.format("%m").to_string().parse().unwrap_or(1), dt.format("%d").to_string().parse().unwrap_or(1));
                span = span_of(&text, day);
                if let Some(sp) = span.as_mut() {
                    if sp["e"].as_i64().unwrap_or(0) > mtime + 60_000 { sp["s"] = (sp["s"].as_i64().unwrap_or(0) - 86_400_000).into(); sp["e"] = (sp["e"].as_i64().unwrap_or(0) - 86_400_000).into(); }
                    if now - mtime < LIVE_MS { sp["e"] = now.into(); is_live = true; }
                }
            } else { continue }
            let Some(sp) = span else { continue };
            let (s, e2) = (sp["s"].as_i64().unwrap_or(0), sp["e"].as_i64().unwrap_or(0));
            if e2 - s < 60_000 { continue }
            if plays.iter().any(|x| x.key == key && (x.s - s).abs() < 5000) { continue }
            plays.push(Play { s, e: e2, key: key.clone() });
            it.ms += e2 - s; it.sessions += 1; it.last = it.last.max(e2);
            if is_live { it.live = true; live_since = Some(s) }
            for sv in sp["servers"].as_array().cloned().unwrap_or_default() { *servers.entry(sv.as_str().unwrap_or("").to_string()).or_default() += 1 }
            if sp["single"].as_bool() == Some(true) { *servers.entry("Singleplayer".into()).or_default() += 1 }
        }
        if it.sessions > 0 {
            if let Some((top, _)) = servers.iter().max_by_key(|x| *x.1) { it.sub = format!("{} · mostly {}", inst.launcher, top) }
            items.push(it);
        }
    }
    items.sort_by_key(|i| -i.last);
    let live = items.iter().find(|i| i.live).map(|i| Live { name: i.name.clone(), icon: None, since: live_since.unwrap_or(now), url: None });
    Details { kind: "minecraft".into(), title: "Instances".into(), source: "Minecraft logs".into(), items, plays, live, ..Default::default() }
}

/// details for a game; caches are passed in and handed back so the library lock isn't held across network calls
pub async fn details_for(g: &Game, caches: Caches) -> (Option<Details>, Caches) {
    let mut caches = caches;
    match kind_of(g) {
        Some("roblox") => {
            let (d, rbx) = roblox_details(caches.rbx.clone()).await;
            caches.rbx = rbx;
            (Some(d), caches)
        }
        Some("minecraft") => {
            let mut mc = caches.mc.clone();
            let (d, mc) = tokio::task::spawn_blocking(move || { let d = minecraft_details(&mut mc); (d, mc) }).await.unwrap_or_default();
            caches.mc = mc;
            (Some(d), caches)
        }
        Some("fortnite") => {
            let saved = caches.fortnite.clone();
            caches.fortnite = tokio::task::spawn_blocking(move || crate::matches::fortnite_blocking(saved)).await.unwrap_or_default();
            (Some(from_matches("fortnite", "Modes you played", "Fortnite's logs", &caches.fortnite)), caches)
        }
        Some("valorant") => {
            crate::matches::valorant(&mut caches.valorant).await;
            (Some(from_matches("valorant", "Maps you played", "Valorant's logs", &caches.valorant)), caches)
        }
        _ => (None, caches),
    }
}

/// matches → grouped items (mode / map), plays and headline stats
fn from_matches(kind: &str, title: &str, source: &str, ms: &[GameMatch]) -> Details {
    let now = now_ms();
    let mut by: HashMap<String, DItem> = HashMap::new();
    let mut wins: HashMap<String, i64> = HashMap::new();
    for m in ms {
        let e = if m.live { now } else { m.e };
        let it = by.entry(m.title.clone()).or_insert_with(|| DItem { key: m.title.clone(), name: m.title.clone(), icon: m.thumb.clone(), ..Default::default() });
        it.ms += e - m.s; it.sessions += 1; it.last = it.last.max(e);
        if m.live { it.live = true }
        if m.win == Some(true) { *wins.entry(m.title.clone()).or_default() += 1 }
    }
    let mut items: Vec<DItem> = by.into_values().map(|mut it| {
        let w = wins.get(&it.key).cloned().unwrap_or(0);
        if kind == "fortnite" && w > 0 { it.sub = format!("{} {}", w, if w == 1 { "Victory Royale" } else { "Victory Royales" }) }
        it
    }).collect();
    items.sort_by_key(|i| -i.ms);
    let plays = ms.iter().map(|m| Play { s: m.s, e: if m.live { now } else { m.e }, key: m.title.clone() }).collect();
    let live = ms.iter().rev().find(|m| m.live).map(|m| Live { name: if m.sub.is_empty() { m.title.clone() } else { format!("{} · {}", m.title, m.sub) }, icon: m.icon.clone().or(m.thumb.clone()), since: m.s, url: None });
    let mut matches: Vec<GameMatch> = ms.to_vec();
    matches.reverse();
    matches.truncate(60);
    let n = ms.len() as i64;
    let mut stats = vec![("Matches".to_string(), n.to_string())];
    if kind == "fortnite" {
        let w = ms.iter().filter(|m| m.win == Some(true)).count();
        stats.push(("Victory Royales".into(), w.to_string()));
        stats.push(("Win rate".into(), if n > 0 { format!("{}%", (w as f64 / n as f64 * 100.0).round()) } else { "—".into() }));
    } else {
        let mut agents: HashMap<String, i64> = HashMap::new();
        for m in ms { if let Some(a) = m.sub.split(" · ").next().filter(|a| !a.is_empty()) { *agents.entry(a.to_string()).or_default() += 1 } }
        let rounds: i64 = ms.iter().map(|m| m.rounds).sum();
        stats.push(("Rounds".into(), rounds.to_string()));
        stats.push(("Main agent".into(), agents.into_iter().max_by_key(|x| x.1).map(|x| x.0).unwrap_or_else(|| "—".into())));
    }
    Details { kind: kind.into(), title: title.into(), source: source.into(), items, plays, live, matches, stats }
}
