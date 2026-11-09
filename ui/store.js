/* global nf, lib, state, $, esc, bgu, ago, hours, toast, renderers, STORE_LABEL, go, now, loadNews, renderNewsInto, paintIcons */
// Store page for games you own but haven't installed, and live install progress.

/* ---------- store page ---------- */
renderers.openStorePage = (o) => { state.store = o; go('store'); };
let sgFor = '';
renderers.store = async (force) => {
  const o = state.store; if (!o) return go('all');
  paintStoreProgress();
  if (!force && sgFor === o.id) return;
  sgFor = o.id;
  const art = o.hero || o.header || o.cover;
  $('#sgArt').style.background = art ? `${bgu(art)} center/cover no-repeat` : 'linear-gradient(160deg,#1c1c24,#0b0b0d)';
  $('#sgLogo').innerHTML = o.logo ? `<img src="${esc(o.logo)}" alt="${esc(o.name)}">` : `<span class="t">${esc(o.name)}</span>`;
  $('#sgChip').textContent = `${STORE_LABEL[o.store] || o.store} · in your library · not installed`;
  $('#sgDesc').textContent = '';
  $('#sgStore').textContent = STORE_LABEL[o.store] || o.store;
  const st = (v, k) => `<div class="hstat"><div class="v"><span>${esc(v)}</span></div><div class="k">${esc(k)}</div></div>`;
  $('#sgStats').innerHTML = (o.playMin ? st(hours(o.playMin), 'On Steam') : '') + (o.last ? st(ago(o.last), 'Last played') : '');
  $('#sgPage').hidden = !o.page;
  $('#sgFacts').innerHTML = '<div class="msg">Loading…</div>';
  $('#sgShots').innerHTML = '';
  $('#sgNews').innerHTML = '';
  const [info, feed] = await Promise.all([
    nf.storeInfo(o.store, o.id, o.appid).catch(() => ({})),
    loadNews({ name: o.name, appid: o.appid }, 's:' + o.id),
  ]);
  if (state.store !== o) return;
  $('#sgDesc').textContent = (info && info.desc) || '';
  const list = (x) => (Array.isArray(x) ? x.filter(Boolean).join(', ') : x || '');
  const facts = [
    ['Developer', list(info.developers)], ['Publisher', list(info.publishers)], ['Released', info.released],
    ['Genres', list(info.genres)], ['Price', info.free ? 'Free to play' : info.price], ['Metacritic', info.metacritic],
    ['Disk space', info.size ? 'about ' + info.size : ''], ['Steam play time', o.playMin ? hours(o.playMin) : ''],
  ].filter(([, v]) => v !== undefined && v !== null && v !== '');
  $('#sgFacts').innerHTML = facts.length ? facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('') : `<div class="msg">${STORE_LABEL[o.store] || 'The store'} doesn't share details for this game. Open its store page for more.</div>`;
  const shots = (info && info.screens) || [];
  $('#sgShots').innerHTML = shots.length ? shots.slice(0, 6).map((u) => `<button style="background-image:${bgu(u)}" data-u="${esc(u)}" aria-label="Screenshot"></button>`).join('') : '<div class="msg">No screenshots available.</div>';
  $('#sgShots').querySelectorAll('[data-u]').forEach((b) => { b.onclick = () => showShot(b.dataset.u); });
  const has = !!(feed && ((feed.items && feed.items.length) || feed.banner));
  $('#sgNewsPanel').hidden = !has;
  $('#sgDetail').dataset.n = has ? 3 : 2;
  if (has) { $('#sgNewsSrc').textContent = feed.source; renderNewsInto($('#sgNews'), feed); }
};
function showShot(u) {
  const d = document.createElement('div');
  d.className = 'shot-view';
  d.innerHTML = `<img src="${esc(u.replace('.600x338', '.1920x1080'))}" alt="">`;
  d.onclick = () => d.remove();
  document.body.appendChild(d);
}
$('#sgPage').onclick = async () => { const o = state.store; if (!o || !o.page) return; const err = await nf.openStore(o.page); if (err) toast(err); };
$('#sgInstall').onclick = () => { if (state.store) renderers.installOwned(state.store); };

/* ---------- installing ---------- */
let fastUntil = 0;
renderers.installOwned = async (o) => {
  const err = await nf.openStore(o.install);
  if (err) return toast(err);
  toast(`${STORE_LABEL[o.store] || 'The store'} is opening to install ${o.name}. Progress shows here once it starts.`);
  fastUntil = now() + 3 * 60000;
  pollDownloads();
};
const dlKeyOf = (o) => (o.store === 'steam' ? 'steam:' + o.appid : o.store === 'epic' ? 'epic:' + (o.ns || '') : o.id);
function bytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return (n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)) + ' ' + u[i];
}
function eta(d) {
  if (!d.total || !d.rate || d.rate < 1) return '';
  const s = (d.total - d.done) / d.rate;
  if (s < 60) return 'less than a minute left';
  if (s < 3600) return Math.round(s / 60) + ' min left';
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return `${h}h ${m}m left`;
}
const pctOf = (d) => (d.total ? Math.min(100, (d.done / d.total) * 100) : 0);
function dlLine(d) {
  if (d.state === 'paused') return `Paused · ${bytes(d.done)}${d.total ? ' of ' + bytes(d.total) : ''}`;
  if (d.state === 'queued' && !d.rate) return `Queued in ${STORE_LABEL[d.store] || d.store}`;
  return [d.rate ? bytes(d.rate) + '/s' : 'Starting…', d.total ? `${bytes(d.done)} of ${bytes(d.total)}` : bytes(d.done) + ' written', eta(d)].filter(Boolean).join(' · ');
}
function paintStoreProgress() {
  const o = state.store; if (!o || state.view !== 'store') return;
  const d = (state.downloads || []).find((x) => x.key === dlKeyOf(o));
  $('#sgProg').hidden = !d;
  $('#sgInstallTxt').textContent = d ? (d.state === 'paused' ? 'Paused' : 'Installing…') : 'Install';
  if (!d) return;
  $('#sgBar').style.width = (d.total ? pctOf(d) : 100) + '%';
  $('#sgProg').classList.toggle('indet', !d.total);
  $('#sgPct').textContent = d.total ? Math.floor(pctOf(d)) + '%' : 'Installing';
  $('#sgRate').textContent = dlLine(d);
}
function paintDownloads() {
  const list = state.downloads || [];
  const pill = $('#dlPill');
  pill.hidden = !list.length;
  if (list.length) {
    const d = list.find((x) => x.state === 'downloading') || list[0];
    const pct = pctOf(d);
    $('#dlRing').style.setProperty('--p', (d.total ? pct : 25) + '%');
    $('#dlRing').classList.toggle('spin', !d.total);
    $('#dlTxt').textContent = `${d.name}${d.total ? ' · ' + Math.floor(pct) + '%' : ''}${d.rate ? ' · ' + bytes(d.rate) + '/s' : ''}${list.length > 1 ? ` · +${list.length - 1}` : ''}`;
  } else $('#dlPop').hidden = true;
  if (!$('#dlPop').hidden) {
    $('#dlList').innerHTML = list.map((d) => `<div class="dl-item"><div class="dl-top"><b>${esc(d.name)}</b><span>${d.total ? Math.floor(pctOf(d)) + '%' : ''}</span></div>
      <div class="bar ${d.total ? '' : 'indet'}"><i style="width:${d.total ? pctOf(d) : 100}%"></i></div><small>${esc(STORE_LABEL[d.store] || d.store)} · ${esc(dlLine(d))}</small></div>`).join('');
  }
  paintStoreProgress();
  if (renderers.paintCards) renderers.paintCards();
}
$('#dlPill').onclick = (e) => { e.stopPropagation(); $('#dlPop').hidden = !$('#dlPop').hidden; paintDownloads(); };
document.addEventListener('click', (e) => { const p = $('#dlPop'); if (!p.hidden && !p.contains(e.target)) p.hidden = true; });

let pollT = null;
async function pollDownloads() {
  clearTimeout(pollT);
  const before = state.downloads || [];
  try { state.downloads = await nf.downloads(); } catch { state.downloads = []; }
  // finished: let the library pick the game up
  for (const d of before) {
    if (!state.downloads.some((x) => x.key === d.key) && (d.total ? d.done / d.total > 0.9 : true)) {
      toast(`${d.name} finished installing`);
      setTimeout(async () => { try { state.owned = await nf.owned(true); if (state.view === 'all') renderers.all(true); } catch {} }, 4000);
    }
  }
  paintDownloads();
  const fast = state.downloads.length || now() < fastUntil || state.view === 'store';
  pollT = setTimeout(pollDownloads, fast ? 2000 : 20000);
}
window.addEventListener('DOMContentLoaded', () => { paintIcons(); setTimeout(pollDownloads, 1500); });
