/* global nf */
// Shared state & helpers, icons, navigation, sidebar, search, add/drop, Game settings, Connect All.

/* ---------------- helpers ---------------- */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bgu = (u) => `url('${String(u).replace(/'/g, '%27')}')`;
const DAY = 864e5;
// one language across the app: English words with day-month dates and a 24-hour clock
const LOCALE = 'en-GB';
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
  return d === 1 ? 'yesterday' : d < 30 ? d + ' days ago' : new Date(t).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
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
/* portrait card art: the real cover, or (when a game only has wide art) that art blurred behind the logo — never a squeezed crop */
function tallArt(g, cls = '') {
  if (g.art.cover) return `<img class="cv-img ${cls}" src="${esc(g.art.cover)}" alt="" loading="lazy" decoding="async">`;
  const w = g.art.hero || g.art.header;
  if (w) return `<span class="cv-comp"><span class="cv-blur" style="background-image:${bgu(w)}"></span><span class="cv-wide" style="background-image:${bgu(w)}"></span><span class="lg">${logoHtml(g)}</span></span>`;
  return `<span class="cv-comp" style="background:${fallbackBg(g)}"><span class="lg">${logoHtml(g)}</span></span>`;
}
const artBg = (url, g) => (url ? `${bgu(url)} center/cover` : fallbackBg(g));
function logoHtml(g, cls = 't') {
  if (g.art.logo) return `<img src="${esc(g.art.logo)}" alt="${esc(g.name)}" class="${g.logoMono ? 'logo-mono' : ''}">`;
  return `<span class="ph-stack">${g.art.icon ? `<img class="ph-icon" src="${esc(g.art.icon)}" alt="">` : ''}<span class="${cls}">${esc(g.name)}</span></span>`;
}

/* ---------------- icons ----------------
   Nightfall's own icon set (ui/icons/*.png, white on transparent) is drawn through SVG masks,
   so every icon takes the colour of the text around it. The few icons the set doesn't have are drawn as strokes. */
const OWN_ICONS = ['cog', 'bookmark', 'news', 'pin', 'play', 'share', 'sparkle', 'link', 'plus', 'refresh', 'search', 'folder', 'home'];
document.body.insertAdjacentHTML('afterbegin', `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${OWN_ICONS.map((n) => `<mask id="mi-${n}" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><image href="icons/${n}.png" x="0" y="0" width="24" height="24"/></mask>`).join('')}</defs></svg>`);
const M = (n, size = 16) => `<svg class="mi mi-${n}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" fill="currentColor" mask="url(#mi-${n})"/></svg>`;
const P = (d, extra = '') => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const ICON = {
  home: P('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/>'),
  grid: P('<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>'),
  plus: P('<path d="M12 5v14M5 12h14"/>'),
  search: P('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  cog: P('<path d="M10.3 3.4a1.8 1.8 0 0 1 3.4 0l.3.9a1.8 1.8 0 0 0 2.4 1l.9-.4a1.8 1.8 0 0 1 2.4 2.4l-.4.9a1.8 1.8 0 0 0 1 2.4l.9.3a1.8 1.8 0 0 1 0 3.4l-.9.3a1.8 1.8 0 0 0-1 2.4l.4.9a1.8 1.8 0 0 1-2.4 2.4l-.9-.4a1.8 1.8 0 0 0-2.4 1l-.3.9a1.8 1.8 0 0 1-3.4 0l-.3-.9a1.8 1.8 0 0 0-2.4-1l-.9.4a1.8 1.8 0 0 1-2.4-2.4l.4-.9a1.8 1.8 0 0 0-1-2.4l-.9-.3a1.8 1.8 0 0 1 0-3.4l.9-.3a1.8 1.8 0 0 0 1-2.4l-.4-.9a1.8 1.8 0 0 1 2.4-2.4l.9.4a1.8 1.8 0 0 0 2.4-1z"/><circle cx="12" cy="12" r="3"/>'),
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

  pin: P('<path d="M9 3.5h6l-1 5 3.5 3.5v2h-11v-2L10 8.5z"/><path d="M12 14v6.5"/>'),
  sliders: P('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
  pencil: P('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
  download: P('<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>'),
  user: P('<circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'),
  news: P('<path d="M5 4h11a1 1 0 0 1 1 1v14a1 1 0 0 0 1 1H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1z"/><path d="M17 8h2a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2"/><path d="M8 8h5M8 12h5M8 16h3"/>'),
  chat: P('<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4A8 8 0 1 1 20 12z"/><path d="M9 11h.01M12 11h.01M15 11h.01"/>'),
  power: P('<path d="M12 3v8"/><path d="M6.4 6.4a8 8 0 1 0 11.2 0"/>'),
  refresh: P('<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>'),
  hdd: P('<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M5.5 13 8 5h8l2.5 8"/><path d="M7 16.5h.01M11 16.5h3"/>'),
  gauge: P('<path d="M12 14l4-4"/><path d="M3.5 18a10 10 0 1 1 17 0"/>'),
  trophy: P('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7"/>'),
};
Object.assign(ICON, {
  cog: M('cog'), bookmark: M('bookmark'), news: M('news'), pin: M('pin'), play: M('play', 12), share: M('share'), sparkle: M('sparkle'),
  link: M('link'), plus: M('plus'), refresh: M('refresh'), search: M('search'), grid: M('folder'), folder: M('folder'), home: M('home'),
});
/* the Game settings icon is a user choice (Settings → Library) */
const setIcon = () => { const k = (lib.settings && lib.settings.settingsIcon) || 'cog'; return k === 'none' ? '' : ICON[k] || ICON.cog; };
function paintSetIcons() {
  const k = (lib.settings && lib.settings.settingsIcon) || 'cog';
  if (paintSetIcons.k === k) return; paintSetIcons.k = k;
  document.querySelectorAll('.set-ic').forEach((el) => { el.innerHTML = setIcon(); el.hidden = k === 'none'; });
}
/* bookmark: filled + a little pop when it turns on */
function paintBookmark(btn, on, animate) {
  btn.innerHTML = ICON.bookmark;
  btn.classList.toggle('on', !!on);
  if (animate && on) { btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop'); }
}
function paintIcons(root = document) { root.querySelectorAll('[data-icon]').forEach((el) => { if (!el.dataset.painted) { el.insertAdjacentHTML('afterbegin', ICON[el.dataset.icon] || ''); el.dataset.painted = 1; } }); }

/* ---------------- state ---------------- */
let lib = { games: [], settings: {}, collections: [] };
const state = { view: 'home', sel: null, shots: 0, shelf: 'recent', libTab: 'mine', filter: 'all', owned: null, store: null, downloads: [] };
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
const VIEWS = { home: '#home', game: '#game', all: '#allView', review: '#reviewView', store: '#storeView', profile: '#profileView', news: '#newsView', settings: '#settingsView' };
function go(view) {
  if (view === 'game' && !lib.games.length) view = 'home';
  if (state.view === 'all' && view !== 'all' && renderers.leaveAll) renderers.leaveAll(); // free 400 covers' worth of memory
  state.view = view;
  for (const [k, sel] of Object.entries(VIEWS)) $(sel).hidden = k !== view;
  $('#main').dataset.view = view;
  $('#homeBtn').classList.toggle('on', view === 'home' || view === 'review');
  $('#allBtn').classList.toggle('on', view === 'all' || view === 'store');
  $('#profileBtn').classList.toggle('on', view === 'profile');
  $('#newsBtn').classList.toggle('on', view === 'news');
  $('#settingsBtn').classList.toggle('on', view === 'settings');
  moveRailInd();
  const v = $(VIEWS[view]);
  if (go.prev !== view) { v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter'); }
  go.prev = view;
  renderRail();
  renderView(true);
}
function select(id) { state.sel = id; go('game'); }
$('#homeBtn').onclick = () => go('home');
$('#allBtn').onclick = () => go('all');
$('#profileBtn').onclick = () => go('profile');
$('#newsBtn').onclick = () => go('news');
$('#dlBtn').onclick = () => { drawer('#dlDrawer', true); if (renderers.paintDownloads) renderers.paintDownloads(); };
/* sliding marker next to the active rail button */
function moveRailInd() {
  const on = document.querySelector('.rail .nav-btn.on, .rail .profile-btn.on, #rail .thumb.active');
  const ind = $('#railInd');
  if (!on) { ind.style.opacity = 0; return; }
  const r = on.getBoundingClientRect(), p = $('.rail').getBoundingClientRect();
  ind.style.opacity = 1; ind.style.transform = `translateY(${r.top - p.top + r.height / 2 - 9}px)`;
}
window.addEventListener('resize', () => moveRailInd());
/* right-side drawers (downloads, news) */
function drawer(id, open) {
  const d = $(id);
  if (open) { document.querySelectorAll('.drawer').forEach((x) => { if (x !== d) x.hidden = true; }); d.hidden = false; requestAnimationFrame(() => d.classList.add('open')); $('#scrim').hidden = false; requestAnimationFrame(() => $('#scrim').classList.add('open')); }
  else { d.classList.remove('open'); $('#scrim').classList.remove('open'); setTimeout(() => { if (!d.classList.contains('open')) d.hidden = true; if (!document.querySelector('.drawer.open')) $('#scrim').hidden = true; }, 260); }
}
$('#scrim').onclick = () => document.querySelectorAll('.drawer.open').forEach((d) => drawer('#' + d.id, false));

/* ---------------- sidebar ---------------- */
const rail = $('#rail'), tip = $('#tip');
function tipFor(el, text) {
  el.addEventListener('mouseenter', () => { tip.textContent = text(); const r = el.getBoundingClientRect(); tip.style.top = (r.top + r.height / 2 - 13) + 'px'; tip.classList.add('show'); });
  el.addEventListener('mouseleave', () => tip.classList.remove('show'));
}
tipFor($('#homeBtn'), () => 'Home');
tipFor($('#newsBtn'), () => 'News');
tipFor($('#dlBtn'), () => (renderers.dlTip ? renderers.dlTip() : 'Downloads'));
tipFor($('#profileBtn'), () => (lib.profile && lib.profile.name) || 'Profile');
tipFor($('#allBtn'), () => 'Library');
tipFor($('#addBtnRail'), () => 'Add a game');
tipFor($('#searchBtn'), () => 'Search');
tipFor($('#settingsBtn'), () => 'Settings');
let railKey = '';
function renderRail() {
  const f = state.view === 'game' ? featured() : null;
  const list = ordered('recent').filter((g) => g.pinned);
  const key = list.map((g) => [g.id, g.art.icon, !!g.open, f && g.id === f.id].join()).join(';') + '|' + list.length;
  if (key === railKey) return; railKey = key;
  rail.innerHTML = list.length ? '' : '<span class="rail-empty" title="Pin games from their page">' + ICON.pin + '</span>';
  for (const g of list) {
    const b = document.createElement('button');
    b.className = 'thumb' + (f && g.id === f.id ? ' active' : '');
    b.setAttribute('aria-label', g.name);
    b.innerHTML = (g.art.icon ? `<img src="${esc(g.art.icon)}" alt="">` : `<span class="ph">${esc(g.name[0] || '?')}</span>`) + (g.open ? '<i class="live"></i>' : '');
    b.onclick = () => select(g.id);
    tipFor(b, () => g.name + (g.open ? ' · playing' : ''));
    rail.appendChild(b);
  }
  requestAnimationFrame(moveRailInd);
}

function renderProfileBtn() {
  const p = lib.profile || {};
  const img = $('#profileImg');
  if (p.avatar) { if (img.getAttribute('src') !== p.avatar) img.src = p.avatar; img.hidden = false; $('#profileInit').textContent = ''; }
  else { img.hidden = true; img.removeAttribute('src'); $('#profileInit').textContent = ((p.name || 'P').trim()[0] || 'P').toUpperCase(); }
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
function openSearch() { pop.hidden = false; q.value = ''; renderResults(); q.focus(); }
q.onkeydown = (e) => { if (e.key === 'Escape') pop.hidden = true; if (e.key === 'Enter') $('#results button')?.click(); if (e.key === 'ArrowDown') { e.preventDefault(); $('#results button')?.focus(); } };
$('#results').addEventListener('keydown', (e) => {
  const bs = [...$('#results').querySelectorAll('button')], i = bs.indexOf(document.activeElement);
  if (e.key === 'ArrowDown' && i < bs.length - 1) { e.preventDefault(); bs[i + 1].focus(); }
  if (e.key === 'ArrowUp') { e.preventDefault(); (i > 0 ? bs[i - 1] : q).focus(); }
  if (e.key === 'Escape') pop.hidden = true;
});
document.addEventListener('click', (e) => { if (!pop.hidden && !pop.contains(e.target)) pop.hidden = true; });

/* ---------------- modal helpers ---------------- */
function modal(id, open) { const m = $(id); m.hidden = !open; if (open) { m.classList.remove('in'); void m.offsetWidth; m.classList.add('in'); } }
document.querySelectorAll('.modal-bg').forEach((bg) => bg.addEventListener('mousedown', (e) => { if (e.target === bg) bg.hidden = true; }));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { document.querySelectorAll('.modal-bg').forEach((m) => { m.hidden = true; }); document.querySelectorAll('.drawer.open').forEach((d) => drawer('#' + d.id, false)); } });

/* ---------------- Game settings ---------------- */
let mId = null;
function openModal(id) {
  const g = gameById(id); if (!g) return;
  mId = id;
  $('#mTitle').textContent = g.name;
  if (g.art.icon) $('#mIcon').src = g.art.icon; else $('#mIcon').removeAttribute('src');
  $('#mName').value = g.name; $('#mProc').value = g.proc; $('#mQuery').value = g.name;
  $('#mResults').innerHTML = '';
  $('#mPin').checked = !!g.pinned;
  resetRemove(); renderModalCols(id);
  modal('#modal', true); $('#mName').focus();
}
$('#mClose').onclick = () => modal('#modal', false);
$('#mPin').onchange = (e) => nf.update(mId, { pinned: e.target.checked });
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

/* ---------------- small touches ---------------- */
// one spin for any refresh icon on click; buttons that wait for work keep spinning while .busy
document.addEventListener('click', (e) => {
  const ic = e.target.closest('button')?.querySelector('.mi-refresh');
  if (!ic) return;
  ic.classList.remove('spin1'); void ic.getBoundingClientRect(); ic.classList.add('spin1');
  ic.addEventListener('animationend', () => ic.classList.remove('spin1'), { once: true });
}, true);
async function busy(btn, work) { btn.classList.add('busy'); btn.disabled = true; try { return await work(); } finally { btn.classList.remove('busy'); btn.disabled = false; } }

/* ---------------- smooth image loading ---------------- */
const IMG_OK = new Set();
const urlOf = (el) => { const m = /url\((['"]?)(.*?)\1\)/.exec(el.style.backgroundImage || el.style.background || ''); return m ? m[2] : null; };
function reveal(el) { el.classList.remove('img-wait'); el.classList.add('img-in'); setTimeout(() => el.classList.remove('img-in'), 600); }
function watchImage(el) {
  if (el.tagName === 'IMG') {
    if (!el.getAttribute('src') || el.complete) { if (el.src) IMG_OK.add(el.src); return; }
    if (IMG_OK.has(el.src)) return;
    el.classList.add('img-wait');
    const done = () => { IMG_OK.add(el.src); reveal(el); };
    el.addEventListener('load', done, { once: true }); el.addEventListener('error', () => reveal(el), { once: true });
    return;
  }
  const u = urlOf(el);
  if (!u || IMG_OK.has(u) || el.dataset.waiting === u || el.closest('.no-fade')) return;
  el.dataset.waiting = u;
  el.classList.add('img-wait');
  const i = new Image();
  i.onload = i.onerror = () => { IMG_OK.add(u); if (el.dataset.waiting === u) { delete el.dataset.waiting; reveal(el); } };
  i.src = u;
}
new MutationObserver((muts) => {
  for (const m of muts) {
    if (m.type === 'attributes') { watchImage(m.target); continue; }
    for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.tagName === 'IMG' || n.style) watchImage(n);
      n.querySelectorAll && n.querySelectorAll('img, [style*="url("]').forEach(watchImage);
    }
  }
}).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'src'] });

/* ---------------- render cycle ---------------- */
const renderers = {}; // filled by the view files
function renderView(force) { const r = renderers[state.view]; if (r) r(force); }
function render() {
  renderRail();
  renderProfileBtn();
  paintSetIcons();
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
  if (window.afterBoot) afterBoot();
});
