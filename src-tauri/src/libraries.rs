//! Games you own on each store, read from what the store apps already keep on this PC.
//! No password or API key; installs are handed to the official launcher.
use crate::scan::steam_root;
use crate::store::SteamItem;
use crate::util::*;
use base64::Engine;
use regex::Regex;
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;

#[derive(Serialize, Clone, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Owned {
    pub store: String,
    pub id: String,
    pub appid: Option<i64>,
    pub ns: Option<String>,
    pub name: String,
    pub cover: Option<String>,
    pub hero: Option<String>,
    pub header: Option<String>,
    pub logo: Option<String>,
    pub play_min: i64,
    pub last: i64,
    pub install: String,
    pub run: Option<String>,
    pub page: Option<String>,
    pub game_id: Option<String>,
}

#[derive(Serialize, Clone, Default, Debug)]
pub struct Account { pub store: String, pub name: String, pub id: Option<String>, pub games: usize }

/* ---------------- Steam ---------------- */
pub struct SteamAcct { pub id64: String, pub account_id: String, pub persona: String }
pub fn steam_account() -> Option<SteamAcct> {
    let t = fs::read_to_string(steam_root().join("config").join("loginusers.vdf")).ok()?;
    let block = Regex::new(r#""(\d{17})"\s*\{([^}]*)\}"#).unwrap();
    let mut users = vec![];
    for c in block.captures_iter(&t) {
        let f = |k: &str| Regex::new(&format!(r#"(?i)"{}"\s+"([^"]*)""#, k)).ok().and_then(|r| r.captures(&c[2]).map(|m| m[1].to_string()));
        users.push((c[1].to_string(), f("PersonaName").unwrap_or_default(), f("MostRecent").as_deref() == Some("1"), f("Timestamp").and_then(|x| x.parse::<i64>().ok()).unwrap_or(0)));
    }
    users.sort_by_key(|u| (!u.2, -u.3));
    let (id64, persona, _, _) = users.into_iter().next()?;
    let account_id = (id64.parse::<u64>().ok()? - 76_561_197_960_265_728).to_string();
    Some(SteamAcct { id64, account_id, persona })
}
fn steam_playtime(a: &SteamAcct) -> HashMap<String, (i64, i64)> {
    let t = fs::read_to_string(steam_root().join("userdata").join(&a.account_id).join("config").join("localconfig.vdf")).unwrap_or_default();
    let block = Regex::new(r#""(\d+)"\s*\{([^{}]*?"(?:Playtime|LastPlayed)"[^{}]*)\}"#).unwrap();
    let (pt, lp) = (Regex::new(r#""Playtime"\s+"(\d+)""#).unwrap(), Regex::new(r#""LastPlayed"\s+"(\d+)""#).unwrap());
    let mut out = HashMap::new();
    for c in block.captures_iter(&t) {
        let m = pt.captures(&c[2]).and_then(|x| x[1].parse().ok()).unwrap_or(0);
        let l = lp.captures(&c[2]).and_then(|x| x[1].parse::<i64>().ok()).unwrap_or(0) * 1000;
        out.insert(c[1].to_string(), (m, l));
    }
    out
}
pub async fn steam_items(ids: &[String], cache: &mut HashMap<String, SteamItem>) {
    // re-read after 14 days, and once for entries that still point at the big 2x covers
    let need: Vec<&String> = ids.iter().filter(|id| cache.get(*id).map(|c| now_ms() - c.t > 14 * 86_400_000 || c.cover.as_deref().map(|u| u.contains("_2x")).unwrap_or(false)).unwrap_or(true)).collect();
    for batch in need.chunks(100) {
        let input = serde_json::json!({ "ids": batch.iter().map(|a| serde_json::json!({ "appid": a.parse::<i64>().unwrap_or(0) })).collect::<Vec<_>>(),
            "context": { "language": "english", "country_code": "US" }, "data_request": { "include_basic_info": true, "include_assets": true } });
        let Ok(j) = get_json(&format!("https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json={}", urlencoding::encode(&input.to_string()))).await else { break };
        for it in j["response"]["store_items"].as_array().cloned().unwrap_or_default() {
            let Some(appid) = it["appid"].as_i64() else { continue };
            let a = &it["assets"];
            let url = |f: Option<&str>| -> Option<String> { let fmt = a["asset_url_format"].as_str()?; Some(format!("https://shared.akamai.steamstatic.com/store_item_assets/{}", fmt.replace("${FILENAME}", f?))) };
            cache.insert(appid.to_string(), SteamItem { t: now_ms(), name: it["name"].as_str().map(String::from), kind: it["type"].as_i64().unwrap_or(-1),
                cover: url(a["library_capsule"].as_str().or(a["library_capsule_2x"].as_str())), hero: url(a["library_hero_2x"].as_str().or(a["library_hero"].as_str())), header: url(a["header"].as_str()) });
        }
        for id in batch { cache.entry((*id).clone()).or_insert(SteamItem { t: now_ms(), kind: -1, ..Default::default() }); }
    }
}
async fn steam(cache: &mut HashMap<String, SteamItem>) -> (Option<Account>, Vec<Owned>) {
    let Some(acct) = steam_account() else { return (None, vec![]) };
    let mut ids: HashSet<String> = HashSet::new();
    // the Steam client caches art for every app in your library
    if let Ok(rd) = fs::read_dir(steam_root().join("appcache").join("librarycache")) {
        let lead = Regex::new(r"^(\d+)").unwrap();
        for e in rd.flatten() { if let Some(c) = lead.captures(&e.file_name().to_string_lossy()) { ids.insert(c[1].to_string()); } }
    }
    let play = steam_playtime(&acct);
    ids.extend(play.keys().cloned());
    let ids: Vec<String> = ids.into_iter().collect();
    steam_items(&ids, cache).await;
    let games: Vec<Owned> = ids.iter().filter_map(|id| {
        let c = cache.get(id)?;
        if c.kind != 0 { return None } // 0 = game (skips tools, DLC, soundtracks)
        let (pm, last) = play.get(id).cloned().unwrap_or((0, 0));
        Some(Owned { store: "steam".into(), id: format!("steam:{}", id), appid: id.parse().ok(), name: c.name.clone()?, cover: c.cover.clone(), hero: c.hero.clone(), header: c.header.clone(),
            play_min: pm, last, install: format!("steam://install/{}", id), run: Some(format!("steam://rungameid/{}", id)), page: Some(format!("https://store.steampowered.com/app/{}", id)), ..Default::default() })
    }).collect();
    (Some(Account { store: "steam".into(), name: acct.persona, id: Some(acct.id64), games: games.len() }), games)
}

/* ---------------- Epic ---------------- */
fn epic() -> (Option<Account>, Vec<Owned>) {
    let f = program_data().join("Epic").join("EpicGamesLauncher").join("Data").join("Catalog").join("catcache.bin");
    let Ok(raw) = fs::read_to_string(&f) else { return (None, vec![]) };
    let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(raw.trim()) else { return (None, vec![]) };
    let Ok(items) = serde_json::from_slice::<Vec<Value>>(&bytes) else { return (None, vec![]) };
    let mut seen = HashSet::new();
    let mut games = vec![];
    for i in items {
        let cats: Vec<String> = i["categories"].as_array().cloned().unwrap_or_default().iter().filter_map(|c| c["path"].as_str().map(String::from)).collect();
        if !cats.iter().any(|c| c == "games") || cats.iter().any(|c| c.contains("addons") || c.contains("digitalextras") || c.contains("hidden")) { continue }
        let Some(rel) = i["releaseInfo"].as_array().and_then(|r| r.iter().find(|x| x["platform"].as_array().map(|p| p.iter().any(|y| y == "Windows")).unwrap_or(false)).cloned()) else { continue };
        let (ns, id, app) = (i["namespace"].as_str().unwrap_or(""), i["id"].as_str().unwrap_or(""), rel["appId"].as_str().unwrap_or(""));
        if app.is_empty() || !seen.insert(ns.to_string()) { continue }
        let img = |types: &[&str]| types.iter().find_map(|t| i["keyImages"].as_array().and_then(|k| k.iter().find(|x| x["type"] == *t)).and_then(|x| x["url"].as_str().map(String::from)));
        let base = format!("com.epicgames.launcher://apps/{}%3A{}%3A{}", ns, id, app);
        games.push(Owned { store: "epic".into(), id: format!("epic:{}", ns), ns: Some(ns.into()), name: i["title"].as_str().unwrap_or("").replace('\u{a0}', " ").trim().to_string(),
            cover: img(&["DieselGameBoxTall", "OfferImageTall"]), hero: img(&["DieselGameBox", "OfferImageWide", "Featured"]), header: img(&["DieselGameBoxWide", "OfferImageWide"]), logo: img(&["DieselGameBoxLogo"]),
            install: format!("{}?action=install", base), run: Some(format!("{}?action=launch&silent=true", base)), ..Default::default() });
    }
    let acct = if games.is_empty() { None } else { Some(Account { store: "epic".into(), name: "Epic Games".into(), id: None, games: games.len() }) };
    (acct, games)
}

/* ---------------- GOG Galaxy 2.0 ---------------- */
fn gog() -> (Option<Account>, Vec<Owned>) {
    let db = program_data().join("GOG.com").join("Galaxy").join("storage").join("galaxy-2.0.db");
    if !db.exists() { return (None, vec![]) }
    let Ok(c) = rusqlite::Connection::open_with_flags(&db, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY) else { return (None, vec![]) };
    let sql = "SELECT lr.releaseKey, \
        (SELECT gp.value FROM GamePieces gp JOIN GamePieceTypes t ON t.id = gp.gamePieceTypeId WHERE gp.releaseKey = lr.releaseKey AND t.type = 'title' LIMIT 1), \
        (SELECT gp.value FROM GamePieces gp JOIN GamePieceTypes t ON t.id = gp.gamePieceTypeId WHERE gp.releaseKey = lr.releaseKey AND t.type = 'originalImages' LIMIT 1) \
        FROM LibraryReleases lr WHERE lr.releaseKey LIKE 'gog_%'";
    let mut games = vec![];
    if let Ok(mut st) = c.prepare(sql) {
        let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?, r.get::<_, Option<String>>(2)?)));
        if let Ok(rows) = rows {
            for (key, title, imgs) in rows.flatten() {
                let title: Value = title.and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(Value::Null);
                let imgs: Value = imgs.and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(Value::Null);
                let Some(name) = title["title"].as_str() else { continue };
                games.push(Owned { store: "gog".into(), id: key.clone(), name: name.into(), cover: imgs["verticalCover"].as_str().map(String::from), hero: imgs["background"].as_str().map(String::from),
                    install: format!("goggalaxy://openGameView/{}", key), ..Default::default() });
            }
        }
    }
    let acct = if games.is_empty() { None } else { Some(Account { store: "gog".into(), name: "GOG Galaxy".into(), id: None, games: games.len() }) };
    (acct, games)
}

/* ---------------- Amazon Games ---------------- */
fn amazon() -> (Option<Account>, Vec<Owned>) {
    let db = local_appdata().join("Amazon Games").join("Data").join("Games").join("Sql").join("GameProductInfo.sqlite");
    if !db.exists() { return (None, vec![]) }
    let Ok(c) = rusqlite::Connection::open_with_flags(&db, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY) else { return (None, vec![]) };
    let mut games = vec![];
    if let Ok(mut st) = c.prepare("SELECT ProductIdStr, ProductTitle, ProductIconUrl FROM DbSet") {
        if let Ok(rows) = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?))) {
            for (id, title, icon) in rows.flatten() {
                games.push(Owned { store: "amazon".into(), id: format!("amazon:{}", id), name: title, cover: icon, install: format!("amazon-games://play/{}", id), ..Default::default() });
            }
        }
    }
    let acct = if games.is_empty() { None } else { Some(Account { store: "amazon".into(), name: "Amazon Games".into(), id: None, games: games.len() }) };
    (acct, games)
}

/* ---------------- itch.io ---------------- */
fn itch() -> (Option<Account>, Vec<Owned>) {
    let db = roaming().join("itch").join("db").join("butler.db");
    if !db.exists() { return (None, vec![]) }
    let Ok(c) = rusqlite::Connection::open_with_flags(&db, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY) else { return (None, vec![]) };
    let mut games = vec![];
    if let Ok(mut st) = c.prepare("SELECT DISTINCT g.id, g.title, g.cover_url FROM download_keys dk JOIN games g ON g.id = dk.game_id") {
        if let Ok(rows) = st.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?))) {
            for (id, title, cover) in rows.flatten() {
                games.push(Owned { store: "itch".into(), id: format!("itch:{}", id), name: title, cover, install: format!("itch://games/{}", id), ..Default::default() });
            }
        }
    }
    let acct = if games.is_empty() { None } else { Some(Account { store: "itch".into(), name: "itch.io".into(), id: None, games: games.len() }) };
    (acct, games)
}

pub async fn owned_all(cache: &mut HashMap<String, SteamItem>) -> (Vec<Account>, Vec<Owned>) {
    let (sa, sg) = steam(cache).await;
    let others = tokio::task::spawn_blocking(|| vec![epic(), gog(), amazon(), itch()]).await.unwrap_or_default();
    let mut accounts: Vec<Account> = sa.into_iter().collect();
    let mut games = sg;
    for (a, g) in others { if let Some(a) = a { accounts.push(a) } games.extend(g) }
    games.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    (accounts, games)
}

/// only the stores' own install / launch links and store pages may be opened from the UI
pub fn allowed_store_link(u: &str) -> bool {
    Regex::new(r"^(steam://(install|rungameid)/\d+|com\.epicgames\.launcher://apps/[\w%.-]+\?action=(install|launch)(&silent=true)?|https://store\.steampowered\.com/app/\d+|goggalaxy://openGameView/[\w-]+|amazon-games://play/[\w.-]+|itch://games/\d+)$").unwrap().is_match(u)
}
