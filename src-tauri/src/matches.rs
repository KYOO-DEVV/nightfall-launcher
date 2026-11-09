//! Matches read from Fortnite's and Valorant's own log files (no account, no API key).
//! Both games overwrite their logs, so every match seen is kept in the library.
use crate::store::GameMatch;
use crate::util::*;
use once_cell::sync::Lazy;
use regex::Regex;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const LIVE_MS: i64 = 3 * 60 * 1000;
static TS: Lazy<Regex> = Lazy::new(|| Regex::new(r"^\[(\d{4})\.(\d\d)\.(\d\d)-(\d\d)\.(\d\d)\.(\d\d):(\d{3})\]").unwrap());

/// Unreal log lines start with a UTC timestamp: [2026.11.09-04.56.21:721]
fn ts_of(line: &str) -> Option<i64> {
    let c = TS.captures(line)?;
    let n = |i: usize| c[i].parse::<u32>().ok();
    let d = chrono::NaiveDate::from_ymd_opt(c[1].parse().ok()?, n(2)?, n(3)?)?.and_hms_milli_opt(n(4)?, n(5)?, n(6)?, n(7)?)?;
    Some(d.and_utc().timestamp_millis())
}
fn mtime(p: &Path) -> i64 {
    fs::metadata(p).ok().and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as i64).unwrap_or(0)
}
fn logs(dir: &Path, prefix: &str) -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = fs::read_dir(dir).into_iter().flatten().flatten().map(|e| e.path())
        .filter(|p| p.file_name().map(|f| { let f = f.to_string_lossy().to_lowercase(); f.starts_with(prefix) && f.ends_with(".log") }).unwrap_or(false)).collect();
    v.sort_by_key(|p| mtime(p));
    v
}
/// parse each file once per (size, mtime)
static FILE_CACHE: Lazy<Mutex<HashMap<PathBuf, (String, Vec<GameMatch>)>>> = Lazy::new(|| Mutex::new(HashMap::new()));
fn cached(p: &Path, parse: fn(&str, bool) -> Vec<GameMatch>) -> Vec<GameMatch> {
    let m = mtime(p);
    let len = fs::metadata(p).map(|x| x.len()).unwrap_or(0);
    let live = now_ms() - m < LIVE_MS;
    let key = format!("{}:{}:{}", len, m, live);
    let mut c = FILE_CACHE.lock().unwrap();
    if let Some((k, v)) = c.get(p) { if *k == key { return v.clone() } }
    let text = fs::read(p).map(|b| String::from_utf8_lossy(&b).to_string()).unwrap_or_default();
    let v = parse(&text, live);
    c.insert(p.to_path_buf(), (key, v.clone()));
    v
}
/// merge freshly parsed matches into the saved history (same start = same match)
fn merge(saved: &mut Vec<GameMatch>, fresh: Vec<GameMatch>) {
    for s in saved.iter_mut() { s.live = false }
    for f in fresh {
        if let Some(x) = saved.iter_mut().find(|x| (x.s - f.s).abs() < 5000) { *x = f } else { saved.push(f) }
    }
    saved.sort_by_key(|m| m.s);
    let n = saved.len();
    if n > 2000 { saved.drain(0..n - 2000); }
}

/* =================== Fortnite =================== */
static FN_START: Lazy<Regex> = Lazy::new(|| Regex::new(r"Welcomed by server \(Level: ([^,?)]+)").unwrap());
static FN_PLAYLIST: Lazy<Regex> = Lazy::new(|| Regex::new(r"PlaylistName is (Playlist_\w+)").unwrap());
static FN_RICH: Lazy<Regex> = Lazy::new(|| Regex::new(r"RichText=\[([^\]]*)\]").unwrap());
static FN_LEFT: Lazy<Regex> = Lazy::new(|| Regex::new(r"^(.*?)\s+-\s+(\d+)\s+\S+\s*$").unwrap());
static FN_LINK: Lazy<Regex> = Lazy::new(|| Regex::new(r"Link id changing from .* to \[Mnemonic=\[([^\]]+)\]").unwrap());
static FN_END: Lazy<Regex> = Lazy::new(|| Regex::new(r"LoadMap: /Game/Maps/Frontend|Browse: /Game/Maps/Frontend\?closed").unwrap());

/// Playlist_NoBuildBR_Squad → No Build BR Squad
fn pretty_playlist(p: &str) -> String {
    let p = p.trim_start_matches("Playlist_").replace('_', " ");
    let mut out = String::new();
    let ch: Vec<char> = p.chars().collect();
    for (i, c) in ch.iter().enumerate() {
        if i > 0 && c.is_uppercase() && ch[i - 1].is_lowercase() { out.push(' ') }
        out.push(*c);
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}
fn parse_fortnite(text: &str, live: bool) -> Vec<GameMatch> {
    let mut out = vec![];
    let mut cur: Option<(GameMatch, Option<String>, Option<i64>)> = None; // match, playlist, fewest players seen
    let mut link = String::new();
    let mut last = 0i64;
    let finish = |m: (GameMatch, Option<String>, Option<i64>), e: i64, link: &str, out: &mut Vec<GameMatch>| {
        let (mut g, pl, left) = m;
        g.e = e;
        if g.title.is_empty() { g.title = pl.as_deref().map(pretty_playlist).unwrap_or_else(|| if link.is_empty() { "Fortnite".into() } else { link.to_string() }) }
        if g.sub.is_empty() { g.sub = pl.as_deref().map(pretty_playlist).filter(|p| *p != g.title).unwrap_or_default() }
        g.result = if g.win == Some(true) { "Victory Royale".into() } else if let Some(n) = left { format!("{} players left", n) } else { String::new() };
        if g.e - g.s >= 60_000 || g.live { out.push(g) }
    };
    for line in text.lines() {
        let Some(ts) = ts_of(line) else { continue };
        last = ts;
        if let Some(c) = FN_LINK.captures(line) { link = c[1].to_string(); continue }
        if line.contains("Welcomed by server") {
            if let Some(m) = cur.take() { finish(m, ts, &link, &mut out) }
            let level = FN_START.captures(line).map(|c| c[1].to_string()).unwrap_or_default();
            cur = Some((GameMatch { s: ts, map: Some(level), ..Default::default() }, None, None));
            continue;
        }
        let Some(m) = cur.as_mut() else { continue };
        if let Some(c) = FN_PLAYLIST.captures(line) { m.1 = Some(c[1].to_string()); continue }
        if let Some(c) = FN_RICH.captures(line) {
            let r = c[1].trim();
            if r.is_empty() { continue }
            if let Some(x) = FN_LEFT.captures(r) {
                m.0.title = x[1].trim().to_string();
                let n: i64 = x[2].parse().unwrap_or(0);
                if n > 0 { m.2 = Some(m.2.map(|o| o.min(n)).unwrap_or(n)) }
            } else if m.0.title.is_empty() || m.0.title == "Battle Royale" { m.0.title = r.to_string() }
            continue;
        }
        if line.contains("GetLocalPlayerHasWinningPlacement 1") { m.0.win = Some(true); continue }
        if FN_END.is_match(line) { let m = cur.take().unwrap(); finish(m, ts, &link, &mut out) }
    }
    if let Some(mut m) = cur { m.0.live = live; finish(m, if live { now_ms() } else { last }, &link, &mut out) }
    for g in out.iter_mut() { if g.win.is_none() && !g.live { g.win = Some(false) } }
    out
}
pub fn fortnite(saved: &mut Vec<GameMatch>) {
    let dir = local_appdata().join("FortniteGame").join("Saved").join("Logs");
    let mut fresh = vec![];
    for p in logs(&dir, "fortnitegame") { fresh.extend(cached(&p, parse_fortnite)) }
    merge(saved, fresh);
}

/* =================== Valorant =================== */
static VL_LOCK: Lazy<Regex> = Lazy::new(|| Regex::new(r"pregame/v1/matches/([0-9a-f-]{36})/lock/([0-9a-f-]{36})").unwrap());
static VL_MODE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(\w+?)_GameMode_PrimaryAsset_C").unwrap());
static VL_MAP: Lazy<Regex> = Lazy::new(|| Regex::new(r"Map Name: (\w+) \| Changed: TRUE").unwrap());
static VL_ROUND: Lazy<Regex> = Lazy::new(|| Regex::new(r"OnRoundEnded for round '(\d+)'").unwrap());
static VL_END: Lazy<Regex> = Lazy::new(|| Regex::new(r"Match Ended: Completion State: '(\w+)'\. Winning Team: '(\w+)'").unwrap());
const VL_MENUS: &[&str] = &["MainMenuV2", "MainMenu", "Init", "CharacterSelectPersistentLevel", "Entry", "Range", "RangeV2"];

fn parse_valorant(text: &str, live: bool) -> Vec<GameMatch> {
    let mut out = vec![];
    let (mut agent, mut mode) = (None::<String>, None::<String>);
    let mut cur: Option<GameMatch> = None;
    let mut last = 0i64;
    for line in text.lines() {
        let Some(ts) = ts_of(line) else { continue };
        last = ts;
        if let Some(c) = VL_LOCK.captures(line) { agent = Some(c[2].to_string()); mode = None; continue }
        if let Some(c) = VL_MODE.captures(line) { mode = Some(c[1].to_string()); continue }
        if let Some(c) = VL_MAP.captures(line) {
            let map = c[1].to_string();
            if VL_MENUS.contains(&map.as_str()) {
                if map.starts_with("MainMenu") { if let Some(mut m) = cur.take() { m.e = ts; if m.result.is_empty() { m.result = "Left early".into() } out.push(m) } }
                continue;
            }
            if cur.as_ref().map(|m| m.map.as_deref() == Some(map.as_str())).unwrap_or(false) { continue }
            if let Some(mut m) = cur.take() { m.e = ts; out.push(m) }
            cur = Some(GameMatch { s: ts, map: Some(map), agent: agent.clone(), sub: mode.clone().unwrap_or_default(), ..Default::default() });
            continue;
        }
        let Some(m) = cur.as_mut() else { continue };
        if let Some(c) = VL_ROUND.captures(line) { m.rounds = m.rounds.max(c[1].parse::<i64>().unwrap_or(0) + 1); continue }
        if let Some(c) = VL_END.captures(line) {
            m.e = ts;
            m.result = if &c[1] == "Completed" { format!("{} rounds", m.rounds) } else { c[1].to_string() };
            let m = cur.take().unwrap();
            out.push(m);
            agent = None;
        }
    }
    if let Some(mut m) = cur { m.live = live; m.e = if live { now_ms() } else { last }; out.push(m) }
    out.retain(|m| m.e - m.s >= 60_000 || m.live);
    out
}

/// map / agent names and pictures from valorant-api.com (public, no key)
static VL_META: Lazy<Mutex<Option<(i64, HashMap<String, (String, Option<String>)>, HashMap<String, (String, Option<String>)>)>>> = Lazy::new(|| Mutex::new(None));
async fn valorant_meta() -> (HashMap<String, (String, Option<String>)>, HashMap<String, (String, Option<String>)>) {
    if let Some((t, m, a)) = VL_META.lock().unwrap().clone() { if now_ms() - t < 86_400_000 { return (m, a) } }
    let mut maps = HashMap::new();
    let mut agents = HashMap::new();
    if let Ok(j) = get_json("https://valorant-api.com/v1/maps").await {
        for m in j["data"].as_array().cloned().unwrap_or_default() {
            let key = m["mapUrl"].as_str().unwrap_or("").rsplit('/').next().unwrap_or("").to_string();
            if key.is_empty() { continue }
            maps.insert(key, (m["displayName"].as_str().unwrap_or("").to_string(), m["listViewIcon"].as_str().or(m["splash"].as_str()).map(String::from)));
        }
    }
    if let Ok(j) = get_json("https://valorant-api.com/v1/agents?isPlayableCharacter=true").await {
        for a in j["data"].as_array().cloned().unwrap_or_default() {
            agents.insert(a["uuid"].as_str().unwrap_or("").to_lowercase(), (a["displayName"].as_str().unwrap_or("").to_string(), a["displayIcon"].as_str().map(String::from)));
        }
    }
    if !maps.is_empty() { *VL_META.lock().unwrap() = Some((now_ms(), maps.clone(), agents.clone())) }
    (maps, agents)
}
fn pretty_mode(m: &str) -> String {
    match m.to_lowercase().as_str() {
        "swiftplay" => "Swiftplay".into(), "quickbomb" => "Spike Rush".into(), "deathmatch" => "Deathmatch".into(), "hurm" => "Team Deathmatch".into(),
        "ggteam" => "Escalation".into(), "onefa" => "Replication".into(), "snowball" => "Snowball Fight".into(), "" => String::new(), x => x.to_string(),
    }
}
pub async fn valorant(saved: &mut Vec<GameMatch>) {
    let dir = local_appdata().join("VALORANT").join("Saved").join("Logs");
    let fresh: Vec<GameMatch> = tokio::task::spawn_blocking(move || { let mut v = vec![]; for p in logs(&dir, "shootergame") { v.extend(cached(&p, parse_valorant)) } v }).await.unwrap_or_default();
    let (maps, agents) = valorant_meta().await;
    let fresh = fresh.into_iter().map(|mut m| {
        let key = m.map.clone().unwrap_or_default();
        let (mname, mimg) = maps.get(&key).cloned().unwrap_or((key.clone(), None));
        let ag = m.agent.as_ref().and_then(|a| agents.get(&a.to_lowercase())).cloned();
        let mode = pretty_mode(&m.sub);
        let mode = if mode.is_empty() { if m.rounds >= 13 { "Unrated / Competitive".into() } else { String::new() } } else { mode };
        m.title = mname;
        m.thumb = mimg;
        m.sub = [ag.as_ref().map(|x| x.0.clone()).unwrap_or_default(), mode].into_iter().filter(|x| !x.is_empty()).collect::<Vec<_>>().join(" · ");
        m.icon = ag.and_then(|x| x.1);
        m
    }).collect();
    merge(saved, fresh);
}
pub fn fortnite_blocking(saved: Vec<GameMatch>) -> Vec<GameMatch> { let mut s = saved; fortnite(&mut s); s }
