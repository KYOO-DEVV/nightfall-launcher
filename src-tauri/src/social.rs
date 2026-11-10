//! Steam friends playing now. Works with no setup: the friend list comes from the Steam client on this PC,
//! and each friend's status / game from their public Steam mini-profile. A Web API key is optional (faster, exact).
use crate::libraries::steam_account;
use crate::scan::steam_root;
use crate::util::*;
use futures::stream::{self, StreamExt};
use once_cell::sync::Lazy;
use regex::Regex;
use serde::Serialize;

#[derive(Serialize, Clone, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Friend {
    pub id: String,
    pub name: String,
    pub avatar: Option<String>,
    pub state: String,
    pub game: Option<String>,
    /// what they're doing in the game (Steam rich presence), when shared
    pub detail: Option<String>,
    pub game_id: Option<String>,
    pub cover: Option<String>,
    pub profile: Option<String>,
    pub last_off: i64,
}

const ID_BASE: u64 = 76_561_197_960_265_728;

/* ---------- a tiny VDF reader (Steam's text config format) ---------- */
#[derive(Debug, Clone)]
pub enum Vdf { S(String), M(Vec<(String, Vdf)>) }
impl Vdf {
    pub fn get(&self, k: &str) -> Option<&Vdf> { if let Vdf::M(v) = self { v.iter().find(|(x, _)| x.eq_ignore_ascii_case(k)).map(|(_, v)| v) } else { None } }
    pub fn str(&self) -> Option<&str> { if let Vdf::S(s) = self { Some(s) } else { None } }
}
pub fn parse_vdf(t: &str) -> Vdf {
    fn tokens(t: &str) -> Vec<String> {
        let mut out = vec![];
        let mut it = t.chars().peekable();
        while let Some(c) = it.next() {
            match c {
                '"' => { let mut s = String::new(); while let Some(c) = it.next() { if c == '\\' { if let Some(n) = it.next() { s.push(n) } } else if c == '"' { break } else { s.push(c) } } out.push(format!("\"{}", s)) }
                '{' | '}' => out.push(c.to_string()),
                '/' if it.peek() == Some(&'/') => { while let Some(c) = it.next() { if c == '\n' { break } } }
                _ => {}
            }
        }
        out
    }
    fn block(tk: &[String], i: &mut usize) -> Vdf {
        let mut v = vec![];
        while *i < tk.len() {
            let t = &tk[*i];
            if t == "}" { *i += 1; break }
            let key = t.trim_start_matches('"').to_string();
            *i += 1;
            if *i >= tk.len() { break }
            if tk[*i] == "{" { *i += 1; v.push((key, block(tk, i))) } else { v.push((key, Vdf::S(tk[*i].trim_start_matches('"').to_string()))); *i += 1 }
        }
        Vdf::M(v)
    }
    let tk = tokens(t);
    let mut i = 0;
    block(&tk, &mut i)
}

/// friends the Steam client knows about, from userdata/<you>/config/localconfig.vdf
fn local_friends(account_id: &str) -> Vec<(String, String, Option<String>)> {
    let Ok(t) = std::fs::read_to_string(steam_root().join("userdata").join(account_id).join("config").join("localconfig.vdf")) else { return vec![] };
    let v = parse_vdf(&t);
    let root = v.get("UserLocalConfigStore").unwrap_or(&v);
    let Some(Vdf::M(fr)) = root.get("friends") else { return vec![] };
    fr.iter().filter_map(|(k, x)| {
        if !k.chars().all(|c| c.is_ascii_digit()) || k == account_id { return None }
        let name = x.get("name").and_then(|n| n.str()).or_else(|| x.get("NameHistory").and_then(|h| h.get("0")).and_then(|n| n.str()))?.to_string();
        let avatar = x.get("avatar").and_then(|a| a.str()).filter(|a| a.len() == 40 && !a.starts_with("0000")).map(|a| format!("https://avatars.steamstatic.com/{}_medium.jpg", a));
        Some((k.clone(), name, avatar))
    }).collect()
}

static PERSONA: Lazy<Regex> = Lazy::new(|| Regex::new(r#"class="persona ([\w-]+)"[^>]*>\s*([^<]*)"#).unwrap());
static GAME: Lazy<Regex> = Lazy::new(|| Regex::new(r#"class="miniprofile_game_name"[^>]*>\s*([^<]+)"#).unwrap());
static RICH: Lazy<Regex> = Lazy::new(|| Regex::new(r#"class="rich_presence"[^>]*>\s*([^<]+)"#).unwrap());
static LOGO: Lazy<Regex> = Lazy::new(|| Regex::new(r#"class="game_logo"[^>]*src="([^"]+)"|src="([^"]+)"[^>]*class="game_logo""#).unwrap());
static APPID: Lazy<Regex> = Lazy::new(|| Regex::new(r"/apps/(\d+)/").unwrap());

fn unescape(s: &str) -> String { s.replace("&amp;", "&").replace("&#39;", "'").replace("&quot;", "\"").replace("&lt;", "<").replace("&gt;", ">").trim().to_string() }

async fn mini(account_id: String, name: String, avatar: Option<String>) -> Friend {
    let id64 = account_id.parse::<u64>().map(|a| (a + ID_BASE).to_string()).unwrap_or_default();
    let mut f = Friend { id: id64.clone(), name, avatar, state: "offline".into(), profile: Some(format!("https://steamcommunity.com/profiles/{}", id64)), ..Default::default() };
    let Ok(r) = HTTP.get(format!("https://steamcommunity.com/miniprofile/{}", account_id)).send().await else { f.state = "unknown".into(); return f };
    let Ok(h) = r.text().await else { return f };
    if let Some(c) = PERSONA.captures(&h) {
        f.state = match &c[1] { "in-game" => "ingame", "online" => "online", "busy" => "busy", "away" | "snooze" => "away", _ => "offline" }.into();
        let n = unescape(&c[2]); if !n.is_empty() { f.name = n }
    }
    if let Some(c) = GAME.captures(&h) { f.game = Some(unescape(&c[1])); if f.state != "offline" { f.state = "ingame".into() } }
    f.detail = RICH.captures(&h).map(|c| unescape(&c[1])).filter(|x| !x.is_empty());
    if let Some(c) = LOGO.captures(&h) {
        let u = c.get(1).or(c.get(2)).map(|m| m.as_str().to_string()).unwrap_or_default();
        f.game_id = APPID.captures(&u).map(|a| a[1].to_string());
        f.cover = f.game_id.as_ref().map(|g| format!("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/header.jpg", g)).or(Some(u).filter(|u| !u.is_empty()));
    }
    f
}

fn sort(out: &mut [Friend]) {
    let rank = |s: &str| match s { "ingame" => 0, "online" => 1, "busy" => 2, "away" => 3, _ => 4 };
    out.sort_by(|a, b| rank(&a.state).cmp(&rank(&b.state)).then(b.last_off.cmp(&a.last_off)).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
}

/// (friends, how they were read: "local" or "key")
pub async fn steam_friends(key: &str) -> R<(Vec<Friend>, &'static str)> {
    let Some(acct) = steam_account() else { return Err("nosteam".into()) };
    if !key.trim().is_empty() { if let Ok(f) = with_key(key, &acct.id64).await { return Ok((f, "key")) } }
    let list = local_friends(&acct.account_id);
    if list.is_empty() { return Err("nofriends".into()) }
    let mut out: Vec<Friend> = stream::iter(list.into_iter().take(200).map(|(a, n, av)| mini(a, n, av))).buffer_unordered(10).collect().await;
    if out.iter().all(|f| f.state == "unknown") { return Err("Couldn't reach Steam. Check your connection.".into()) }
    sort(&mut out);
    Ok((out, "local"))
}

async fn with_key(key: &str, id64: &str) -> R<Vec<Friend>> {
    let r = HTTP.get(format!("https://api.steampowered.com/ISteamUser/GetFriendList/v1/?key={}&steamid={}&relationship=friend", urlencoding::encode(key.trim()), id64))
        .send().await.map_err(|e| e.to_string())?;
    if r.status().as_u16() != 200 { return Err(format!("status {}", r.status())) }
    let j: serde_json::Value = r.json().await.map_err(|e| e.to_string())?;
    let ids: Vec<String> = j["friendslist"]["friends"].as_array().cloned().unwrap_or_default().iter().filter_map(|f| f["steamid"].as_str().map(String::from)).collect();
    let mut out = vec![];
    for batch in ids.chunks(100) {
        let j = get_json(&format!("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key={}&steamids={}", urlencoding::encode(key.trim()), batch.join(","))).await?;
        for p in j["response"]["players"].as_array().cloned().unwrap_or_default() {
            let st = p["personastate"].as_i64().unwrap_or(0);
            let game_id = p["gameid"].as_str().map(String::from);
            out.push(Friend {
                id: p["steamid"].as_str().unwrap_or("").into(),
                name: p["personaname"].as_str().unwrap_or("").into(),
                avatar: p["avatarmedium"].as_str().map(String::from),
                state: match (st, game_id.is_some()) { (_, true) => "ingame", (0, _) => "offline", (2, _) => "busy", (3 | 4, _) => "away", _ => "online" }.into(),
                game: p["gameextrainfo"].as_str().map(String::from),
                cover: game_id.as_ref().map(|g| format!("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/header.jpg", g)),
                game_id,
                profile: p["profileurl"].as_str().map(String::from),
                last_off: p["lastlogoff"].as_i64().unwrap_or(0) * 1000,
                detail: None,
            });
        }
    }
    sort(&mut out);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::parse_vdf;
    #[test]
    fn reads_steam_text_vdf() {
        let v = parse_vdf("\"UserLocalConfigStore\"\n{\n\t\"friends\"\n\t{\n\t\t\"123\"\n\t\t{\n\t\t\t\"name\"\t\t\"Kyle\"\n\t\t}\n\t}\n}\n");
        assert_eq!(v.get("UserLocalConfigStore").and_then(|r| r.get("friends")).and_then(|f| f.get("123")).and_then(|x| x.get("name")).and_then(|n| n.str()), Some("Kyle"));
    }
}
