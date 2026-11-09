/* global nf, lib, state, $, esc, bgu, artBg, fmt, ago, clock, total, lastPlayed, within, weekStart, ordered, gameById, logoHtml, wideOf, thumbOf, coverOf, heroOf, fallbackBg, hours, ICON, launch, select, go, renderers, DAY, now */
// Home: everything at a glance on one screen.

const played = () => ordered('recent').filter((g) => lastPlayed(g) > 0);
function metaLine(g) {
  if (g.open) return `Playing now · ${clock(now() - g.open.s)}`;
  const lp = lastPlayed(g);
  return lp ? `${fmt(total(g))} played · ${ago(lp)}` : `Added ${ago(g.addedAt) || 'today'} · not played yet`;
}

/* ---------- shelf tiles ---------- */
function gameTile(g) {
  const b = document.createElement('div');
  b.className = 'tile-g'; b.tabIndex = 0; b.setAttribute('role', 'button');
  const im = wideOf(g);
  b.innerHTML = `<div class="im" style="background:${artBg(im, g)}">${im ? '' : `<div class="lg">${logoHtml(g)}</div>`}
      ${g.open ? '<span class="badge">Playing</span>' : ''}<button class="play" aria-label="Play ${esc(g.name)}">${ICON.play}</button></div>
    <div class="n">${g.art.icon ? `<img src="${esc(g.art.icon)}" alt="">` : ''}${esc(g.name)}</div>
    <div class="p" data-live="${g.id}">${esc(metaLine(g))}</div>`;
  b.onclick = (e) => { if (e.target.closest('.play')) return launch(g); select(g.id); };
  b.onkeydown = (e) => { if (e.key === 'Enter') select(g.id); };
  return b;
}
function storeTile(o) {
  const b = document.createElement('div');
  b.className = 'tile-g store-tile';
  b.innerHTML = `<div class="im" style="${o.header || o.hero || o.cover ? `background:${bgu(o.header || o.hero || o.cover)} center/cover` : ''}"><span class="badge store">${esc(o.store === 'steam' ? 'Steam' : o.store === 'epic' ? 'Epic' : o.store.toUpperCase())}</span>
      <button class="play inst" aria-label="Install ${esc(o.name)}">Install</button></div>
    <div class="n">${esc(o.name)}</div><div class="p">${o.playMin ? hours(o.playMin) + ' on Steam' : 'Not installed'}${o.last ? ' · ' + ago(o.last) : ''}</div>`;
  b.querySelector('.inst').onclick = async (e) => { e.stopPropagation(); const err = await nf.openStore(o.install); toast(err || `Opening ${o.store === 'steam' ? 'Steam' : o.store === 'epic' ? 'the Epic Games Launcher' : 'the store app'} to install ${o.name}.`); };
  return b;
}
function shelfTabs() {
  const tabs = [['recent', 'Recently played'], ['fav', 'Bookmarks']];
  for (const c of lib.collections || []) if (c.games.some(gameById)) tabs.push(['col:' + c.id, c.name]);
  tabs.push(['added', 'Recently added']);
  if (state.owned && state.owned.games.some((x) => !x.gameId)) tabs.push(['stores', 'From your stores']);
  return tabs;
}
function shelfItems(k) {
  if (k === 'recent') return played().slice(0, 16);
  if (k === 'fav') return ordered('recent').filter((g) => g.fav);
  if (k === 'added') return ordered('added').slice(0, 16);
  if (k.startsWith('col:')) { const c = (lib.collections || []).find((x) => 'col:' + x.id === k); return c ? c.games.map(gameById).filter(Boolean) : []; }
  return [];
}
const SHELF_EMPTY = { recent: 'Games you play show up here, even when you start them from Steam or a desktop shortcut.', fav: 'Bookmark a game on its page and it shows up here.', added: 'No games yet.' };

/* ---------- friends ---------- */
let friendsData = null, friendsAt = 0;
async function loadFriends(force) {
  if (!force && friendsData && now() - friendsAt < 60000) return friendsData;
  try { friendsData = await nf.friends(!!force); } catch (e) { friendsData = { error: String(e) }; }
  friendsAt = now(); return friendsData;
}
async function renderFriends() {
  const d = await loadFriends(false);
  const el = $('#frList');
  const msg = { nosteam: "Sign in to the Steam app on this PC and your friends show up here.", nofriends: 'No friends in your Steam app yet.' };
  if (d.error) { $('#frSub').textContent = 'Steam'; el.innerHTML = `<div class="fr-empty"><p>${esc(msg[d.error] || d.error)}</p></div>`; return; }
  const f = (d.friends || []).filter((x) => x.state !== 'unknown');
  const on = f.filter((x) => x.state !== 'offline');
  $('#frSub').textContent = `${on.length} online · ${f.filter((x) => x.state === 'ingame').length} playing`;
  const label = (x) => x.state === 'ingame' ? esc(x.game || 'In a game') + (x.detail ? ' · ' + esc(x.detail) : '')
    : x.state === 'offline' ? (x.lastOff ? 'Last online ' + ago(x.lastOff) : 'Offline') : x.state[0].toUpperCase() + x.state.slice(1);
  el.innerHTML = f.length ? f.slice(0, 40).map((x, i) => `<div class="fr ${x.state}" style="--i:${Math.min(i, 12)}">
      <span class="av" style="${x.avatar ? `background-image:${bgu(x.avatar)}` : ''}"><i></i></span>
      <span class="fr-tx"><b>${esc(x.name)}</b><small>${label(x)}</small></span>
    </div>`).join('') : '<div class="fr-empty"><p>No Steam friends yet.</p></div>';
}

/* ---------- render ---------- */
let homeKey = '';
renderers.home = (force) => {
  const d = new Date(), h = d.getHours();
  $('#hmDate').textContent = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  $('#hmGreet').textContent = h < 5 ? 'Late night session' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  $('#hmReviewTxt').textContent = d.getFullYear() + ' in review';
  const gs = lib.games, empty = !gs.length;
  $('#hmCta').hidden = !empty; $('#hmTop').hidden = empty; $('#hmBottom').hidden = empty;
  $('#hmAdd').hidden = empty; $('#hmConnect').hidden = empty;
  const a = weekStart(), b = a + 7 * DAY;
  const week = gs.reduce((t, g) => t + within(g, a, b), 0);
  const gamesWeek = gs.filter((g) => within(g, a, b) > 0);
  const running = gs.filter((g) => g.open);
  $('#hmSub').innerHTML = empty ? 'Nothing connected yet.' : running.length
    ? `Playing <b>${esc(running.map((g) => g.name).join(', '))}</b> right now · <b>${fmt(week)}</b> this week.`
    : `<b>${gs.length}</b> ${gs.length === 1 ? 'game' : 'games'} · <b>${fmt(week)}</b> played this week across <b>${gamesWeek.length}</b> ${gamesWeek.length === 1 ? 'game' : 'games'}.`;
  if (empty) return;
  if (!state.owned) nf.owned(false).then((o) => { state.owned = o; homeKey = ''; renderers.home(true); }).catch(() => {});
  renderFriends();

  const key = gs.map((g) => [g.id, g.name, g.status, wideOf(g), thumbOf(g), g.art.logo, g.art.icon, String(g.tint), !!g.open, g.fav, g.sessions.length, Math.floor(total(g) / 6e4)].join(',')).join(';')
    + '|' + state.shots + '|' + state.shelf + '|' + JSON.stringify(lib.collections) + '|' + (state.owned ? state.owned.games.length : 0);
  if (!force && key === homeKey) return; homeKey = key;

  /* jump back in */
  const recent = played();
  const pool = recent.length ? recent : ordered('added');
  const top = pool[0];
  // fill the side list with recently added games when you've only played a few
  const rest = [...pool.slice(1), ...ordered('added').filter((g) => !pool.includes(g))].slice(0, 3);
  const bn = $('#hmBanner');
  bn.style.background = artBg(heroOf(top), top);
  bn.innerHTML = `<div class="b-logo">${logoHtml(top)}</div>
    <div class="b-meta">${top.open ? `<span class="live" data-live="${top.id}">● ${esc(metaLine(top))}</span>` : `<span>${lastPlayed(top) ? 'Last played ' + ago(lastPlayed(top)) : 'Ready to play'}</span><span>${fmt(total(top))} total</span><span>${top.sessions.length} sessions</span>`}</div>
    <div class="actions"><button class="btn btn-solid ${top.open ? 'running' : ''}" id="hmPlay"><span>${top.open ? 'Running' : recent.length ? 'Continue' : 'Play'}</span><span class="ic">${ICON.play}</span></button></div>`;
  bn.onclick = (e) => { if (e.target.closest('#hmPlay')) return launch(top); select(top.id); };
  $('#hmSide').innerHTML = rest.map((g) => `<div class="side-item" data-id="${g.id}" tabindex="0" role="button">
      <i class="th" style="background:${artBg(thumbOf(g), g)}">${thumbOf(g) || !g.art.icon ? '' : `<img class="ph-icon only" src="${esc(g.art.icon)}" alt="">`}</i>
      <div class="tx"><div class="n">${g.art.icon ? `<img src="${esc(g.art.icon)}" alt="">` : ''}${esc(g.name)}</div><div class="p" data-live="${g.id}">${esc(metaLine(g))}</div></div>
      <button class="go" aria-label="Play ${esc(g.name)}">${ICON.play}</button></div>`).join('') || '<div class="row-empty">Play more games and they show up here.</div>';
  $('#hmSide').querySelectorAll('.side-item').forEach((el) => { const g = gameById(el.dataset.id); el.onclick = (e) => { if (e.target.closest('.go')) return launch(g); select(g.id); }; });

  /* shelf */
  const tabs = shelfTabs();
  if (!tabs.some((t) => t[0] === state.shelf)) state.shelf = 'recent';
  $('#shelfTabs').innerHTML = tabs.map(([k, l]) => `<button class="chip ${k === state.shelf ? 'on' : ''}" data-k="${esc(k)}">${k === 'fav' ? ICON.bookmark + ' ' : ''}${esc(l)}</button>`).join('');
  $('#shelfTabs').querySelectorAll('button').forEach((b) => { b.onclick = () => { state.shelf = b.dataset.k; renderers.home(true); }; });
  const row = $('#shelfRow'); row.innerHTML = '';
  if (state.shelf === 'stores') {
    state.owned.games.filter((x) => !x.gameId && (x.header || x.cover)).sort((x, y) => (y.last - x.last) || (y.playMin - x.playMin)).slice(0, 16).forEach((o) => row.appendChild(storeTile(o)));
  } else {
    const items = shelfItems(state.shelf);
    if (!items.length) row.innerHTML = `<div class="row-empty">${SHELF_EMPTY[state.shelf] || 'Nothing here yet.'}</div>`;
    items.forEach((g) => row.appendChild(gameTile(g)));
  }

  /* most played */
  const most = ordered('most').filter((g) => total(g) > 0).slice(0, 5);
  const max = most.length ? total(most[0]) : 1;
  $('#hmRank').innerHTML = most.length ? most.map((g, i) => `<li><button data-id="${g.id}"><span class="no">${i + 1}</span>
      <span class="ic">${g.art.icon ? `<img src="${esc(g.art.icon)}" alt="">` : ''}</span>
      <span class="nm"><b>${esc(g.name)}</b><span class="bar"><i style="width:${Math.max(3, (total(g) / max) * 100)}%"></i></span></span>
      <span class="tm">${fmt(total(g))}</span></button></li>`).join('') : '<li class="none">Play a game for at least 30 seconds and it shows up here.</li>';
  $('#hmRank').querySelectorAll('button').forEach((el) => { el.onclick = () => select(el.dataset.id); });

  /* this week */
  const days = [...Array(7)].map((_, i) => gs.reduce((t, g) => t + within(g, a + i * DAY, a + (i + 1) * DAY), 0));
  const dmax = Math.max(...days, 1), today = Math.floor((now() - a) / DAY);
  $('#hmWeek').innerHTML = days.map((ms, i) => `<div class="${i === today ? 'today ' : ''}${ms > 0 ? 'has' : ''}"><em>${ms >= 6e4 ? fmt(ms) : ''}</em><i style="height:${Math.max(3, Math.round((ms / dmax) * 100))}%"></i>${['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}</div>`).join('');
  let sess = 0, sessMs = 0;
  for (const g of gs) {
    for (const x of g.sessions) if (x.e > a) { sess++; sessMs += x.e - Math.max(x.s, a); }
    if (g.open) { sess++; sessMs += now() - Math.max(g.open.s, a); }
  }
  $('#hmWeekTotal').textContent = fmt(week) + ' total';
  $('#hmWSess').textContent = sess; $('#hmWGames').textContent = gamesWeek.length;
  $('#hmWAvg').textContent = sess ? fmt(sessMs / sess) : '0m'; $('#hmWShots').textContent = state.shots;
};
$('#hmReview').onclick = () => go('review');

/* live timers without rebuilding */
renderers.tick = () => {
  for (const g of lib.games) if (g.open) document.querySelectorAll(`[data-live="${g.id}"]`).forEach((el) => { el.textContent = (el.classList.contains('live') ? '● ' : '') + metaLine(g); });
  if (renderers.gameTick) renderers.gameTick();
};
