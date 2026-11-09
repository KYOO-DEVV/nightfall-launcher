/* global nf, lib, state, $, esc, css, ordered, total, lastPlayed, within, weekStart, fmt, ago, clock, fallbackBg, coverOf, heroOf, launch, select, addDialog, toast, render, DAY, now */
// Home page + Connect All. Loaded after renderer.js and shares its top-level helpers.

const bgu = (u) => `url('${String(u).replace(/'/g, '%27')}')`; // single-quoted: safe inside style="…" attributes
const ICON_PLAY = '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>';
const SOURCE_LABEL = { steam: 'Steam', epic: 'Epic Games', gog: 'GOG', ubisoft: 'Ubisoft Connect', riot: 'Riot Games', hoyo: 'HoYoPlay', other: 'Other launchers', manual: 'Added by you' };

/* ---------- view switching ---------- */
function applyView() {
  const v = state.view, home = v === "home", game = v === "game";
  $("#home").hidden = !home;
  $("#libSection").hidden = !game;
  $("#allView").hidden = v !== "all";
  $("#reviewView").hidden = v !== "review";
  const empty = lib.games.length === 0;
  $("#hero").hidden = !game || empty; $("#empty").hidden = !game || !empty;
  $("#detail").hidden = !game || empty;
  $("#homeBtn").classList.toggle("on", home);
  $("#allBtn").classList.toggle("on", v === "all");
  if (game) requestAnimationFrame(movePill);
}
function goHome() {
  state.view = 'home'; applyView(); renderRail(); renderHome();
  $('#main').scrollTo({ top: 0 });
}
$('#homeBtn').onclick = goHome;
$('#hmSeeAll').onclick = () => { const g = ordered('recent')[0]; if (g) select(g.id); };
$('#hmAdd').onclick = addDialog;

/* ---------- pieces ---------- */
const played = () => ordered('recent').filter((g) => lastPlayed(g) > 0);
const wideOf = (g) => g.art.header || g.art.hero || g.art.cover;
const thumbOf = (g) => g.art.cover || g.art.hero || g.art.header; // tall slots prefer the poster
function logoHtml(g, cls = 't') {
  if (g.art.logo) return `<img src="${esc(g.art.logo)}" alt="${esc(g.name)}" class="${g.logoMono ? 'logo-mono' : ''}">`;
  // no logo: the game's own icon above its name, so the placeholder still looks like the game
  return `<span class="ph-stack">${g.art.icon ? `<img class="ph-icon" src="${esc(g.art.icon)}" alt="">` : ''}<span class="${cls}">${esc(g.name)}</span></span>`;
}
const iconOnly = (g) => (g.art.icon ? `<img class="ph-icon only" src="${esc(g.art.icon)}" alt="">` : '');
function metaLine(g) {
  if (g.open) return `Playing now · ${clock(now() - g.open.s)}`;
  const lp = lastPlayed(g);
  return lp ? `${fmt(total(g))} played · ${ago(lp)}` : `Added ${ago(g.addedAt) || 'today'} · not played yet`;
}
function tile(g) {
  const b = document.createElement('div');
  b.className = 'tile-g'; b.tabIndex = 0; b.setAttribute('role', 'button');
  const im = wideOf(g);
  b.innerHTML = `<div class="im" style="background:${im ? bgu(im) + ' center/cover' : fallbackBg(g)}">
      ${im ? '' : `<div class="lg">${logoHtml(g)}</div>`}
      ${g.open ? '<span class="badge">Playing</span>' : ''}
      <button class="play" aria-label="Play ${esc(g.name)}">${ICON_PLAY}</button></div>
    <div class="n">${g.art.icon ? `<img src="${esc(g.art.icon)}" alt="">` : ''}${esc(g.name)}</div>
    <div class="p" data-live="${g.id}">${esc(metaLine(g))}</div>`;
  b.onclick = (e) => { if (e.target.closest('.play')) return launch(g); select(g.id); };
  b.onkeydown = (e) => { if (e.key === 'Enter') select(g.id); };
  return b;
}
function fillRow(el, games, emptyText) {
  el.innerHTML = '';
  if (!games.length) { el.innerHTML = `<div class="row-empty">${esc(emptyText)}</div>`; return; }
  games.forEach((g) => el.appendChild(tile(g)));
}

/* ---------- render ---------- */
let homeKey = '';
function renderHome() {
  if (state.view !== 'home') return;
  const d = new Date(), h = d.getHours();
  $('#hmDate').textContent = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  $('#hmGreet').textContent = h < 5 ? 'Late night session' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';

  const gs = lib.games, empty = !gs.length;
  $('#hmCta').hidden = !empty; $('#hmBody').hidden = empty;
  $('#hmConnect').hidden = empty; $('#hmAdd').hidden = empty;

  const a = weekStart(), b = a + 7 * DAY;
  const week = gs.reduce((t, g) => t + within(g, a, b), 0);
  const gamesWeek = gs.filter((g) => within(g, a, b) > 0);
  const running = gs.filter((g) => g.open);
  $('#hmSub').innerHTML = empty
    ? 'Nothing connected yet.'
    : running.length
      ? `Playing <b>${esc(running.map((g) => g.name).join(', '))}</b> right now. <b>${fmt(week)}</b> played this week.`
      : `<b>${gs.length}</b> ${gs.length === 1 ? 'game' : 'games'} connected · <b>${fmt(week)}</b> played this week across <b>${gamesWeek.length}</b> ${gamesWeek.length === 1 ? 'game' : 'games'}.`;
  if (empty) return;

  // skip rebuilding the DOM when nothing visible changed (the live timer patches text in place)
  const key = gs.map((g) => [g.id, g.name, g.status, wideOf(g), thumbOf(g), g.art.logo, g.art.icon, String(g.tint), !!g.open, g.sessions.length, Math.floor(total(g) / 6e4)].join(',')).join(';') + '|' + state.shots;
  if (key === homeKey) return; homeKey = key;

  // jump back in
  const recent = played();
  const pool = recent.length ? recent : ordered('added');
  const top = pool[0], rest = pool.slice(1, 4);
  const jump = $('#hmJump');
  jump.className = 'jump' + (rest.length ? '' : ' solo');
  const bg = heroOf(top);
  jump.innerHTML = `<div class="banner" id="hmBanner" style="background:${bg ? bgu(bg) + ' center/cover' : fallbackBg(top)}">
      <div class="b-logo">${logoHtml(top)}</div>
      <div class="b-meta">${top.open ? `<span class="live" data-live="${top.id}">● ${esc(metaLine(top))}</span>` : `<span>${lastPlayed(top) ? 'Last played ' + ago(lastPlayed(top)) : 'Ready to play'}</span><span>${fmt(total(top))} total</span><span>${top.sessions.length} sessions</span>`}</div>
      <div class="actions"><button class="btn btn-solid ${top.open ? 'running' : ''}" id="hmPlay"><span>${top.open ? 'Running' : recent.length ? 'Continue' : 'Play'}</span><span class="ic">${ICON_PLAY}</span></button></div>
    </div>
    ${rest.length ? `<div class="side-list">${rest.map((g) => `
      <div class="side-item" data-id="${g.id}" tabindex="0" role="button">
        <i class="th" style="background:${thumbOf(g) ? bgu(thumbOf(g)) + ' center/cover' : fallbackBg(g)}">${thumbOf(g) ? '' : iconOnly(g)}</i>
        <div class="tx"><div class="n">${g.art.icon ? `<img src="${esc(g.art.icon)}" alt="">` : ''}${esc(g.name)}</div><div class="p" data-live="${g.id}">${esc(metaLine(g))}</div></div>
        <button class="go" aria-label="Play ${esc(g.name)}">${ICON_PLAY}</button>
      </div>`).join('')}</div>` : ''}`;
  $('#hmBanner').onclick = (e) => { if (e.target.closest('#hmPlay')) return launch(top); select(top.id); };
  jump.querySelectorAll('.side-item').forEach((el) => {
    const g = gs.find((x) => x.id === el.dataset.id);
    el.onclick = (e) => { if (e.target.closest('.go')) return launch(g); select(g.id); };
  });

  fillRow($('#hmRecent'), recent.slice(0, 12), 'Games you play show up here. Nightfall notices them even when you start them from Steam or a desktop shortcut.');
  fillRow($('#hmAdded'), ordered('added').slice(0, 12), 'No games yet.');

  // most played
  const most = ordered('most').filter((g) => total(g) > 0).slice(0, 6);
  const max = most.length ? total(most[0]) : 1;
  $('#hmRank').innerHTML = most.length ? most.map((g, i) => `<li><button data-id="${g.id}">
      <span class="no">${i + 1}</span>
      <span class="ic">${g.art.icon ? `<img src="${esc(g.art.icon)}" alt="">` : ''}</span>
      <span class="nm"><b>${esc(g.name)}</b><span class="bar"><i style="width:${Math.max(3, (total(g) / max) * 100)}%"></i></span></span>
      <span class="tm">${fmt(total(g))}</span></button></li>`).join('')
    : '<li class="none">Play a game for at least 30 seconds and it shows up here.</li>';
  $('#hmRank').querySelectorAll('button').forEach((el) => { el.onclick = () => select(el.dataset.id); });

  // this week
  const days = [...Array(7)].map((_, i) => gs.reduce((t, g) => t + within(g, a + i * DAY, a + (i + 1) * DAY), 0));
  const dmax = Math.max(...days, 1), today = Math.floor((now() - a) / DAY);
  $('#hmWeek').innerHTML = days.map((ms, i) => `<div class="${i === today ? 'today ' : ''}${ms > 0 ? 'has' : ''}"><em>${ms >= 6e4 ? fmt(ms) : ''}</em><i style="height:${Math.max(3, Math.round((ms / dmax) * 78))}px;animation-delay:${i * 50}ms"></i>${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}</div>`).join('');
  let sess = 0, sessMs = 0;
  for (const g of gs) {
    for (const x of g.sessions) if (x.e > a) { sess++; sessMs += x.e - Math.max(x.s, a); }
    if (g.open) { sess++; sessMs += now() - Math.max(g.open.s, a); }
  }
  $('#hmWeekTotal').textContent = fmt(week) + ' total';
  $('#hmWSess').textContent = sess;
  $('#hmWGames').textContent = gamesWeek.length;
  $('#hmWAvg').textContent = sess ? fmt(sessMs / sess) : '0m';
  $('#hmWShots').textContent = state.shots;
}
// live timers on the home page without rebuilding it
setInterval(() => {
  if (state.view !== 'home') return;
  for (const g of lib.games) if (g.open) document.querySelectorAll(`[data-live="${g.id}"]`).forEach((el) => { el.textContent = (el.classList.contains('live') ? '● ' : '') + metaLine(g); });
}, 1000);

/* ---------- Connect All ---------- */
let scanResults = [];
const scanBody = $('#scanBody');
function closeScan() { $('#scan').hidden = true; }
$('#scanClose').onclick = closeScan;
$('#scan').addEventListener('mousedown', (e) => { if (e.target.id === 'scan') closeScan(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#scan').hidden) closeScan(); });

async function connectAll() {
  $('#scan').hidden = false; $('#scanFoot').hidden = true;
  scanBody.innerHTML = `<div class="scan-state"><div class="spinner"></div><b>Looking for games on this PC</b>
    <p>Checking Steam, Epic Games, GOG, Ubisoft Connect, Riot Games, HoYoPlay and the games registered with Windows (Battle.net, EA, Rockstar, Roblox…).</p></div>`;
  const t0 = Date.now();
  try { scanResults = await nf.scan(); } catch { scanResults = null; }
  await new Promise((r) => setTimeout(r, Math.max(0, 700 - (Date.now() - t0)))); // let the spinner register
  if (!scanResults) {
    scanBody.innerHTML = '<div class="scan-state"><b>The scan stopped early</b><p>Something went wrong while reading the launchers. Try again, or add games one at a time with Add a game.</p></div>';
    $('#scanFoot').hidden = false; return;
  }
  renderScan();
}
function renderScan() {
  const fresh = scanResults.filter((r) => !r.connected);
  $('#scanFoot').hidden = false;
  if (!scanResults.length) {
    scanBody.innerHTML = '<div class="scan-state"><b>No installed games found</b><p>Nightfall didn\'t find games in the launchers it knows. You can still add any game by choosing its .exe with Add a game.</p></div>';
    $('#scanGo').hidden = true; $('#scanToggle').hidden = true; return;
  }
  $('#scanGo').hidden = false; $('#scanToggle').hidden = !fresh.length;
  const groups = {};
  for (const r of scanResults) (groups[r.source] = groups[r.source] || []).push(r);
  const order = ['steam', 'epic', 'gog', 'ubisoft', 'riot', 'hoyo', 'other'];
  scanBody.innerHTML = `<p class="scan-sum">Found <b>${scanResults.length}</b> ${scanResults.length === 1 ? 'game' : 'games'}${fresh.length < scanResults.length ? `, ${scanResults.length - fresh.length} already connected` : ''}. Untick anything you don't want.</p>` +
    order.filter((k) => groups[k]).map((k) => `<div class="scan-group"><h4>${SOURCE_LABEL[k]}</h4>${groups[k].map((r) => `
      <label class="scan-item ${r.connected ? 'done' : ''}">
        <input type="checkbox" data-i="${r.i}" ${r.connected ? 'disabled' : 'checked'}>
        <span class="tx"><b>${esc(r.name)}</b><small>${esc(r.exe)}</small></span>
        ${r.connected ? '<span class="tag">Connected</span>' : ''}
      </label>`).join('')}</div>`).join('');
  scanBody.querySelectorAll('input').forEach((i) => { i.onchange = updateScanButton; });
  updateScanButton();
}
function checked() { return [...scanBody.querySelectorAll('input:checked:not(:disabled)')].map((i) => +i.dataset.i); }
function updateScanButton() {
  const n = checked().length, all = scanBody.querySelectorAll('input:not(:disabled)').length;
  $('#scanGo').disabled = !n; $('#scanGo').style.opacity = n ? 1 : 0.4;
  $('#scanGo').firstElementChild.textContent = n ? `Connect ${n} ${n === 1 ? 'game' : 'games'}` : 'Nothing selected';
  $('#scanToggle').firstElementChild.textContent = n === all ? 'Select none' : 'Select all';
}
$('#scanToggle').onclick = () => {
  const boxes = [...scanBody.querySelectorAll('input:not(:disabled)')];
  const on = boxes.some((b) => !b.checked);
  boxes.forEach((b) => { b.checked = on; }); updateScanButton();
};
$('#scanAgain').onclick = connectAll;
$('#scanGo').onclick = async () => {
  const sel = checked(); if (!sel.length) return;
  const ids = await nf.connect(sel);
  closeScan();
  toast(ids.length ? `Connected ${ids.length} ${ids.length === 1 ? 'game' : 'games'} · fetching official artwork` : 'Those games are already connected');
  goHome();
};
$('#hmConnect').onclick = connectAll;
$('#hmCtaBtn').onclick = connectAll;
setInterval(() => renderHome(), 15000);
