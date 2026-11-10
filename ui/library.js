/* global busy, tallArt, nf, lib, state, $, esc, bgu, artBg, fmt, ago, total, lastPlayed, hours, ordered, coverOf, gameById, logoHtml, ICON, launch, select, toast, renderers, STORE_LABEL, setIcon, openModal */
// Library: games on this PC (with bookmarks & collections) and everything you own on your stores.

function movePill() { const b = $('#libTabs [aria-selected="true"]'); if (!b) return; $('#libPill').style.width = b.offsetWidth + 'px'; $('#libPill').style.transform = `translateX(${b.offsetLeft}px)`; }
$('#libTabs').querySelectorAll('button').forEach((b) => {
  b.onclick = () => { state.libTab = b.dataset.t; state.filter = 'all'; $('#libTabs').querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', x === b)); movePill(); renderers.all(true); };
});
window.addEventListener('resize', movePill);

function mineCard(g) {
  const el = document.createElement('div');
  el.className = 'av-card installed';
  el.tabIndex = 0;
  el.innerHTML = `<div class="av-img">${tallArt(g)}
      <span class="store mine">${esc(STORE_LABEL[g.source] || 'PC')}</span>${state.newSince && g.addedAt > state.newSince ? '<span class="new-badge">New</span>' : ''}${g.fav ? `<span class="fav-dot">${ICON.bookmark}</span>` : ''}${g.open ? '<span class="live-dot">Playing</span>' : ''}</div>
    <div class="av-meta"><b title="${esc(g.name)}">${esc(g.name)}</b><small>${total(g) ? fmt(total(g)) + ' played' : 'Not played yet'}${lastPlayed(g) ? ' · ' + ago(lastPlayed(g)) : ''}</small></div>
    <div class="av-btns"><button class="btn btn-solid sm av-btn">${g.open ? 'Running' : 'Play'}</button>${setIcon() ? `<button class="btn btn-ghost sm icon-only av-more" aria-label="Game settings" title="Game settings">${setIcon()}</button>` : ''}</div>`;
  el.querySelector('.av-btn').onclick = (e) => { e.stopPropagation(); launch(g); };
  const more = el.querySelector('.av-more'); if (more) more.onclick = (e) => { e.stopPropagation(); openModal(g.id); };
  el.oncontextmenu = (e) => { e.preventDefault(); openModal(g.id); };
  el.onclick = () => select(g.id);
  return el;
}
function ownedCard(o) {
  const g = o.gameId && gameById(o.gameId);
  const el = document.createElement('div');
  el.className = 'av-card' + (g ? ' installed' : '');
  el.tabIndex = 0;
  el.dataset.key = dlKey(o);
  el.innerHTML = `<div class="av-img">${o.cover ? `<img class="cv-img" src="${esc(epicSmall(o.cover))}" alt="" loading="lazy" decoding="async">` : `<span class="nm">${esc(o.name)}</span>`}
      <span class="store ${o.store}">${esc(STORE_LABEL[o.store] || o.store)}</span>${g && g.open ? '<span class="live-dot">Playing</span>' : ''}</div>
    <div class="av-meta"><b title="${esc(o.name)}">${esc(o.name)}</b><small>${o.playMin ? hours(o.playMin) + ' on Steam' : g ? fmt(total(g)) + ' played' : 'Not installed'}${o.last ? ' · ' + ago(o.last) : ''}</small></div>
    <div class="av-btns"><button class="btn ${g ? 'btn-solid' : 'btn-ghost'} sm av-btn">${g ? 'Play' : 'Install'}</button></div>`;
  el.querySelector('.av-btn').onclick = async (e) => {
    e.stopPropagation();
    if (g) return launch(g);
    renderers.installOwned(o);
  };
  el.onclick = () => { if (g) select(g.id); else renderers.openStorePage(o); };
  paintCardProgress(el);
  return el;
}
const skelCards = (n) => Array.from({ length: n }, (_, i) => `<div class="av-card skel" style="--i:${i}"><div class="av-img"></div><div class="av-meta"><i></i><i></i></div></div>`).join('');
const dlKey = (o) => (o.store === 'steam' ? 'steam:' + o.appid : o.store === 'epic' ? 'epic:' + (o.ns || '') : o.id);
/* live install progress on store cards */
function paintCardProgress(el) {
  const d = (state.downloads || []).find((x) => x.key === el.dataset.key);
  const box = el.querySelector('.av-img'), btn = el.querySelector('.av-btn');
  if (!box || !btn) return;
  if (!d) {
    const done = state.justDone && state.justDone[el.dataset.key];
    if (done && now() - done < 8000 && !box.classList.contains('done')) { box.classList.add('done'); setTimeout(() => box.classList.remove('done'), 1600); }
    if (box.classList.contains('dl')) { box.classList.remove('dl', 'paused', 'indet'); box.querySelector('.cv-fill')?.remove(); }
    if (btn.dataset.dl) { btn.textContent = 'Install'; delete btn.dataset.dl; }
    return;
  }
  // the cover turns grey and fills back up with colour, bottom to top, as the game downloads
  const pct = d.total ? Math.min(100, (d.done / d.total) * 100) : 0;
  const img = box.querySelector('.cv-img');
  let fill = box.querySelector('.cv-fill');
  if (!fill) {
    fill = document.createElement('span'); fill.className = 'cv-fill';
    fill.innerHTML = img ? `<img src="${img.getAttribute('src')}" alt="">` : '';
    fill.insertAdjacentHTML('beforeend', '<i class="cv-edge"></i>');
    box.insertBefore(fill, img ? img.nextSibling : box.firstChild);
  }
  box.classList.add('dl');
  box.classList.toggle('paused', d.state === 'paused');
  box.classList.toggle('indet', !d.total);
  box.style.setProperty('--fill', (d.total ? pct : 0) + '%');
  btn.dataset.dl = 1;
  btn.textContent = d.state === 'paused' ? `Paused · ${Math.floor(pct)}%` : d.total ? Math.floor(pct) + '%' : 'Installing…';
}
renderers.paintCards = () => { if (state.view === 'all' && state.libTab === 'stores') document.querySelectorAll('#avGrid .av-card[data-key]').forEach(paintCardProgress); };

let avKey = '';
// Epic's image CDN resizes on request: ask for card-sized covers
const epicSmall = (u) => (/epicgames.com/.test(u) ? u + (u.includes('?') ? '&' : '?') + 'h=480&w=320&resize=1' : u);
renderers.leaveAll = () => { $('#avGrid').innerHTML = ''; avKey = ''; };
renderers.all = async (force) => {
  requestAnimationFrame(movePill);
  const qv = $('#avQ').value.trim().toLowerCase();
  const sort = $('#avSort').value;
  const grid = $('#avGrid');
  const showChips = !!(lib.settings && lib.settings.showFilters);
  if (renderers.libLayout) renderers.libLayout();
  $('#avChips').hidden = !showChips;
  if (!showChips) state.filter = 'all';
  if (state.libTab === 'mine') {
    $('#avSort').hidden = false; $('#avRefresh').hidden = true;
    $('#avEyebrow').textContent = 'On this PC';
    $('#avSub').textContent = `${lib.games.length} ${lib.games.length === 1 ? 'game' : 'games'} installed and tracked · ${lib.games.filter((g) => g.fav).length} bookmarked · ${(lib.collections || []).length} collections`;
    const cols = lib.collections || [];
    if (state.filter !== 'all' && state.filter !== 'fav' && state.filter !== 'hidden' && !cols.some((c) => c.id === state.filter)) state.filter = 'all';
    const chip = (k, label, n) => `<button class="chip ${state.filter === k ? 'on' : ''}" data-f="${esc(k)}">${label}${n != null ? `<i>${n}</i>` : ''}</button>`;
    $('#avChips').innerHTML = chip('all', 'All', lib.games.length) + chip('fav', ICON.bookmark + ' Bookmarks', lib.games.filter((g) => g.fav).length)
      + cols.map((c) => chip(c.id, esc(c.name), c.games.filter(gameById).length)).join('') + '<button class="chip add" id="chipNew">+ New collection</button>';
    $('#avChips').querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => { state.filter = b.dataset.f; renderers.all(true); }; });
    $('#chipNew').onclick = () => {
      $('#chipNew').outerHTML = '<input class="chip-input" id="chipInput" maxlength="40" placeholder="Collection name, then Enter">';
      const i = $('#chipInput'); i.focus();
      i.onkeydown = async (e) => { if (e.key === 'Escape') return renderers.all(true); if (e.key === 'Enter' && i.value.trim()) { state.filter = (await nf.colCreate(i.value.trim())) || 'all'; toast('Collection created · add games from their settings'); } };
      i.onblur = () => setTimeout(() => renderers.all(true), 150);
    };
    let list = ordered(sort);
    const hiddenN = (lib.allGames || []).filter((g) => g.hidden).length;
    $('#avHidden').hidden = !hiddenN && state.filter !== 'hidden';
    $('#avHidden').classList.toggle('on', state.filter === 'hidden');
    $('#avHidden').firstElementChild.textContent = state.filter === 'hidden' ? 'Back to all games' : `Hidden · ${hiddenN}`;
    if (state.filter === 'hidden') list = (lib.allGames || []).filter((g) => g.hidden);
    if (state.filter === 'fav') list = list.filter((g) => g.fav);
    else { const c = cols.find((x) => x.id === state.filter); if (c) list = list.filter((g) => c.games.includes(g.id)); }
    if (qv) list = list.filter((g) => g.name.toLowerCase().includes(qv));
    const key = 'mine' + state.filter + sort + qv + (lib.settings && lib.settings.settingsIcon) + state.newSince + list.map((g) => [g.id, coverOf(g), g.fav, !!g.open, Math.floor(total(g) / 6e4)].join()).join(';');
    if (!force && key === avKey) return; avKey = key;
    grid.innerHTML = list.length ? '' : `<div class="row-empty">${state.filter === 'fav' ? 'Bookmark a game on its page to add it here.' : state.filter !== 'all' ? 'This collection is empty. Add games from their Game settings.' : 'No games match.'}</div>`;
    const frag = document.createDocumentFragment(); list.forEach((g) => frag.appendChild(mineCard(g))); grid.appendChild(frag);
    return;
  }
  // your stores
  $('#avSort').hidden = true; $('#avRefresh').hidden = false; $('#avHidden').hidden = true;
  if (!state.owned || force === 'refresh') {
    $('#avSub').textContent = 'Reading your store libraries…';
    if (!grid.querySelector('.av-card')) { grid.innerHTML = skelCards(12); avKey = ''; }
    try { state.owned = await nf.owned(force === 'refresh'); } catch (e) { nf.log('warn', 'owned: ' + e); state.owned = { accounts: [], games: [], failed: true }; }
  }
  const o = state.owned, games = o.games || [];
  if (o.failed) {
    $('#avSub').textContent = '';
    grid.innerHTML = `<div class="state-box">${ICON.refresh}<b>Couldn't read your store libraries</b><p>Your stores' apps may be busy updating. Your games on this PC are not affected.</p><button class="btn btn-solid sm" id="avRetry"><span>Try again</span></button></div>`;
    avKey = ''; $('#avRetry').onclick = () => renderers.all('refresh'); return;
  }
  const by = (s) => games.filter((x) => x.store === s).length;
  $('#avEyebrow').textContent = (o.accounts || []).map((a) => a.store === 'steam' ? 'Steam · ' + a.name : a.name).join('  ·  ') || 'Your stores';
  $('#avSub').textContent = games.length ? `${games.length} games you own · ${games.filter((x) => x.gameId).length} installed here` : 'No store libraries found on this PC. Sign in to Steam, Epic, GOG Galaxy, Amazon Games or itch once, then refresh.';
  const stores = [...new Set(games.map((x) => x.store))];
  const f = ['all', 'inst', 'not', ...stores].includes(state.filter) ? state.filter : 'all';
  const chip = (k, label, n) => `<button class="chip ${f === k ? 'on' : ''}" data-k="${k}">${label}<i>${n}</i></button>`;
  $('#avChips').innerHTML = chip('all', 'All', games.length) + chip('inst', 'Installed', games.filter((x) => x.gameId).length) + chip('not', 'Not installed', games.filter((x) => !x.gameId).length)
    + stores.map((s) => chip(s, STORE_LABEL[s] || s, by(s))).join('');
  $('#avChips').querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => { state.filter = b.dataset.k; renderers.all(true); }; });
  const list = games.filter((x) => (f === 'inst' ? x.gameId : f === 'not' ? !x.gameId : f === 'all' ? true : x.store === f) && (!qv || x.name.toLowerCase().includes(qv)))
    .sort((a, b) => (!!b.gameId - !!a.gameId) || (b.last - a.last) || (b.playMin - a.playMin) || a.name.localeCompare(b.name));
  const key = 'stores' + f + qv + list.length + list.map((x) => x.gameId || '').join();
  if (!force && key === avKey) return; avKey = key;
  grid.innerHTML = list.length ? '' : '<div class="row-empty">No games match.</div>';
  const frag = document.createDocumentFragment(); list.forEach((x) => frag.appendChild(ownedCard(x))); grid.appendChild(frag);
};
$('#avQ').oninput = () => renderers.all(true);
$('#avSort').onchange = () => renderers.all(true);
$('#avRefresh').onclick = () => busy($('#avRefresh'), () => renderers.all('refresh'));
