const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');
const { pathToFileURL } = require('url');
const { scanAll } = require('./scan');
const { detailsFor, kindOf } = require('./details');
const { ownedLibraries } = require('./libraries');
const presence = require('./presence');
let autoUpdater = null;
try { ({ autoUpdater } = require('electron-updater')); } catch { /* dev without the package */ }

if (process.env.NF_USERDATA) app.setPath('userData', process.env.NF_USERDATA); // test/dev isolation
if (!app.requestSingleInstanceLock()) { app.quit(); return; }

const USER = app.getPath('userData');
const DB_FILE = path.join(USER, 'library.json');
const ART_DIR = path.join(USER, 'art');
const ICON = path.join(__dirname, 'icon.png');
const TICK_MS = 5000;
const MIN_SESSION_MS = 30000;   // ignore blips shorter than this (crash-on-start, launcher hand-offs)
const GAP_MS = 60000;           // a longer gap between ticks (sleep/hibernate) splits the session

let win = null, tray = null;
let db = { games: [], settings: { closeToTray: true } };

/* ---------------- storage ---------------- */
function loadDb() {
  try { db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; } catch { /* first run */ }
  db.settings = { closeToTray: true, discordEnabled: false, discordClientId: '', autoAddInstalled: true, ...(db.settings || {}) };
  db.collections = db.collections || [];
  db.ignored = db.ignored || [];
  db.caches = { rbx: {}, mc: {}, steam: {}, ...(db.caches || {}) };
  // close sessions left open by a crash / shutdown at their last confirmed moment
  for (const g of db.games) {
    if (g.open) {
      if (g.open.last - g.open.s >= MIN_SESSION_MS) g.sessions.push({ s: g.open.s, e: g.open.last });
      g.open = null;
    }
  }
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(USER, { recursive: true });
      fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db));
      fs.renameSync(DB_FILE + '.tmp', DB_FILE);
    } catch (e) { console.error('save failed', e); }
  }, 250);
}
function flushSave() { clearTimeout(saveTimer); try { fs.writeFileSync(DB_FILE, JSON.stringify(db)); } catch {} }

const fileUrl = (p, v) => (p && fs.existsSync(p) ? pathToFileURL(p).href + '?v=' + (v || 0) : null);
function publicGame(g) {
  const a = g.art || {};
  return {
    id: g.id, name: g.name, exe: g.exe, proc: g.proc, addedAt: g.addedAt, appid: g.appid || null,
    desc: g.desc || '', sessions: g.sessions, open: g.open, status: g.status || 'ready',
    source: g.source || 'manual', logoMono: !!g.logoMono, tint: g.tint || null,
    fav: !!g.fav, detail: kindOf(g), steamMin: g.steamMin || 0, live: g.live || null,
    art: {
      cover: fileUrl(a.cover, g.artVer), hero: fileUrl(a.hero, g.artVer), logo: fileUrl(a.logo, g.artVer),
      header: fileUrl(a.header, g.artVer), icon: fileUrl(a.icon, g.artVer),
    },
  };
}
let updateState = { state: 'idle' }, presenceState = 'off';
const snapshot = () => ({ games: db.games.map(publicGame), settings: db.settings, collections: db.collections, now: Date.now(),
  version: app.getVersion(), update: updateState, presence: presenceState, portable: !!process.env.PORTABLE_EXECUTABLE_FILE });
function notify() { if (win && !win.isDestroyed()) win.webContents.send('lib:changed', snapshot()); }
const byId = (id) => db.games.find((g) => g.id === id);

/* ---------------- naming ---------------- */
function versionInfo(exe) {
  return new Promise((res) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '$v=(Get-Item -LiteralPath $env:NF_EXE).VersionInfo; [pscustomobject]@{p=$v.ProductName;d=$v.FileDescription} | ConvertTo-Json -Compress'],
      { env: { ...process.env, NF_EXE: exe }, windowsHide: true, timeout: 10000 },
      (err, out) => { try { res(JSON.parse(out)); } catch { res({}); } });
  });
}
const GENERIC = /^(unity|unity player|unreal|unrealgame|unreal engine|bootstrappackagedgame|game|launcher|launch|start|play|client|app|application|main|win64|win32|shipping|setup|x64|x86|bin|binaries|release|retail|electron|java|javaw|python|nw|godot engine)$/i;
const tidy = (s) => (s || '').replace(/[™®©]/g, '').replace(/[-_]+(win64|win32|shipping|x64|dx11|dx12|vulkan)\b/gi, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
function folderName(exe) {
  let dir = path.dirname(exe);
  for (let i = 0; i < 4; i++) {
    const base = path.basename(dir);
    if (!/^(bin|binaries|win64|win32|x64|x86|game|release|retail|shipping)$/i.test(base)) return base;
    dir = path.dirname(dir);
  }
  return path.basename(path.dirname(exe));
}
async function guessName(exe) {
  const v = await versionInfo(exe);
  const stem = path.basename(exe, path.extname(exe)).replace(/([a-z])([A-Z])/g, '$1 $2');
  const cands = [v.p, v.d, folderName(exe), stem].map(tidy);
  return cands.find((c) => c && c.length > 1 && !GENERIC.test(c) && !/microsoft|windows/i.test(c)) || stem;
}

/* ---------------- steam lookups ---------------- */
async function localSteamApp(exe) {
  let dir = path.dirname(exe);
  for (let i = 0; i < 5; i++) {
    try {
      const t = (await fsp.readFile(path.join(dir, 'steam_appid.txt'), 'utf8')).trim();
      if (/^\d+$/.test(t)) return { appid: +t };
    } catch {}
    const up = path.dirname(dir); if (up === dir) break; dir = up;
  }
  const m = /^(.*[\\/]steamapps)[\\/]common[\\/]([^\\/]+)/i.exec(exe);
  if (m) {
    const files = await fsp.readdir(m[1]).catch(() => []);
    for (const f of files) {
      if (!/^appmanifest_\d+\.acf$/i.test(f)) continue;
      const t = await fsp.readFile(path.join(m[1], f), 'utf8').catch(() => '');
      const inst = /"installdir"\s+"([^"]+)"/i.exec(t);
      if (inst && inst[1].toLowerCase() === m[2].toLowerCase()) {
        const id = /"appid"\s+"(\d+)"/i.exec(t), nm = /"name"\s+"([^"]+)"/i.exec(t);
        if (id) return { appid: +id[1], name: nm && nm[1] };
      }
    }
  }
  return null;
}
async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'NightfallLauncher/1.0' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
async function steamSearch(q) {
  const j = await getJson(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&l=english&cc=US`);
  return (j.items || []).map((i) => ({ appid: i.id, name: i.name, thumb: i.tiny_image }));
}
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function bestMatch(name, items) {
  const n = norm(name);
  return items.find((i) => norm(i.name) === n)
    || items.find((i) => norm(i.name).startsWith(n) || n.startsWith(norm(i.name)))
    || items.find((i) => norm(i.name).includes(n) || n.includes(norm(i.name)))
    || null;
}

const CDNS = [
  'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps',
  'https://cdn.akamai.steamstatic.com/steam/apps',
  'https://steamcdn-a.akamaihd.net/steam/apps',
];
const KINDS = {
  cover: ['library_600x900_2x.jpg', 'library_600x900.jpg'],
  hero: ['library_hero.jpg'],
  logo: ['logo_2x.png', 'logo.png'],
  header: ['header.jpg'],
};
async function download(url, dest) {
  try {
    const r = await fetch(url);
    if (!r.ok || !(r.headers.get('content-type') || '').startsWith('image')) return false;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 1500) return false;
    await fsp.writeFile(dest, buf);
    return true;
  } catch { return false; }
}
async function fetchArt(g) {
  const dir = path.join(ART_DIR, g.id);
  await fsp.mkdir(dir, { recursive: true });
  g.art = g.art || {}; g.custom = g.custom || {};
  if (!g.appid) return;
  for (const [kind, files] of Object.entries(KINDS)) {
    if (g.custom[kind]) continue;
    g.art[kind] = null;
    outer: for (const file of files) for (const cdn of CDNS) {
      const dest = path.join(dir, kind + path.extname(file));
      if (await download(`${cdn}/${g.appid}/${file}`, dest)) { g.art[kind] = dest; break outer; }
    }
  }
  try {
    const j = await getJson(`https://store.steampowered.com/api/appdetails?appids=${g.appid}&l=english`);
    const d = j[g.appid] && j[g.appid].data;
    if (d) {
      if (d.short_description) g.desc = d.short_description.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'");
      if (!g.art.header && d.header_image && await download(d.header_image, path.join(dir, 'header.jpg'))) g.art.header = path.join(dir, 'header.jpg');
      if (!g.art.hero && !g.custom.hero) {
        const bg = d.background_raw || (d.screenshots && d.screenshots[0] && d.screenshots[0].path_full);
        if (bg && await download(bg, path.join(dir, 'hero.jpg'))) g.art.hero = path.join(dir, 'hero.jpg');
      }
      if (!g.art.cover && !g.custom.cover && d.capsule_imagev5 && await download(d.capsule_imagev5, path.join(dir, 'cover.jpg'))) g.art.cover = path.join(dir, 'cover.jpg');
    }
  } catch {}
  g.artVer = Date.now();
}
async function fetchIcon(g) {
  try {
    const dir = path.join(ART_DIR, g.id);
    await fsp.mkdir(dir, { recursive: true });
    const img = await app.getFileIcon(g.exe, { size: 'large' });
    if (!img.isEmpty()) { const p = path.join(dir, 'icon.png'); await fsp.writeFile(p, img.toPNG()); g.art = g.art || {}; g.art.icon = p; tintFrom(g, img); }
  } catch {}
}
/* average colour of an icon's opaque pixels, used to tint placeholders so they match the game */
function tintFrom(g, img) {
  try {
    const { width: w, height: h } = img.getSize(), b = img.toBitmap();
    let r = 0, gr = 0, bl = 0, n = 0;
    for (let i = 0; i < w * h * 4; i += 4) { if (b[i + 3] < 200) continue; const s = Math.max(b[i], b[i + 1], b[i + 2]) - Math.min(b[i], b[i + 1], b[i + 2]); const wgt = 1 + s / 32; bl += b[i] * wgt; gr += b[i + 1] * wgt; r += b[i + 2] * wgt; n += wgt; }
    if (n) g.tint = [Math.round(r / n), Math.round(gr / n), Math.round(bl / n)];
  } catch {}
}
/* download to <dir>/<base>.<ext from content-type>; returns the path or null */
async function downloadAs(url, dir, base) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 NightfallLauncher/1.2' } });
    const ct = r.headers.get('content-type') || '';
    if (!r.ok || !ct.startsWith('image')) return null;
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length < 1500) return null;
    const ext = /png/.test(ct) ? '.png' : /webp/.test(ct) ? '.webp' : /gif/.test(ct) ? '.gif' : '.jpg';
    for (const e of ['.png', '.jpg', '.webp', '.gif']) await fsp.rm(path.join(dir, base + e), { force: true }).catch(() => {});
    const dest = path.join(dir, base + ext); await fsp.writeFile(dest, buf); return dest;
  } catch { return null; }
}
const UA = { headers: { 'User-Agent': 'Mozilla/5.0 NightfallLauncher/1.2' } };
/* crop the empty transparent margin around a logo so every logo renders at the same visual size */
function trimAlpha(file) {
  try {
    const im = nativeImage.createFromPath(file); if (im.isEmpty()) return file;
    const { width: w, height: h } = im.getSize(), b = im.toBitmap();
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (b[(y * w + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0 || (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1)) return file;
    const out = file.replace(/\.\w+$/, '') + '-trim.png';
    fs.writeFileSync(out, im.crop({ x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }).toPNG());
    return out;
  } catch { return file; }
}

/* HoYoverse's own launcher API: official background, logo and icon for Genshin, Star Rail, ZZZ, Honkai 3rd… */
let hoyoCache = null;
async function hoyoArt(g) {
  try {
    if (!hoyoCache) {
      const j = await (await fetch('https://sg-hyp-api.hoyoverse.com/hyp/hyp-connect/api/getGames?launcher_id=VYTpXlbWo8&language=en-us', UA)).json();
      hoyoCache = (j.data && j.data.games) || [];
    }
    const hit = hoyoCache.find((x) => norm(x.display && x.display.name) === norm(g.name));
    if (!hit) return false;
    const d = hit.display, dir = path.join(ART_DIR, g.id); await fsp.mkdir(dir, { recursive: true });
    g.remote = { hero: d.background && d.background.url, icon: d.icon && d.icon.url, logo: d.logo && d.logo.url }; // web URLs for Discord
    if (d.background && d.background.url && !g.custom.hero) g.art.hero = (await downloadAs(d.background.url, dir, 'hero')) || g.art.hero;
    if (d.logo && d.logo.url && !g.custom.logo) { const p = await downloadAs(d.logo.url, dir, 'logo'); if (p) { g.art.logo = trimAlpha(p); g.logoMono = false; } }
    if (d.icon && d.icon.url && !g.art.icon) g.art.icon = await downloadAs(d.icon.url, dir, 'icon');
    if (!g.art.cover && g.art.hero) g.art.cover = null; // cards crop the hero instead
    return !!g.art.hero;
  } catch { return false; }
}

/* Microsoft Store catalog: official hero (1920×1080), poster and tile for Roblox, Minecraft, Fortnite, Game Pass games… */
async function storeArt(g) {
  try {
    const q = g.name.replace(/\s+(player|game|launcher)$/i, '');
    const j = await (await fetch(`https://storeedgefd.dsx.mp.microsoft.com/v9.0/search?market=US&locale=en-US&deviceFamily=Windows.Desktop&query=${encodeURIComponent(q)}`, UA)).json();
    const res = (j.Payload && j.Payload.SearchResults) || [];
    const n = norm(q);
    const EDITION = /^(windows|forwindows|forpc|pc|javabedrockedition.*|javaedition|bedrockedition|standardedition|edition|windowsedition|gamepass.*|xboxseries.*|definitiveedition|remastered)?$/;
    const rank = (t) => { const x = norm(t); if (x === n) return 3; if (x.startsWith(n) && EDITION.test(x.slice(n.length))) return 2; return 0; };
    const best = res.map((r) => [rank(r.Title), r]).filter((x) => x[0] > 0).sort((a, b) => b[0] - a[0])[0];
    if (!best) return false;
    const p = (await (await fetch(`https://storeedgefd.dsx.mp.microsoft.com/v9.0/products/${best[1].ProductId}?market=US&locale=en-US&deviceFamily=Windows.Desktop`, UA)).json()).Payload || {};
    const imgs = p.Images || [];
    const pick = (...types) => { for (const t of types) { const i = imgs.find((x) => (x.ImageType || '').toLowerCase() === t.toLowerCase()); if (i && i.Url) return i.Url.startsWith('//') ? 'https:' + i.Url : i.Url; } return null; };
    const dir = path.join(ART_DIR, g.id); await fsp.mkdir(dir, { recursive: true });
    const hero = pick('SuperHeroArt', 'hero', 'TitledHeroArt', 'Screenshot'), poster = pick('Poster', 'BoxArt'), tile = pick('logo', 'Tile', 'BoxArt');
    g.remote = { hero, cover: poster, icon: tile }; // web URLs for Discord
    if (hero && !g.custom.hero) g.art.hero = (await downloadAs(hero, dir, 'hero')) || g.art.hero;
    if (poster && !g.custom.cover) g.art.cover = (await downloadAs(poster, dir, 'cover')) || g.art.cover;
    if (tile && (g.storeIcon || !g.art.icon)) { const t = await downloadAs(tile, dir, 'store-icon'); if (t) { g.art.icon = t; try { tintFrom(g, nativeImage.createFromPath(t).resize({ width: 48 })); } catch {} } }
    if (!g.desc) {
      // drop an all-caps marketing slogan at the start ("ROBLOX – GREAT GAMES… PLAY FREE The range…")
      const txt = (p.ShortDescription || p.Description || '').replace(/\s+/g, ' ').trim().replace(/^[^a-z]{12,}?(?=\s[A-Z][a-z])\s*/, '');
      if (txt) g.desc = txt.length > 380 ? txt.slice(0, 377).replace(/\s+\S*$/, '') + '…' : txt;
    }
    return !!(g.art.hero || g.art.cover);
  } catch { return false; }
}

/* Wikipedia fallback for games that are not on Steam (Riot, HoYoverse, Roblox…) */
async function wikiArt(g) {
  const H = { headers: { 'User-Agent': 'NightfallLauncher/1.0 (desktop game library)' } };
  const summary = async (t) => {
    try {
      const r = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(t.replace(/ /g, '_')), H);
      if (!r.ok) return null; const j = await r.json(); return j.type === 'standard' ? j : null;
    } catch { return null; }
  };
  const clean = g.name.replace(/\s+(player|game)$/i, '');
  let p = await summary(clean);
  if (!p || !p.originalimage) {
    try {
      const s = await getJson('https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=4&srsearch=' + encodeURIComponent(clean + ' video game'));
      for (const hit of (s.query && s.query.search) || []) {
        if (!norm(hit.title).includes(norm(clean))) continue;
        p = await summary(hit.title); if (p && p.originalimage && /logo|cover|box|key.?art|poster|wordmark|title|capsule|banner|icon/i.test(decodeURIComponent(p.originalimage.source.split('/').pop()))) break;
      }
    } catch {}
  }
  // only take logos / cover art, never photos (e.g. a company HQ on the article)
  const isArt = (q) => q && q.originalimage && /logo|cover|box|key.?art|poster|wordmark|title|capsule|banner|icon/i.test(decodeURIComponent(q.originalimage.source.split('/').pop()));
  if (!isArt(p)) return false;
  const img = p.originalimage, dir = path.join(ART_DIR, g.id);
  await fsp.mkdir(dir, { recursive: true });
  const kind = img.width / img.height > 1.45 ? 'logo' : 'cover';
  if (g.custom && g.custom[kind]) return false;
  const dest = path.join(dir, 'wiki-' + kind + (path.extname(new URL(img.source).pathname) || '.png'));
  if (!(await download(img.source, dest))) return false;
  g.art[kind] = dest;
  // dark-on-transparent wiki logos vanish on our dark UI: render them white, but only when the corners are transparent
  g.logoMono = false;
  if (kind === 'logo') {
    try {
      const im = nativeImage.createFromPath(dest), { width: w, height: h } = im.getSize(), bmp = im.toBitmap();
      const a = (x, y) => bmp[(y * w + x) * 4 + 3];
      g.logoMono = [a(0, 0), a(w - 1, 0), a(0, h - 1), a(w - 1, h - 1)].every((v) => v < 20);
    } catch {}
  }
  if (!g.desc && p.extract) g.desc = p.extract.length > 420 ? p.extract.slice(0, 417).replace(/\s+\S*$/, '') + '…' : p.extract;
  return true;
}

/* short description from Wikipedia when the art source had none (HoYoverse, hand-added games) */
async function wikiDesc(g) {
  try {
    const t = g.name.replace(/\s+(player|game|launcher)$/i, '');
    const r = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(t.replace(/ /g, '_')), { headers: { 'User-Agent': 'NightfallLauncher/1.2 (desktop game library)' } });
    if (!r.ok) return; const j = await r.json();
    if (j.type !== 'standard' || !/\b(game|video game|role-playing|shooter|sandbox|platform)\b/i.test(j.extract || '')) return;
    g.desc = j.extract.length > 380 ? j.extract.slice(0, 377).replace(/\s+\S*$/, '') + '…' : j.extract;
  } catch {}
}

/* ---------------- adding games ---------------- */
async function enrich(g, { lookupName = true } = {}) {
  g.status = 'searching'; notify();
  g.art = g.art || {}; g.custom = g.custom || {};
  await fetchIcon(g);
  try {
    let found = false;
    if (!g.appid) {
      const local = await localSteamApp(g.exe);
      if (local) { g.appid = local.appid; if (local.name && lookupName) g.name = local.name; }
    }
    // official sources that are not Steam come first for games we know are not Steam games
    if (!g.appid) found = await hoyoArt(g);
    if (!g.appid && !found) found = await storeArt(g);
    if (!g.appid && !found) {
      const items = await steamSearch(g.name);
      // scanned games must match exactly; a hand-added exe gets fuzzy matching
      const hit = g.source && g.source !== 'manual' ? items.find((i) => norm(i.name) === norm(g.name)) : bestMatch(g.name, items);
      if (hit) { g.appid = hit.appid; if (lookupName) g.name = hit.name; }
    }
    if (g.appid) { await fetchArt(g); found = true; }
    if (!g.art.logo && !g.custom.logo) { const w = await wikiArt(g); found = found || w; }
    if (!g.desc) await wikiDesc(g);
    g.status = found ? 'ready' : 'noart';
  } catch (e) {
    g.status = 'offline';
  }
  g.artVer = Date.now();
  save(); notify();
}
async function addPaths(paths) {
  const added = [];
  for (let p of paths || []) {
    if (!p) continue;
    if (/\.lnk$/i.test(p)) { try { p = shell.readShortcutLink(p).target; } catch { continue; } }
    if (!/\.exe$/i.test(p) || !fs.existsSync(p)) continue;
    if (db.games.some((g) => g.exe.toLowerCase() === p.toLowerCase())) continue;
    const g = {
      id: crypto.randomBytes(6).toString('hex'), exe: p, proc: path.basename(p).toLowerCase(),
      name: tidy(path.basename(p, '.exe')), addedAt: Date.now(), sessions: [], open: null, art: {}, custom: {}, status: 'searching',
    };
    db.games.push(g); added.push(g);
  }
  save(); notify();
  for (const g of added) { g.name = await guessName(g.exe); notify(); enrich(g); }
  return added.map((g) => g.id);
}

/* ---------------- Connect All ---------------- */
const lc = (s) => (s || '').toLowerCase().replace(/[\\/]+$/, '');
function alreadyIn(it) {
  return db.games.find((g) => lc(g.exe) === lc(it.exe) || (it.appid && g.appid === it.appid)
    || (it.dir && g.dir && lc(g.dir) === lc(it.dir)) || norm(g.name) === norm(it.name)
    || (it.dir && lc(g.exe).startsWith(lc(it.dir) + '\\')));
}
let lastScan = [];
async function scan() {
  lastScan = await scanAll();
  return lastScan.map((it, i) => ({ i, name: it.name, source: it.source, exe: it.exe, connected: !!alreadyIn(it) }));
}
const queue = []; let active = 0;
function queueEnrich(g) { queue.push(g); pump(); }
function pump() {
  while (active < 3 && queue.length) {
    const g = queue.shift(); active++;
    enrich(g, { lookupName: false }).finally(() => { active--; pump(); });
  }
}
function connect(indexes) {
  const ids = [];
  for (const i of indexes || []) {
    const it = lastScan[i]; if (!it || alreadyIn(it)) continue;
    const g = {
      id: crypto.randomBytes(6).toString('hex'), exe: it.exe, dir: it.dir, source: it.source,
      proc: (it.procs && it.procs.length ? it.procs : [path.basename(it.exe)]).join(',').toLowerCase(),
      launch: it.launch || null, appid: it.appid || null, name: it.name, storeIcon: !!it.storeIcon,
      addedAt: Date.now(), sessions: [], open: null, art: {}, custom: {}, status: 'searching',
    };
    db.games.push(g); ids.push(g.id); queueEnrich(g);
  }
  save(); notify();
  return ids;
}

/* ---------------- play-time tracking ---------------- */
function processNames() {
  return new Promise((res) => {
    execFile('tasklist', ['/fo', 'csv', '/nh'], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, out) => {
      const s = new Set();
      if (!err) for (const line of out.split(/\r?\n/)) { const m = /^"([^"]+)"/.exec(line); if (m) s.add(m[1].toLowerCase()); }
      res(err ? null : s);
    });
  });
}
let ticking = false;
async function tick() {
  if (ticking) return; ticking = true;
  try {
    const procs = await processNames();
    if (!procs) return;
    const now = Date.now(); let changed = false;
    for (const g of db.games) {
      const running = (g.proc || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).some((p) => procs.has(p));
      if (g.open && now - g.open.last > GAP_MS) { // machine slept: close at last seen
        if (g.open.last - g.open.s >= MIN_SESSION_MS) g.sessions.push({ s: g.open.s, e: g.open.last });
        g.open = null; changed = true;
      }
      if (running) {
        if (!g.open) { g.open = { s: now, last: now }; changed = true; } else g.open.last = now;
      } else if (g.open) {
        if (g.open.last - g.open.s >= MIN_SESSION_MS) g.sessions.push({ s: g.open.s, e: g.open.last });
        g.open = null; changed = true;
      }
    }
    if (await refreshLive(now)) changed = true;
    if (changed) { notify(); updateTray(); }
    if (changed || db.games.some((g) => g.open)) save();
    await pushPresence();
  } finally { ticking = false; }
}

/* what you're doing inside a running game (Roblox experience, Minecraft instance), refreshed every ~15 s */
let liveAt = 0;
async function refreshLive(now) {
  if (now - liveAt < 15000) return false; liveAt = now;
  let changed = false;
  for (const g of db.games) {
    const before = JSON.stringify(g.live || null);
    if (g.open && kindOf(g)) {
      try { const d = await detailsFor(g, db.caches); g.live = d && d.live ? d.live : null; } catch { g.live = null; }
    } else g.live = null;
    if (JSON.stringify(g.live || null) !== before) changed = true;
  }
  return changed;
}
/* Discord Rich Presence for the game you're playing */
const steamImg = (appid, f) => `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/${f}`;
async function pushPresence() {
  const g = db.games.filter((x) => x.open).sort((a, b) => b.open.s - a.open.s)[0];
  let act = null;
  if (g) {
    const r = g.remote || {};
    act = {
      game: g.name,
      detail: g.live ? g.live.name : null,
      detailImage: g.live && g.live.icon ? g.live.icon : null,
      image: g.appid ? steamImg(g.appid, 'header.jpg') : r.icon || r.hero || null,
      since: g.live ? g.live.since : g.open.s,
      url: g.live && g.live.url ? g.live.url : g.appid ? `https://store.steampowered.com/app/${g.appid}` : null,
    };
  }
  try {
    const res = await presence.update(db.settings, act);
    if (res.state !== presenceState) { presenceState = res.state; notify(); }
  } catch {}
}

/* ---------------- screenshots this week ---------------- */
async function countImages(dir, since, depth = 0) {
  let n = 0;
  const ents = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (depth < 2 && e.name.toLowerCase() !== 'thumbnails') n += await countImages(p, since, depth + 1); }
    else if (/\.(png|jpe?g|jxr|webp)$/i.test(e.name)) { const st = await fsp.stat(p).catch(() => null); if (st && st.mtimeMs >= since) n++; }
  }
  return n;
}
async function screenshotsSince(since) {
  const dirs = [path.join(app.getPath('pictures'), 'Screenshots'), path.join(app.getPath('videos'), 'Captures')];
  const steamUser = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Steam', 'userdata');
  for (const u of await fsp.readdir(steamUser).catch(() => [])) {
    const remote = path.join(steamUser, u, '760', 'remote');
    for (const a of await fsp.readdir(remote).catch(() => [])) dirs.push(path.join(remote, a, 'screenshots'));
  }
  let n = 0; for (const d of dirs) n += await countImages(d, since);
  return n;
}

/* ---------------- window + tray ---------------- */
function createWindow(show = true) {
  win = new BrowserWindow({
    width: 1360, height: 840, minWidth: 940, minHeight: 600, show: false,
    backgroundColor: '#0b0b0d', icon: ICON, title: 'Nightfall Launcher',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#d6d6dc', height: 34 },
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => { if (show) win.show(); });
  win.on('close', (e) => {
    if (!app.isQuitting && db.settings.closeToTray) { e.preventDefault(); win.hide(); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}
function showWindow() { if (!win || win.isDestroyed()) createWindow(); else { win.show(); if (win.isMinimized()) win.restore(); win.focus(); } }
function loginPath() { return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath; }
function updateTray() {
  if (!tray) return;
  const playing = db.games.filter((g) => g.open).map((g) => g.name);
  tray.setToolTip(playing.length ? `Nightfall — playing ${playing.join(', ')}` : 'Nightfall Launcher');
  const login = app.getLoginItemSettings({ path: loginPath() }).openAtLogin;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Nightfall', click: showWindow },
    { type: 'separator' },
    ...(playing.length ? [{ label: 'Tracking: ' + playing.join(', '), enabled: false }, { type: 'separator' }] : []),
    { label: 'Start with Windows', type: 'checkbox', checked: login, click: (i) => setLogin(i.checked) },
    { label: 'Keep tracking when closed', type: 'checkbox', checked: db.settings.closeToTray, click: (i) => { db.settings.closeToTray = i.checked; save(); notify(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
}
function setLogin(on) {
  app.setLoginItemSettings({ openAtLogin: on, path: loginPath(), args: ['--hidden'] });
  updateTray(); notify();
}

/* ---------------- IPC ---------------- */
ipcMain.handle('lib:get', () => snapshot());
ipcMain.handle('lib:add-dialog', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Add games', buttonLabel: 'Add to library', properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Games', extensions: ['exe', 'lnk'] }],
  });
  return r.canceled ? [] : addPaths(r.filePaths);
});
ipcMain.handle('lib:add-paths', (_e, paths) => addPaths(Array.isArray(paths) ? paths.filter((p) => typeof p === 'string') : []));
ipcMain.handle('game:launch', async (_e, id) => {
  const g = byId(id); if (!g) return 'Game not found';
  setTimeout(tick, 3000);
  try {
    if (g.launch && g.launch.uri) { await shell.openExternal(g.launch.uri); return null; }
    if (g.launch && g.launch.cmd && fs.existsSync(g.launch.cmd)) {
      spawn(g.launch.cmd, g.launch.args || [], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
      return null;
    }
  } catch (e) { /* fall back to the exe below */ }
  if (!fs.existsSync(g.exe)) return 'The game file was moved or deleted. Remove it and add it again.';
  const err = await shell.openPath(g.exe);
  return err || null;
});
ipcMain.handle('lib:scan', () => scan());
ipcMain.handle('lib:connect', (_e, indexes) => connect(Array.isArray(indexes) ? indexes.map(Number) : []));
ipcMain.handle('game:update', (_e, id, patch) => {
  const g = byId(id); if (!g) return;
  if (typeof patch.name === 'string' && patch.name.trim()) g.name = patch.name.trim().slice(0, 120);
  if (typeof patch.proc === 'string' && patch.proc.trim()) g.proc = patch.proc.trim().toLowerCase().slice(0, 300);
  if (typeof patch.fav === 'boolean') g.fav = patch.fav;
  save(); notify();
});
ipcMain.handle('game:remove', async (_e, id) => {
  const i = db.games.findIndex((g) => g.id === id); if (i < 0) return;
  const gone = db.games[i];
  db.ignored.push({ exe: lc(gone.exe), appid: gone.appid || null }); // don't auto-add it back
  db.collections.forEach((c) => { c.games = c.games.filter((x) => x !== id); });
  db.games.splice(i, 1);
  await fsp.rm(path.join(ART_DIR, id), { recursive: true, force: true }).catch(() => {});
  save(); notify();
});
ipcMain.handle('game:show-file', (_e, id) => { const g = byId(id); if (g) shell.showItemInFolder(g.exe); });
ipcMain.handle('art:search', async (_e, q) => { try { return await steamSearch(String(q || '').slice(0, 100)); } catch { return null; } });
ipcMain.handle('art:apply', async (_e, id, appid, name) => {
  const g = byId(id); if (!g) return;
  g.appid = +appid; g.custom = {}; if (name) g.name = String(name).slice(0, 120);
  g.status = 'searching'; notify();
  try { await fetchArt(g); g.status = 'ready'; } catch { g.status = 'offline'; }
  save(); notify();
});
ipcMain.handle('art:refetch', async (_e, id) => { const g = byId(id); if (g) { g.custom = {}; await enrich(g, { lookupName: false }); } });
ipcMain.handle('art:custom', async (_e, id, kind) => {
  const g = byId(id); if (!g || !['cover', 'hero', 'logo'].includes(kind)) return;
  const r = await dialog.showOpenDialog(win, { title: 'Choose an image', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }] });
  if (r.canceled) return;
  const dir = path.join(ART_DIR, g.id); await fsp.mkdir(dir, { recursive: true });
  const dest = path.join(dir, 'custom-' + kind + path.extname(r.filePaths[0]).toLowerCase());
  await fsp.copyFile(r.filePaths[0], dest);
  g.art = g.art || {}; g.custom = g.custom || {};
  g.art[kind] = dest; g.custom[kind] = true; g.artVer = Date.now();
  save(); notify();
});
ipcMain.handle('stats:screenshots', (_e, since) => screenshotsSince(+since || 0));
ipcMain.handle('app:settings', () => ({ ...db.settings, startWithWindows: app.getLoginItemSettings({ path: loginPath() }).openAtLogin }));
ipcMain.handle('app:set', (_e, key, val) => {
  if (key === 'startWithWindows') setLogin(!!val);
  if (key === 'closeToTray') { db.settings.closeToTray = !!val; save(); updateTray(); }
  if (key === 'discordEnabled' || key === 'autoAddInstalled') { db.settings[key] = !!val; save(); notify(); pushPresence(); }
  if (key === 'discordClientId') { db.settings.discordClientId = String(val || '').replace(/\D/g, '').slice(0, 22); save(); notify(); pushPresence(); }
});

/* ---------------- details (Roblox experiences, Minecraft instances) ---------------- */
ipcMain.handle('details:get', async (_e, id) => {
  const g = byId(id); if (!g) return null;
  try { const d = await detailsFor(g, db.caches); save(); return d; } catch { return null; }
});

/* ---------------- collections & favorites ---------------- */
ipcMain.handle('col:create', (_e, name, gameId) => {
  const n = String(name || '').trim().slice(0, 40); if (!n) return null;
  const c = { id: crypto.randomBytes(4).toString('hex'), name: n, games: gameId ? [gameId] : [] };
  db.collections.push(c); save(); notify(); return c.id;
});
ipcMain.handle('col:rename', (_e, id, name) => { const c = db.collections.find((x) => x.id === id); const n = String(name || '').trim().slice(0, 40); if (c && n) { c.name = n; save(); notify(); } });
ipcMain.handle('col:delete', (_e, id) => { db.collections = db.collections.filter((x) => x.id !== id); save(); notify(); });
ipcMain.handle('col:toggle', (_e, id, gameId) => {
  const c = db.collections.find((x) => x.id === id); if (!c || !byId(gameId)) return;
  c.games = c.games.includes(gameId) ? c.games.filter((x) => x !== gameId) : [...c.games, gameId];
  save(); notify();
});

/* ---------------- owned Steam & Epic libraries ---------------- */
let owned = null, ownedAt = 0;
async function refreshOwned(force) {
  if (owned && !force && Date.now() - ownedAt < 10 * 60000) return owned;
  owned = await ownedLibraries(db.caches.steam);
  ownedAt = Date.now();
  // Steam's own all-time playtime, shown on connected Steam games
  const byApp = Object.fromEntries(owned.games.filter((x) => x.appid).map((x) => [x.appid, x.playMin]));
  for (const g of db.games) if (g.appid && byApp[g.appid] != null) g.steamMin = byApp[g.appid];
  save();
  return owned;
}
ipcMain.handle('owned:get', async (_e, force) => {
  const o = await refreshOwned(!!force);
  // mark which owned games are already installed and connected here
  const games = o.games.map((x) => {
    const g = db.games.find((y) => (x.appid && y.appid === x.appid) || norm(y.name) === norm(x.name) || (x.ns && y.launch && y.launch.uri && y.launch.uri.includes(x.ns)));
    return { ...x, gameId: g ? g.id : null };
  });
  return { steam: o.steam, epic: o.epic, games };
});
ipcMain.handle('owned:open', async (_e, uri) => {
  // only the two launchers' own install / launch links (and their store pages) are allowed
  if (!/^(steam:\/\/(install|rungameid)\/\d+|com\.epicgames\.launcher:\/\/apps\/[\w%.-]+\?action=(install|launch)(&silent=true)?|https:\/\/store\.steampowered\.com\/app\/\d+)$/.test(String(uri))) return 'Not a Steam or Epic link';
  await shell.openExternal(uri);
  scheduleAutoAdd(90000); // pick the game up once it finishes installing
  return null;
});

/* newly installed Steam / Epic games join the library by themselves */
let autoTimer = null;
function scheduleAutoAdd(ms) { clearTimeout(autoTimer); autoTimer = setTimeout(autoAdd, ms); }
async function autoAdd() {
  scheduleAutoAdd(10 * 60000);
  if (!db.settings.autoAddInstalled) return;
  try {
    const items = await scanAll();
    const ignored = (it) => db.ignored.some((x) => x.exe === lc(it.exe) || (it.appid && x.appid === it.appid));
    lastScan = items;
    const pick = items.map((it, i) => [it, i]).filter(([it]) => (it.source === 'steam' || it.source === 'epic') && !alreadyIn(it) && !ignored(it)).map(([, i]) => i);
    if (pick.length) connect(pick);
  } catch {}
}

/* ---------------- auto-update (installed version only; the portable .exe can't replace itself) ---------------- */
function setUpdate(s) { updateState = s; notify(); }
function initUpdater() {
  if (!autoUpdater || !app.isPackaged || process.env.PORTABLE_EXECUTABLE_FILE) { updateState = { state: app.isPackaged ? 'portable' : 'dev' }; return; }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => setUpdate({ state: 'checking' }));
  autoUpdater.on('update-not-available', () => setUpdate({ state: 'latest', at: Date.now() }));
  autoUpdater.on('update-available', (i) => setUpdate({ state: 'downloading', version: i.version, percent: 0 }));
  autoUpdater.on('download-progress', (p) => setUpdate({ state: 'downloading', version: updateState.version, percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => setUpdate({ state: 'ready', version: i.version }));
  autoUpdater.on('error', (e) => setUpdate({ state: 'error', message: String((e && e.message) || e).slice(0, 160) }));
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 8000); setInterval(check, 6 * 3600 * 1000);
}
ipcMain.handle('update:check', () => { if (autoUpdater && updateState.state !== 'portable' && updateState.state !== 'dev') return autoUpdater.checkForUpdates().then(() => null).catch((e) => String(e.message || e)); return 'Updates work in the installed version.'; });
ipcMain.handle('update:install', () => { if (updateState.state === 'ready') { app.isQuitting = true; autoUpdater.quitAndInstall(false, true); } });

/* ---------------- lifecycle ---------------- */
app.on('second-instance', showWindow);
app.whenReady().then(() => {
  app.setAppUserModelId('app.nightfall.launcher');
  loadDb();
  createWindow(!process.argv.includes('--hidden'));
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.on('click', showWindow);
  updateTray();
  // retry art for games added while offline, and once for games that predate the HoYoverse / Microsoft Store sources
  for (const g of db.games) {
    const missing = !(g.art && (g.art.hero || g.art.header)) && !(g.custom && g.custom.hero);
    if (g.status === 'offline' || g.status === 'searching' || (missing && g.artRev !== 2)) { g.artRev = 2; queueEnrich(g); }
  }
  tick(); setInterval(tick, TICK_MS);
  initUpdater();
  scheduleAutoAdd(20000);
  setTimeout(() => refreshOwned(false).then(() => notify()).catch(() => {}), 12000);
});
app.on('before-quit', () => {
  app.isQuitting = true;
  presence.stop().catch(() => {});
  const now = Date.now();
  for (const g of db.games) if (g.open) { if (now - g.open.s >= MIN_SESSION_MS) g.sessions.push({ s: g.open.s, e: now }); g.open = null; }
  flushSave();
});
app.on('window-all-closed', () => { if (!db.settings.closeToTray) app.quit(); });
