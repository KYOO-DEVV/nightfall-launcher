//! The library file. Same JSON shape as Nightfall 1.x, so 1.x libraries load unchanged.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default)]
pub struct Session { pub s: i64, pub e: i64 }

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default)]
pub struct Open { pub s: i64, pub last: i64 }

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default)]
pub struct Launch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cmd: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub args: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default)]
pub struct Art {
    pub cover: Option<String>,
    pub hero: Option<String>,
    pub logo: Option<String>,
    pub header: Option<String>,
    pub icon: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default)]
pub struct Custom { pub cover: bool, pub hero: bool, pub logo: bool }

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default)]
pub struct Remote {
    pub hero: Option<String>,
    pub cover: Option<String>,
    pub icon: Option<String>,
    pub logo: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default)]
pub struct Live {
    pub name: String,
    pub icon: Option<String>,
    pub since: i64,
    pub url: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Game {
    pub id: String,
    pub exe: String,
    pub dir: Option<String>,
    #[serde(rename = "proc")]
    pub proc_: String,
    pub name: String,
    pub added_at: i64,
    pub sessions: Vec<Session>,
    pub open: Option<Open>,
    pub art: Art,
    pub custom: Custom,
    pub status: String,
    pub source: Option<String>,
    pub launch: Option<Launch>,
    pub appid: Option<i64>,
    pub desc: Option<String>,
    pub tint: Option<[u8; 3]>,
    pub logo_mono: bool,
    pub fav: bool,
    pub steam_min: i64,
    pub store_icon: bool,
    pub remote: Remote,
    pub art_ver: i64,
    pub art_rev: i64,
    /// shown in the sidebar
    pub pinned: bool,
    /// position among pinned games (0 = after the ordered ones)
    pub pin_order: i64,
    /// kept, but out of sight
    pub hidden: bool,
    /// extra command-line arguments when Nightfall starts the .exe itself
    pub launch_args: String,
    pub run_as_admin: bool,
    /// hide Nightfall to the tray once the game starts
    pub hide_on_launch: bool,
    /// daily reminder after this many minutes (0 = off)
    pub limit_min: i64,
    /// the day (local midnight) the reminder last fired
    pub limit_day: i64,
    #[serde(skip)]
    pub live: Option<Live>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub close_to_tray: bool,
    pub discord_enabled: bool,
    pub discord_client_id: String,
    pub discord_idle: bool,
    pub auto_add_installed: bool,
    pub steam_api_key: String,
    /// filter chips above the library grid
    pub show_filters: bool,
    /// icon on the Game settings buttons: cog, sliders, dots, pencil or none
    pub settings_icon: String,
    /// the first-run welcome has been completed
    pub onboarded: bool,
    /// the version whose "What's new" you've seen
    pub last_seen_version: String,
    /// "system" (follow Windows), "on" or "off"
    pub reduce_motion: String,
    /// a soft sound when a game launches
    pub sounds: bool,
    /// white, violet, blue, green, pink or orange
    pub accent: String,
    /// "auto" (follow Windows), "en" or "fr"
    pub language: String,
    /// a small always-on-top window with the session timer
    pub widget: bool,
    pub notify_downloads: bool,
    pub weekly_recap: bool,
    pub last_recap_week: String,
    /// library layout: "grid" or "list", and cover width in pixels
    pub lib_view: String,
    pub card_size: i64,
}
impl Default for Settings {
    fn default() -> Self {
        Settings { close_to_tray: true, discord_enabled: false, discord_client_id: String::new(), discord_idle: false, auto_add_installed: true, steam_api_key: String::new(),
            show_filters: false, settings_icon: "cog".into(), onboarded: false, last_seen_version: String::new(), reduce_motion: "system".into(), sounds: false,
            accent: "white".into(), language: "auto".into(), widget: false, notify_downloads: true, weekly_recap: true, last_recap_week: String::new(),
            lib_view: "grid".into(), card_size: 150 }
    }
}

/// your profile page
#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default)]
pub struct Profile {
    pub name: String,
    pub bio: String,
    /// files inside the data folder's profile/ directory
    pub avatar: Option<String>,
    pub banner: Option<String>,
    /// game ids shown on the profile, in order ("own:<store key>" for games you own but haven't installed)
    pub showcase: Vec<String>,
    /// name and cover of the not-installed games in the showcase, so the profile never has to wait for the stores
    pub showcase_owned: std::collections::HashMap<String, Value>,
    pub pronouns: String,
    pub ver: i64,
}

/// one match read from a game's own logs (Fortnite, Valorant); kept because the games overwrite their logs
#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default)]
pub struct GameMatch {
    pub s: i64,
    pub e: i64,
    /// mode / map, the thing matches are grouped by
    pub title: String,
    pub sub: String,
    pub icon: Option<String>,
    pub thumb: Option<String>,
    pub result: String,
    pub win: Option<bool>,
    pub agent: Option<String>,
    pub map: Option<String>,
    pub rounds: i64,
    pub live: bool,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default)]
pub struct Collection { pub id: String, pub name: String, pub games: Vec<String> }

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default)]
pub struct Ignored { pub exe: String, pub appid: Option<i64> }

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default)]
pub struct RbxInfo {
    pub name: Option<String>,
    pub creator: Option<String>,
    pub place: Option<i64>,
    pub icon: Option<String>,
    pub thumb: Option<String>,
    pub t: i64,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default)]
pub struct SteamItem {
    pub t: i64,
    pub name: Option<String>,
    #[serde(rename = "type")]
    pub kind: i64,
    pub cover: Option<String>,
    pub hero: Option<String>,
    pub header: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default)]
pub struct Caches {
    pub rbx: HashMap<String, RbxInfo>,
    /// Minecraft .log.gz → parsed span (or 0 when the file had none); gz logs never change
    pub mc: HashMap<String, Value>,
    pub steam: HashMap<String, SteamItem>,
    pub fortnite: Vec<GameMatch>,
    pub valorant: Vec<GameMatch>,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default)]
pub struct Db {
    pub games: Vec<Game>,
    pub settings: Settings,
    pub collections: Vec<Collection>,
    pub ignored: Vec<Ignored>,
    pub caches: Caches,
    pub profile: Profile,
    /// set once the 1.x (Electron) library has been imported
    pub migrated: bool,
    /// your store libraries as last read, so the Your stores tab opens instantly
    pub owned_cache: Option<(i64, Vec<crate::libraries::Account>, Vec<crate::libraries::Owned>)>,
}

impl Db {
    pub fn by_id(&mut self, id: &str) -> Option<&mut Game> {
        self.games.iter_mut().find(|g| g.id == id)
    }
}
