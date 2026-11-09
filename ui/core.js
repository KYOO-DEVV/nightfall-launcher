/* global nf */
// Shared state & helpers, icons, navigation, sidebar, search, add/drop, Game settings, Connect All.

/* ---------------- helpers ---------------- */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bgu = (u) => `url('${String(u).replace(/'/g, '%27')}')`;
const DAY = 864e5;
const now = () => Date.now();
function weekStart(t = now()) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() - ((d.getDay() + 6) % 7) * DAY; }
function spans(g) { const s = g.sessions.map((x) => [x.s, x.e]); if (g.open) s.push([g.open.s, now()]); return s; }
function within(g, a, b) { let t = 0; for (const [s, e] of spans(g)) t += Math.max(0, Math.min(e, b) - Math.max(s, a)); return t; }
const total = (g) => within(g, 0, Infinity);
const lastPlayed = (g) => (g.open ? now() : g.sessions.reduce((m, x) => Math.max(m, x.e), 0));
function fmt(ms) {
  const m = Math.floor(ms / 6e4);
  if (m < 1) return '0m';
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60), r = m % 60;
  return h >= 10 ? h + 'h' : r ? `${h}h ${r}m` : h + 'h';
}
const hours = (min) => (min >= 600 ? Math.round(min / 60) + 'h' : (min / 60).toFixed(1).replace(/\.0$/, '') + 'h');
function clock(ms) { const s = Math.floor(ms / 1000); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
function ago(t) {
  if (!t) return null;
  const m = (now() - t) / 6e4;
  if (m < 2) return 'just now';
  if (m < 60) return Math.floor(m) + ' minutes ago';
  if (m < 1440) return Math.floor(m / 60) + (m < 120 ? ' hour ago' : ' hours ago');
  const d = Math.floor(m / 1440);
  return d === 1 ? 'yesterday' : d < 30 ? d + ' days ago' : new Date(t).toLocaleDateString();
}
function hue(name) { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
function fallbackBg(g) {
  if (g.tint) { const [r, gg, b] = g.tint; return `radial-gradient(75% 90% at 72% 18%, rgba(${r},${gg},${b},.55), transparent 70%), radial-gradient(60% 70% at 15% 95%, rgba(${r},${gg},${b},.22), transparent 70%), linear-gradient(160deg, rgba(${r},${gg},${b},.2), #0c0c0f 78%)`; }
  const h = hue(g.name); return `radial-gradient(70% 80% at 70% 25%, hsl(${h} 35% 30%), transparent 70%), linear-gradient(160deg, hsl(${h} 25% 18%), hsl(${(h + 40) % 360} 30% 7%))`;
}
const coverOf = (g) => g.art.cover || g.art.header || g.art.hero;
const heroOf = (g) => g.art.hero || g.art.header || g.art.cover;
const wideOf = (g) => g.art.header || g.art.hero || g.art.cover;
const thumbOf = (g) => g.art.cover || g.art.hero || g.art.header;
const artBg = (url, g) => (url ? `${bgu(url)} center/cover` : fallbackBg(g));
function logoHtml(g, cls = 't') {
  if (g.art.logo) return `<img src="${esc(g.art.logo)}" alt="${esc(g.name)}" class="${g.logoMono ? 'logo-mono' : ''}">`;
  return `<span class="ph-stack">${g.art.icon ? `<img class="ph-icon" src="${esc(g.art.icon)}" alt="">` : ''}<span class="${cls}">${esc(g.name)}</span></span>`;
}

/* ---------------- icons (one consistent stroke set) ---------------- */
const P = (d, extra = '') => `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const ICON = {
  home: P('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/>'),
  grid: P('<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>'),
  plus: P('<path d="M12 5v14M5 12h14"/>'),
  search: P('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  cog: P('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'),
  play: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
  star: P('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
  starOn: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  link: P('<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>'),
  share: P('<path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>'),
  sparkle: P('<path d="M12 3l1.8 4.6L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.9z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>'),
  x: P('<path d="M6 6l12 12M18 6 6 18"/>'),
  min: P('<path d="M5 12h14"/>'),
  max: P('<rect x="5" y="5" width="14" height="14" rx="1.5"/>'),
  clock: P('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  pulse: P('<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>'),
  dots: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  ext: P('<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>'),
};
function paintIcons(root = document) { root.querySelectorAll('[data-icon]').forEach((el) => { if (!el.dataset.painted) { el.insertAdjacentHTML('afterbegin', ICON[el.dataset.icon] || ''); el.dataset.painted = 1; } }); }

/* ---------------- state ---------------- */
let lib = { games: [], settings: {}, collections: [] };
const state = { view: 'home', sel: null, shots: 0, shelf: 'recent', libTab: 'mine', filter: 'all', owned: null };
const STORE_LABEL = { steam: 'Steam', epic: 'Epic Games', gog: 'GOG', ubisoft: 'Ubisoft Connect', riot: 'Riot Games', hoyo: 'HoYoPlay', ea: 'EA app', rockstar: 'Rockstar', xbox: 'Xbox', minecraft: 'Minecraft', amazon: 'Amazon Games', itch: 'itch.io', other: 'Other launchers', manual: 'Added by you' };
const gameById = (id) => lib.games.find((g) => g.id === id);
function ordered(tab = 'recent') {
  const gs = [...lib.games];
  if (tab === 'most') return gs.sort((a, b) => total(b) - total(a) || b.addedAt - a.addedAt);
  if (tab === 'added') return gs.sort((a, b) => b.addedAt - a.addedAt);
  if (tab === 'name') return gs.sort((a, b) => a.name.localeCompare(b.name));
  return gs.sort((a, b) => (lastPlayed(b) || b.addedAt / 1e3) - (lastPlayed(a) || a.addedAt / 1e3));
}
function featured() { return gameById(state.sel) || lib.games.find((x) => x.open) || ordered('recent')[0] || null; }

function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); }

/* ---------------- window controls ---------------- */
$('#wMin').onclick = () => nf.win.minimize();
$('#wMax').onclick = () => nf.win.toggleMaximize();
$('#wClose').onclick = () => nf.win.close();

/* ---------------- navigation ---------------- */
const VIEWS = { home: '#home', game: '#game', all: '#allView', review: '#reviewView' };
function go(view) {
  if (view === 'game' && !lib.games.length) view = 'home';
  if (state.view === 'all' && view !== 'all' && renderers.leaveAll) renderers.leaveAll(); // free 400 covers' worth of memory
  state.view = view;
  for (const [k, sel] of Object.entries(VIEWS)) $(sel).hidden = k !== view;
  $('#main').dataset.view = view;
  $('#homeBtn').classList.toggle('on', view === 'home' || view === 'review');
  $('#allBtn').classList.toggle('on', view === 'all');
  renderRail();
  renderView(true);
}
function select(id) { state.sel = id; go('game'); }
$('#homeBtn').onclick = () => go('home');
$('#allBtn').onclick = () => go('all');

/* ---------------- sidebar ---------------- */
const rail = $('#rail'), tip = $('#tip');
function tipFor(el, text) {
  el.addEventListener('mouseenter', () => { tip.textContent = text(); const r = el.getBoundingClientRect(); tip.style.top = (r.top + r.height / 2 - 13) + 'px'; tip.classList.add('show'); });
  el.addEventListener('mouseleave', () => tip.classList.remove('show'));
}
tipFor($('#homeBtn'), () => 'Home');
tipFor($('#allBtn'), () => 'Library');
tipFor($('#addBtnRail'), () => 'Add a game');
tipFor($('#searchBtn'), () => 'Search');
tipFor($('#settingsBtn'), () => 'Settings');
let railKey = '';
function renderRail() {
  const f = state.view === 'game' ? featured() : null;
  const list = ordered('recent').slice(0, 14);
  const key = list.map((g) => [g.id, g.art.icon, !!g.open, f && g.id === f.id].join()).join(';');
  if (key === railKey) return; railKey = key;
  rail.innerHTML = '';
  for (const g of list) {
    const b = document.createElement('button');
    b.className = 'thumb' + (f && g.id === f.id ? ' active' : '');
    b.setAttribute('aria-label', g.name);
    b.innerHTML = (g.art.icon ? `<img src="${esc(g.art.icon)}" alt="">` : `<span class="ph">${esc(g.name[0] || '?')}</span>`) + (g.open ? '<i class="live"></i>' : '');
    b.onclick = () => select(g.id);
    tipFor(b, () => g.name + (g.open ? ' · playing' : ''));
    rail.appendChild(b);
  }
}

/* ---------------- launching ---------------- */
async function launch(g) {
  if (!g) return;
  if (g.open) return toast(`${g.name} is already running`);
  const err = await nf.launch(g.id);
  toast(err || `Launching ${g.name}…`);
}

/* ---------------- adding games ---------------- */
async function addDialog() {
  const ids = await nf.addDialog();
  if (ids && ids.length) { state.sel = ids[ids.length - 1]; toast(ids.length === 1 ? 'Game added · finding artwork' : `${ids.length} games added · finding artwork`); go('game'); }
}
$('#addBtnRail').onclick = addDialog;
$('#hmAdd').onclick = addDialog;
nf.onDrag({
  enter: () => { $('#drop').hidden = false; },
  leave: () => { $('#drop').hidden = true; },
  drop: async (paths) => {
    $('#drop').hidden = true;
    const ids = await nf.addPaths(paths);
    if (ids.length) { state.sel = ids[ids.length - 1]; toast(ids.length === 1 ? 'Game added · finding artwork' : `${ids.length} games added`); go('game'); }
    else toast('Drop a game .exe (or a shortcut to one) that is not already in your library');
  },
});

/* ---------------- search ---------------- */
const pop = $('#searchPop'), q = $('#q');
function renderResults() {
  const s = q.value.trim().toLowerCase();
  const list = ordered('recent').filter((g) => g.name.toLowerCase().includes(s));
  const ul = $('#results');
  ul.innerHTML = list.length ? '' : `<li class="empty-li">${lib.games.length ? 'No games match that name.' : 'Your library is empty.'}</li>`;
  for (const g of list) {
    const li = document.createElement('li');
    li.innerHTML = `<button>${g.art.icon ? `<img src="${esc(g.art.icon)}" alt="">` : ''}${esc(g.name)}</button>`;
    li.firstChild.onclick = () => { pop.hidden = true; select(g.id); };
    ul.appendChild(li);
  }
}
$('#searchBtn').onclick = (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; if (!pop.hidden) { q.value = ''; renderResults(); q.focus(); } };
q.oninput = renderResults;
q.onkeydown = (e) => { if (e.key === 'Escape') pop.hidden = true; if (e.key === 'Enter') $('#results button')?.click(); };
document.addEventListener('click', (e) => { if (!pop.hidden && !pop.contains(e.target)) pop.hidden = true; });

/* ---------------- modal helpers ---------------- */
function modal(id, open) { $(id).hidden = !open; }
document.querySelectorAll('.modal-bg').forEach((bg) => bg.addEventListener('mousedown', (e) => { if (e.target === bg) bg.hidden = true; }));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.modal-bg').forEach((m) => { m.hidden = true; }); });

/* ---------------- Game settings ---------------- */
let mId = null;
function openModal(id) {
  const g = gameById(id); if (!g) return;
  mId = id;
  $('#mTitle').textContent = g.name;
  if (g.art.icon) $('#mIcon').src = g.art.icon; else $('#mIcon').removeAttribute('src');
  $('#mName').value = g.name; $('#mProc').value = g.proc; $('#mQuery').value = g.name;
  $('#mResults').innerHTML = '';
  resetRemove(); renderModalCols(id);
  modal('#modal', true); $('#mName').focus();
}
$('#mClose').onclick = () => modal('#modal', false);
$('#mSave').onclick = async () => { await nf.update(mId, { name: $('#mName').value, proc: $('#mProc').value }); toast('Saved'); modal('#modal', false); };
async function doArtSearch() {
  const ul = $('#mResults'); ul.innerHTML = '<li class="msg">Searching Steam…</li>';
  const res = await nf.searchArt($('#mQuery').value.trim());
  if (res === null) { ul.innerHTML = '<li class="msg">Could not reach Steam. Check your connection and try again.</li>'; return; }
  if (!res.length) { ul.innerHTML = '<li class="msg">No matches. Try a shorter name, or use your own images below.</li>'; return; }
  ul.innerHTML = '';
  for (const r of res.slice(0, 8)) {
    const li = document.createElement('li');
    li.innerHTML = `<button><img src="${esc(r.thumb)}" alt="">${esc(r.name)}<small>${r.appid}</small></button>`;
    li.firstChild.onclick = async () => { const id = mId; modal('#modal', false); toast(`Fetching artwork for ${r.name}…`); await nf.applyArt(id, r.appid, r.name); toast('Artwork updated'); };
    ul.appendChild(li);
  }
}
$('#mSearch').onclick = doArtSearch;
$('#mQuery').onkeydown = (e) => { if (e.key === 'Enter') doArtSearch(); };
$('#mCover').onclick = () => nf.customArt(mId, 'cover');
$('#mHeroImg').onclick = () => nf.customArt(mId, 'hero');
$('#mLogo').onclick = () => nf.customArt(mId, 'logo');
$('#mRefetch').onclick = () => { nf.refetchArt(mId); modal('#modal', false); toast('Fetching artwork…'); };
$('#mShow').onclick = () => nf.showFile(mId);
function resetRemove() { const b = $('#mRemove'); b.classList.remove('confirm'); b.firstElementChild.textContent = 'Remove from library'; }
$('#mRemove').onclick = async () => {
  const b = $('#mRemove');
  if (!b.classList.contains('confirm')) { b.classList.add('confirm'); b.firstElementChild.textContent = 'Click again to remove (play history is deleted)'; return; }
  const g = gameById(mId);
  await nf.remove(mId); modal('#modal', false); toast(`${g ? g.name : 'Game'} removed`);
  if (state.sel === mId) { state.sel = null; go('home'); }
};
function renderModalCols(gameId) {
  const cols = lib.collections || [];
  $('#mCols').innerHTML = cols.length
    ? cols.map((c) => `<label class="col-pick"><input type="checkbox" data-c="${c.id}" ${c.games.includes(gameId) ? 'checked' : ''}><span>${esc(c.name)}</span></label>`).join('')
    : '<span class="help">No collections yet. Create one below.</span>';
  $('#mCols').querySelectorAll('input').forEach((i) => { i.onchange = () => nf.colToggle(i.dataset.c, gameId); });
}
$('#mAddCol').onclick = async () => {
  const n = $('#mNewCol').value.trim(); if (!n) return;
  await nf.colCreate(n, mId); $('#mNewCol').value = ''; toast(`Added to ${n}`);
  setTimeout(() => renderModalCols(mId), 150);
};
$('#mNewCol').onkeydown = (e) => { if (e.key === 'Enter') $('#mAddCol').click(); };

/* ---------------- Connect All ---------------- */
let scanResults = [];
$('#scanClose').onclick = () => modal('#scan', false);
async function connectAll() {
  modal('#scan', true); $('#scanFoot').hidden = true;
  $('#scanBody').innerHTML = `<div class="scan-state"><div class="spinner"></div><b>Looking for games on this PC</b>
    <p>Checking Steam, Epic Games, GOG, Ubisoft Connect, Riot Games, HoYoPlay, EA, Rockstar, Xbox, Minecraft launchers and game folders on every drive.</p></div>`;
  const t0 = now();
  try { scanResults = await nf.scan(); } catch { scanResults = null; }
  await new Promise((r) => setTimeout(r, Math.max(0, 600 - (now() - t0))));
  if (!scanResults) { $('#scanBody').innerHTML = '<div class="scan-state"><b>The scan stopped early</b><p>Something went wrong while reading the launchers. Try again, or add games one at a time.</p></div>'; $('#scanFoot').hidden = false; return; }
  renderScan();
}
function renderScan() {
  const fresh = scanResults.filter((r) => !r.connected);
  $('#scanFoot').hidden = false;
  if (!scanResults.length) {
    $('#scanBody').innerHTML = "<div class=\"scan-state\"><b>No installed games found</b><p>Nightfall didn't find games in the launchers it knows. You can still add any game by choosing its .exe with Add a game.</p></div>";
    $('#scanGo').hidden = true; $('#scanToggle').hidden = true; return;
  }
  $('#scanGo').hidden = false; $('#scanToggle').hidden = !fresh.length;
  const groups = {};
  for (const r of scanResults) (groups[r.source] = groups[r.source] || []).push(r);
  $('#scanBody').innerHTML = `<p class="scan-sum">Found <b>${scanResults.length}</b> ${scanResults.length === 1 ? 'game' : 'games'}${fresh.length < scanResults.length ? `, ${scanResults.length - fresh.length} already connected` : ''}. Untick anything you don't want.</p>`
    + Object.keys(STORE_LABEL).filter((k) => groups[k]).map((k) => `<div class="scan-group"><h4>${STORE_LABEL[k]}</h4>${groups[k].map((r) => `
      <label class="scan-item ${r.connected ? 'done' : ''}"><input type="checkbox" data-i="${r.i}" ${r.connected ? 'disabled' : 'checked'}>
        <span class="tx"><b>${esc(r.name)}</b><small>${esc(r.exe)}</small></span>${r.connected ? '<span class="tag">Connected</span>' : ''}</label>`).join('')}</div>`).join('');
  $('#scanBody').querySelectorAll('input').forEach((i) => { i.onchange = updateScanButton; });
  updateScanButton();
}
const checkedScan = () => [...$('#scanBody').querySelectorAll('input:checked:not(:disabled)')].map((i) => +i.dataset.i);
function updateScanButton() {
  const n = checkedScan().length, all = $('#scanBody').querySelectorAll('input:not(:disabled)').length;
  $('#scanGo').disabled = !n; $('#scanGo').style.opacity = n ? 1 : 0.4;
  $('#scanGo').firstElementChild.textContent = n ? `Connect ${n} ${n === 1 ? 'game' : 'games'}` : 'Nothing selected';
  $('#scanToggle').firstElementChild.textContent = n === all ? 'Select none' : 'Select all';
}
$('#scanToggle').onclick = () => { const b = [...$('#scanBody').querySelectorAll('input:not(:disabled)')]; const on = b.some((x) => !x.checked); b.forEach((x) => { x.checked = on; }); updateScanButton(); };
$('#scanAgain').onclick = connectAll;
$('#scanGo').onclick = async () => {
  const sel = checkedScan(); if (!sel.length) return;
  const ids = await nf.connect(sel);
  modal('#scan', false);
  toast(ids.length ? `Connected ${ids.length} ${ids.length === 1 ? 'game' : 'games'} · fetching official artwork` : 'Those games are already connected');
  go('home');
};
$('#hmConnect').onclick = connectAll;
$('#hmCtaBtn').onclick = connectAll;

/* ---------------- render cycle ---------------- */
const renderers = {}; // filled by the view files
function renderView(force) { const r = renderers[state.view]; if (r) r(force); }
function render() {
  renderRail();
  renderView(false);
  if (renderers.chrome) renderers.chrome();
}
async function refreshShots() { try { state.shots = await nf.screenshots(weekStart()); if (state.view === 'home') renderView(true); } catch {} }

window.addEventListener('DOMContentLoaded', async () => {
  paintIcons();
  nf.onChange((data) => { lib = data; render(); });
  lib = await nf.get();
  go(lib.games.length ? 'home' : 'home');
  render();
  refreshShots();
  setInterval(refreshShots, 60000);
  setInterval(() => { if (lib.games.some((g) => g.open) && renderers.tick) renderers.tick(); }, 1000);
  setInterval(() => renderView(false), 30000);
});
