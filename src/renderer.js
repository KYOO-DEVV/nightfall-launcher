/* global nf */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const css = (u) => (u ? `url("${u.replace(/"/g, '%22')}")` : 'none');

let lib = { games: [], settings: {} };
let state = { sel: null, tab: 'recent', shots: 0, view: 'home' };
try { const t = localStorage.getItem('nf-tab'); if (['recent', 'most', 'added'].includes(t)) state.tab = t; } catch {}

/* ---------------- time maths ---------------- */
const now = () => Date.now();
const DAY = 864e5;
function weekStart(t = now()) { const d = new Date(t); d.setHours(0, 0, 0, 0); const wd = (d.getDay() + 6) % 7; return d.getTime() - wd * DAY; }
function spans(g) { const s = g.sessions.map((x) => [x.s, x.e]); if (g.open) s.push([g.open.s, now()]); return s; }
function within(g, a, b) { let t = 0; for (const [s, e] of spans(g)) t += Math.max(0, Math.min(e, b) - Math.max(s, a)); return t; }
const total = (g) => within(g, 0, Infinity);
const lastPlayed = (g) => (g.open ? now() : g.sessions.reduce((m, x) => Math.max(m, x.e), 0));
function sessionsIn(g, a, b) { return g.sessions.filter((x) => x.e > a && x.s < b).length + (g.open && g.open.s < b ? 1 : 0); }
function fmt(ms) {
  const m = Math.floor(ms / 6e4);
  if (m < 1) return '0m';
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60), r = m % 60;
  return h >= 10 ? h + 'h' : r ? `${h}h ${r}m` : h + 'h';
}
function clock(ms) { const s = Math.floor(ms / 1000); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`; }
function ago(t) {
  if (!t) return null;
  const d = now() - t, m = d / 6e4;
  if (m < 2) return 'just now';
  if (m < 60) return Math.floor(m) + ' minutes ago';
  if (m < 1440) return Math.floor(m / 60) + (m < 120 ? ' hour ago' : ' hours ago');
  const days = Math.floor(m / 1440);
  return days === 1 ? 'yesterday' : days < 30 ? days + ' days ago' : new Date(t).toLocaleDateString();
}
function hue(name) { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
const fallbackBg = (g) => {
  if (g.tint) { const [r, gg, b] = g.tint; return `radial-gradient(75% 90% at 72% 18%, rgba(${r},${gg},${b},.55), transparent 70%), radial-gradient(60% 70% at 15% 95%, rgba(${r},${gg},${b},.22), transparent 70%), linear-gradient(160deg, rgba(${r},${gg},${b},.20), #0c0c0f 78%)`; }
  const h = hue(g.name); return `radial-gradient(70% 80% at 70% 25%, hsl(${h} 35% 30%), transparent 70%), linear-gradient(160deg, hsl(${h} 25% 18%), hsl(${(h + 40) % 360} 30% 7%))`; };
const coverOf = (g) => g.art.cover || g.art.header || g.art.hero;
const heroOf = (g) => g.art.hero || g.art.header || g.art.cover;

/* ---------------- ordering ---------------- */
function ordered(tab = state.tab) {
  const gs = [...lib.games];
  if (tab === 'most') return gs.sort((a, b) => total(b) - total(a) || b.addedAt - a.addedAt);
  if (tab === 'added') return gs.sort((a, b) => b.addedAt - a.addedAt);
  return gs.sort((a, b) => (lastPlayed(b) || b.addedAt / 1e3) - (lastPlayed(a) || a.addedAt / 1e3));
}
function featured() {
  const g = lib.games.find((x) => x.id === state.sel);
  if (g) return g;
  return lib.games.find((x) => x.open) || ordered('recent')[0] || null;
}

/* ---------------- toast ---------------- */
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2400); }

/* ---------------- rail ---------------- */
const rail = $('#rail'), tip = $('#tip');
function tipFor(el, text) {
  el.addEventListener('mouseenter', () => { tip.textContent = text(); const r = el.getBoundingClientRect(); tip.style.top = (r.top + r.height / 2 - 13) + 'px'; tip.classList.add('show'); });
  el.addEventListener('mouseleave', () => tip.classList.remove('show'));
}
tipFor($('#addBtnRail'), () => 'Add a game');
tipFor($('#homeBtn'), () => 'Home');
tipFor($('#searchBtn'), () => 'Search library');
function renderRail() {
  const f = featured();
  rail.innerHTML = '';
  for (const g of ordered('recent')) {
    const b = document.createElement('button');
    b.className = 'thumb' + (state.view === 'game' && f && g.id === f.id ? ' active' : '');
    b.setAttribute('aria-label', g.name);
    b.innerHTML = (g.art.icon ? `<img src="${esc(g.art.icon)}" alt="">` : `<span class="ph">${esc(g.name[0] || '?')}</span>`) + (g.open ? '<i class="live"></i>' : '');
    b.onclick = () => select(g.id);
    tipFor(b, () => g.name + (g.open ? ' · playing' : ''));
    rail.appendChild(b);
  }
}

/* ---------------- hero ---------------- */
let shownHero = null;
const heroKey = (g) => [g.id, heroOf(g), g.art.logo, g.art.icon, g.name, g.desc].join('|');
function renderHero(animate) {
  const empty = lib.games.length === 0;
  $('#empty').hidden = !empty; $('#hero').hidden = empty;
  if (empty) return;
  const g = featured(); const art = $('#heroArt'), logo = $('#logo');
  const apply = () => {
    const h = heroOf(g);
    art.style.backgroundImage = h ? css(h) : fallbackBg(g);
    logo.innerHTML = g.art.logo ? `<img src="${esc(g.art.logo)}" alt="${esc(g.name)}" class="${g.logoMono ? 'logo-mono' : ''}">` : `<span class="t">${esc(g.name)}</span>`;
    const d = $('#desc');
    if (g.desc) { d.textContent = g.desc; d.classList.remove('path'); } else { d.textContent = g.exe; d.classList.add('path'); }
    $('#chipIcon').src = g.art.icon || '';
    if (!g.art.icon) $('#chipIcon').removeAttribute('src');
    art.classList.remove('fade'); logo.classList.remove('swap');
    shownHero = heroKey(g);
    renderHeroLive();
  };
  const key = heroKey(g);
  if (key === shownHero) return renderHeroLive();
  if (!animate) return apply();
  art.classList.add('fade'); logo.classList.add('swap'); setTimeout(apply, 260);
}
function renderHeroLive() {
  const g = featured(); if (!g) return;
  const chip = $('#chipTxt');
  const lp = lastPlayed(g);
  if (g.open) chip.innerHTML = `<i class="dot"></i> Playing now · ${clock(now() - g.open.s)}`;
  else if (g.status === 'searching') chip.textContent = 'Finding official artwork…';
  else if (g.status === 'offline') chip.textContent = 'Offline · artwork loads when you reconnect';
  else if (g.status === 'noart' && !coverOf(g)) chip.textContent = 'No artwork found · pick it in Game settings';
  else chip.textContent = lp ? 'Last played ' + ago(lp) : 'Added ' + (ago(g.addedAt) || 'today') + ' · not played yet';
  $('#hTotal').textContent = fmt(total(g));
  $('#hSessions').textContent = g.sessions.length + (g.open ? 1 : 0);
  const pb = $('#playBtn');
  pb.classList.toggle('running', !!g.open);
  $('#playTxt').textContent = g.open ? 'Running' : 'Play';
}
function select(id) {
  state.sel = id; state.view = 'game'; renderRail(); renderHero(true); applyView();
  $('#main').scrollTo({ top: 0, behavior: 'smooth' });
}
$('#playBtn').onclick = () => launch(featured());
$('#setBtn').onclick = () => openModal(featured().id);

async function launch(g) {
  if (!g) return;
  if (g.open) return toast(`${g.name} is already running`);
  const err = await nf.launch(g.id);
  toast(err ? err : `Launching ${g.name}…`);
}

/* parallax */
const main = $('#main');
main.addEventListener('scroll', () => { $('#heroArt').style.transform = `translateY(${main.scrollTop * 0.35}px)`; }, { passive: true });

/* ---------------- cards ---------------- */
const ICON_CLOCK = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
const ICON_PULSE = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M4 12h4l2-5 4 10 2-5h4"/></svg>';
let cardsKey = '';
function renderCards(animate) {
  const wrap = $('#cards');
  const list = typeof libFilter === 'function' ? libFilter(ordered()) : ordered();
  const key = state.tab + (state.filter || '') + (lib.collections || []).length + '|' + list.map((g) => [g.id, g.name, coverOf(g), g.status, !!g.open, g.art.icon, Math.floor(total(g) / 6e4), g.sessions.length].join(',')).join(';');
  if (key === cardsKey && !animate) return;
  cardsKey = key;
  const build = () => {
    wrap.innerHTML = '';
    list.forEach((g, i) => {
      const c = document.createElement('article');
      c.className = 'card' + (i === 0 ? ' wide' : ''); c.tabIndex = 0;
      const cov = i === 0 ? (g.art.hero || coverOf(g)) : coverOf(g); // the wide card looks best with landscape art
      c.style.background = cov ? `${css(cov)} center/cover` : fallbackBg(g);
      const lp = lastPlayed(g);
      c.innerHTML = `${cov ? '' : g.art.logo ? `<div class="ttl"><img src="${esc(g.art.logo)}" alt="" class="${g.logoMono ? 'logo-mono' : ''}" style="max-width:80%;max-height:40%;object-fit:contain"></div>` : `<div class="ttl">${esc(g.name)}</div>`}
        ${g.status === 'searching' ? '<div class="shimmer"></div>' : ''}
        ${g.open ? `<span class="badge live">Playing</span>` : ''}
        <div class="info"><div>
          <div class="n">${g.art.icon ? `<img src="${esc(g.art.icon)}" alt="">` : ''}${esc(g.name)}</div>
          <div class="p">${lp ? 'Last played ' + ago(lp) : 'Not played yet'}</div>
          <div class="m"><span>${ICON_CLOCK}${fmt(total(g))}</span><span>${ICON_PULSE}${g.sessions.length + (g.open ? 1 : 0)} sessions</span></div>
        </div>
        <div class="side">
          <button data-a="play" aria-label="Play ${esc(g.name)}"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg></button>
          <button data-a="set" aria-label="Settings for ${esc(g.name)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg></button>
        </div></div>`;
      c.onclick = (e) => {
        const a = e.target.closest('button')?.dataset.a;
        if (a === 'play') return launch(g);
        if (a === 'set') return openModal(g.id);
        select(g.id);
      };
      c.ondblclick = (e) => { if (!e.target.closest('button')) launch(g); };
      c.onkeydown = (e) => { if (e.key === 'Enter') launch(g); };
      wrap.appendChild(c);
    });
    const add = document.createElement('button');
    add.className = 'card add';
    add.innerHTML = '<span class="plus"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg></span>Add a game';
    add.onclick = addDialog;
    wrap.appendChild(add);
  };
  if (!animate) return build();
  wrap.classList.add('leaving'); setTimeout(() => { build(); requestAnimationFrame(() => wrap.classList.remove('leaving')); }, 220);
}

/* tabs */
const seg = $('#seg'), pill = $('#pill');
function movePill() { const b = seg.querySelector('[aria-selected="true"]'); pill.style.width = b.offsetWidth + 'px'; pill.style.transform = `translateX(${b.offsetLeft}px)`; }
seg.querySelectorAll('button').forEach((b) => {
  b.setAttribute('aria-selected', b.dataset.k === state.tab);
  b.onclick = () => {
    if (b.dataset.k === state.tab) return;
    seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', x === b));
    state.tab = b.dataset.k; movePill(); renderCards(true);
    try { localStorage.setItem('nf-tab', state.tab); } catch {}
  };
});

/* ---------------- weekly stats ---------------- */
function renderStats() {
  const a = weekStart(), b = a + 7 * DAY, gs = lib.games;
  let week = 0, sess = 0, sessMs = 0;
  for (const g of gs) {
    week += within(g, a, b);
    for (const x of g.sessions) if (x.e > a) { sess++; sessMs += x.e - Math.max(x.s, a); }
    if (g.open) { sess++; sessMs += now() - Math.max(g.open.s, a); }
  }
  $('#wHours').textContent = fmt(week);
  $('#wSessions').textContent = sess;
  $('#wAvg').textContent = sess ? fmt(sessMs / sess) : '0m';
  $('#wNew').textContent = gs.filter((g) => g.addedAt >= a).length;
  $('#wShots').textContent = state.shots;
  const days = [...Array(7)].map((_, i) => gs.reduce((t, g) => t + within(g, a + i * DAY, a + (i + 1) * DAY), 0));
  const max = Math.max(...days, 1), today = Math.floor((now() - a) / DAY);
  const html = days.map((ms, i) => `<div class="${i === today ? 'today' : ''}" title="${fmt(ms)}"><i style="height:${Math.max(2, Math.round((ms / max) * 34))}px;animation-delay:${i * 50}ms"></i>${'MTWTFSS'[i]}</div>`).join('');
  if ($('#bars').dataset.k !== html) { $('#bars').innerHTML = html; $('#bars').dataset.k = html; }
  const fav = gs.map((g) => [g, within(g, a, b)]).sort((x, y) => y[1] - x[1])[0];
  if (fav && fav[1] > 0) {
    const g = fav[0], cv = coverOf(g) || g.art.icon;
    $('#favCv').style.background = cv ? `${css(cv)} center/cover` : fallbackBg(g);
    $('#favName').textContent = g.name; $('#favSub').textContent = fmt(fav[1]) + ' this week';
  } else {
    $('#favCv').style.background = ''; $('#favName').textContent = 'No games played yet'; $('#favSub').textContent = 'Play something this week';
  }
  $('#count').textContent = gs.length ? '· ' + gs.length : '';
}
async function refreshShots() { try { state.shots = await nf.screenshots(weekStart()); renderStats(); if (typeof renderHome === 'function') renderHome(); } catch {} }

/* ---------------- full render ---------------- */
function render(animateHero) {
  if (state.sel && !lib.games.some((g) => g.id === state.sel)) state.sel = null;
  if (!lib.games.length && state.view === 'game') state.view = 'home';
  renderRail(); renderHero(animateHero); renderCards(); renderStats(); applyView(); renderHome();
  $('#foot').textContent = lib.settings.closeToTray
    ? 'Nightfall checks for running games every 5 seconds. Closing the window keeps it tracking from the tray; right-click the tray icon to quit or start with Windows.'
    : 'Nightfall checks for running games every 5 seconds while it is open.';
}

/* ---------------- adding ---------------- */
async function addDialog() {
  const ids = await nf.addDialog();
  if (ids && ids.length) { state.sel = ids[ids.length - 1]; state.view = 'game'; toast(ids.length === 1 ? 'Game added · finding artwork' : `${ids.length} games added · finding artwork`); render(true); }
}
$('#addBtnRail').onclick = addDialog;
$('#addBtnEmpty').onclick = addDialog;

let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; $('#drop').hidden = false; });
window.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#drop').hidden = true; });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
  e.preventDefault(); dragDepth = 0; $('#drop').hidden = true;
  const paths = [...e.dataTransfer.files].map((f) => nf.pathFor(f)).filter(Boolean);
  const ids = await nf.addPaths(paths);
  if (ids.length) { state.sel = ids[ids.length - 1]; state.view = 'game'; toast(ids.length === 1 ? 'Game added · finding artwork' : `${ids.length} games added`); render(true); }
  else toast('Drop a game .exe (or a shortcut to one) that is not already in your library');
});

/* ---------------- search ---------------- */
const pop = $('#searchPop'), q = $('#q');
function renderResults() {
  const s = q.value.trim().toLowerCase();
  const list = ordered('recent').filter((g) => g.name.toLowerCase().includes(s));
  const ul = $('#results'); ul.innerHTML = list.length ? '' : `<li class="empty-li">${lib.games.length ? 'No games match that name.' : 'Your library is empty.'}</li>`;
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

/* ---------------- settings modal ---------------- */
let mId = null;
function openModal(id) {
  const g = lib.games.find((x) => x.id === id); if (!g) return;
  mId = id;
  $('#mTitle').textContent = g.name;
  if (g.art.icon) $('#mIcon').src = g.art.icon; else $('#mIcon').removeAttribute('src');
  $('#mName').value = g.name; $('#mProc').value = g.proc; $('#mQuery').value = g.name;
  $('#mResults').innerHTML = '';
  resetRemove();
  if (typeof renderModalCols === 'function') renderModalCols(id);
  $('#modal').hidden = false; $('#mName').focus();
}
const closeModal = () => { $('#modal').hidden = true; mId = null; };
$('#mClose').onclick = closeModal;
$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });
$('#mSave').onclick = async () => { await nf.update(mId, { name: $('#mName').value, proc: $('#mProc').value }); toast('Saved'); closeModal(); };
async function doArtSearch() {
  const ul = $('#mResults'); ul.innerHTML = '<li class="msg">Searching Steam…</li>';
  const res = await nf.searchArt($('#mQuery').value.trim());
  if (res === null) { ul.innerHTML = '<li class="msg">Could not reach Steam. Check your connection and try again.</li>'; return; }
  if (!res.length) { ul.innerHTML = '<li class="msg">No matches. Try a shorter name, or use your own images below.</li>'; return; }
  ul.innerHTML = '';
  for (const r of res.slice(0, 8)) {
    const li = document.createElement('li');
    li.innerHTML = `<button><img src="${esc(r.thumb)}" alt="">${esc(r.name)}<small>${r.appid}</small></button>`;
    li.firstChild.onclick = async () => {
      const id = mId; closeModal(); toast(`Fetching artwork for ${r.name}…`);
      await nf.applyArt(id, r.appid, r.name); toast('Artwork updated');
    };
    ul.appendChild(li);
  }
}
$('#mSearch').onclick = doArtSearch;
$('#mQuery').onkeydown = (e) => { if (e.key === 'Enter') doArtSearch(); };
$('#mCover').onclick = () => nf.customArt(mId, 'cover');
$('#mHeroImg').onclick = () => nf.customArt(mId, 'hero');
$('#mLogo').onclick = () => nf.customArt(mId, 'logo');
$('#mRefetch').onclick = async () => { const id = mId; closeModal(); toast('Fetching artwork…'); await nf.refetchArt(id); toast('Artwork updated'); };
$('#mShow').onclick = () => nf.showFile(mId);
function resetRemove() { const b = $('#mRemove'); b.classList.remove('confirm'); b.firstElementChild.textContent = 'Remove from library'; }
$('#mRemove').onclick = async () => {
  const b = $('#mRemove');
  if (!b.classList.contains('confirm')) { b.classList.add('confirm'); b.firstElementChild.textContent = 'Click again to remove (play history is deleted)'; return; }
  const g = lib.games.find((x) => x.id === mId);
  await nf.remove(mId); closeModal(); toast(`${g ? g.name : 'Game'} removed`);
};

/* ---------------- boot ---------------- */
const domReady = new Promise((r) => (document.readyState === 'loading' ? addEventListener('DOMContentLoaded', r) : r()));
nf.onChange(async (data) => { await domReady; lib = data; render(false); });
(async () => {
  await domReady;
  lib = await nf.get();
  render(false);
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(movePill); movePill();
  refreshShots();
})();
addEventListener('resize', movePill);
setInterval(() => { if (lib.games.some((g) => g.open)) { renderHeroLive(); renderStats(); } }, 1000);
setInterval(() => { renderCards(); renderStats(); }, 30000);
setInterval(refreshShots, 60000);
