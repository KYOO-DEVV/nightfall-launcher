/* global nf, lib, state, $, esc, fmt, ago, clock, total, lastPlayed, within, fallbackBg, coverOf, heroOf, launch, select, toast, ordered, DAY, now,
   bgu, tile, thumbOf, wideOf, ICON_PLAY, applyView, renderRail, renderCards, renderHome, tipFor, movePill, render */
// Favorites & collections, per-game detail, All games (Steam + Epic), Year in review, Settings, auto-update banner.

const STAR = (on) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.2"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>`;
const hours = (min) => (min >= 600 ? Math.round(min / 60) + 'h' : (min / 60).toFixed(1).replace(/\.0$/, '') + 'h');
const DOW = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const gameById = (id) => lib.games.find((g) => g.id === id);
tipFor($('#allBtn'), () => 'All your games');
tipFor($('#settingsBtn'), () => 'Settings');

/* ================= favorites & collections ================= */
state.filter = '';
function libFilter(list) {
  if (state.filter === 'fav') return list.filter((g) => g.fav);
  const c = (lib.collections || []).find((x) => x.id === state.filter);
  return c ? list.filter((g) => c.games.includes(g.id)) : list;
}
function renderChips() {
  const cols = lib.collections || [];
  if (state.filter && state.filter !== 'fav' && !cols.some((c) => c.id === state.filter)) state.filter = '';
  const favN = lib.games.filter((g) => g.fav).length;
  const chip = (k, label, n) => `<button class="chip ${state.filter === k ? 'on' : ''}" data-f="${k}">${label}${n != null ? `<i>${n}</i>` : ''}</button>`;
  $('#libChips').innerHTML = chip('', 'All', lib.games.length) + chip('fav', STAR(state.filter === 'fav') + ' Favorites', favN)
    + cols.map((c) => chip(c.id, esc(c.name), c.games.filter(gameById).length)).join('')
    + '<button class="chip add" id="chipNew">+ New collection</button>';
  $('#libChips').querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => { state.filter = b.dataset.f; renderChips(); renderCards(true); }; });
  $('#chipNew').onclick = () => {
    const b = $('#chipNew');
    b.outerHTML = '<input class="chip-input" id="chipInput" maxlength="40" placeholder="Collection name, then Enter">';
    const i = $('#chipInput'); i.focus();
    i.onkeydown = async (e) => {
      if (e.key === 'Escape') return renderChips();
      if (e.key !== 'Enter' || !i.value.trim()) return;
      const id = await nf.colCreate(i.value.trim()); state.filter = id || ''; toast('Collection created · add games from Game settings');
    };
    i.onblur = () => setTimeout(renderChips, 150);
  };
}
function renderModalCols(gameId) {
  const cols = lib.collections || [];
  $('#mCols').innerHTML = cols.length
    ? cols.map((c) => `<label class="col-pick"><input type="checkbox" data-c="${c.id}" ${c.games.includes(gameId) ? 'checked' : ''}><span>${esc(c.name)}</span></label>`).join('')
    : '<span class="help">No collections yet. Create one below.</span>';
  $('#mCols').querySelectorAll('input').forEach((i) => { i.onchange = () => nf.colToggle(i.dataset.c, gameId); });
  $('#mAddCol').onclick = async () => {
    const n = $('#mNewCol').value.trim(); if (!n) return;
    await nf.colCreate(n, gameId); $('#mNewCol').value = ''; toast(`Added to ${n}`);
    setTimeout(() => renderModalCols(gameId), 100);
  };
  $('#mNewCol').onkeydown = (e) => { if (e.key === 'Enter') $('#mAddCol').click(); };
}
function renderFav() {
  const g = featured(); if (!g) return;
  const b = $('#favBtn');
  b.innerHTML = STAR(g.fav); b.classList.toggle('on', g.fav);
  b.setAttribute('aria-label', g.fav ? 'Remove from favorites' : 'Add to favorites');
  b.onclick = async () => { await nf.update(g.id, { fav: !g.fav }); toast(g.fav ? 'Removed from favorites' : `${g.name} added to favorites`); };
}

/* ================= per-game detail ================= */
const detailCache = {};
let detailFor = null;
async function loadDetail(g, force) {
  const c = detailCache[g.id];
  if (!force && c && Date.now() - c.t < 30000) return c.d;
  const d = g.detail ? await nf.details(g.id) : null;
  detailCache[g.id] = { t: Date.now(), d };
  return d;
}
function dayLabel(t) { return new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); }
function hm(t) { return new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }
async function renderDetail(force) {
  const g = featured(); if (!g || state.view !== 'game') return;
  const id = g.id; detailFor = id;
  const d = await loadDetail(g, force);
  if (detailFor !== id) return; // user moved on
  const items = d ? Object.fromEntries(d.items.map((i) => [i.key, i])) : {};
  // history: the game's own logs when we have them (they predate Nightfall), otherwise Nightfall's sessions
  const tracked = g.sessions.map((x) => ({ s: x.s, e: x.e })).concat(g.open ? [{ s: g.open.s, e: now() }] : []);
  const plays = d && d.plays.length ? d.plays : tracked;
  const from = d && d.plays.length ? d.source : 'Nightfall';
  // 30-day chart
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = today.getTime() - 29 * DAY;
  const days = [...Array(30)].map((_, i) => plays.reduce((t, p) => t + Math.max(0, Math.min(p.e, start + (i + 1) * DAY) - Math.max(p.s, start + i * DAY)), 0));
  const max = Math.max(...days, 1);
  $('#dHistSub').textContent = `Last 30 days · from ${from}`;
  $('#dChart').innerHTML = days.map((ms, i) => `<div title="${dayLabel(start + i * DAY)} · ${fmt(ms)}" class="${ms ? 'has' : ''} ${i === 29 ? 'today' : ''}"><i style="height:${Math.max(2, Math.round(ms / max * 64))}px"></i></div>`).join('');
  // facts
  const sum = plays.reduce((t, p) => t + p.e - p.s, 0);
  const longest = plays.reduce((m, p) => (p.e - p.s > m.e - m.s ? p : m), { s: 0, e: 0 });
  const fact = (v, k) => `<div><b>${v}</b><span>${k}</span></div>`;
  $('#dFacts').innerHTML = fact(fmt(Math.max(sum, total(g))), 'Total played') + fact(plays.length, 'Sessions')
    + fact(plays.length ? fmt(sum / plays.length) : '0m', 'Average') + fact(longest.e ? fmt(longest.e - longest.s) : '—', 'Longest')
    + (g.steamMin ? fact(hours(g.steamMin), 'On Steam, all time') : '');
  // recent sessions
  const recent = [...plays].sort((a, b) => b.s - a.s).slice(0, 8);
  $('#dSessions').innerHTML = recent.length ? recent.map((p) => {
    const it = p.key && items[p.key];
    return `<li><span class="d-date">${dayLabel(p.s)}</span><span class="d-time">${hm(p.s)} – ${hm(p.e)}</span>
      <span class="d-what">${it ? `${it.icon ? `<img src="${esc(it.icon)}" alt="">` : ''}${esc(it.name)}` : ''}</span><b>${fmt(p.e - p.s)}</b></li>`;
  }).join('') : '<li class="none">No sessions yet. Play it and they show up here.</li>';
  // Roblox experiences / Minecraft instances
  $('#dSubPanel').hidden = !d || !d.items.length;
  if (d && d.items.length) {
    $('#dSubTitle').textContent = d.kind === 'roblox' ? 'Experiences you played' : 'Your instances';
    $('#dSubSrc').textContent = `${d.items.length} · from ${d.source}`;
    $('#dLive').hidden = !d.live;
    if (d.live) $('#dLive').innerHTML = `${d.live.icon ? `<img src="${esc(d.live.icon)}" alt="">` : ''}<div><small>Playing now</small><b>${esc(d.live.name)}</b></div><span data-since="${d.live.since}">${clock(now() - d.live.since)}</span>`;
    const top = Math.max(...d.items.map((i) => i.ms), 1);
    $('#dItems').innerHTML = [...d.items].sort((a, b) => b.ms - a.ms).map((i) => `<li>
      <span class="d-ic" style="${i.icon ? `background:${bgu(i.icon)} center/cover` : ''}">${i.icon ? '' : esc((i.name[0] || '?').toUpperCase())}</span>
      <span class="d-nm"><b>${esc(i.name)}</b><small>${esc(i.sub || '')}${i.sub ? ' · ' : ''}${i.sessions} ${i.sessions === 1 ? 'session' : 'sessions'} · ${ago(i.last)}</small><span class="bar"><i style="width:${Math.max(3, i.ms / top * 100)}%"></i></span></span>
      <span class="d-tm">${fmt(i.ms)}</span>
      ${i.url ? `<a class="d-open" href="${esc(i.url)}" target="_blank" rel="noreferrer" aria-label="Open ${esc(i.name)} on Roblox">↗</a>` : ''}
    </li>`).join('');
  }
}
setInterval(() => { const s = document.querySelector('#dLive [data-since]'); if (s) s.textContent = clock(now() - +s.dataset.since); }, 1000);

/* ================= All games (Steam + Epic) ================= */
let ownedData = null, avFilter = 'all';
async function loadOwned(force) {
  try { ownedData = await nf.owned(!!force); } catch { ownedData = { games: [] }; }
  return ownedData;
}
function ownedCard(o) {
  const g = o.gameId && gameById(o.gameId);
  const el = document.createElement('div');
  el.className = 'av-card';
  el.innerHTML = `<div class="av-img" style="${o.cover ? `background-image:${bgu(o.cover)}` : ''}">
      ${o.cover ? '' : `<span>${esc(o.name)}</span>`}
      <span class="store ${o.store}">${o.store === 'steam' ? 'Steam' : 'Epic'}</span>
      ${g && g.open ? '<span class="live-dot">Playing</span>' : ''}
    </div>
    <div class="av-meta"><b title="${esc(o.name)}">${esc(o.name)}</b>
      <small>${o.playMin ? hours(o.playMin) + ' on Steam' : g ? fmt(total(g)) + ' played' : 'Not played'}${o.last ? ' · ' + ago(o.last) : ''}</small></div>
    <button class="btn ${g ? 'btn-solid' : 'btn-ghost'} sm av-btn">${g ? 'Play' : 'Install'}</button>`;
  el.querySelector('.av-btn').onclick = async (e) => {
    e.stopPropagation();
    if (g) return launch(g);
    const err = await nf.openStore(o.install);
    toast(err || `Opening ${o.store === 'steam' ? 'Steam' : 'the Epic Games Launcher'} to install ${o.name}. It joins your library once installed.`);
  };
  el.onclick = () => { if (g) select(g.id); };
  if (g) el.classList.add('installed');
  return el;
}
async function renderAll(force) {
  if (!ownedData || force) { $('#avSub').textContent = 'Reading your Steam and Epic libraries…'; await loadOwned(force); }
  const o = ownedData, games = o.games || [];
  const s = games.filter((x) => x.store === 'steam').length, e = games.length - s, inst = games.filter((x) => x.gameId).length;
  $('#avEyebrow').textContent = [o.steam ? 'Steam · ' + o.steam.name : null, o.epic ? 'Epic Games' : null].filter(Boolean).join('  ·  ') || 'Your libraries';
  $('#avSub').textContent = games.length
    ? `${games.length} games you own · ${s} on Steam, ${e} on Epic · ${inst} installed here`
    : 'No Steam or Epic library found on this PC. Sign in to Steam or the Epic Games Launcher once, then refresh.';
  const chip = (k, label, n) => `<button class="chip ${avFilter === k ? 'on' : ''}" data-k="${k}">${label}<i>${n}</i></button>`;
  $('#avChips').innerHTML = chip('all', 'All', games.length) + chip('inst', 'Installed', inst) + chip('not', 'Not installed', games.length - inst) + chip('steam', 'Steam', s) + chip('epic', 'Epic', e);
  $('#avChips').querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => { avFilter = b.dataset.k; renderAll(); }; });
  const q = $('#avQ').value.trim().toLowerCase();
  const list = games.filter((x) => (avFilter === 'inst' ? x.gameId : avFilter === 'not' ? !x.gameId : avFilter === 'all' ? true : x.store === avFilter) && (!q || x.name.toLowerCase().includes(q)))
    .sort((a, b) => (!!b.gameId - !!a.gameId) || (b.last - a.last) || (b.playMin - a.playMin) || a.name.localeCompare(b.name));
  const grid = $('#avGrid'); grid.innerHTML = '';
  if (!list.length) grid.innerHTML = '<div class="row-empty">No games match.</div>';
  const frag = document.createDocumentFragment(); list.forEach((x) => frag.appendChild(ownedCard(x))); grid.appendChild(frag);
}
$('#avQ').oninput = () => renderAll();
$('#avRefresh').onclick = () => renderAll(true);
function openAll() { state.view = 'all'; applyView(); renderRail(); $('#main').scrollTo({ top: 0 }); renderAll(); }
$('#allBtn').onclick = openAll;
$('#hmOwnedAll').onclick = openAll;

/* home: favorites, collections and "from your libraries" rows */
let homeExtraKey = '';
async function renderHomeExtras() {
  if (state.view !== 'home' || !lib.games.length) return;
  const favs = ordered('recent').filter((g) => g.fav);
  const cols = (lib.collections || []).filter((c) => c.games.some(gameById));
  const key = JSON.stringify([favs.map((g) => g.id + coverOf(g) + !!g.open), cols, lib.games.length]);
  if (key !== homeExtraKey) {
    homeExtraKey = key;
    $('#hmFavWrap').hidden = !favs.length;
    $('#hmFav').innerHTML = ''; favs.forEach((g) => $('#hmFav').appendChild(tile(g)));
    $('#hmCols').innerHTML = '';
    for (const c of cols) {
      const wrap = document.createElement('div');
      wrap.innerHTML = `<div class="row-head"><h2>${esc(c.name)}</h2><span class="muted">${c.games.filter(gameById).length} games</span></div><div class="row"></div>`;
      c.games.map(gameById).filter(Boolean).forEach((g) => wrap.querySelector('.row').appendChild(tile(g)));
      $('#hmCols').appendChild(wrap);
    }
  }
  if (!ownedData) await loadOwned(false);
  const pick = (ownedData.games || []).filter((x) => !x.gameId && x.cover).sort((a, b) => (b.last - a.last) || (b.playMin - a.playMin)).slice(0, 14);
  $('#hmOwnedWrap').hidden = !pick.length;
  const row = $('#hmOwned');
  if (row.dataset.k !== pick.map((x) => x.id).join()) { row.dataset.k = pick.map((x) => x.id).join(); row.innerHTML = ''; pick.forEach((x) => row.appendChild(ownedCard(x))); }
}

/* ================= Year in review ================= */
async function renderReview() {
  const el = $('#reviewView');
  const Y = new Date().getFullYear(), a = new Date(Y, 0, 1).getTime(), b = new Date(Y + 1, 0, 1).getTime();
  // Roblox / Minecraft: their own logs go back further than Nightfall, so they replace the tracked sessions
  const extra = [], logPlays = {};
  for (const g of lib.games.filter((x) => x.detail)) {
    const d = await loadDetail(g).catch(() => null);
    if (!d) continue;
    if (d.plays && d.plays.length) logPlays[g.id] = d.plays;
    const top = d.items.map((i) => ({ ...i, ms: (d.plays || []).filter((p) => p.key === i.key && p.e > a).reduce((t, p) => t + p.e - Math.max(p.s, a), 0) })).sort((x, y) => y.ms - x.ms)[0];
    if (top && top.ms > 0) extra.push({ g, kind: d.kind, top });
  }
  const plays = [];
  for (const g of lib.games) {
    const src = logPlays[g.id] || g.sessions.concat(g.open ? [{ s: g.open.s, e: now() }] : []);
    for (const s of src) if (s.e > a && s.s < b) plays.push({ g, s: Math.max(s.s, a), e: Math.min(s.e, b) });
  }
  if (!ownedData) await loadOwned(false);
  const steamTop = (ownedData.games || []).filter((x) => x.playMin).sort((x, y) => y.playMin - x.playMin).slice(0, 5);

  const totalMs = plays.reduce((t, p) => t + p.e - p.s, 0);
  const byGame = {};
  for (const p of plays) byGame[p.g.id] = (byGame[p.g.id] || 0) + (p.e - p.s);
  const ranked = Object.entries(byGame).map(([id, ms]) => ({ g: gameById(id), ms })).filter((x) => x.g).sort((x, y) => y.ms - x.ms);
  const months = [...Array(12)].map((_, m) => plays.reduce((t, p) => t + Math.max(0, Math.min(p.e, new Date(Y, m + 1, 1).getTime()) - Math.max(p.s, new Date(Y, m, 1).getTime())), 0));
  const dow = [...Array(7)].fill(0), byDay = {}; let night = 0;
  for (const p of plays) {
    const d = new Date(p.s); dow[(d.getDay() + 6) % 7] += p.e - p.s;
    const k = d.toDateString(); byDay[k] = (byDay[k] || 0) + p.e - p.s;
    if (d.getHours() >= 22 || d.getHours() < 5) night += p.e - p.s;
  }
  const busiest = Object.entries(byDay).sort((x, y) => y[1] - x[1])[0];
  const longest = plays.reduce((m, p) => (p.e - p.s > (m ? m.e - m.s : 0) ? p : m), null);
  const favDow = dow.indexOf(Math.max(...dow));
  const first = plays.reduce((m, p) => Math.min(m, p.s), Infinity);
  const mmax = Math.max(...months, 1);
  const top = ranked[0];
  const heroBg = top ? heroOf(top.g) : null;

  el.innerHTML = `
    <div class="rv-hero" style="${heroBg ? `background-image:linear-gradient(90deg,rgba(11,11,13,.92),rgba(11,11,13,.55) 60%,rgba(11,11,13,.85)),${bgu(heroBg)}` : ''}">
      <p class="eyebrow">Nightfall · Year in review</p>
      <h1>Your ${Y}<br>in games</h1>
      <p class="sub">${plays.length ? `Counted from ${new Date(first).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}${first > a + 7 * DAY ? ', the oldest play history Nightfall found on this PC' : ''}.` : 'Nothing tracked yet this year. Play something and come back.'}</p>
      <div class="rv-big">
        <div><b>${fmt(totalMs)}</b><span>played</span></div>
        <div><b>${plays.length}</b><span>sessions</span></div>
        <div><b>${ranked.length}</b><span>${ranked.length === 1 ? 'game' : 'games'}</span></div>
        <div><b>${longest ? fmt(longest.e - longest.s) : '—'}</b><span>longest session</span></div>
      </div>
    </div>
    ${ranked.length ? `
    <div class="rv-grid">
      <div class="panel rv-top"><div class="row-head"><h2>Your top games</h2></div>
        ${ranked.slice(0, 5).map((x, i) => `<div class="rv-row"><span class="no">${i + 1}</span><i class="cv" style="background:${(coverOf(x.g) ? bgu(coverOf(x.g)) + ' center/cover' : fallbackBg(x.g))}"></i>
          <span class="nm"><b>${esc(x.g.name)}</b><span class="bar"><i style="width:${Math.max(4, x.ms / ranked[0].ms * 100)}%"></i></span></span><span class="tm">${fmt(x.ms)}</span></div>`).join('')}
      </div>
      <div class="panel"><div class="row-head"><h2>Month by month</h2></div>
        <div class="rv-months">${months.map((ms, m) => `<div class="${ms ? 'has' : ''}"><em>${ms >= 36e5 ? Math.round(ms / 36e5) + 'h' : ''}</em><i style="height:${Math.max(3, Math.round(ms / mmax * 110))}px"></i>${MON[m]}</div>`).join('')}</div>
      </div>
    </div>
    <div class="rv-facts">
      <div class="panel"><small>Favorite day</small><b>${DOW[favDow]}</b><span>${fmt(dow[favDow])} played on ${DOW[favDow]}s</span></div>
      <div class="panel"><small>Biggest day</small><b>${busiest ? new Date(busiest[0]).toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) : '—'}</b><span>${busiest ? fmt(busiest[1]) + ' in one day' : ''}</span></div>
      <div class="panel"><small>Longest session</small><b>${longest ? esc(longest.g.name) : '—'}</b><span>${longest ? fmt(longest.e - longest.s) + ' on ' + new Date(longest.s).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''}</span></div>
      <div class="panel"><small>Night owl</small><b>${totalMs ? Math.round(night / totalMs * 100) : 0}%</b><span>of your play time was after 10 pm</span></div>
      ${extra.map((x) => `<div class="panel"><small>Top ${x.kind === 'roblox' ? 'Roblox experience' : 'Minecraft instance'}</small><b>${esc(x.top.name)}</b><span>${fmt(x.top.ms)} this year</span></div>`).join('')}
    </div>` : ''}
    ${steamTop.length ? `<div class="panel rv-steam"><div class="row-head"><h2>All-time on Steam</h2><span class="muted">From your Steam account</span></div>
      <div class="rv-steam-row">${steamTop.map((x) => `<div><i style="background-image:${bgu(x.cover)}"></i><b>${esc(x.name)}</b><span>${hours(x.playMin)}</span></div>`).join('')}</div></div>` : ''}`;
}
$('#hmReview').onclick = () => { state.view = 'review'; applyView(); renderRail(); $('#main').scrollTo({ top: 0 }); renderReview(); };

/* ================= Settings ================= */
async function openSettings() {
  $('#settings').hidden = false;
  const s = await nf.settings();
  $('#sAutoAdd').checked = s.autoAddInstalled !== false;
  $('#sDiscord').checked = !!s.discordEnabled;
  $('#sClientId').value = s.discordClientId || '';
  $('#sLogin').checked = !!s.startWithWindows;
  $('#sTray').checked = s.closeToTray !== false;
  renderSettingsLive();
  const o = ownedData || await loadOwned(false);
  const st = (o.games || []).filter((x) => x.store === 'steam').length, ep = (o.games || []).length - st;
  $('#sSteam').textContent = o.steam ? `Signed in as ${o.steam.name} · ${st} games · read from the Steam app on this PC` : 'Not found. Sign in to the Steam app on this PC, then reopen Settings.';
  $('#sSteamTag').hidden = !o.steam;
  $('#sEpic').textContent = o.epic ? `${ep} games · read from the Epic Games Launcher on this PC` : 'Not found. Sign in to the Epic Games Launcher once, then reopen Settings.';
  $('#sEpicTag').hidden = !o.epic;
}
function renderSettingsLive() {
  if ($('#settings').hidden) return;
  const p = lib.presence;
  $('#sDiscordState').textContent = !lib.settings.discordEnabled ? 'Off' : !/^\d{15,22}$/.test(lib.settings.discordClientId || '') ? 'Paste your Discord Application ID below to turn it on.'
    : p === 'on' ? 'Connected to Discord' : 'Waiting for the Discord app… make sure it is open.';
  $('#sVersion').textContent = 'Nightfall ' + (lib.version || '');
  const u = lib.update || {};
  $('#sUpdate').textContent = ({ portable: "This is the portable version, which can't update itself. Use the installer to get automatic updates.",
    dev: 'Updates are off in development.', checking: 'Checking for updates…', latest: "You're on the latest version.",
    downloading: `Downloading ${u.version || 'update'}… ${u.percent || 0}%`, ready: `Version ${u.version} is ready. Restart to install it.`,
    error: "Couldn't check for updates. Try again later.", idle: 'Checks automatically every 6 hours.' })[u.state] || '—';
}
$('#settingsBtn').onclick = openSettings;
$('#sClose').onclick = () => { $('#settings').hidden = true; };
$('#settings').addEventListener('mousedown', (e) => { if (e.target.id === 'settings') $('#settings').hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#settings').hidden = true; });
$('#sAutoAdd').onchange = (e) => nf.set('autoAddInstalled', e.target.checked);
$('#sDiscord').onchange = (e) => nf.set('discordEnabled', e.target.checked);
$('#sClientId').onchange = (e) => { nf.set('discordClientId', e.target.value); toast('Discord Application ID saved'); };
$('#sLogin').onchange = (e) => nf.set('startWithWindows', e.target.checked);
$('#sTray').onchange = (e) => nf.set('closeToTray', e.target.checked);
$('#sCheck').onclick = async () => { const err = await nf.checkUpdate(); if (err) toast(err); };

/* ================= update banner ================= */
function renderUpdateBar() {
  const u = lib.update || {};
  $('#updBar').hidden = u.state !== 'ready';
  if (u.state === 'ready') $('#updTxt').textContent = `Nightfall ${u.version} is ready.`;
}
$('#updGo').onclick = () => nf.installUpdate();

/* ================= hook into the existing render cycle ================= */
const baseRender = render;
render = function (animate) { // eslint-disable-line no-global-assign
  if (!lib.games.length && state.view === 'game') state.view = 'home';
  baseRender(animate);
  renderChips(); renderFav(); renderUpdateBar(); renderSettingsLive();
  $('#hmReviewTxt').textContent = new Date().getFullYear() + ' in review';
  if (state.view === 'game') renderDetail();
  if (state.view === 'home') renderHomeExtras();
  if (state.view === 'all' && ownedData) renderAll();
};
const baseSelect = select;
select = function (id) { baseSelect(id); renderFav(); renderDetail(); }; // eslint-disable-line no-global-assign
