/* global nf, lib, state, $, esc, bgu, artBg, fmt, ago, clock, total, lastPlayed, hours, heroOf, coverOf, fallbackBg, ICON, launch, toast, renderers, DAY, now, openModal, featured */
// Game page: hero on top, play history / sessions / experiences underneath — one screen.

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
  const ex = heroExtra[g.id]; // Roblox / Minecraft logs know more history than Nightfall's own sessions
  $('#hTotal').textContent = fmt(Math.max(total(g), ex ? ex.sum : 0));
  $('#hSessions').textContent = Math.max(g.sessions.length + (g.open ? 1 : 0), ex ? ex.count : 0);
  $('#hSteamBox').hidden = !g.steamMin; $('#hSteam').textContent = hours(g.steamMin || 0);
  $('#playBtn').classList.toggle('running', !!g.open);
  $('#playTxt').textContent = g.open ? 'Running' : 'Play';
  const fav = $('#favBtn');
  fav.innerHTML = g.fav ? ICON.starOn : ICON.star; fav.classList.toggle('on', g.fav);
  fav.setAttribute('aria-label', g.fav ? 'Remove from favorites' : 'Add to favorites');
}
function renderHero(g) {
  const art = $('#heroArt'), logo = $('#logo');
  const apply = () => {
    const h = heroOf(g);
    art.style.background = h ? `${bgu(h)} center/cover no-repeat` : fallbackBg(g);
    logo.innerHTML = g.art.logo ? `<img src="${esc(g.art.logo)}" alt="${esc(g.name)}" class="${g.logoMono ? 'logo-mono' : ''}">` : `<span class="t">${esc(g.name)}</span>`;
    const d = $('#desc');
    if (g.desc) { d.textContent = g.desc; d.classList.remove('path'); } else { d.textContent = g.exe; d.classList.add('path'); }
    if (g.art.icon) $('#chipIcon').src = g.art.icon; else $('#chipIcon').removeAttribute('src');
    art.classList.remove('fade'); logo.classList.remove('swap');
    shownHero = heroKey(g);
  };
  if (heroKey(g) === shownHero) return;
  if (!shownHero || shownHero.split('|')[0] === g.id) return apply();
  art.classList.add('fade'); logo.classList.add('swap'); setTimeout(apply, 220);
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
let detailFor = null;
async function renderDetail(g, force) {
  detailFor = g.id;
  const d = await loadDetail(g, force);
  if (detailFor !== g.id || state.view !== 'game') return;
  const items = d ? Object.fromEntries(d.items.map((i) => [i.key, i])) : {};
  const tracked = g.sessions.map((x) => ({ s: x.s, e: x.e })).concat(g.open ? [{ s: g.open.s, e: now() }] : []);
  const plays = d && d.plays.length ? d.plays : tracked;
  const from = d && d.plays.length ? d.source : 'Nightfall';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = today.getTime() - 29 * DAY;
  const days = [...Array(30)].map((_, i) => plays.reduce((t, p) => t + Math.max(0, Math.min(p.e, start + (i + 1) * DAY) - Math.max(p.s, start + i * DAY)), 0));
  const max = Math.max(...days, 1);
  $('#dHistSub').textContent = `Last 30 days · ${from}`;
  $('#dChart').innerHTML = days.map((ms, i) => `<div title="${dayLabel(start + i * DAY)} · ${fmt(ms)}" class="${ms ? 'has' : ''} ${i === 29 ? 'today' : ''}"><i style="height:${Math.max(3, Math.round(ms / max * 100))}%"></i></div>`).join('');
  const sum = plays.reduce((t, p) => t + p.e - p.s, 0);
  const longest = plays.reduce((m, p) => (p.e - p.s > m.e - m.s ? p : m), { s: 0, e: 0 });
  heroExtra[g.id] = { sum, count: plays.length }; renderHeroLive(g);
  const fact = (v, k) => `<div><b>${v}</b><span>${k}</span></div>`;
  $('#dFacts').innerHTML = fact(fmt(Math.max(sum, total(g))), 'Total') + fact(plays.length, 'Sessions')
    + fact(plays.length ? fmt(sum / plays.length) : '0m', 'Average') + fact(longest.e ? fmt(longest.e - longest.s) : '—', 'Longest');
  const recent = [...plays].sort((a, b) => b.s - a.s).slice(0, 30);
  $('#dSessions').innerHTML = recent.length ? recent.map((p) => {
    const it = p.key && items[p.key];
    return `<li><span class="d-date">${dayLabel(p.s)}</span><span class="d-time">${hm(p.s)} – ${hm(p.e)}</span>
      <span class="d-what">${it ? `${it.icon ? `<img src="${esc(it.icon)}" alt="">` : ''}${esc(it.name)}` : ''}</span><b>${fmt(p.e - p.s)}</b></li>`;
  }).join('') : '<li class="none">No sessions yet. Play it and they show up here.</li>';
  const hasSub = !!(d && d.items.length);
  $('#dSubPanel').hidden = !hasSub;
  $('#detail').classList.toggle('two', !hasSub);
  if (hasSub) {
    $('#dSubTitle').textContent = d.kind === 'roblox' ? 'Experiences you played' : 'Your instances';
    $('#dSubSrc').textContent = `${d.items.length} · ${d.source}`;
    $('#dLive').hidden = !d.live;
    if (d.live) $('#dLive').innerHTML = `${d.live.icon ? `<img src="${esc(d.live.icon)}" alt="">` : ''}<div><small>Playing now</small><b>${esc(d.live.name)}</b></div><span data-since="${d.live.since}">${clock(now() - d.live.since)}</span>`;
    const top = Math.max(...d.items.map((i) => i.ms), 1);
    $('#dItems').innerHTML = [...d.items].sort((a, b) => b.ms - a.ms).map((i) => `<li>
      <span class="d-ic" style="${i.icon ? `background:${bgu(i.icon)} center/cover` : ''}">${i.icon ? '' : esc((i.name[0] || '?').toUpperCase())}</span>
      <span class="d-nm"><b>${esc(i.name)}</b><small>${esc(i.sub || '')}${i.sub ? ' · ' : ''}${i.sessions} ${i.sessions === 1 ? 'session' : 'sessions'} · ${ago(i.last)}</small><span class="bar"><i style="width:${Math.max(3, i.ms / top * 100)}%"></i></span></span>
      <span class="d-tm">${fmt(i.ms)}</span>
      ${i.url ? `<button class="d-open" data-url="${esc(i.url)}" aria-label="Open ${esc(i.name)} on Roblox">${ICON.ext}</button>` : '<span></span>'}</li>`).join('');
    $('#dItems').querySelectorAll('[data-url]').forEach((b) => { b.onclick = () => nf.openLink(b.dataset.url); });
  }
}

renderers.game = (force) => {
  const g = featured();
  if (!g) return;
  renderHero(g); renderHeroLive(g);
  renderDetail(g, force);
};
renderers.gameTick = () => {
  if (state.view !== 'game') return;
  const g = featured(); if (g) renderHeroLive(g);
  const s = document.querySelector('#dLive [data-since]'); if (s) s.textContent = clock(now() - +s.dataset.since);
};
$('#playBtn').onclick = () => launch(featured());
$('#setBtn').onclick = () => openModal(featured().id);
$('#favBtn').onclick = async () => { const g = featured(); await nf.update(g.id, { fav: !g.fav }); toast(g.fav ? 'Removed from favorites' : `${g.name} added to favorites`); };
$('#shareGameBtn').onclick = () => renderers.shareGame && renderers.shareGame(featured(), detailCache[featured().id] && detailCache[featured().id].d);
