//! News for a game, live store downloads, and store pages for games you own but haven't installed.
use crate::scan::steam_libs;
use crate::util::*;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::Mutex;

/* =================== news =================== */
#[derive(Serialize, Clone, Default, Debug)]
pub struct News {
    pub title: String,
    pub date: i64,
    pub url: Option<String>,
    pub image: Option<String>,
    /// banner, update, event, notice, news
    pub tag: String,
    pub body: String,
}
#[derive(Serialize, Clone, Default, Debug)]
pub struct NewsFeed {
    pub source: String,
    pub items: Vec<News>,
    /// big picture for the top of the panel (current banner / featured)
    pub banner: Option<News>,
    /// e.g. "Next version expected around 17 Dec" (an estimate, labelled as such)
    pub next: Option<String>,
}

static NEWS_CACHE: Lazy<Mutex<HashMap<String, (i64, NewsFeed)>>> = Lazy::new(|| Mutex::new(HashMap::new()));

fn tag_for(title: &str) -> String {
    let t = title.to_lowercase();
    if Regex::new(r"warp|wish|signal search|banner|gacha|limited.*(character|agent)").unwrap().is_match(&t) { return "banner".into() }
    if Regex::new(r"character (trailer|demo|teaser|preview)|new (character|agent|champion)|agent (reveal|trailer)|gameplay reveal").unwrap().is_match(&t) { return "character".into() }
    if Regex::new(r"version|update|patch|maintenance|preview|release notes").unwrap().is_match(&t) { return "update".into() }
    if Regex::new(r"event|festival|season|battle pass|live").unwrap().is_match(&t) { return "event".into() }
    "news".into()
}

/// which feed a game uses
pub fn news_key(name: &str, appid: Option<i64>) -> Option<String> {
    let n = norm(name);
    let hoyo = [("honkaistarrail", "hkrpg"), ("starrail", "hkrpg"), ("genshinimpact", "hk4e"), ("genshin", "hk4e"), ("zenlesszonezero", "nap"), ("zzz", "nap"), ("honkaiimpact3rd", "bh3"), ("honkaiimpact3", "bh3")];
    for (k, biz) in hoyo { if n.contains(k) { return Some(format!("hoyo:{}", biz)) } }
    if n.contains("fortnite") { return Some("fortnite".into()) }
    if n == "valorant" { return Some("riot:valorant".into()) }
    if n.contains("leagueoflegends") { return Some("riot:lol".into()) }
    appid.map(|a| format!("steam:{}", a))
}

async fn hoyo_news(biz: &str) -> R<NewsFeed> {
    let base = "https://sg-hyp-api.hoyoverse.com/hyp/hyp-connect/api";
    let games = get_json(&format!("{}/getGames?launcher_id=VYTpXlbWo8&language=en-us", base)).await?;
    let id = games["data"]["games"].as_array().and_then(|a| a.iter().find(|g| g["biz"].as_str().map(|b| b.starts_with(biz)).unwrap_or(false))).and_then(|g| g["id"].as_str()).ok_or("game not found")?.to_string();
    let c = get_json(&format!("{}/getGameContent?launcher_id=VYTpXlbWo8&game_id={}&language=en-us", base, id)).await?;
    let content = &c["data"]["content"];
    let year = chrono::Local::now().format("%Y").to_string().parse::<i32>().unwrap_or(2026);
    // posts only carry MM/DD: newest first, so step the year back when the month jumps up
    let mut items = vec![];
    let (mut y, mut prev_m) = (year, 13u32);
    for p in content["posts"].as_array().cloned().unwrap_or_default() {
        let title = p["title"].as_str().unwrap_or("").replace(" | Honkai: Star Rail", "").replace(" | Genshin Impact", "").replace(" | Zenless Zone Zero", "").trim().to_string();
        if title.is_empty() { continue }
        let d = p["date"].as_str().unwrap_or("");
        let (m, day) = d.split_once('/').map(|(a, b)| (a.parse::<u32>().unwrap_or(1), b.parse::<u32>().unwrap_or(1))).unwrap_or((1, 1));
        if m > prev_m + 1 { y -= 1 }
        prev_m = m;
        let date = chrono::NaiveDate::from_ymd_opt(y, m, day).and_then(|d| d.and_hms_opt(12, 0, 0)).map(|d| d.and_utc().timestamp_millis()).unwrap_or(0);
        let kind = p["type"].as_str().unwrap_or("");
        let mut tag = tag_for(&title);
        if tag == "news" && kind == "POST_TYPE_ACTIVITY" { tag = "event".into() }
        if tag == "news" && kind == "POST_TYPE_ANNOUNCE" { tag = "notice".into() }
        items.push(News { title, date, url: p["link"].as_str().map(String::from), image: None, tag, body: String::new() });
    }
    items.sort_by_key(|n| -n.date);
    let banner = content["banners"].as_array().and_then(|b| b.first()).map(|b| News {
        title: "Featured".into(), image: b["image"]["url"].as_str().map(String::from), url: b["image"]["link"].as_str().map(String::from), tag: "banner".into(), ..Default::default()
    });
    // HoYoverse ships a new version about every 6 weeks: estimate the next from the newest version post
    let ver = Regex::new(r"(?i)version\s*(\d+)\.(\d+)").unwrap();
    let release_post = Regex::new(r"(?i)preview|update details|maintenance|now available|is live").unwrap();
    let next = items.iter().filter(|n| n.tag == "update" && release_post.is_match(&n.title)).filter_map(|n| ver.captures(&n.title).map(|c| (c[1].parse::<i64>().unwrap_or(0) * 100 + c[2].parse::<i64>().unwrap_or(0), n.date, n.title.to_lowercase().contains("preview")))).max_by_key(|x| (x.0, x.1)).and_then(|(v, date, preview)| {
        // a "preview" goes out ~10 days before that version; "update details" on release day
        let release = if preview { date + 10 * 86_400_000 } else { date };
        let mut nxt = release;
        while nxt < now_ms() { nxt += 42 * 86_400_000 }
        let (maj, min) = (v / 100, v % 100);
        let label = if nxt == release { format!("Version {}.{}", maj, min) } else { format!("Version {}.{}", maj, min + 1) };
        chrono::DateTime::from_timestamp_millis(nxt).map(|d| format!("{} expected around {} (estimate: versions come every 6 weeks)", label, d.format("%-d %b")))
    });
    Ok(NewsFeed { source: "HoYoverse".into(), items, banner, next })
}
async fn fortnite_news() -> R<NewsFeed> {
    let j = get_json("https://fortnite-api.com/v2/news/br?language=en").await?;
    let items: Vec<News> = j["data"]["motds"].as_array().cloned().unwrap_or_default().iter().map(|m| News {
        title: m["title"].as_str().unwrap_or("").to_string(), body: m["body"].as_str().unwrap_or("").to_string(), image: m["tileImage"].as_str().or(m["image"].as_str()).map(String::from),
        date: 0, tag: "news".into(), url: None,
    }).filter(|n| !n.title.is_empty()).collect();
    let banner = items.first().cloned();
    Ok(NewsFeed { source: "Fortnite".into(), items, banner, next: None })
}
/// playvalorant.com / leagueoflegends.com list pages embed their articles as JSON
async fn riot_news(site: &str) -> R<NewsFeed> {
    let (url, base, src) = if site == "lol" { ("https://www.leagueoflegends.com/en-us/news/", "https://www.leagueoflegends.com", "League of Legends") } else { ("https://playvalorant.com/en-us/news/", "https://playvalorant.com", "VALORANT") };
    let html = HTTP.get(url).header("User-Agent", "Mozilla/5.0").send().await.map_err(|e| e.to_string())?.text().await.map_err(|e| e.to_string())?;
    let js = Regex::new(r#"(?s)<script id="__NEXT_DATA__"[^>]*>(.*?)</script>"#).unwrap().captures(&html).map(|c| c[1].to_string()).ok_or("no data")?;
    let v: Value = serde_json::from_str(&js).map_err(|e| e.to_string())?;
    let mut items = vec![];
    fn walk(v: &Value, base: &str, out: &mut Vec<News>) {
        match v {
            Value::Object(o) => {
                if let (Some(t), Some(d)) = (o.get("title").and_then(|x| x.as_str()), o.get("publishedAt").and_then(|x| x.as_str())) {
                    let url = o.get("action").and_then(|a| a["payload"]["url"].as_str()).map(|u| if u.starts_with("http") { u.to_string() } else { format!("{}{}", base, u) });
                    let image = o.get("media").and_then(|m| m["url"].as_str()).map(String::from);
                    let cat = o.get("category").and_then(|c| c["title"].as_str()).unwrap_or("").to_string();
                    let date = chrono::DateTime::parse_from_rfc3339(d).map(|x| x.timestamp_millis()).unwrap_or(0);
                    let tag = if cat.to_lowercase().contains("update") { "update".to_string() } else { tag_for(t) };
                    out.push(News { title: t.to_string(), date, url, image, tag, body: cat });
                    return;
                }
                for x in o.values() { walk(x, base, out) }
            }
            Value::Array(a) => for x in a { walk(x, base, out) },
            _ => {}
        }
    }
    walk(&v, base, &mut items);
    let mut seen = std::collections::HashSet::new();
    items.retain(|n| seen.insert(n.title.clone()));
    items.sort_by_key(|n| -n.date);
    items.truncate(20);
    let banner = items.iter().find(|n| n.image.is_some()).cloned();
    Ok(NewsFeed { source: src.into(), items, banner, next: None })
}
async fn steam_news(appid: &str) -> R<NewsFeed> {
    let j = get_json(&format!("https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid={}&count=15&maxlength=300&feeds=steam_community_announcements", appid)).await?;
    let img = Regex::new(r"\{STEAM_CLAN_IMAGE\}([^\s\[\]]+\.(?:png|jpg|jpeg|gif|webp))").unwrap();
    let img2 = Regex::new(r#"(https://[^\s"\[\]]+\.(?:png|jpg|jpeg|webp))"#).unwrap();
    let strip = Regex::new(r"\[[^\]]*\]|\{STEAM_CLAN_IMAGE\}\S+|<[^>]*>").unwrap();
    let items: Vec<News> = j["appnews"]["newsitems"].as_array().cloned().unwrap_or_default().iter().map(|n| {
        let c = n["contents"].as_str().unwrap_or("");
        let image = img.captures(c).map(|x| format!("https://clan.akamai.steamstatic.com/images/{}", &x[1])).or(img2.captures(c).map(|x| x[1].to_string()));
        let title = n["title"].as_str().unwrap_or("").to_string();
        News { tag: tag_for(&title), title, date: n["date"].as_i64().unwrap_or(0) * 1000, url: n["url"].as_str().map(String::from), image, body: strip.replace_all(c, " ").split_whitespace().collect::<Vec<_>>().join(" ") }
    }).collect();
    let mut seen = std::collections::HashSet::new();
    let items: Vec<News> = items.into_iter().filter(|n| seen.insert(n.title.clone())).collect();
    let banner = items.iter().find(|n| n.image.is_some()).cloned();
    Ok(NewsFeed { source: "Steam".into(), items, banner, next: None })
}
pub async fn news(key: &str) -> R<NewsFeed> {
    if let Some((t, f)) = NEWS_CACHE.lock().unwrap().get(key).cloned() { if now_ms() - t < 30 * 60_000 { return Ok(f) } }
    let f = if let Some(b) = key.strip_prefix("hoyo:") { hoyo_news(b).await? }
        else if key == "fortnite" { fortnite_news().await? }
        else if let Some(s) = key.strip_prefix("riot:") { riot_news(s).await? }
        else if let Some(a) = key.strip_prefix("steam:") { steam_news(a).await? }
        else { return Err("no news".into()) };
    NEWS_CACHE.lock().unwrap().insert(key.to_string(), (now_ms(), f.clone()));
    Ok(f)
}
/// links the news panel may open
pub fn allowed_news_link(u: &str) -> bool {
    Regex::new(r"^https://(hoyo\.link/\w+|youtu\.be/[\w-]+|www\.youtube\.com/watch\?v=[\w-]+|[\w.-]*hoyoverse\.com/[\w/?=&.%#-]*|[\w.-]*hoyolab\.com/[\w/?=&.%#-]*|playvalorant\.com/[\w/-]*|www\.leagueoflegends\.com/[\w/-]*|store\.steampowered\.com/news/[\w/?=&.-]*|steamstore-a\.akamaihd\.net/news/[\w/?=&.-]*|steamcommunity\.com/(games|app)/[\w/?=&.-]*|www\.fortnite\.com/[\w/?=&.-]*)$").unwrap().is_match(u)
}

/* =================== downloads in progress =================== */
#[derive(Serialize, Clone, Default, Debug)]
pub struct Download {
    pub store: String,
    pub key: String,
    pub appid: Option<i64>,
    pub name: String,
    pub done: u64,
    pub total: u64,
    /// bytes per second, averaged over the last samples
    pub rate: f64,
    pub state: String,
}
static SAMPLES: Lazy<Mutex<HashMap<String, Vec<(i64, u64)>>>> = Lazy::new(|| Mutex::new(HashMap::new()));
fn acf_field(t: &str, k: &str) -> Option<String> {
    Regex::new(&format!(r#"(?i)"{}"\s+"([^"]*)""#, k)).ok()?.captures(t).map(|c| c[1].to_string())
}
fn dir_size(p: &Path, budget: &mut u32) -> u64 {
    let mut n = 0;
    for e in fs::read_dir(p).into_iter().flatten().flatten() {
        if *budget == 0 { break }
        *budget -= 1;
        match e.file_type() {
            Ok(t) if t.is_dir() => n += dir_size(&e.path(), budget),
            Ok(_) => n += e.metadata().map(|m| m.len()).unwrap_or(0),
            _ => {}
        }
    }
    n
}
pub fn downloads() -> Vec<Download> {
    let mut out = vec![];
    // Steam: appmanifests of apps that aren't fully installed carry live byte counts
    for lib in steam_libs() {
        for e in fs::read_dir(lib.join("steamapps")).into_iter().flatten().flatten() {
            let f = e.file_name().to_string_lossy().to_string();
            if !f.starts_with("appmanifest_") || !f.ends_with(".acf") { continue }
            let Ok(t) = fs::read_to_string(e.path()) else { continue };
            let flags: u32 = acf_field(&t, "StateFlags").and_then(|x| x.parse().ok()).unwrap_or(4);
            let to_dl: u64 = acf_field(&t, "BytesToDownload").and_then(|x| x.parse().ok()).unwrap_or(0);
            let dl: u64 = acf_field(&t, "BytesDownloaded").and_then(|x| x.parse().ok()).unwrap_or(0);
            let to_st: u64 = acf_field(&t, "BytesToStage").and_then(|x| x.parse().ok()).unwrap_or(0);
            let st: u64 = acf_field(&t, "BytesStaged").and_then(|x| x.parse().ok()).unwrap_or(0);
            if flags == 4 || (to_dl == 0 && to_st == 0) || (dl >= to_dl && st >= to_st) { continue }
            let appid: i64 = acf_field(&t, "appid").and_then(|x| x.parse().ok()).unwrap_or(0);
            // flag 1024 = update running, 512 = suspended / queued
            let state = if flags & 1024 != 0 || flags & 1048576 != 0 { "downloading" } else if flags & 512 != 0 { "paused" } else { "queued" };
            out.push(Download { store: "steam".into(), key: format!("steam:{}", appid), appid: Some(appid), name: acf_field(&t, "name").unwrap_or_default(),
                done: if to_dl > 0 { dl } else { st }, total: if to_dl > 0 { to_dl } else { to_st }, state: state.into(), ..Default::default() });
        }
    }
    // Epic: installs in progress have a Pending manifest; count what's been written so far
    let pend = program_data().join("Epic").join("EpicGamesLauncher").join("Data").join("Manifests").join("Pending");
    for e in fs::read_dir(&pend).into_iter().flatten().flatten() {
        let Ok(t) = fs::read_to_string(e.path()) else { continue };
        let Ok(v) = serde_json::from_str::<Value>(&t) else { continue };
        let loc = v["InstallLocation"].as_str().unwrap_or("");
        if loc.is_empty() { continue }
        let mut budget = 60_000u32;
        let done = dir_size(Path::new(loc), &mut budget);
        let total = v["InstallSize"].as_u64().unwrap_or(0);
        out.push(Download { store: "epic".into(), key: format!("epic:{}", v["CatalogNamespace"].as_str().unwrap_or("")), name: v["DisplayName"].as_str().unwrap_or("").to_string(),
            done, total, state: "downloading".into(), ..Default::default() });
    }
    // speed from the last ~10 seconds of samples
    let now = now_ms();
    let mut s = SAMPLES.lock().unwrap();
    s.retain(|k, _| out.iter().any(|d| &d.key == k));
    for d in out.iter_mut() {
        let v = s.entry(d.key.clone()).or_default();
        v.push((now, d.done));
        v.retain(|x| now - x.0 <= 12_000);
        if let (Some(a), Some(b)) = (v.first(), v.last()) { if b.0 > a.0 && b.1 >= a.1 { d.rate = (b.1 - a.1) as f64 * 1000.0 / (b.0 - a.0) as f64 } }
        if d.state == "queued" && d.rate > 0.0 { d.state = "downloading".into() }
        // no bytes for a while: Steam / Epic paused it or it's waiting (disk, network, another download)
        let span = v.last().map(|x| x.0).unwrap_or(now) - v.first().map(|x| x.0).unwrap_or(now);
        if d.state == "downloading" && d.rate == 0.0 && span >= 8000 { d.state = "paused".into() }
    }
    out
}

/* =================== store pages for games you don't have installed =================== */
static INFO_CACHE: Lazy<Mutex<HashMap<String, Value>>> = Lazy::new(|| Mutex::new(HashMap::new()));
pub async fn store_info(store: &str, id: &str, appid: Option<i64>) -> Value {
    let key = format!("{}:{}", store, id);
    if let Some(v) = INFO_CACHE.lock().unwrap().get(&key).cloned() { return v }
    let mut v = json!({});
    if let Some(a) = appid {
        if let Ok(j) = get_json(&format!("https://store.steampowered.com/api/appdetails?appids={}&l=english", a)).await {
            let d = &j[a.to_string()]["data"];
            let strip = Regex::new(r"<[^>]*>").unwrap();
            v = json!({
                "desc": d["short_description"].as_str().map(|s| strip.replace_all(s, "").replace("&quot;", "\"").replace("&amp;", "&")),
                "developers": d["developers"], "publishers": d["publishers"],
                "genres": d["genres"].as_array().map(|g| g.iter().filter_map(|x| x["description"].as_str()).collect::<Vec<_>>()),
                "released": d["release_date"]["date"], "free": d["is_free"],
                "price": d["price_overview"]["final_formatted"],
                "metacritic": d["metacritic"]["score"],
                "screens": d["screenshots"].as_array().map(|s| s.iter().take(8).filter_map(|x| x["path_thumbnail"].as_str()).collect::<Vec<_>>()),
                "size": d["pc_requirements"]["minimum"].as_str().and_then(|r| Regex::new(r"(\d+)\s*GB").unwrap().captures(r).map(|c| format!("{} GB", &c[1]))),
            });
        }
    } else if store == "epic" {
        // the Epic launcher's own catalog cache has the description and developer
        let f = program_data().join("Epic").join("EpicGamesLauncher").join("Data").join("Catalog").join("catcache.bin");
        let ns = id.trim_start_matches("epic:").to_string();
        let found = tokio::task::spawn_blocking(move || -> Option<Value> {
            use base64::Engine;
            let raw = fs::read_to_string(&f).ok()?;
            let bytes = base64::engine::general_purpose::STANDARD.decode(raw.trim()).ok()?;
            let items: Vec<Value> = serde_json::from_slice(&bytes).ok()?;
            items.into_iter().find(|i| i["namespace"].as_str() == Some(ns.as_str()) && i["categories"].as_array().map(|c| c.iter().any(|x| x["path"] == "games")).unwrap_or(false))
        }).await.ok().flatten();
        if let Some(i) = found {
            let shots: Vec<String> = i["keyImages"].as_array().cloned().unwrap_or_default().iter().filter(|k| k["type"].as_str().map(|t| t.contains("Screenshot") || t == "featuredMedia").unwrap_or(false)).filter_map(|k| k["url"].as_str().map(String::from)).take(8).collect();
            v = json!({ "desc": i["description"], "developers": [i["developer"]], "screens": shots, "released": Value::Null });
        }
    }
    INFO_CACHE.lock().unwrap().insert(key, v.clone());
    v
}
