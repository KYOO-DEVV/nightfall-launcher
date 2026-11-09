/* global drawer, ICON, setNewsButton, nf, lib, state, $, esc, bgu, ago, hours, toast, renderers, STORE_LABEL, go, now, loadNews, renderNewsInto, paintIcons */
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
  $('#sgNewsBtn').hidden = true;
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
  $('#sgDetail').dataset.n = 2;
  setNewsButton($('#sgNewsBtn'), $('#sgNewsBadge'), feed, o.name);
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
const rateTxt = (r) => (r ? bytes(r) + '/s' : '—');
const mbit = (r) => (r ? Math.round((r * 8) / 1e6) + ' Mbit/s' : '');
function etaTxt(d) {
  if (!d.total || !d.rate || d.rate < 1) return '—';
  const s = (d.total - d.done) / d.rate;
  if (s < 60) return '< 1 min';
  if (s < 3600) return Math.round(s / 60) + ' min';
  return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
}
function finishAt(d) {
  if (!d.total || !d.rate || d.rate < 1) return '';
  const t = new Date(now() + ((d.total - d.done) / d.rate) * 1000);
  return 'done around ' + t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
const pctOf = (d) => (d.total ? Math.min(100, (d.done / d.total) * 100) : 0);
const STATE_TXT = { downloading: 'Downloading', installing: 'Installing', paused: 'Paused', queued: 'Queued' };
const stateOf = (d) => (d.state === 'downloading' && d.phase === 'installing' ? 'installing' : d.state);
function dlLine(d) {
  const st = stateOf(d);
  if (st === 'paused') return `Paused in ${STORE_LABEL[d.store] || d.store} · ${bytes(d.done)}${d.total ? ' of ' + bytes(d.total) : ''}`;
  if (st === 'queued') return `Waiting in ${STORE_LABEL[d.store] || d.store}`;
  return [rateTxt(d.rate), d.total ? `${bytes(d.done)} of ${bytes(d.total)}` : bytes(d.done) + ' written', d.total && d.rate ? etaTxt(d) + ' left' : ''].filter(Boolean).join(' · ');
}
/* speed graph: last 2 minutes */
function spark(hist) {
  const h = (hist || []).slice(-60);
  if (h.length < 2) return '<div class="dl-spark empty">Measuring speed…</div>';
  if (!h.some((v) => v > 0)) return '<div class="dl-spark empty">No data moving in the last 2 minutes</div>';
  const max = Math.max(...h, 1), W = 300, H = 46;
  const pts = h.map((v, i) => [(i / (h.length - 1)) * W, H - (v / max) * (H - 4) - 2]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return `<svg class="dl-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="sg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#9ec5ff" stop-opacity=".35"/><stop offset="1" stop-color="#9ec5ff" stop-opacity="0"/></linearGradient></defs>
    <path d="${line} L${W} ${H} L0 ${H}Z" fill="url(#sg)"/><path d="${line}" fill="none" stroke="#9ec5ff" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
}
function paintStoreProgress() {
  const o = state.store; if (!o || state.view !== 'store') return;
  const d = (state.downloads || []).find((x) => x.key === dlKeyOf(o));
  $('#sgProg').hidden = !d;
  $('#sgInstallTxt').textContent = d ? STATE_TXT[stateOf(d)] + (d.total ? ` ${Math.floor(pctOf(d))}%` : '…') : 'Install';
  if (!d) return;
  $('#sgBar').style.width = (d.total ? pctOf(d) : 100) + '%';
  $('#sgProg').classList.toggle('indet', !d.total);
  $('#sgProg').classList.toggle('paused', stateOf(d) === 'paused');
  $('#sgPct').textContent = d.total ? Math.floor(pctOf(d)) + '%' : 'Installing';
  $('#sgRate').textContent = dlLine(d);
}
function dlCard(d) {
  const st = stateOf(d), pct = pctOf(d);
  const two = d.dlTotal && d.diskTotal;
  const dPct = d.dlTotal ? Math.min(100, (d.dlDone / d.dlTotal) * 100) : 0, wPct = d.diskTotal ? Math.min(100, (d.diskDone / d.diskTotal) * 100) : 0;
  const freeLow = d.free && d.total && d.free < d.total - d.done;
  const fact = (k, v, sub) => `<div><span>${k}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  return `<article class="dl-card ${st}" data-key="${esc(d.key)}">
    <div class="dl-head">
      <span class="dl-art" style="${d.header ? `background-image:${bgu(d.header)}` : ''}"></span>
      <div class="dl-title"><b>${esc(d.name)}</b><small>${esc(STORE_LABEL[d.store] || d.store)} · ${d.kind === 'update' ? 'Update' : 'Install'}</small></div>
      <span class="dl-state ${st}">${STATE_TXT[st] || st}</span>
    </div>
    <div class="dl-big"><b>${d.total ? Math.floor(pct) + '<i>%</i>' : '—'}</b><span>${d.total ? `${bytes(d.done)} of ${bytes(d.total)}` : bytes(d.done) + ' written so far'}<br>${finishAt(d)}</span></div>
    ${two ? `<div class="dl-bars"><div><span>Download</span><div class="bar"><i style="width:${dPct}%"></i></div><small>${bytes(d.dlDone)} / ${bytes(d.dlTotal)}</small></div>
      <div><span>Install</span><div class="bar disk"><i style="width:${wPct}%"></i></div><small>${bytes(d.diskDone)} / ${bytes(d.diskTotal)}</small></div></div>`
      : `<div class="bar ${d.total ? '' : 'indet'}"><i style="width:${d.total ? pct : 100}%"></i></div>`}
    ${spark(d.history)}
    <div class="dl-facts">
      ${fact('Speed', rateTxt(d.rate), mbit(d.rate))}${fact('Peak', rateTxt(d.peak), d.avg ? 'avg ' + rateTxt(d.avg) : '')}${fact('Time left', etaTxt(d))}
      ${fact('Drive', d.drive ? esc(d.drive) : '—', d.free ? `<em class="${freeLow ? 'low' : ''}">${bytes(d.free)} free</em>` : '')}
    </div>
    ${freeLow ? `<p class="dl-warn">Not enough free space on ${esc(d.drive || 'this drive')} to finish. Free up ${bytes(d.total - d.done - d.free)} or move the game.</p>` : ''}
    ${d.path ? `<p class="dl-path" title="${esc(d.path)}">${esc(d.path)}</p>` : ''}
  </article>`;
}
function paintDownloads() {
  const list = state.downloads || [];
  // sidebar button: progress ring around the icon and a count
  const btn = $('#dlBtn');
  const active = list.find((x) => stateOf(x) === 'downloading' || stateOf(x) === 'installing') || list[0];
  btn.classList.toggle('busy', !!list.length);
  btn.classList.toggle('paused', !!active && stateOf(active) === 'paused');
  btn.classList.toggle('indet', !!active && !active.total);
  $('#dlArc').style.strokeDasharray = `${active && active.total ? pctOf(active) : 28} 100`;
  $('#dlCount').hidden = list.length < 2; $('#dlCount').textContent = list.length;
  renderers.dlTip = () => (active ? `${active.name} · ${active.total ? Math.floor(pctOf(active)) + '%' : STATE_TXT[stateOf(active)]}${active.rate ? ' · ' + rateTxt(active.rate) : stateOf(active) === 'paused' ? ' · paused' : ''}` : 'Downloads');
  if (!$('#dlDrawer').hidden) {
    const total = list.reduce((t, d) => t + (d.rate || 0), 0);
    $('#dlSum').textContent = list.length ? `${list.length} ${list.length === 1 ? 'item' : 'items'}${total ? ' · ' + rateTxt(total) + ' total' : ''}` : 'Nothing downloading';
    const box = $('#dlList');
    if (!list.length) { if (!box.querySelector('.dr-empty')) box.innerHTML = `<div class="dr-empty">${ICON.download}<b>No downloads right now</b><p>Install a game from Library → Your stores and its progress shows here.</p></div>`; }
    else {
      box.querySelector('.dr-empty')?.remove();
      // update cards in place: no re-animation, bars glide to their new width
      const keep = new Set(list.map((d) => d.key));
      box.querySelectorAll('.dl-card').forEach((c) => { if (!keep.has(c.dataset.key)) c.remove(); });
      for (const d of list) {
        const tmp = document.createElement('div'); tmp.innerHTML = dlCard(d); const fresh = tmp.firstElementChild;
        const old = [...box.children].find((c) => c.dataset.key === d.key);
        if (!old) { box.appendChild(fresh); continue; }
        old.className = fresh.className;
        patch(old, fresh);
      }
    }
    $('#dlSteam').hidden = !list.some((d) => d.store === 'steam');
  }
  paintStoreProgress();
  if (renderers.paintCards) renderers.paintCards();
}
/* copy text / widths / attributes from a freshly built card onto the one on screen, keeping elements (and their images) */
function patch(a, b) {
  if (a.nodeType === 3 || b.nodeType === 3) { if (a.textContent !== b.textContent) a.textContent = b.textContent; return; }
  if (a.tagName !== b.tagName || a.childNodes.length !== b.childNodes.length) { a.replaceWith(b); return; }
  for (const at of b.attributes) if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
  for (const at of [...a.attributes]) if (!b.hasAttribute(at.name) && !/^(class|data-waiting)$/.test(at.name)) a.removeAttribute(at.name);
  [...a.childNodes].forEach((c, i) => patch(c, b.childNodes[i]));
}
renderers.paintDownloads = paintDownloads;
$('#dlClose').onclick = () => drawer('#dlDrawer', false);
$('#dlSteam').onclick = async () => { const err = await nf.openStore('steam://open/downloads'); if (err) toast(err); };

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
  const fast = state.downloads.length || now() < fastUntil || state.view === 'store' || !$('#dlDrawer').hidden;
  pollT = setTimeout(pollDownloads, fast ? 2000 : 20000);
}
window.addEventListener('DOMContentLoaded', () => { paintIcons(); setTimeout(pollDownloads, 1500); });
