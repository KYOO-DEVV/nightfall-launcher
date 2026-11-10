//! Player features read from this PC: Steam achievements, screenshots per game, daily limits and the weekly recap.
use crate::store::{Game, Session};
use chrono::{Datelike, Local, TimeZone};
use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};

// ---------------- Steam binary KeyValues (appcache/stats/...bin) ----------------
pub fn kv_parse(b: &[u8]) -> Value {
    fn read(b: &[u8], i: &mut usize) -> Option<Value> {
        let mut out = Map::new();
        while *i < b.len() {
            let t = b[*i];
            *i += 1;
            if t == 8 { return Some(Value::Object(out)) }
            let end = b[*i..].iter().position(|&c| c == 0)? + *i;
            let k = String::from_utf8_lossy(&b[*i..end]).to_string();
            *i = end + 1;
            let v = match t {
                0 => read(b, i)?,
                1 => { let e = b[*i..].iter().position(|&c| c == 0)? + *i; let s = String::from_utf8_lossy(&b[*i..e]).to_string(); *i = e + 1; json!(s) }
                2 | 4 | 6 => { let v = i32::from_le_bytes(b.get(*i..*i + 4)?.try_into().ok()?); *i += 4; json!(v) }
                3 => { let v = f32::from_le_bytes(b.get(*i..*i + 4)?.try_into().ok()?); *i += 4; json!(v) }
                7 => { let v = u64::from_le_bytes(b.get(*i..*i + 8)?.try_into().ok()?); *i += 8; json!(v) }
                _ => return None,
            };
            out.insert(k, v);
        }
        Some(Value::Object(out))
    }
    let mut i = 0;
    read(b, &mut i).unwrap_or(Value::Null)
}

/// achievements of a Steam game from Steam's own cache: no internet, no API key
pub fn achievements(steam_root: &Path, account_id: &str, appid: i64, french: bool) -> Option<Value> {
    let dir = steam_root.join("appcache").join("stats");
    let schema = kv_parse(&std::fs::read(dir.join(format!("UserGameStatsSchema_{appid}.bin"))).ok()?);
    let user = std::fs::read(dir.join(format!("UserGameStats_{account_id}_{appid}.bin"))).ok().map(|b| kv_parse(&b)).unwrap_or(Value::Null);
    Some(achievements_from(&schema, &user, appid, french))
}
pub fn achievements_from(schema: &Value, user: &Value, appid: i64, french: bool) -> Value {
    let stats = schema.as_object().and_then(|o| o.values().next()).and_then(|v| v.get("stats")).and_then(|v| v.as_object()).cloned().unwrap_or_default();
    let mine = user.get("cache").cloned().unwrap_or(Value::Null);
    let lang = |v: &Value| -> String {
        if french { if let Some(s) = v.get("french").and_then(|x| x.as_str()) { return s.to_string() } }
        v.get("english").and_then(|x| x.as_str()).or_else(|| v.as_str()).unwrap_or("").to_string()
    };
    let icon = |f: Option<&str>| f.filter(|s| !s.is_empty()).map(|f| format!("https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/{appid}/{f}"));
    let mut list = vec![];
    for (sid, st) in &stats {
        let Some(bits) = st.get("bits").and_then(|b| b.as_object()) else { continue };
        let data = mine.get(sid).and_then(|s| s.get("data")).and_then(|d| d.as_i64()).unwrap_or(0) as u32;
        for (bit, a) in bits {
            let Ok(n) = bit.parse::<u32>() else { continue };
            let on = n < 32 && data & (1 << n) != 0;
            let at = mine.get(sid).and_then(|s| s.get("AchievementTimes")).and_then(|t| t.get(bit)).and_then(|x| x.as_i64()).map(|t| t * 1000);
            let d = a.get("display").cloned().unwrap_or(Value::Null);
            let hidden = d.get("hidden").and_then(|h| h.as_i64().or_else(|| h.as_str().and_then(|s| s.parse().ok()))).unwrap_or(0) == 1;
            list.push(json!({
                "name": lang(&d["name"]), "desc": if hidden && !on { String::new() } else { lang(&d["desc"]) }, "hidden": hidden,
                "icon": if on { icon(d["icon"].as_str()) } else { icon(d["icon_gray"].as_str()).or(icon(d["icon"].as_str())) },
                "on": on, "at": at,
            }));
        }
    }
    // unlocked first (newest first), then the rest in the game's order
    list.sort_by(|a, b| b["on"].as_bool().cmp(&a["on"].as_bool()).then(b["at"].as_i64().cmp(&a["at"].as_i64())));
    let unlocked = list.iter().filter(|a| a["on"].as_bool() == Some(true)).count();
    json!({ "total": list.len(), "unlocked": unlocked, "list": list.into_iter().take(300).collect::<Vec<_>>() })
}

/* ---------------- screenshots of one game ---------------- */
fn is_image(p: &Path) -> bool { matches!(p.extension().map(|x| x.to_string_lossy().to_lowercase()).as_deref(), Some("png" | "jpg" | "jpeg" | "webp")) }
fn mtime(p: &Path) -> i64 { std::fs::metadata(p).and_then(|m| m.modified()).ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as i64).unwrap_or(0) }
fn simple(s: &str) -> String { s.to_lowercase().chars().filter(|c| c.is_alphanumeric()).collect() }
/// (folder to allow, image files newest first): Steam, Xbox Game Bar and NVIDIA captures
pub fn screenshots(g: &Game, steam_root: &Path, videos: &Path) -> (Vec<PathBuf>, Vec<(PathBuf, i64)>) {
    let mut dirs = vec![];
    let mut files: Vec<(PathBuf, i64)> = vec![];
    let key = simple(&g.name);
    if let Some(appid) = g.appid {
        for u in std::fs::read_dir(steam_root.join("userdata")).into_iter().flatten().flatten() {
            let d = u.path().join("760").join("remote").join(appid.to_string()).join("screenshots");
            if d.is_dir() { dirs.push(d) }
        }
    }
    // Game Bar names files "<Game> <date>.png"; NVIDIA keeps a folder per game
    let caps = videos.join("Captures");
    if caps.is_dir() && key.len() >= 3 {
        let mut any = false;
        for e in std::fs::read_dir(&caps).into_iter().flatten().flatten() {
            let n = simple(&e.file_name().to_string_lossy());
            if n.starts_with(&key) && is_image(&e.path()) { files.push((e.path(), mtime(&e.path()))); any = true; }
        }
        if any { dirs.push(caps.clone()) }
    }
    for e in std::fs::read_dir(videos).into_iter().flatten().flatten() {
        if e.path().is_dir() && simple(&e.file_name().to_string_lossy()) == key && key.len() >= 3 { dirs.push(e.path()) }
    }
    for d in &dirs {
        if *d == caps { continue }
        for e in std::fs::read_dir(d).into_iter().flatten().flatten() { if is_image(&e.path()) { files.push((e.path(), mtime(&e.path()))) } }
    }
    files.sort_by(|a, b| b.1.cmp(&a.1));
    files.dedup_by(|a, b| a.0 == b.0);
    files.truncate(60);
    (dirs, files)
}

/* ---------------- time helpers ---------------- */
pub fn local_midnight(now: i64) -> i64 {
    let d = Local.timestamp_millis_opt(now).single().unwrap_or_else(Local::now).date_naive();
    Local.from_local_datetime(&d.and_hms_opt(0, 0, 0).unwrap()).earliest().map(|t| t.timestamp_millis()).unwrap_or(now - now % 86_400_000)
}
/// play time between a and b, counting the session that's still open
pub fn played_between(g: &Game, a: i64, b: i64, now: i64) -> i64 {
    let mut spans: Vec<Session> = g.sessions.clone();
    if let Some(o) = &g.open { spans.push(Session { s: o.s, e: now }) }
    spans.iter().map(|s| (s.e.min(b) - s.s.max(a)).max(0)).sum()
}
pub fn iso_week(now: i64) -> String {
    let d = Local.timestamp_millis_opt(now).single().unwrap_or_else(Local::now);
    let w = d.iso_week();
    format!("{}-W{:02}", w.year(), w.week())
}
/// Monday 00:00 of the week before the one `now` is in
pub fn last_week_range(now: i64) -> (i64, i64) {
    let m = local_midnight(now);
    let d = Local.timestamp_millis_opt(m).single().unwrap_or_else(Local::now);
    let this_monday = m - d.weekday().num_days_from_monday() as i64 * 86_400_000;
    (this_monday - 7 * 86_400_000, this_monday)
}
pub fn hm(ms: i64) -> String {
    let m = ms / 60_000;
    if m < 60 { format!("{m} min") } else if m % 60 == 0 || m >= 600 { format!("{} h", m / 60) } else { format!("{} h {:02}", m / 60, m % 60) }
}
/// "12 h played last week, mostly Fortnite" (or None when nothing was played)
pub fn recap(games: &[Game], now: i64, french: bool) -> Option<(String, String)> {
    let (a, b) = last_week_range(now);
    let mut per: Vec<(&str, i64)> = games.iter().map(|g| (g.name.as_str(), played_between(g, a, b, now))).filter(|x| x.1 >= 60_000).collect();
    if per.is_empty() { return None }
    per.sort_by(|x, y| y.1.cmp(&x.1));
    let total: i64 = per.iter().map(|x| x.1).sum();
    Some(if french {
        ("Ta semaine de jeu".into(), format!("{} de jeu la semaine dernière, surtout sur {} ({}). {} jeu{} au total.", hm(total), per[0].0, hm(per[0].1), per.len(), if per.len() > 1 { "x" } else { "" }))
    } else {
        ("Your week in games".into(), format!("{} played last week, mostly {} ({}). {} game{} in total.", hm(total), per[0].0, hm(per[0].1), per.len(), if per.len() > 1 { "s" } else { "" }))
    })
}
/// split "-windowed -dx11 \"C:\\a b\"" into arguments
pub fn split_args(s: &str) -> Vec<String> {
    let mut out = vec![];
    let mut cur = String::new();
    let mut q = false;
    for c in s.chars() {
        match c { '"' => q = !q, ' ' if !q => { if !cur.is_empty() { out.push(std::mem::take(&mut cur)) } } _ => cur.push(c) }
    }
    if !cur.is_empty() { out.push(cur) }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    fn kv_string(k: &str, v: &str) -> Vec<u8> { let mut b = vec![1]; b.extend(k.as_bytes()); b.push(0); b.extend(v.as_bytes()); b.push(0); b }
    fn kv_int(k: &str, v: i32) -> Vec<u8> { let mut b = vec![2]; b.extend(k.as_bytes()); b.push(0); b.extend(v.to_le_bytes()); b }
    fn kv_obj(k: &str, inner: Vec<u8>) -> Vec<u8> { let mut b = vec![0]; b.extend(k.as_bytes()); b.push(0); b.extend(inner); b.push(8); b }

    #[test]
    fn parses_binary_kv() {
        let mut b = kv_obj("root", [kv_string("name", "Nightfall"), kv_int("n", 42)].concat());
        b.push(8);
        let v = kv_parse(&b);
        assert_eq!(v["root"]["name"], "Nightfall");
        assert_eq!(v["root"]["n"], 42);
    }
    #[test]
    fn counts_unlocked_achievements_from_bits() {
        let ach = |name: &str| kv_obj("display", kv_obj("name", [kv_string("english", name), kv_string("french", &format!("{name} FR"))].concat()));
        let schema_b = kv_obj("10", kv_obj("stats", kv_obj("1", [kv_obj("bits", [kv_obj("0", ach("A")), kv_obj("1", ach("B")), kv_obj("2", ach("C"))].concat()), kv_string("type", "ACHIEVEMENTS")].concat())));
        let user_b = kv_obj("cache", kv_obj("1", [kv_int("data", 0b101), kv_obj("AchievementTimes", [kv_int("0", 100), kv_int("2", 200)].concat())].concat()));
        let r = achievements_from(&kv_parse(&[schema_b, vec![8]].concat()), &kv_parse(&[user_b, vec![8]].concat()), 10, true);
        assert_eq!(r["total"], 3);
        assert_eq!(r["unlocked"], 2);
        assert_eq!(r["list"][0]["name"], "C FR"); // newest unlock first
        assert_eq!(r["list"][2]["on"], false);
    }
    #[test]
    fn play_time_is_clipped_to_the_range() {
        let g = Game { sessions: vec![Session { s: 0, e: 100 }, Session { s: 150, e: 400 }], ..Default::default() };
        assert_eq!(played_between(&g, 50, 200, 1000), 50 + 50);
    }
    #[test]
    fn open_session_counts_until_now() {
        let g = Game { open: Some(crate::store::Open { s: 500, last: 600 }), ..Default::default() };
        assert_eq!(played_between(&g, 0, i64::MAX, 900), 400);
    }
    #[test]
    fn week_ranges_are_seven_days() {
        let now = Local::now().timestamp_millis();
        let (a, b) = last_week_range(now);
        assert!((b - a - 7 * 86_400_000).abs() <= 3_600_000); // DST can move it by an hour
        assert!(b <= now && now - b < 8 * 86_400_000);
    }
    #[test]
    fn splits_launch_arguments() {
        assert_eq!(split_args(r#"-windowed  -dx11 "C:\My Games\cfg.ini""#), vec!["-windowed", "-dx11", r"C:\My Games\cfg.ini"]);
    }
    #[test]
    fn formats_durations() {
        assert_eq!(hm(45 * 60_000), "45 min");
        assert_eq!(hm(90 * 60_000), "1 h 30");
        assert_eq!(hm(12 * 3_600_000), "12 h");
    }
}
