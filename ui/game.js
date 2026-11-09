/* global IMG_OK, drawer, nf, lib, state, $, esc, bgu, artBg, fmt, ago, clock, total, lastPlayed, hours, heroOf, coverOf, fallbackBg, ICON, launch, toast, renderers, DAY, now, openModal, featured, paintBookmark */
// Game page: hero on top, play history / sessions or matches / experiences / news underneath — one screen.

let shownHero = '';
const heroExtra = {};
const heroKey = (g) => [g.id, heroOf(g), g.art.logo, g.art.icon, g.name, g.desc, g.logoMono].join('|');
function renderHeroLive(g) {
  const lp = lastPlayed(g);
  const chip = $('#chipTxt');
  if (g.open) chip.innerHTML = `<i class="dot"></i> ${g.live ? esc(g.live.name) + ' · ' : 'Playing now · '}${clock(now() - (g.live ? g.live.since : g.open.s))}`;
  else if (g.status === 'searching') chip.textContent = 'Finding official artwork…';
  else if (g.status === 'offline') chip.textContent = 'Offline · artwork loads when you reconnect';
  else if (g.status === 'noart' && !coverOf(g)) chip.textContent = 'No artwork found · pick it in Game settings';
  else chip.textContent = lp ? 'Last played ' + ago(lp) : 'Added ' + (ago(g.addedAt) || 'today') + ' · not played yet';
  const ex = heroExtra[g.id]; // Roblox / Minecraft / Fortnite / Valorant logs know more history than Nightfall's own sessions
  $('#hTotal').textContent = fmt(Math.max(total(g), ex ? ex.sum : 0));
  $('#hSessions').textContent = Math.max(g.sessions.length + (g.open ? 1 : 0), ex ? ex.count : 0);
  $('#hSessions').parentElement.nextElementSibling.textContent = ex && ex.matches ? 'Matches' : 'Sessions';
  $('#hSteamBox').hidden = !g.steamMin; $('#hSteam').textContent = hours(g.steamMin || 0);
  $('#playBtn').classList.toggle('running', !!g.open);
  $('#playTxt').textContent = g.open ? 'Running' : 'Play';
  const fav = $('#favBtn');
  if (fav.dataset.g !== g.id || fav.classList.contains('on') !== !!g.fav) { paintBookmark(fav, g.fav, false); fav.dataset.g = g.id; }
  fav.setAttribute('aria-label', g.fav ? 'Remove bookmark' : 'Bookmark');
  const pin = $('#pinBtn');
  pin.innerHTML = ICON.pin; pin.classList.toggle('on', !!g.pinned);
  pin.setAttribute('aria-label', g.pinned ? 'Unpin from sidebar' : 'Pin to sidebar'); pin.title = pin.getAttribute('aria-label');
}
/* hero: the new art fades in over the old one (after it has loaded); title and text slide out, then back in */
function renderHero(g) {
  const key = heroKey(g);
  if (key === shownHero) return;
  const switching = !!shownHero && shownHero.split('|')[0] !== g.id;
  shownHero = key;
  const box = $('#heroArt'), logo = $('#logo');
  const copy = document.querySelector('#hero .hero-copy'), stats = document.querySelector('#hero .hero-stats');
  const h = heroOf(g);
  const text = () => {
    logo.innerHTML = g.art.logo ? `<img src="${esc(g.art.logo)}" alt="${esc(g.name)}" class="${g.logoMono ? 'logo-mono' : ''}">` : `<span class="t">${esc(g.name)}</span>`;
    const d = $('#desc');
    if (g.desc) { d.textContent = g.desc; d.classList.remove('path'); } else { d.textContent = g.exe; d.classList.add('path'); }
    if (g.art.icon) $('#chipIcon').src = g.art.icon; else $('#chipIcon').removeAttribute('src');
  };
  const layer = document.createElement('div');
  layer.className = 'hero-layer';
  layer.style.background = h ? `${bgu(h)} center/cover no-repeat` : fallbackBg(g);
  const show = () => {
    if (shownHero !== key) return;
    box.appendChild(layer);
    requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('on')));
    setTimeout(() => { [...box.children].forEach((c) => { if (c !== layer && shownHero === key) c.remove(); }); }, 900);
  };
  if (h && !IMG_OK.has(h)) { const i = new Image(); let done = false; const go2 = () => { if (!done) { done = true; IMG_OK.add(h); show(); } }; i.onload = go2; i.onerror = go2; setTimeout(go2, 1800); i.src = h; } else show();
  if (!switching) { text(); return; }
  copy.classList.add('out'); stats.classList.add('out');
  // the new title comes in only once its logo image is ready, so it never pops in after the text
  const logoReady = new Promise((res) => {
    if (!g.art.logo || IMG_OK.has(g.art.logo)) return res();
    const i = new Image(); i.onload = i.onerror = () => { IMG_OK.add(g.art.logo); res(); }; i.src = g.art.logo; setTimeout(res, 1500);
  });
  Promise.all([logoReady, new Promise((r) => setTimeout(r, 240))]).then(() => {
    if (shownHero !== key) return;
    text();
    requestAnimationFrame(() => { copy.classList.remove('out'); stats.classList.remove('out'); });
  });
}

/* ---------- news (shared with the store page) ---------- */
const TAG = { banner: 'Banner', character: 'New character', update: 'Update', event: 'Event', notice: 'Notice', news: 'News' };
const newsCache = {};
async function loadNews(q, key) {
  const c = newsCache[key];
  if (c && now() - c.t < 10 * 60000) return c.f;
  const f = await nf.news(q).catch(() => null);
  newsCache[key] = { t: now(), f };
  return f;
}
const shortDate = (t) => (t ? new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');
function renderNewsInto(el, f, rich) {
  const items = (f && f.items) || [];
  const b = f && f.banner && f.banner.image ? f.banner : null;
  el.innerHTML = (b ? `<button class="news-banner" ${b.url ? `data-url="${esc(b.url)}"` : ''} style="background-image:${bgu(b.image)}"><span>${esc(b.title)}</span></button>` : '')
    + (f && f.next ? `<div class="news-next">${ICON.clock}<span>${esc(f.next)}</span></div>` : '')
    + (rich ? `<ol class="news-cards">${items.slice(0, 24).map((n, i) => `<li style="--i:${Math.min(i, 10)}"><button ${n.url ? `data-url="${esc(n.url)}"` : ''}>
        ${n.image ? `<span class="nc-img" style="background-image:${bgu(n.image)}"></span>` : ''}
        <span class="nc-tx"><span class="nc-meta"><span class="ntag ${n.tag}">${TAG[n.tag] || 'News'}</span>${n.date ? `<small>${shortDate(n.date)}</small>` : ''}</span>
        <b>${esc(n.title)}</b>${n.body ? `<p>${esc(n.body.slice(0, 160))}</p>` : ''}</span></button></li>`).join('')}</ol>`
      : `<ol class="news-list">${items.slice(0, 14).map((n) => `<li><button ${n.url ? `data-url="${esc(n.url)}"` : ''} title="${esc(n.body || n.title)}">
        <span class="ntag ${n.tag}">${TAG[n.tag] || 'News'}</span><b>${esc(n.title)}</b><small>${shortDate(n.date)}</small></button></li>`).join('')}</ol>`);
  el.querySelectorAll('[data-url]').forEach((x) => { x.onclick = async () => { const err = await nf.openLink(x.dataset.url); if (err) toast(err); }; });
  el.querySelectorAll('button:not([data-url])').forEach((x) => { x.classList.add('static'); });
}

/* ---------- detail ---------- */
const detailCache = {};
async function loadDetail(g, force) {
  const c = detailCache[g.id];
  if (!force && c && now() - c.t < 30000) return c.d;
  const d = g.detail ? await nf.details(g.id).catch(() => null) : null;
  detailCache[g.id] = { t: now(), d };
  return d;
}
const dayLabel = (t) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const hm = (t) => new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
let detailFor = null, dTab = 'sessions';
$('#dTabs').querySelectorAll('button').forEach((b) => { b.onclick = () => { dTab = b.dataset.t; const g = featured(); if (g) renderDetail(g); }; });
function layoutDetail() {
  const n = [...$('#detail').children].filter((x) => !x.hidden).length;
  $('#detail').dataset.n = n;
}
async function renderDetail(g, force) {
  detailFor = g.id;
  const d = await loadDetail(g, force);
  if (detailFor !== g.id || state.view !== 'game') return;
  const items = d ? Object.fromEntries(d.items.map((i) => [i.key, i])) : {};
  const tracked = g.sessions.map((x) => ({ s: x.s, e: x.e })).concat(g.open ? [{ s: g.open.s, e: now() }] : []);
  const plays = d && d.plays.length ? d.plays : tracked;
  const from = d && d.plays.length ? d.source : 'Nightfall';
  const matches = (d && d.matches) || [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = today.getTime() - 29 * DAY;
  const days = [...Array(30)].map((_, i) => plays.reduce((t, p) => t + Math.max(0, Math.min(p.e, start + (i + 1) * DAY) - Math.max(p.s, start + i * DAY)), 0));
  const max = Math.max(...days, 1);
  $('#dHistSub').textContent = `Last 30 days · ${from}`;
  $('#dChart').innerHTML = days.map((ms, i) => `<div title="${dayLabel(start + i * DAY)} · ${fmt(ms)}" class="${ms ? 'has' : ''} ${i === 29 ? 'today' : ''}"><i style="height:${Math.max(3, Math.round(ms / max * 100))}%"></i></div>`).join('');
  const sum = plays.reduce((t, p) => t + p.e - p.s, 0);
  const longest = plays.reduce((m, p) => (p.e - p.s > m.e - m.s ? p : m), { s: 0, e: 0 });
  heroExtra[g.id] = { sum, count: plays.length, matches: matches.length > 0 }; renderHeroLive(g);
  const fact = (v, k) => `<div><b>${esc(v)}</b><span>${esc(k)}</span></div>`;
  $('#dFacts').innerHTML = d && d.stats && d.stats.length
    ? fact(fmt(Math.max(sum, total(g))), 'Total') + d.stats.slice(0, 3).map(([k, v]) => fact(v, k)).join('')
    : fact(fmt(Math.max(sum, total(g))), 'Total') + fact(plays.length, 'Sessions') + fact(plays.length ? fmt(sum / plays.length) : '0m', 'Average') + fact(longest.e ? fmt(longest.e - longest.s) : '—', 'Longest');

  // sessions / matches tabs
  const mBtn = $('#dTabs [data-t="matches"]');
  mBtn.hidden = !matches.length;
  if (!matches.length && dTab === 'matches') dTab = 'sessions';
  if (matches.length && !renderDetail.auto) { dTab = 'matches'; } renderDetail.auto = matches.length > 0;
  $('#dTabs').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === dTab));
  $('#dSessions').hidden = dTab !== 'sessions'; $('#dMatches').hidden = dTab !== 'matches';
  $('#dTabSub').textContent = dTab === 'matches' ? `${matches.length} · ${d.source}` : '';
  const recent = [...plays].sort((a, b) => b.s - a.s).slice(0, 30);
  $('#dSessions').innerHTML = recent.length ? recent.map((p) => {
    const it = p.key && items[p.key];
    return `<li><span class="d-date">${dayLabel(p.s)}</span><span class="d-time">${hm(p.s)} – ${hm(p.e)}</span>
      <span class="d-what">${it ? `${it.icon ? `<img src="${esc(it.icon)}" alt="">` : ''}${esc(it.name)}` : ''}</span><b>${fmt(p.e - p.s)}</b></li>`;
  }).join('') : '<li class="none">No sessions yet. Play it and they show up here.</li>';
  $('#dMatches').innerHTML = matches.map((m) => `<li class="${m.win === true ? 'win' : ''} ${m.live ? 'live' : ''}">
      <span class="m-ic" style="${m.icon ? `background-image:${bgu(m.icon)}` : m.thumb ? `background-image:${bgu(m.thumb)}` : ''}">${m.icon || m.thumb ? '' : ICON.trophy}</span>
      <span class="m-tx"><b>${esc(m.title)}</b><small>${esc(m.sub || '')}${m.sub ? ' · ' : ''}${m.live ? 'playing now' : dayLabel(m.s) + ' ' + hm(m.s)}</small></span>
      <span class="m-res">${m.live ? '<i class="dot"></i>Live' : esc(m.result || '')}</span><b>${fmt((m.live ? now() : m.e) - m.s)}</b></li>`).join('');

  // experiences / instances / modes / maps
  const hasSub = !!(d && d.items.length);
  $('#dSubPanel').hidden = !hasSub;
  if (hasSub) {
    $('#dSubTitle').textContent = d.kind === 'roblox' ? 'Experiences you played' : d.title;
    $('#dSubSrc').textContent = `${d.items.length} · ${d.source}`;
    $('#dLive').hidden = !d.live;
    if (d.live) $('#dLive').innerHTML = `${d.live.icon ? `<img src="${esc(d.live.icon)}" alt="">` : ''}<div><small>Playing now</small><b>${esc(d.live.name)}</b></div><span data-since="${d.live.since}">${clock(now() - d.live.since)}</span>`;
    const top = Math.max(...d.items.map((i) => i.ms), 1);
    $('#dItems').innerHTML = [...d.items].sort((a, b) => b.ms - a.ms).map((i) => `<li>
      <span class="d-ic" style="${i.icon ? `background:${bgu(i.icon)} center/cover` : ''}">${i.icon ? '' : esc((i.name[0] || '?').toUpperCase())}</span>
      <span class="d-nm"><b>${esc(i.name)}</b><small>${esc(i.sub || '')}${i.sub ? ' · ' : ''}${i.sessions} ${d.matches && d.matches.length ? (i.sessions === 1 ? 'match' : 'matches') : (i.sessions === 1 ? 'session' : 'sessions')} · ${ago(i.last)}</small><span class="bar"><i style="width:${Math.max(3, i.ms / top * 100)}%"></i></span></span>
      <span class="d-tm">${fmt(i.ms)}</span>
      ${i.url ? `<button class="d-open" data-url="${esc(i.url)}" aria-label="Open ${esc(i.name)} on Roblox">${ICON.ext}</button>` : '<span></span>'}</li>`).join('');
    $('#dItems').querySelectorAll('[data-url]').forEach((b) => { b.onclick = () => nf.openLink(b.dataset.url); });
  }
  layoutDetail();
  $('#detail').classList.remove('swap');
  // news lives in a side drawer, opened from the hero (HoYoverse, Fortnite, Riot, Steam)
  const f = await loadNews({ id: g.id }, 'g:' + g.id);
  if (detailFor !== g.id || state.view !== 'game') return;
  setNewsButton($('#gNewsBtn'), $('#gNewsBadge'), f, g.name);
}
/* News button + drawer, shared with the store page */
function setNewsButton(btn, badge, f, title) {
  const has = !!(f && ((f.items && f.items.length) || f.banner));
  btn.hidden = !has;
  if (!has) return;
  const fresh = (f.items || []).filter((n) => n.date && now() - n.date < 7 * DAY).length;
  badge.hidden = !fresh; badge.textContent = fresh;
  btn.onclick = () => openNewsDrawer(f, title);
}
function openNewsDrawer(f, title) {
  $('#ndTitle').textContent = title + ' news';
  $('#ndSrc').textContent = f.source ? 'From ' + f.source : '';
  renderNewsInto($('#ndBody'), f, true);
  drawer('#newsDrawer', true);
}
$('#ndClose').onclick = () => drawer('#newsDrawer', false);

renderers.game = (force) => {
  const g = featured();
  if (!g) return;
  if (force) {
    renderDetail.auto = false;
    if (g.id !== renderers.game.last) { $('#gNewsBtn').hidden = true; if (renderers.game.last) $('#detail').classList.add('swap'); }
    renderers.game.last = g.id;
  }
  const switching = shownHero && shownHero.split('|')[0] !== g.id;
  renderHero(g);
  // during a switch the numbers change while the hero text is faded out
  if (switching) setTimeout(() => { if (featured() === g) renderHeroLive(g); }, 230); else renderHeroLive(g);
  renderDetail(g, force);
};
renderers.gameTick = () => {
  if (state.view !== 'game') return;
  const g = featured(); if (g) renderHeroLive(g);
  const s = document.querySelector('#dLive [data-since]'); if (s) s.textContent = clock(now() - +s.dataset.since);
};
$('#playBtn').onclick = () => launch(featured());
$('#setBtn').onclick = () => openModal(featured().id);
$('#favBtn').onclick = async () => {
  const g = featured(); const on = !g.fav;
  paintBookmark($('#favBtn'), on, true);
  await nf.update(g.id, { fav: on });
  toast(on ? `${g.name} bookmarked` : 'Bookmark removed');
};
$('#pinBtn').onclick = async () => { const g = featured(); await nf.update(g.id, { pinned: !g.pinned }); toast(g.pinned ? 'Unpinned from the sidebar' : `${g.name} pinned to the sidebar`); };
$('#shareGameBtn').onclick = () => renderers.shareGame && renderers.shareGame(featured(), detailCache[featured().id] && detailCache[featured().id].d);
