// Your owned Steam and Epic libraries, read from what the Steam and Epic launchers already keep on this PC.
// No password or API key: installs are handed to the official launcher with its own install link.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { execFile } = require('child_process');

const PF86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
const PDATA = process.env.ProgramData || 'C:\\ProgramData';
const STEAM_CDN = 'https://shared.akamai.steamstatic.com/store_item_assets/';

function regSteamPath() {
  return new Promise((res) => execFile('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { windowsHide: true }, (e, out) => {
    const m = /SteamPath\s+REG_SZ\s+(.+)/.exec(out || ''); res(m ? m[1].trim().replace(/\//g, '\\') : path.join(PF86, 'Steam'));
  }));
}

/* ---------------- Steam ---------------- */
async function steamAccount() {
  const root = await regSteamPath();
  const t = await fsp.readFile(path.join(root, 'config', 'loginusers.vdf'), 'utf8').catch(() => '');
  const users = [];
  for (const m of t.matchAll(/"(\d{17})"\s*\{([^}]*)\}/g)) {
    const f = (k) => (new RegExp(`"${k}"\\s+"([^"]*)"`, 'i').exec(m[2]) || [])[1];
    users.push({ id64: m[1], persona: f('PersonaName'), recent: f('MostRecent') === '1', ts: +(f('Timestamp') || 0) });
  }
  const u = users.find((x) => x.recent) || users.sort((a, b) => b.ts - a.ts)[0];
  if (!u) return null;
  return { root, id64: u.id64, accountId: String(BigInt(u.id64) - 76561197960265728n), persona: u.persona };
}
async function steamPlaytime(acct) {
  const t = await fsp.readFile(path.join(acct.root, 'userdata', acct.accountId, 'config', 'localconfig.vdf'), 'utf8').catch(() => '');
  const out = {};
  // "apps" blocks: "<appid>" { ... "LastPlayed" "…" "Playtime" "<minutes>" ... }
  for (const m of t.matchAll(/"(\d+)"\s*\{([^{}]*?"(?:Playtime|LastPlayed)"[^{}]*)\}/g)) {
    const pt = /"Playtime"\s+"(\d+)"/.exec(m[2]), lp = /"LastPlayed"\s+"(\d+)"/.exec(m[2]);
    out[m[1]] = { min: pt ? +pt[1] : 0, last: lp ? +lp[1] * 1000 : 0 };
  }
  return out;
}
async function steamItems(ids, cache) {
  const need = ids.filter((id) => !cache[id] || Date.now() - cache[id].t > 14 * 864e5);
  for (let i = 0; i < need.length; i += 100) {
    const batch = need.slice(i, i + 100);
    const input = { ids: batch.map((a) => ({ appid: +a })), context: { language: 'english', country_code: 'US' }, data_request: { include_basic_info: true, include_assets: true } };
    try {
      const j = await (await fetch('https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=' + encodeURIComponent(JSON.stringify(input)))).json();
      for (const it of (j.response && j.response.store_items) || []) {
        if (!it.appid) continue;
        const a = it.assets || {}, url = (f) => (f && a.asset_url_format ? STEAM_CDN + a.asset_url_format.replace('${FILENAME}', f) : null);
        cache[it.appid] = { t: Date.now(), name: it.name, type: it.type, cover: url(a.library_capsule_2x || a.library_capsule), hero: url(a.library_hero_2x || a.library_hero), header: url(a.header) };
      }
      for (const id of batch) if (!cache[id]) cache[id] = { t: Date.now(), type: -1 }; // unknown / removed from store
    } catch { break; }
  }
}
async function steamLibrary(cache) {
  const acct = await steamAccount();
  if (!acct) return { account: null, games: [] };
  const ids = new Set();
  // the Steam client caches art for every app in your library
  for (const f of await fsp.readdir(path.join(acct.root, 'appcache', 'librarycache')).catch(() => [])) { const m = /^(\d+)/.exec(f); if (m) ids.add(m[1]); }
  const play = await steamPlaytime(acct);
  for (const id of Object.keys(play)) ids.add(id);
  await steamItems([...ids], cache);
  const games = [];
  for (const id of ids) {
    const c = cache[id];
    if (!c || c.type !== 0 || !c.name) continue; // type 0 = game (skips tools, DLC, soundtracks)
    games.push({ store: 'steam', id: 'steam:' + id, appid: +id, name: c.name, cover: c.cover, hero: c.hero, header: c.header,
      playMin: play[id] ? play[id].min : 0, last: play[id] ? play[id].last : 0,
      install: `steam://install/${id}`, run: `steam://rungameid/${id}`, page: `https://store.steampowered.com/app/${id}` });
  }
  return { account: { name: acct.persona, id: acct.id64 }, games };
}

/* ---------------- Epic ---------------- */
async function epicLibrary() {
  const file = path.join(PDATA, 'Epic', 'EpicGamesLauncher', 'Data', 'Catalog', 'catcache.bin');
  let items;
  try { items = JSON.parse(Buffer.from(await fsp.readFile(file, 'utf8'), 'base64').toString('utf8')); } catch { return { account: null, games: [] }; }
  const seen = new Set(), games = [];
  for (const i of items) {
    const cats = (i.categories || []).map((c) => c.path);
    if (!cats.includes('games') || cats.some((c) => /addons|digitalextras|hidden/.test(c))) continue;
    const rel = (i.releaseInfo || []).find((r) => (r.platform || []).includes('Windows'));
    if (!rel || !rel.appId || seen.has(i.namespace)) continue;
    seen.add(i.namespace);
    const img = (...types) => { for (const t of types) { const k = (i.keyImages || []).find((x) => x.type === t); if (k) return k.url; } return null; };
    const name = (i.title || '').replace(/\u00a0/g, ' ').trim();
    games.push({ store: 'epic', id: 'epic:' + i.namespace, ns: i.namespace, appName: rel.appId, name,
      cover: img('DieselGameBoxTall', 'OfferImageTall'), hero: img('DieselGameBox', 'OfferImageWide', 'Featured'), header: img('DieselGameBoxWide', 'OfferImageWide'), logo: img('DieselGameBoxLogo'),
      playMin: 0, last: 0, developer: i.developer,
      install: `com.epicgames.launcher://apps/${i.namespace}%3A${i.id}%3A${rel.appId}?action=install`,
      run: `com.epicgames.launcher://apps/${i.namespace}%3A${i.id}%3A${rel.appId}?action=launch&silent=true` });
  }
  return { account: games.length ? { name: 'Epic Games' } : null, games };
}

async function ownedLibraries(steamCache) {
  const [s, e] = await Promise.all([steamLibrary(steamCache).catch(() => ({ account: null, games: [] })), epicLibrary().catch(() => ({ account: null, games: [] }))]);
  return { steam: s.account, epic: e.account, games: [...s.games, ...e.games].sort((a, b) => a.name.localeCompare(b.name)) };
}

module.exports = { ownedLibraries, steamAccount };
