// Finds installed games across the PC, the way GeForce Experience's scan does:
// launcher records first (exact), then Windows registrations, shortcuts and game-engine folders (heuristic).
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { execFile } = require('child_process');

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const exists = (p) => { try { return !!p && fs.existsSync(p); } catch { return false; } };
const ENV = (k, d) => process.env[k] || d;
const PF = ENV('ProgramFiles', 'C:\\Program Files');
const PF86 = ENV('ProgramFiles(x86)', 'C:\\Program Files (x86)');
const LOCAL = ENV('LOCALAPPDATA', path.join(require('os').homedir(), 'AppData', 'Local'));
const ROAMING = ENV('APPDATA', path.join(require('os').homedir(), 'AppData', 'Roaming'));
const PDATA = ENV('ProgramData', 'C:\\ProgramData');
const drives = () => 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => l + ':\\').filter(exists);

/* ---------- shell helpers ---------- */
function reg(key) {
  return new Promise((res) => {
    execFile('reg', ['query', key, '/s'], { windowsHide: true, maxBuffer: 64 * 1024 * 1024 }, (err, out) => {
      const r = {}; let cur = null;
      if (!err) for (const line of out.split(/\r?\n/)) {
        if (/^HKEY_/.test(line)) cur = r[line.trim()] = {};
        else if (cur) { const m = /^\s{4}(.+?)\s{4}(REG_\w+)\s{4}(.*)$/.exec(line); if (m) cur[m[1]] = m[3].trim(); }
      }
      res(r);
    });
  });
}
async function regValue(key, name) { for (const v of Object.values(await reg(key))) if (v[name]) return v[name]; return null; }
function ps(script) {
  return new Promise((res) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
      '[Console]::OutputEncoding=[Text.Encoding]::UTF8;' + script],
    { windowsHide: true, maxBuffer: 32 * 1024 * 1024, timeout: 45000 }, (err, out) => {
      try { const j = JSON.parse(out || 'null'); res(Array.isArray(j) ? j : j ? [j] : []); } catch { res([]); }
    });
  });
}

/* ---------- is this folder a game? (engine fingerprints) ---------- */
// strong = only games ship these; weak = common in games but also elsewhere
const STRONG_FILE = /^(unityplayer\.dll|gameassembly\.dll|steam_api(64)?\.dll|eossdk-win(32|64)-shipping\.dll|bink2?w(32|64)\.dll|fmod(studio|_event)?(64)?\.dll|physx(3)?_?(x)?64\.dll|physx3common_x64\.dll|galaxy(64)?\.dll|.+\.pck|.+\.rgss3a|.+\.rpa|package\.nw|data\.win|game\.rgss3a)$/i;
const WEAK_FILE = /^(xinput1_3\.dll|openal32\.dll|sdl2\.dll|d3dx9_43\.dll|nw\.exe|.+\.pak|game\.ini)$/i;
const STRONG_DIR = /^(.+_data|renpy|paks)$/i;
const WEAK_DIR = /^(engine|www|gamedata|maps|baseq3)$/i;
// Chromium / Electron / Qt desktop apps also ship .pak files and locales — never count those as games
const APP_FILE = /^(resources\.pak|chrome_100_percent\.pak|libcef\.dll|icudtl\.dat|v8_context_snapshot\.bin|qt[56]core\.dll|qt[56]widgets\.dll|ffmpeg\.dll)$/i;
async function isGameDir(dir) {
  let ents; try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return false; }
  let strong = 0, weak = 0, app = false;
  for (const e of ents) {
    if (e.isFile()) {
      if (APP_FILE.test(e.name)) app = true;
      else if (STRONG_FILE.test(e.name)) strong++;
      else if (WEAK_FILE.test(e.name)) weak++;
    } else if (e.isDirectory()) {
      if (STRONG_DIR.test(e.name)) strong++;
      else if (WEAK_DIR.test(e.name)) weak++;
    }
  }
  if (app && !/unityplayer|gameassembly/i.test(ents.map((e) => e.name).join('|'))) return false;
  return strong >= 1 && strong + weak >= 2;
}

/* ---------- picking the game's .exe inside an install folder ---------- */
const BAD_EXE = /(crash|unins|redist|setup|install|updat|report|helper|anti.?cheat|easyanti|^eac|battleye|^be_?service|start_protected|dxsetup|vc_?redist|dotnet|^cef|webhelper|overlay|prereq|dump|bugsplat|patcher|service|server|benchmark|sdk|python|java|^node|7za?$|crs-|elevate|notification|uploader|downloader|repair|cleanup|touchup|activation|register|unitycrashhandler|shadercache|cmd$|console|^nw$|notifu|dxwebsetup|oalinst|physxupdate)/i;
async function walkExes(dir, maxDepth = 4) {
  const out = []; let seen = 0;
  async function walk(d, depth) {
    if (depth > maxDepth || seen > 4000) return;
    let ents; try { ents = await fsp.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (++seen > 4000) return;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!/^(_commonredist|redist|redistributables|directx|vcredist|support|__installer|installers?|tools|crashreport|crashpad|logs|saved|mods|_data|.+_data|shadercache|cache)$/i.test(e.name)) await walk(p, depth + 1); }
      else if (/\.exe$/i.test(e.name) && !BAD_EXE.test(path.basename(e.name, '.exe'))) {
        try { const st = await fsp.stat(p); out.push({ p, size: st.size, depth }); } catch {}
      }
    }
  }
  await walk(dir, 0);
  return out;
}
async function pickExes(dir, name, prefer) {
  const list = await walkExes(dir);
  if (!list.length) return { main: null, procs: [] };
  const n = norm(name);
  const score = (x) => {
    const stem = norm(path.basename(x.p, '.exe'));
    let s = Math.log10(x.size + 1) - x.depth * 0.6;
    if (prefer && prefer.some((p) => stem === norm(p))) s += 20;
    if (stem.length >= 3 && (n.includes(stem) || stem.includes(n))) s += 6;
    if (/shipping/.test(stem)) s += 3;
    if (/binaries[\\/]win64/i.test(x.p)) s += 1;
    if (/launcher/.test(stem)) s -= 2;
    return s;
  };
  list.sort((a, b) => score(b) - score(a));
  return { main: list[0].p, procs: [...new Set(list.slice(0, 10).map((x) => path.basename(x.p).toLowerCase()))] };
}

/* ================= exact sources ================= */

/* Steam: manifests in every library folder */
const STEAM_SKIP = /redistributable|^proton|steam linux runtime|steamvr|soundtrack|dedicated server|\bsdk\b|steamworks|benchmark|playtest$|wallpaper engine/i;
async function steamLibs() {
  const root = ((await regValue('HKCU\\Software\\Valve\\Steam', 'SteamPath')) || path.join(PF86, 'Steam')).replace(/\//g, '\\');
  const libs = new Set([root]);
  try {
    const vdf = await fsp.readFile(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) libs.add(m[1].replace(/\\\\/g, '\\'));
  } catch {}
  for (const d of drives()) for (const n of ['SteamLibrary', 'Steam', 'Games\\SteamLibrary', 'Games\\Steam']) if (exists(path.join(d, n, 'steamapps'))) libs.add(path.join(d, n));
  return [...libs];
}
async function steam() {
  const items = [];
  for (const lib of await steamLibs()) {
    const sa = path.join(lib, 'steamapps');
    for (const f of await fsp.readdir(sa).catch(() => [])) {
      if (!/^appmanifest_\d+\.acf$/i.test(f)) continue;
      const t = await fsp.readFile(path.join(sa, f), 'utf8').catch(() => '');
      const appid = +(/"appid"\s+"(\d+)"/i.exec(t) || [])[1];
      const name = (/"name"\s+"([^"]+)"/i.exec(t) || [])[1];
      const inst = (/"installdir"\s+"([^"]+)"/i.exec(t) || [])[1];
      if (!appid || !name || !inst || STEAM_SKIP.test(name)) continue;
      const dir = path.join(sa, 'common', inst);
      if (!exists(dir)) continue;
      const ex = await pickExes(dir, name);
      if (!ex.main) continue;
      items.push({ source: 'steam', name, appid, dir, exe: ex.main, procs: ex.procs, launch: { uri: `steam://rungameid/${appid}` } });
    }
  }
  return items;
}

/* Epic Games */
async function epic() {
  const dir = path.join(PDATA, 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
  const items = [];
  for (const f of await fsp.readdir(dir).catch(() => [])) {
    if (!/\.item$/i.test(f)) continue;
    let j; try { j = JSON.parse(await fsp.readFile(path.join(dir, f), 'utf8')); } catch { continue; }
    if (j.bIsIncompleteInstall || !j.InstallLocation || !exists(j.InstallLocation)) continue;
    if (Array.isArray(j.AppCategories) && !j.AppCategories.includes('games')) continue;
    const exe = j.LaunchExecutable ? path.join(j.InstallLocation, j.LaunchExecutable) : null;
    const ex = await pickExes(j.InstallLocation, j.DisplayName, exe ? [path.basename(exe, '.exe')] : null);
    const main = exists(exe) ? exe : ex.main;
    if (!main) continue;
    items.push({
      source: 'epic', name: j.DisplayName, dir: j.InstallLocation, exe: main,
      procs: [...new Set([path.basename(main).toLowerCase(), ...ex.procs])],
      launch: { uri: `com.epicgames.launcher://apps/${j.CatalogNamespace}%3A${j.CatalogItemId}%3A${j.AppName}?action=launch&silent=true` },
    });
  }
  return items;
}

/* GOG Galaxy */
async function gog() {
  const items = [];
  for (const v of Object.values(await reg('HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games'))) {
    if (!v.gameName || !v.exe || !exists(v.exe)) continue;
    const dir = v.path || path.dirname(v.exe);
    const ex = await pickExes(dir, v.gameName);
    items.push({ source: 'gog', name: v.gameName, dir, exe: v.exe, procs: [...new Set([path.basename(v.exe).toLowerCase(), ...ex.procs])] });
  }
  return items;
}

/* Ubisoft Connect */
async function ubisoft() {
  const items = [];
  for (const [k, v] of Object.entries(await reg('HKLM\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs'))) {
    const id = (/\\Installs\\(\d+)$/i.exec(k) || [])[1];
    const dir = v.InstallDir && v.InstallDir.replace(/\//g, '\\');
    if (!id || !exists(dir)) continue;
    const name = path.basename(dir.replace(/\\$/, ''));
    const ex = await pickExes(dir, name);
    if (!ex.main) continue;
    items.push({ source: 'ubisoft', name, dir, exe: ex.main, procs: ex.procs, launch: { uri: `uplay://launch/${id}/0` } });
  }
  return items;
}

/* EA app / Origin and Rockstar Games Launcher write one registry key per game */
async function publisherKeys(source, keys, dirField, skip) {
  const items = [];
  for (const key of keys) {
    for (const [k, v] of Object.entries(await reg(key))) {
      const dir = (v[dirField] || '').replace(/"/g, '');
      if (!dir || !exists(dir)) continue;
      const name = k.split('\\').pop();
      if (skip.test(name)) continue;
      const ex = await pickExes(dir, name);
      if (!ex.main) continue;
      items.push({ source, name, dir, exe: ex.main, procs: ex.procs });
    }
  }
  return items;
}
const ea = () => publisherKeys('ea', ['HKLM\\SOFTWARE\\WOW6432Node\\EA Games', 'HKLM\\SOFTWARE\\WOW6432Node\\Electronic Arts', 'HKLM\\SOFTWARE\\EA Games'], 'Install Dir', /^(ea|ea app|ea desktop|origin|ea core|ea games|electronic arts|ea installer)$/i);
const rockstar = () => publisherKeys('rockstar', ['HKLM\\SOFTWARE\\WOW6432Node\\Rockstar Games'], 'InstallFolder', /launcher|social club|rockstar games$/i);

/* Riot Games */
const RIOT = {
  league_of_legends: { name: 'League of Legends', prefer: ['LeagueClient', 'League of Legends'] },
  valorant: { name: 'VALORANT', prefer: ['VALORANT-Win64-Shipping', 'VALORANT'] },
  bacon: { name: 'Legends of Runeterra', prefer: ['LoR'] },
  lion: { name: '2XKO', prefer: [] },
  teamfighttactics: { name: 'Teamfight Tactics', prefer: [] },
};
async function riot() {
  const base = path.join(PDATA, 'Riot Games');
  let rcs = null;
  try { const j = JSON.parse(await fsp.readFile(path.join(base, 'RiotClientInstalls.json'), 'utf8')); rcs = j.rc_default || j.rc_live; } catch {}
  const items = [];
  for (const d of await fsp.readdir(path.join(base, 'Metadata')).catch(() => [])) {
    const m = /^([a-z0-9_]+)\.live$/i.exec(d); if (!m) continue;
    const prod = m[1].toLowerCase();
    let dir = null;
    try {
      const files = await fsp.readdir(path.join(base, 'Metadata', d));
      const y = files.find((f) => f.endsWith('.product_settings.yaml'));
      dir = (/product_install_full_path:\s*"?([^"\r\n]+)"?/.exec(await fsp.readFile(path.join(base, 'Metadata', d, y), 'utf8')) || [])[1];
    } catch {}
    if (!dir || !exists(dir)) continue;
    const info = RIOT[prod] || { name: prod.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), prefer: [] };
    const ex = await pickExes(dir, info.name, info.prefer);
    if (!ex.main) continue;
    items.push({ source: 'riot', name: info.name, dir: path.normalize(dir), exe: ex.main, procs: ex.procs,
      launch: exists(rcs) ? { cmd: rcs, args: [`--launch-product=${prod}`, '--launch-patchline=live'] } : null });
  }
  return items;
}

/* HoYoPlay (Genshin, Star Rail, ZZZ, Honkai 3rd) — default folder plus every drive's HoYoPlay\games */
const HOYO = { starrail: 'Honkai: Star Rail', genshinimpact: 'Genshin Impact', yuanshen: 'Genshin Impact', zenlesszonezero: 'Zenless Zone Zero', bh3: 'Honkai Impact 3rd' };
async function hoyo() {
  const roots = new Set([path.join(PF, 'HoYoPlay', 'games')]);
  for (const d of drives()) for (const n of ['HoYoPlay\\games', 'Program Files\\HoYoPlay\\games', 'Games\\HoYoPlay\\games']) roots.add(path.join(d, n));
  const items = [];
  for (const root of roots) {
    for (const d of await fsp.readdir(root).catch(() => [])) {
      const dir = path.join(root, d);
      const ex = await pickExes(dir, d, Object.keys(HOYO));
      if (!ex.main) continue;
      const stem = norm(path.basename(ex.main, '.exe'));
      items.push({ source: 'hoyo', name: HOYO[stem] || d.replace(/\s*games?$/i, ''), dir, exe: ex.main, procs: ex.procs });
    }
  }
  return items;
}

/* Minecraft through any of its launchers (vanilla, Modrinth, Prism, CurseForge, Lunar, LabyMod…) */
async function minecraft() {
  const launchers = [
    path.join(PF86, 'Minecraft Launcher', 'MinecraftLauncher.exe'),
    path.join(LOCAL, 'Modrinth App', 'Modrinth App.exe'),
    path.join(LOCAL, 'Programs', 'PrismLauncher', 'prismlauncher.exe'),
    path.join(LOCAL, 'Programs', 'CurseForge Windows', 'CurseForge.exe'),
    path.join(LOCAL, 'Programs', 'launcher', 'Lunar Client.exe'),
    path.join(LOCAL, 'labymodlauncher', 'LabyModLauncher.exe'),
    path.join(LOCAL, 'Programs', 'Feather Launcher', 'Feather Launcher.exe'),
    path.join(ROAMING, '.minecraft', 'TLauncher.exe'),
  ].filter(exists);
  if (!launchers.length && !exists(path.join(ROAMING, '.minecraft'))) return [];
  const exe = launchers[0] || null;
  if (!exe) return [];
  return [{ source: 'minecraft', name: 'Minecraft', dir: path.join(ROAMING, '.minecraft'), exe, storeIcon: true,
    procs: ['javaw.exe', 'minecraft.windows.exe'], launchers: launchers.map((l) => path.basename(l, '.exe')) }];
}

/* Xbox app / Game Pass / Microsoft Store games */
async function xbox() {
  const rows = await ps(`Get-AppxPackage | Where-Object { $_.SignatureKind -eq 'Store' -and $_.InstallLocation -and ((Test-Path (Join-Path $_.InstallLocation 'MicrosoftGame.config')) -or $_.Name -eq 'Microsoft.MinecraftUWP') } | ForEach-Object { $c = Join-Path $_.InstallLocation 'MicrosoftGame.config'; [pscustomobject]@{ n=$_.Name; pfn=$_.PackageFamilyName; loc=$_.InstallLocation; cfg=$(if (Test-Path $c) { Get-Content -Raw $c } else { '' }) } } | ConvertTo-Json -Depth 3`);
  const explorer = path.join(process.env.SystemRoot || 'C:\\Windows', 'explorer.exe');
  const items = [];
  for (const r of rows) {
    let name = (/DefaultDisplayName="([^"]+)"/i.exec(r.cfg || '') || [])[1];
    const exeName = (/<Executable\s+Name="([^"]+)"/i.exec(r.cfg || '') || [])[1];
    const appId = (/<Executable[^>]*\sId="([^"]+)"/i.exec(r.cfg || '') || [])[1] || 'App';
    if (r.n === 'Microsoft.MinecraftUWP') name = 'Minecraft for Windows';
    if (!name || /^ms-resource:/i.test(name)) name = r.n.replace(/^[^.]+\./, '').replace(/([a-z])([A-Z])/g, '$1 $2');
    const exe = exeName ? path.join(r.loc, exeName) : path.join(r.loc, 'Minecraft.Windows.exe');
    items.push({ source: 'xbox', name, dir: r.loc, exe, procs: [path.basename(exe).toLowerCase()],
      launch: { cmd: explorer, args: [`shell:AppsFolder\\${r.pfn}!${appId}`] } });
  }
  return items;
}

/* ================= heuristic sources ================= */
const NOT_GAME = /launcher$|^launcher|client|\bsdk\b|vanguard|service|redist|runtime|anti.?cheat|studio|ivcam|driver|overlay|online services|intellisense|update|helper|hoyoplay|battle\.net|desktop app|^ea app|^ea$|origin|social club|uninstall|tools?$|editor|server|voicemod|discord|spotify|medal|obs|nvidia|geforce|blender|unity hub|unreal engine|epic games|steam$|^steam |google play|bluestacks|crash|benchmark|installer|setup|documentation|manual|readme|website|support/i;

/* other launchers via Windows' installed-programs list (Battle.net, EA, Rockstar, Roblox, …) */
const GAME_PUBS = /blizzard|rockstar|electronic arts|\bea\b|mojang|roblox|bethesda|bandai|square enix|capcom|\bsega\b|krafton|nexon|garena|wargaming|kuro games|hoyoverse|mihoyo|cognosphere|ubisoft|riot|2k games|activision|cd projekt|smilegate|ncsoft|pearl abyss|gaijin|innersloth|re-logic|mediatonic|epic games|valve|paradox|focus|devolver|team17|konami|nintendo|level-5|netease|tencent|perfect world|gearbox|bungie|digital extremes|grinding gear|jagex|amazon games|kakao|xbox game studios|microsoft studios/i;
async function registry() {
  const hives = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ];
  const items = [];
  for (const h of hives) {
    for (const v of Object.values(await reg(h))) {
      if (!v.DisplayName || v.SystemComponent === '0x1' || NOT_GAME.test(v.DisplayName)) continue;
      const name = v.DisplayName.replace(/\s+for\s+\S+$/i, '').trim();
      let exe = (v.DisplayIcon || '').replace(/"/g, '').replace(/,-?\d+$/, '');
      if (!/\.exe$/i.test(exe) || /unins|setup|install/i.test(path.basename(exe)) || !exists(exe)) exe = null;
      const dir = (v.InstallLocation && exists(v.InstallLocation)) ? v.InstallLocation : exe ? path.dirname(exe) : null;
      if (!dir) continue;
      // known game publisher, or the install folder itself looks like a game
      if (!GAME_PUBS.test(v.Publisher || '') && !(await isGameDir(dir))) continue;
      let procs = [];
      if (!exe || /launcher/i.test(path.basename(exe))) { const ex = await pickExes(dir, name); exe = exe || ex.main; procs = ex.procs; }
      if (!exe) continue;
      const roblox = /^roblox( player)?$/i.test(name);
      if (roblox) procs = ['robloxplayerbeta.exe'];
      items.push({ source: 'other', name: roblox ? 'Roblox' : name, dir, exe, procs: [...new Set([path.basename(exe).toLowerCase(), ...procs])].slice(0, 10),
        // Roblox moves its exe on every update, so open the Roblox home page instead
        launch: roblox ? { uri: 'https://www.roblox.com/home' } : null });
    }
  }
  return items;
}

/* Start menu + desktop shortcuts: steam:// and epic:// links, and .lnk files pointing into game folders */
async function shortcuts() {
  const rows = await ps(`$sh=New-Object -ComObject WScript.Shell; $d=@([Environment]::GetFolderPath('Programs'),[Environment]::GetFolderPath('CommonPrograms'),[Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('CommonDesktopDirectory')); $d | Where-Object { $_ -and (Test-Path $_) } | ForEach-Object { Get-ChildItem $_ -Recurse -Include *.lnk,*.url -ErrorAction SilentlyContinue } | ForEach-Object { if ($_.Extension -eq '.lnk') { $s=$sh.CreateShortcut($_.FullName); [pscustomobject]@{ n=$_.BaseName; t=$s.TargetPath; u='' } } else { [pscustomobject]@{ n=$_.BaseName; t=''; u=((Get-Content -LiteralPath $_.FullName | Select-String '^URL=' | Select-Object -First 1) -replace '^URL=','') } } } | ConvertTo-Json`);
  const items = [];
  for (const r of rows) {
    if (!r.n || NOT_GAME.test(r.n)) continue;
    const steamId = (/^steam:\/\/rungameid\/(\d+)/i.exec(r.u || '') || [])[1];
    if (steamId) { items.push({ source: 'steam', name: r.n, appid: +steamId, exe: null, dir: null, procs: [], launch: { uri: r.u }, needsExe: true }); continue; }
    if (/^com\.epicgames\.launcher:\/\//i.test(r.u || '')) { items.push({ source: 'epic', name: r.n, exe: null, dir: null, procs: [], launch: { uri: r.u }, needsExe: true }); continue; }
    if (!/\.exe$/i.test(r.t || '') || !exists(r.t) || /\\windows\\|\\windowsapps\\/i.test(r.t)) continue;
    const dir = path.dirname(r.t);
    if (!(await isGameDir(dir)) && !(await isGameDir(path.dirname(dir)))) continue;
    const ex = await pickExes(dir, r.n);
    items.push({ source: 'other', name: r.n, dir, exe: r.t, procs: [...new Set([path.basename(r.t).toLowerCase(), ...ex.procs])].slice(0, 10) });
  }
  return items.filter((i) => !i.needsExe); // steam/epic links are only used to confirm; their manifests give the exe
}

/* Common game folders on every drive (C:\Games, D:\Jeux, Program Files…) with an engine fingerprint */
const SKIP_DIR = /^(microsoft|windows|common files|internet explorer|nvidia|amd|intel|realtek|steam|epic games|hoyoplay|riot games|ubisoft|gog galaxy|ea|electronic arts|origin|rockstar games|battle\.net|google|mozilla|git|nodejs|python|java|jdk|obs-studio|blender foundation|dotnet|reference assemblies|msbuild|windowsapps|modifiablewindowsapps|package cache|uninstall information|installshield|application verifier|windows kits|cisco|malwarebytes|voicemod|softdeluxe|e2esoft|crystaldiskinfo|laragon|exm|saturne music|unity|unreal|godot|.+\.tmp)$/i;
async function folders() {
  const roots = [PF, PF86, path.join(LOCAL, 'Programs')];
  for (const d of drives()) for (const n of ['Games', 'Jeux', 'Juegos', 'Spiele', 'Giochi', 'Program Files\\Games']) roots.push(path.join(d, n));
  const items = [];
  for (const root of roots) {
    for (const e of await fsp.readdir(root, { withFileTypes: true }).catch(() => [])) {
      if (!e.isDirectory() || SKIP_DIR.test(e.name) || NOT_GAME.test(e.name)) continue;
      const dir = path.join(root, e.name);
      let gameDir = null;
      if (await isGameDir(dir)) gameDir = dir;
      else for (const s of await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])) {
        if (s.isDirectory() && await isGameDir(path.join(dir, s.name))) { gameDir = path.join(dir, s.name); break; }
      }
      if (!gameDir) continue;
      const ex = await pickExes(dir, e.name);
      if (!ex.main) continue;
      items.push({ source: 'other', name: e.name.replace(/[_.]+/g, ' ').trim(), dir, exe: ex.main, procs: ex.procs });
    }
  }
  return items;
}

/* exact sources first so they win de-duplication */
const SOURCES = { steam, epic, gog, ubisoft, riot, hoyo, ea, rockstar, xbox, minecraft, registry, shortcuts, folders };
async function scanAll() {
  const results = await Promise.all(Object.entries(SOURCES).map(async ([k, fn]) => { try { return await fn(); } catch (e) { console.error('scan', k, e); return []; } }));
  const seen = new Set(), out = [];
  for (const it of results.flat()) {
    if (!it.exe) continue;
    const dir = it.dir && it.dir.toLowerCase().replace(/[\\/]+$/, '');
    const keys = [norm(it.name), dir, it.exe.toLowerCase(), it.appid && 'steam' + it.appid].filter(Boolean);
    if (keys.some((k) => seen.has(k))) continue;
    // a heuristic hit inside a folder an exact source already claimed is the same game
    if (dir && [...seen].some((k) => k.includes('\\') && (dir.startsWith(k + '\\') || k.startsWith(dir + '\\')))) continue;
    keys.forEach((k) => seen.add(k));
    out.push(it);
  }
  return out;
}

module.exports = { scanAll, pickExes, norm, isGameDir };
