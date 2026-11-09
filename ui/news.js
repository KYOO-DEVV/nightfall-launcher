/* global newsCache, nf, lib, state, $, esc, bgu, toast, renderers, now, DAY, ordered, heroOf, wideOf, ICON, loadNews, TAG, shortDate, select */
// News page: everything new for the games in your library, in one feed.

let nwFilter = 'all', nwData = null, nwAt = 0, nwBusy = false;
async function loadAllNews(force) {
  if (!force && nwData && now() - nwAt < 10 * 60000) return nwData;
  const games = ordered('recent');
  const feeds = await Promise.all(games.map(async (g) => ({ g, f: await loadNews({ id: g.id }, 'g:' + g.id) })));
  nwData = feeds.filter((x) => x.f && ((x.f.items && x.f.items.length) || x.f.banner));
  nwAt = now();
  return nwData;
}
renderers.news = async (force) => {
  if (nwBusy) return;
  if (!force && nwData && $('#nwGrid').childElementCount) return;
  nwBusy = true;
  if (!nwData) {
    $('#nwSub').textContent = 'Gathering news for your games…';
    $('#nwGrid').innerHTML = Array.from({ length: 6 }, () => '<div class="nw-card skel"><span class="nw-img"></span><span class="nw-tx"><i></i><i></i><i></i></span></div>').join('');
  }
  const data = await loadAllNews(force === 'refresh');
  nwBusy = false;
  if (state.view !== 'news') return;
  paintNews(data);
};
function paintNews(data) {
  if (!data.length) {
    $('#nwSub').textContent = '';
    $('#nwChips').innerHTML = ''; $('#nwUpcoming').innerHTML = '';
    $('#nwGrid').innerHTML = `<div class="dr-empty wide">${ICON.news}<b>No news yet</b><p>News shows up for HoYoverse games, Fortnite, Valorant, League of Legends and Steam games in your library.</p></div>`;
    return;
  }
  if (nwFilter !== 'all' && !data.some((x) => x.g.id === nwFilter)) nwFilter = 'all';
  const all = data.flatMap(({ g, f }) => (f.items || []).map((n) => ({ ...n, g, at: n.date || now() })));
  const week = all.filter((n) => now() - n.at < 7 * DAY).length;
  $('#nwSub').textContent = `${data.length} ${data.length === 1 ? 'game' : 'games'} · ${week} new this week`;
  $('#nwChips').innerHTML = `<button class="chip ${nwFilter === 'all' ? 'on' : ''}" data-f="all">All<i>${all.length}</i></button>`
    + data.map(({ g, f }) => `<button class="chip ${nwFilter === g.id ? 'on' : ''}" data-f="${g.id}">${g.art.icon ? `<img src="${esc(g.art.icon)}" alt="">` : ''}${esc(g.name)}<i>${(f.items || []).length}</i></button>`).join('');
  $('#nwChips').querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => { nwFilter = b.dataset.f; paintNews(nwData); }; });

  // coming up: featured banners and the next-version estimates
  const up = data.filter(({ g, f }) => (nwFilter === 'all' || nwFilter === g.id) && (f.next || (f.banner && f.banner.image)));
  $('#nwUpcoming').innerHTML = up.length ? `<h2 class="nw-h">Now and next</h2><div class="nw-up">${up.map(({ g, f }) => `
    <button class="nw-feature" ${f.banner && f.banner.url ? `data-url="${esc(f.banner.url)}"` : `data-g="${g.id}"`} style="--bg:${f.banner && f.banner.image ? bgu(f.banner.image) : heroOf(g) ? bgu(heroOf(g)) : 'none'}">
      <span class="nw-f-game">${g.art.icon ? `<img src="${esc(g.art.icon)}" alt="">` : ''}${esc(g.name)}</span>
      ${f.next ? `<span class="nw-f-next">${ICON.clock}<span>${esc(f.next.replace(/ \(estimate.*\)$/, ''))}<small>Estimate · new versions come about every 6 weeks</small></span></span>` : ''}
    </button>`).join('')}</div>` : '';

  const list = all.filter((n) => nwFilter === 'all' || n.g.id === nwFilter).sort((a, b) => b.at - a.at).slice(0, 60);
  $('#nwGrid').innerHTML = (up.length ? '<h2 class="nw-h">Latest</h2>' : '') + list.map((n, i) => {
    const img = n.image || wideOf(n.g);
    return `<button class="nw-card" style="--i:${Math.min(i, 14)}" ${n.url ? `data-url="${esc(n.url)}"` : `data-g="${n.g.id}"`}>
      <span class="nw-img" style="${img ? `background-image:${bgu(img)}` : ''}"><span class="ntag ${n.tag}">${TAG[n.tag] || 'News'}</span></span>
      <span class="nw-tx"><span class="nw-game">${n.g.art.icon ? `<img src="${esc(n.g.art.icon)}" alt="">` : ''}${esc(n.g.name)}${n.date ? ` · ${shortDate(n.date)}` : ''}</span>
      <b>${esc(n.title)}</b>${n.body ? `<p>${esc(n.body.slice(0, 140))}</p>` : ''}</span></button>`;
  }).join('');
  document.querySelectorAll('#newsView [data-url]').forEach((x) => { x.onclick = async () => { const err = await nf.openLink(x.dataset.url); if (err) toast(err); }; });
  document.querySelectorAll('#newsView [data-g]').forEach((x) => { x.onclick = () => select(x.dataset.g); });
}
$('#nwRefresh').onclick = () => { Object.keys(newsCache).forEach((k) => delete newsCache[k]); nwData = null; renderers.news('refresh'); };
