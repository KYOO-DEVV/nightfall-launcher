// Per-game detail: which Roblox experiences you played, which Minecraft instances/profiles.
// Everything is read from the games' own local logs, so history from before Nightfall shows up too.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const zlib = require('zlib');
const os = require('os');

const LOCAL = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const ROAMING = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const UA = { headers: { 'User-Agent': 'NightfallLauncher/1.3 (desktop game library)' } };
const LIVE_MS = 3 * 60 * 1000;

/* =================== Roblox =================== */
const RBX_LOGS = path.join(LOCAL, 'Roblox', 'logs');
const rbxFileCache = new Map(); // file -> { key, segs }

function parseRobloxLog(text, live) {
  const segs = []; let cur = null, last = 0;
  for (const line of text.split('\n')) {
    if (line.charCodeAt(0) !== 50) continue; // lines we care about start with "2…" (an ISO timestamp)
    const ts = Date.parse(line.slice(0, 24)); if (Number.isNaN(ts)) continue;
    last = ts;
    const j = /game_join_loadtime: placeid:(\d+),.*?universeid:(\d+)/.exec(line);
    if (j) {
      if (cur && cur.u === j[2]) continue; // teleport inside the same experience
      if (cur) { cur.e = ts; segs.push(cur); }
      cur = { u: j[2], p: j[1], s: ts, e: null };
      continue;
    }
    if (cur && /Disconnected from server for reason|\[FLog::Network\] Connection lost/.test(line)) { cur.e = ts; segs.push(cur); cur = null; }
  }
  if (cur) { cur.e = live ? null : last; segs.push(cur); }
  // merge reconnects / teleports of the same experience that are less than 2 minutes apart
  const out = [];
  for (const s of segs) {
    const prev = out[out.length - 1];
    if (prev && prev.u === s.u && prev.e && s.s - prev.e < 120000) { prev.e = s.e; continue; }
    out.push(s);
  }
  return out.filter((s) => s.e === null || s.e - s.s >= 20000);
}
async function robloxSegments() {
  const files = (await fsp.readdir(RBX_LOGS).catch(() => [])).filter((f) => /Player/i.test(f) && !/crash|studio/i.test(f) && /\.log$/i.test(f));
  const all = [];
  const now = Date.now();
  for (const f of files) {
    const p = path.join(RBX_LOGS, f);
    const st = await fsp.stat(p).catch(() => null); if (!st) continue;
    const live = now - st.mtimeMs < LIVE_MS;
    const key = st.size + ':' + st.mtimeMs + ':' + live;
    let c = rbxFileCache.get(p);
    if (!c || c.key !== key) {
      const text = await fsp.readFile(p, 'utf8').catch(() => '');
      c = { key, segs: parseRobloxLog(text, live) };
      rbxFileCache.set(p, c);
    }
    all.push(...c.segs);
  }
  return all.sort((a, b) => a.s - b.s);
}

/* experience names / icons from Roblox's public API, cached in the library file */
async function resolveUniverses(ids, cache) {
  const need = [...new Set(ids)].filter((u) => !cache[u] || Date.now() - cache[u].t > 7 * 864e5);
  for (let i = 0; i < need.length; i += 50) {
    const batch = need.slice(i, i + 50);
    try {
      const g = await (await fetch('https://games.roblox.com/v1/games?universeIds=' + batch.join(','), UA)).json();
      for (const x of g.data || []) cache[x.id] = { ...(cache[x.id] || {}), name: x.name, creator: x.creator && x.creator.name, place: x.rootPlaceId, t: Date.now() };
      const ic = await (await fetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${batch.join(',')}&returnPolicy=PlaceHolder&size=256x256&format=Png&isCircular=false`, UA)).json();
      for (const x of ic.data || []) if (cache[x.targetId]) cache[x.targetId].icon = x.imageUrl;
      const th = await (await fetch(`https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${batch.join(',')}&countPerUniverse=1&size=768x432&format=Png`, UA)).json();
      for (const x of th.data || []) if (cache[x.universeId] && x.thumbnails && x.thumbnails[0]) cache[x.universeId].thumb = x.thumbnails[0].imageUrl;
    } catch { /* offline: names fill in next time */ }
  }
}

async function robloxDetails(cache) {
  const segs = await robloxSegments();
  await resolveUniverses(segs.map((s) => s.u), cache);
  const now = Date.now(), by = {};
  for (const s of segs) {
    const it = by[s.u] || (by[s.u] = { key: s.u, ms: 0, sessions: 0, last: 0, live: false, plays: [] });
    const e = s.e || now;
    it.ms += e - s.s; it.sessions++; it.last = Math.max(it.last, e); it.plays.push({ s: s.s, e });
    if (!s.e) it.live = true;
  }
  const items = Object.values(by).map((it) => {
    const c = cache[it.key] || {};
    return { ...it, name: c.name || 'Experience ' + it.key, sub: c.creator ? 'by ' + c.creator : '', icon: c.icon || null, thumb: c.thumb || null,
      url: c.place ? `https://www.roblox.com/games/${c.place}` : null };
  }).sort((a, b) => b.last - a.last);
  const liveItem = items.find((i) => i.live);
  const liveSeg = segs.find((s) => !s.e);
  return { kind: 'roblox', title: 'Experiences', source: "Roblox's logs", items, plays: segs.map((s) => ({ s: s.s, e: s.e || now, key: s.u })),
    live: liveItem ? { name: liveItem.name, icon: liveItem.icon, since: liveSeg.s, url: liveItem.url } : null };
}

/* =================== Minecraft =================== */
function minecraftInstances() {
  const out = [];
  const add = (name, dir, launcher) => { if (fs.existsSync(path.join(dir, 'logs'))) out.push({ name, dir, launcher }); };
  const list = (root) => { try { return fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return []; } };
  for (const n of list(path.join(ROAMING, 'ModrinthApp', 'profiles'))) add(n, path.join(ROAMING, 'ModrinthApp', 'profiles', n), 'Modrinth');
  for (const n of list(path.join(ROAMING, 'PrismLauncher', 'instances'))) {
    const base = path.join(ROAMING, 'PrismLauncher', 'instances', n);
    add(n, fs.existsSync(path.join(base, '.minecraft')) ? path.join(base, '.minecraft') : path.join(base, 'minecraft'), 'Prism');
  }
  for (const n of list(path.join(os.homedir(), 'curseforge', 'minecraft', 'Instances'))) add(n, path.join(os.homedir(), 'curseforge', 'minecraft', 'Instances', n), 'CurseForge');
  add('Minecraft (default)', path.join(ROAMING, '.minecraft'), 'Minecraft Launcher');
  return out;
}
const TIME = /^\[(\d\d):(\d\d):(\d\d)/;
function spanOf(text, day) {
  // first / last [HH:MM:SS] stamps; a session that crosses midnight wraps to the next day
  let first = null, last = null, servers = new Set(), single = false;
  for (const line of text.split('\n')) {
    const m = TIME.exec(line); if (!m) continue;
    const t = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
    if (first === null) first = t; last = t;
    if (line.includes('Connecting to ')) { const s = /Connecting to ([^,\s]+),/.exec(line); if (s) servers.add(s[1]); }
    if (line.includes('Starting integrated minecraft server')) single = true;
  }
  if (first === null) return null;
  const s = day + first * 1000; let e = day + last * 1000; if (e < s) e += 864e5;
  return { s, e, servers: [...servers], single };
}
async function minecraftDetails(cache) {
  const now = Date.now(); const plays = [], items = [];
  for (const inst of minecraftInstances()) {
    const logs = path.join(inst.dir, 'logs');
    const files = await fsp.readdir(logs).catch(() => []);
    const it = { key: inst.dir, name: inst.name, sub: inst.launcher, ms: 0, sessions: 0, last: 0, live: false, servers: {} };
    for (const f of files) {
      const p = path.join(logs, f);
      let span;
      const dm = /^(\d{4})-(\d\d)-(\d\d)-\d+\.log\.gz$/.exec(f);
      if (dm) {
        if (cache[p]) span = cache[p];
        else {
          try { span = spanOf(zlib.gunzipSync(await fsp.readFile(p)).toString('utf8'), new Date(+dm[1], +dm[2] - 1, +dm[3]).getTime()); } catch { span = null; }
          cache[p] = span || 0; // gz logs never change: remember even "nothing here"
        }
      } else if (f === 'latest.log') {
        const st = await fsp.stat(p).catch(() => null); if (!st) continue;
        const text = await fsp.readFile(p, 'utf8').catch(() => '');
        const d = new Date(st.mtimeMs); d.setHours(0, 0, 0, 0);
        span = spanOf(text, d.getTime());
        if (span && span.e > st.mtimeMs + 60000) { span.s -= 864e5; span.e -= 864e5; } // started the day before
        if (span && now - st.mtimeMs < LIVE_MS) { span.e = now; span.live = true; }
        // latest.log is the newest session: skip it if a .gz with the same start already exists
      } else continue;
      if (!span || span.e - span.s < 60000) continue;
      if (plays.some((x) => x.key === inst.dir && Math.abs(x.s - span.s) < 5000)) continue;
      plays.push({ s: span.s, e: span.e, key: inst.dir });
      it.ms += span.e - span.s; it.sessions++; it.last = Math.max(it.last, span.e);
      if (span.live) it.live = true;
      for (const sv of span.servers) it.servers[sv] = (it.servers[sv] || 0) + 1;
      if (span.single) it.servers.Singleplayer = (it.servers.Singleplayer || 0) + 1;
    }
    if (it.sessions) {
      const top = Object.entries(it.servers).sort((a, b) => b[1] - a[1])[0];
      it.sub = inst.launcher + (top ? ' · mostly ' + top[0] : '');
      items.push(it);
    }
  }
  items.sort((a, b) => b.last - a.last);
  const liveItem = items.find((i) => i.live);
  return { kind: 'minecraft', title: 'Instances', source: 'Minecraft logs', items, plays,
    live: liveItem ? { name: liveItem.name, since: (plays.find((p) => p.key === liveItem.key && p.e >= now - 5000) || {}).s || now } : null };
}

/* which detail provider applies to a game */
function kindOf(g) {
  const p = (g.proc || '').toLowerCase();
  if (/robloxplayerbeta/.test(p) || /^roblox/i.test(g.name)) return 'roblox';
  if (g.source === 'minecraft' || /javaw\.exe/.test(p)) return 'minecraft';
  return null;
}
async function detailsFor(g, caches) {
  const k = kindOf(g);
  if (k === 'roblox') return robloxDetails(caches.rbx);
  if (k === 'minecraft') return minecraftDetails(caches.mc);
  return null;
}

module.exports = { detailsFor, kindOf, robloxDetails, minecraftDetails };
