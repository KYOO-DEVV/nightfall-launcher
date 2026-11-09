//! Official artwork: Steam → HoYoverse → Microsoft Store → Wikipedia, plus the exe's own icon.
use crate::store::Game;
use crate::util::*;
use regex::Regex;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

const CDNS: [&str; 3] = [
    "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps",
    "https://cdn.akamai.steamstatic.com/steam/apps",
    "https://steamcdn-a.akamaihd.net/steam/apps",
];

/* ---------- names ---------- */
pub fn version_info(exe: &str) -> (String, String) {
    let esc = exe.replace('\'', "''");
    let v = powershell_json(&format!("$v=(Get-Item -LiteralPath '{}').VersionInfo; [pscustomobject]@{{p=$v.ProductName;d=$v.FileDescription}} | ConvertTo-Json -Compress", esc));
    let p = v.first().and_then(|x| x["p"].as_str()).unwrap_or("").to_string();
    let d = v.first().and_then(|x| x["d"].as_str()).unwrap_or("").to_string();
    (p, d)
}
pub fn tidy(s: &str) -> String {
    let s = s.replace(['™', '®', '©'], "");
    let s = Regex::new(r"(?i)[-_]+(win64|win32|shipping|x64|dx11|dx12|vulkan)\b").unwrap().replace_all(&s, "").to_string();
    s.replace('_', " ").split_whitespace().collect::<Vec<_>>().join(" ")
}
fn folder_name(exe: &Path) -> String {
    let generic = Regex::new(r"(?i)^(bin|binaries|win64|win32|x64|x86|game|release|retail|shipping)$").unwrap();
    let mut dir = exe.parent();
    for _ in 0..4 {
        let Some(d) = dir else { break };
        let base = d.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        if !generic.is_match(&base) { return base }
        dir = d.parent();
    }
    String::new()
}
pub fn guess_name(exe: &str) -> String {
    let generic = Regex::new(r"(?i)^(unity|unity player|unreal|unrealgame|unreal engine|bootstrappackagedgame|game|launcher|launch|start|play|client|app|application|main|win64|win32|shipping|setup|x64|x86|bin|binaries|release|retail|electron|java|javaw|python|nw|godot engine)$").unwrap();
    let (p, d) = version_info(exe);
    let stem = Path::new(exe).file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let stem = Regex::new(r"([a-z])([A-Z])").unwrap().replace_all(&stem, "$1 $2").to_string();
    for c in [p, d, folder_name(Path::new(exe)), stem.clone()].iter().map(|c| tidy(c)) {
        if c.chars().count() > 1 && !generic.is_match(&c) && !c.to_lowercase().contains("microsoft") && !c.to_lowercase().contains("windows") {
            return c;
        }
    }
    stem
}

/* ---------- exe icon (+ colour tint) ---------- */
pub fn fetch_icon(g: &mut Game, dir: &Path) {
    let _ = fs::create_dir_all(dir);
    let out = dir.join("icon.png");
    let _ = fs::remove_file(&out);
    // the exe's own icon at 256 px (PrivateExtractIcons picks the largest image in the icon group).
    // An exe without an icon resource gives nothing, so the store / launcher icon is used instead of Windows' blank one.
    let script = format!(
        "Add-Type -AssemblyName System.Drawing; Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class NfIx{{[DllImport(\"user32.dll\",CharSet=CharSet.Unicode)]public static extern uint PrivateExtractIcons(string f,int i,int cx,int cy,IntPtr[] h,uint[] id,uint n,uint fl);[DllImport(\"user32.dll\")]public static extern bool DestroyIcon(IntPtr h);}}';          $h=New-Object IntPtr[] 1; $id=New-Object UInt32[] 1; $n=[NfIx]::PrivateExtractIcons('{exe}',0,256,256,$h,$id,1,0);          if($n -gt 0 -and $h[0] -ne [IntPtr]::Zero){{ $ic=[System.Drawing.Icon]::FromHandle($h[0]); $b=$ic.ToBitmap(); $b.Save('{out}',[System.Drawing.Imaging.ImageFormat]::Png); $b.Dispose(); [NfIx]::DestroyIcon($h[0]) | Out-Null }}",
        exe = g.exe.replace('\'', "''"), out = out.to_string_lossy().replace('\'', "''")
    );
    powershell(&script);
    if out.exists() && !is_blank_icon(&out) {
        g.art.icon = Some(trim_alpha(&out.to_string_lossy()));
        tint_from(g, &out);
    } else {
        let _ = fs::remove_file(&out);
        g.art.icon = None;
    }
}
/// Windows' generic "application" icon (white window, blue title bar) or an empty image
fn is_blank_icon(f: &Path) -> bool {
    let Ok(img) = image::open(f) else { return true };
    let img = img.thumbnail(32, 32).to_rgba8();
    let px: Vec<&image::Rgba<u8>> = img.pixels().filter(|p| p[3] > 128).collect();
    if px.len() < 20 { return true }
    // the generic icon is almost all white / light grey plus one saturated blue
    let colorful = px.iter().filter(|p| { let mx = p[0].max(p[1]).max(p[2]) as i32; let mn = p[0].min(p[1]).min(p[2]) as i32; mx - mn > 40 }).count();
    let blue = px.iter().filter(|p| p[2] as i32 > p[0] as i32 + 60 && p[2] > 150).count();
    let light = px.iter().filter(|p| p[0] > 200 && p[1] > 200 && p[2] > 200).count();
    blue * 20 >= px.len() && colorful <= blue + px.len() / 20 && light * 2 > px.len()
}
/// average colour of an icon's opaque pixels, used to tint placeholders so they match the game
pub fn tint_from(g: &mut Game, file: &Path) {
    let Ok(img) = image::open(file) else { return };
    let img = img.thumbnail(48, 48).to_rgba8();
    let (mut r, mut gr, mut b, mut n) = (0f64, 0f64, 0f64, 0f64);
    for p in img.pixels() {
        if p[3] < 200 { continue }
        let mx = p[0].max(p[1]).max(p[2]) as f64;
        let mn = p[0].min(p[1]).min(p[2]) as f64;
        let w = 1.0 + (mx - mn) / 32.0;
        r += p[0] as f64 * w; gr += p[1] as f64 * w; b += p[2] as f64 * w; n += w;
    }
    if n > 0.0 { g.tint = Some([(r / n) as u8, (gr / n) as u8, (b / n) as u8]) }
}
/// crop the empty transparent margin around a logo so every logo renders at the same visual size
pub fn trim_alpha(file: &str) -> String {
    let Ok(img) = image::open(file) else { return file.to_string() };
    let img = img.to_rgba8();
    let (w, h) = img.dimensions();
    let (mut x0, mut y0, mut x1, mut y1) = (w, h, 0u32, 0u32);
    let mut any = false;
    for (x, y, p) in img.enumerate_pixels() {
        if p[3] > 12 { any = true; x0 = x0.min(x); y0 = y0.min(y); x1 = x1.max(x); y1 = y1.max(y); }
    }
    if !any || (x0 == 0 && y0 == 0 && x1 == w - 1 && y1 == h - 1) { return file.to_string() }
    let out = format!("{}-trim.png", file.rsplit_once('.').map(|x| x.0).unwrap_or(file));
    let crop = image::imageops::crop_imm(&img, x0, y0, x1 - x0 + 1, y1 - y0 + 1).to_image();
    if crop.save(&out).is_ok() { out } else { file.to_string() }
}
fn corners_transparent(file: &str) -> bool {
    let Ok(img) = image::open(file) else { return false };
    let img = img.to_rgba8();
    let (w, h) = img.dimensions();
    if w == 0 || h == 0 { return false }
    [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)].iter().all(|&(x, y)| img.get_pixel(x, y)[3] < 20)
}

/// "Roblox Player" → "Roblox", "Minecraft Launcher" → "Minecraft"
pub fn clean_title(name: &str) -> String {
    let t = Regex::new(r"(?i)\s+(player|launcher|client|beta|\(beta\))$").unwrap().replace(name.trim(), "").trim().to_string();
    if t.chars().count() < 2 { name.trim().to_string() } else { t }
}

/* ---------- Steam ---------- */
pub fn local_steam_app(exe: &str) -> Option<(i64, Option<String>)> {
    let mut dir = Path::new(exe).parent().map(PathBuf::from);
    for _ in 0..5 {
        let Some(d) = dir.clone() else { break };
        if let Ok(t) = fs::read_to_string(d.join("steam_appid.txt")) {
            if let Ok(id) = t.trim().parse::<i64>() { return Some((id, None)) }
        }
        dir = d.parent().map(PathBuf::from);
    }
    let m = Regex::new(r"(?i)^(.*[\\/]steamapps)[\\/]common[\\/]([^\\/]+)").unwrap().captures(exe)?;
    let (sa, inst) = (m[1].to_string(), m[2].to_lowercase());
    for e in fs::read_dir(&sa).ok()?.flatten() {
        let f = e.file_name().to_string_lossy().to_string();
        if !f.starts_with("appmanifest_") { continue }
        let t = fs::read_to_string(e.path()).unwrap_or_default();
        let field = |k: &str| Regex::new(&format!(r#"(?i)"{}"\s+"([^"]+)""#, k)).ok().and_then(|r| r.captures(&t).map(|c| c[1].to_string()));
        if field("installdir").map(|x| x.to_lowercase()) == Some(inst.clone()) {
            if let Some(id) = field("appid").and_then(|x| x.parse().ok()) { return Some((id, field("name"))) }
        }
    }
    None
}
pub async fn steam_search(q: &str) -> R<Vec<Value>> {
    let j = get_json(&format!("https://store.steampowered.com/api/storesearch/?term={}&l=english&cc=US", urlencoding::encode(q))).await?;
    Ok(j["items"].as_array().cloned().unwrap_or_default().into_iter()
        .map(|i| serde_json::json!({ "appid": i["id"], "name": i["name"], "thumb": i["tiny_image"] })).collect())
}
pub fn best_match(name: &str, items: &[Value]) -> Option<(i64, String)> {
    let n = norm(name);
    let nm = |i: &Value| norm(i["name"].as_str().unwrap_or(""));
    let pick = items.iter().find(|i| nm(i) == n)
        .or_else(|| items.iter().find(|i| { let x = nm(i); x.starts_with(&n) || n.starts_with(&x) }))
        .or_else(|| items.iter().find(|i| { let x = nm(i); !x.is_empty() && (x.contains(&n) || n.contains(&x)) }))?;
    Some((pick["appid"].as_i64()?, pick["name"].as_str().unwrap_or("").to_string()))
}
pub async fn steam_art(g: &mut Game, dir: &Path) {
    let Some(appid) = g.appid else { return };
    let kinds: [(&str, &[&str]); 4] = [("cover", &["library_600x900_2x.jpg", "library_600x900.jpg"]), ("hero", &["library_hero.jpg"]), ("logo", &["logo_2x.png", "logo.png"]), ("header", &["header.jpg"])];
    for (kind, files) in kinds {
        let custom = match kind { "cover" => g.custom.cover, "hero" => g.custom.hero, "logo" => g.custom.logo, _ => false };
        if custom { continue }
        let mut got = None;
        'o: for f in files {
            for cdn in CDNS {
                if let Some(p) = download_as(&format!("{}/{}/{}", cdn, appid, f), dir, kind).await { got = Some(p); break 'o; }
            }
        }
        match kind { "cover" => g.art.cover = got, "hero" => g.art.hero = got, "logo" => g.art.logo = got, _ => g.art.header = got }
    }
    // newer games keep library art under hashed paths: the store-browse API knows their exact file names
    if g.art.cover.is_none() || g.art.hero.is_none() {
        let input = serde_json::json!({ "ids": [{ "appid": appid }], "context": { "language": "english", "country_code": "US" }, "data_request": { "include_assets": true } });
        if let Ok(j) = get_json(&format!("https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json={}", urlencoding::encode(&input.to_string()))).await {
            let a = &j["response"]["store_items"][0]["assets"];
            if let Some(fmt) = a["asset_url_format"].as_str() {
                let url = |f: &str| format!("https://shared.akamai.steamstatic.com/store_item_assets/{}", fmt.replace("${FILENAME}", f));
                if g.art.cover.is_none() && !g.custom.cover {
                    if let Some(f) = a["library_capsule_2x"].as_str().or(a["library_capsule"].as_str()) { g.art.cover = download_as(&url(f), dir, "cover").await }
                }
                if g.art.hero.is_none() && !g.custom.hero {
                    if let Some(f) = a["library_hero_2x"].as_str().or(a["library_hero"].as_str()) { g.art.hero = download_as(&url(f), dir, "hero").await }
                }
            }
        }
    }
    if let Ok(j) = get_json(&format!("https://store.steampowered.com/api/appdetails?appids={}&l=english", appid)).await {
        let d = &j[appid.to_string()]["data"];
        if let Some(s) = d["short_description"].as_str() {
            let s = Regex::new(r"<[^>]+>").unwrap().replace_all(s, "").replace("&quot;", "\"").replace("&amp;", "&").replace("&#39;", "'");
            g.desc = Some(shorten(&s, 400));
        }
        if g.art.header.is_none() { if let Some(u) = d["header_image"].as_str() { g.art.header = download_as(u, dir, "header").await } }
        if g.art.hero.is_none() && !g.custom.hero {
            if let Some(u) = d["background_raw"].as_str().or(d["screenshots"][0]["path_full"].as_str()) { g.art.hero = download_as(u, dir, "hero").await }
        }
    }
    g.remote.hero = Some(format!("{}/{}/header.jpg", CDNS[0], appid));
}

/* ---------- HoYoverse launcher API (Genshin, Star Rail, ZZZ, Honkai 3rd) ---------- */
pub async fn hoyo_art(g: &mut Game, dir: &Path) -> bool {
    let Ok(j) = get_json("https://sg-hyp-api.hoyoverse.com/hyp/hyp-connect/api/getGames?launcher_id=VYTpXlbWo8&language=en-us").await else { return false };
    let n = norm(&g.name);
    let Some(hit) = j["data"]["games"].as_array().and_then(|a| a.iter().find(|x| norm(x["display"]["name"].as_str().unwrap_or("")) == n).cloned()) else { return false };
    let d = &hit["display"];
    let (bg, logo, icon) = (d["background"]["url"].as_str(), d["logo"]["url"].as_str(), d["icon"]["url"].as_str());
    g.remote.hero = bg.map(String::from);
    g.remote.icon = icon.map(String::from);
    if let (Some(u), false) = (bg, g.custom.hero) { if let Some(p) = download_as(u, dir, "hero").await { g.art.hero = Some(p) } }
    if let (Some(u), false) = (logo, g.custom.logo) { if let Some(p) = download_as(u, dir, "logo").await { g.art.logo = Some(trim_alpha(&p)); g.logo_mono = false; } }
    if g.art.icon.is_none() { if let Some(u) = icon { g.art.icon = download_as(u, dir, "icon").await } }
    g.art.hero.is_some()
}

/* ---------- Microsoft Store catalog (Roblox, Minecraft, Fortnite, Game Pass…) ---------- */
pub async fn store_art(g: &mut Game, dir: &Path) -> bool {
    let q = Regex::new(r"(?i)\s+(player|game|launcher)$").unwrap().replace(&g.name, "").to_string();
    let Ok(j) = get_json(&format!("https://storeedgefd.dsx.mp.microsoft.com/v9.0/search?market=US&locale=en-US&deviceFamily=Windows.Desktop&query={}", urlencoding::encode(&q))).await else { return false };
    let n = norm(&q);
    let edition = Regex::new(r"^(windows|forwindows|forpc|pc|javabedrockedition.*|javaedition|bedrockedition|standardedition|edition|windowsedition|gamepass.*|xboxseries.*|definitiveedition|remastered)?$").unwrap();
    let rank = |t: &str| { let x = norm(t); if x == n { 3 } else if x.starts_with(&n) && edition.is_match(&x[n.len()..]) { 2 } else { 0 } };
    let results = j["Payload"]["SearchResults"].as_array().cloned().unwrap_or_default();
    let Some(best) = results.iter().filter(|r| rank(r["Title"].as_str().unwrap_or("")) > 0).max_by_key(|r| rank(r["Title"].as_str().unwrap_or(""))) else { return false };
    let id = best["ProductId"].as_str().unwrap_or("");
    let Ok(p) = get_json(&format!("https://storeedgefd.dsx.mp.microsoft.com/v9.0/products/{}?market=US&locale=en-US&deviceFamily=Windows.Desktop", id)).await else { return false };
    let p = &p["Payload"];
    let imgs = p["Images"].as_array().cloned().unwrap_or_default();
    let pick = |types: &[&str]| -> Option<String> {
        for t in types {
            if let Some(i) = imgs.iter().find(|x| x["ImageType"].as_str().map(|s| s.eq_ignore_ascii_case(t)).unwrap_or(false)) {
                if let Some(u) = i["Url"].as_str() { return Some(if u.starts_with("//") { format!("https:{}", u) } else { u.to_string() }) }
            }
        }
        None
    };
    let (hero, poster, tile) = (pick(&["SuperHeroArt", "hero", "TitledHeroArt", "Screenshot"]), pick(&["Poster", "BoxArt"]), pick(&["logo", "Tile", "BoxArt"]));
    g.remote.hero = hero.clone(); g.remote.cover = poster.clone(); g.remote.icon = tile.clone();
    if let (Some(u), false) = (&hero, g.custom.hero) { if let Some(x) = download_as(u, dir, "hero").await { g.art.hero = Some(x) } }
    if let (Some(u), false) = (&poster, g.custom.cover) { if let Some(x) = download_as(u, dir, "cover").await { g.art.cover = Some(x) } }
    if let Some(u) = &tile {
        if g.store_icon || g.art.icon.is_none() {
            if let Some(x) = download_as(u, dir, "store-icon").await { tint_from(g, Path::new(&x)); g.art.icon = Some(x); }
        }
    }
    if g.desc.is_none() {
        let txt = p["ShortDescription"].as_str().or(p["Description"].as_str()).unwrap_or("");
        let txt = txt.split_whitespace().collect::<Vec<_>>().join(" ");
        // drop an all-caps marketing slogan at the start ("ROBLOX – GREAT GAMES… PLAY FREE The range…")
        let txt = Regex::new(r"^[^a-z]{12,}?\s(?:[A-Z][a-z])").ok().and_then(|r| r.find(&txt).map(|m| txt[m.end() - 2..].to_string())).unwrap_or(txt);
        if !txt.is_empty() { g.desc = Some(shorten(&txt, 380)) }
    }
    g.art.hero.is_some() || g.art.cover.is_some()
}

/* ---------- Wikipedia: logos and descriptions for anything else ---------- */
async fn wiki_summary(t: &str) -> Option<Value> {
    let j = get_json(&format!("https://en.wikipedia.org/api/rest_v1/page/summary/{}", urlencoding::encode(&t.replace(' ', "_")))).await.ok()?;
    if j["type"] == "standard" { Some(j) } else { None }
}
fn is_art(j: &Value) -> bool {
    let f = j["originalimage"]["source"].as_str().unwrap_or("");
    let f = urlencoding::decode(f.rsplit('/').next().unwrap_or("")).map(|s| s.to_string()).unwrap_or_default();
    Regex::new(r"(?i)logo|cover|box|key.?art|poster|wordmark|title|capsule|banner|icon").unwrap().is_match(&f)
}
pub async fn wiki_art(g: &mut Game, dir: &Path) -> bool {
    let clean = Regex::new(r"(?i)\s+(player|game)$").unwrap().replace(&g.name, "").to_string();
    let mut p = wiki_summary(&clean).await;
    if !p.as_ref().map(is_art).unwrap_or(false) {
        if let Ok(s) = get_json(&format!("https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=4&srsearch={}", urlencoding::encode(&format!("{} video game", clean)))).await {
            for hit in s["query"]["search"].as_array().cloned().unwrap_or_default() {
                let t = hit["title"].as_str().unwrap_or("");
                // the article must be this game, not a spin-off ("Minecraft" ≠ "Minecraft Legends")
                let (nt, nc) = (norm(t), norm(&clean));
                if nt != nc && nt != format!("{}videogame", nc) { continue }
                let q = wiki_summary(t).await;
                if q.as_ref().map(is_art).unwrap_or(false) { p = q; break }
            }
        }
    }
    let Some(p) = p.filter(is_art) else { return false };
    let (w, h) = (p["originalimage"]["width"].as_f64().unwrap_or(1.0), p["originalimage"]["height"].as_f64().unwrap_or(1.0));
    let kind = if w / h > 1.45 { "logo" } else { "cover" };
    // never replace a cover that came from a store
    if (kind == "logo" && g.custom.logo) || (kind == "cover" && (g.custom.cover || g.art.cover.is_some())) { return false }
    let Some(file) = download_as(p["originalimage"]["source"].as_str().unwrap_or(""), dir, &format!("wiki-{}", kind)).await else { return false };
    if kind == "logo" {
        let t = trim_alpha(&file);
        // dark-on-transparent wiki logos vanish on the dark UI: render them white, but only when the corners are transparent
        g.logo_mono = corners_transparent(&t);
        g.art.logo = Some(t);
    } else {
        g.art.cover = Some(file);
    }
    if g.desc.is_none() { if let Some(x) = p["extract"].as_str() { g.desc = Some(shorten(x, 400)) } }
    true
}
pub async fn wiki_desc(g: &mut Game) {
    let t = Regex::new(r"(?i)\s+(player|game|launcher)$").unwrap().replace(&g.name, "").to_string();
    if let Some(j) = wiki_summary(&t).await {
        let x = j["extract"].as_str().unwrap_or("");
        if Regex::new(r"(?i)\b(game|video game|role-playing|shooter|sandbox|platform)\b").unwrap().is_match(x) { g.desc = Some(shorten(x, 380)) }
    }
}

/// the whole pipeline for one game; works on a copy so the library stays unlocked meanwhile
pub async fn enrich(mut g: Game, art_dir: PathBuf, lookup_name: bool) -> Game {
    let dir = art_dir.join(&g.id);
    let _ = fs::create_dir_all(&dir);
    {
        let mut tmp = g.clone();
        let d2 = dir.clone();
        tmp = tokio::task::spawn_blocking(move || { fetch_icon(&mut tmp, &d2); tmp }).await.unwrap_or(g.clone());
        g.art.icon = tmp.art.icon; g.tint = tmp.tint;
    }
    let mut found = false;
    let mut online = true;
    if g.appid.is_none() {
        if let Some((id, name)) = local_steam_app(&g.exe) {
            g.appid = Some(id);
            if lookup_name { if let Some(n) = name { g.name = n } }
        }
    }
    if g.appid.is_none() { found = hoyo_art(&mut g, &dir).await }
    if g.appid.is_none() && !found { found = store_art(&mut g, &dir).await }
    if g.appid.is_none() && !found {
        match steam_search(&g.name).await {
            Ok(items) => {
                // scanned games must match exactly; a hand-added exe gets fuzzy matching
                let hit = if g.source.as_deref().map(|s| s != "manual").unwrap_or(false) {
                    items.iter().find(|i| norm(i["name"].as_str().unwrap_or("")) == norm(&g.name)).and_then(|i| Some((i["appid"].as_i64()?, i["name"].as_str()?.to_string())))
                } else { best_match(&g.name, &items) };
                if let Some((id, n)) = hit { g.appid = Some(id); if lookup_name { g.name = n } }
            }
            Err(_) => online = false,
        }
    }
    if g.appid.is_some() { steam_art(&mut g, &dir).await; found = true; }
    if g.art.logo.is_none() && !g.custom.logo && wiki_art(&mut g, &dir).await { found = true }
    if g.desc.is_none() { wiki_desc(&mut g).await }
    g.status = if found { "ready".into() } else if online { "noart".into() } else { "offline".into() };
    g.art_ver = now_ms();
    g
}
