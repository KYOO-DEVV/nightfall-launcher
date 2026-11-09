//! Steam friends playing now. Uses your own Steam Web API key (Settings), stored only in your library file.
use crate::libraries::steam_account;
use crate::util::*;
use serde::Serialize;

#[derive(Serialize, Clone, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Friend {
    pub id: String,
    pub name: String,
    pub avatar: Option<String>,
    pub state: String,
    pub game: Option<String>,
    pub game_id: Option<String>,
    pub cover: Option<String>,
    pub profile: Option<String>,
    pub last_off: i64,
}

pub async fn steam_friends(key: &str) -> R<Vec<Friend>> {
    if key.trim().is_empty() { return Err("nokey".into()) }
    let Some(acct) = steam_account() else { return Err("Steam isn't signed in on this PC.".into()) };
    let r = HTTP.get(format!("https://api.steampowered.com/ISteamUser/GetFriendList/v1/?key={}&steamid={}&relationship=friend", urlencoding::encode(key.trim()), acct.id64))
        .send().await.map_err(|_| "Couldn't reach Steam. Check your connection.".to_string())?;
    match r.status().as_u16() {
        200 => {}
        401 => return Err("Steam won't share this friends list. In Steam → Profile → Edit Profile → Privacy, set Friends List to Friends Only or Public.".into()),
        403 => return Err("Steam rejected this API key. Copy it again from steamcommunity.com/dev/apikey.".into()),
        c => return Err(format!("Steam answered with error {}.", c)),
    }
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
            });
        }
    }
    let rank = |s: &str| match s { "ingame" => 0, "online" => 1, "busy" => 2, "away" => 3, _ => 4 };
    out.sort_by(|a, b| rank(&a.state).cmp(&rank(&b.state)).then(b.last_off.cmp(&a.last_off)));
    Ok(out)
}
