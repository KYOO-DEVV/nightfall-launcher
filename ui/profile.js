/* global tallArt, nf, lib, state, $, esc, bgu, fmt, total, ordered, coverOf, heroOf, gameById, logoHtml, fallbackBg, within, select, toast, renderers, modal, ICON */
// Profile: your picture, banner, name, bio, headline stats and a showcase of games you pick.

const prof = () => lib.profile || { name: 'Player', showcase: [] };
let pfKey = '';
renderers.profile = (force) => {
  const p = prof();
  const games = lib.games;
  const own = p.showcaseOwned || {};
  const show = (p.showcase || []).map((id) => gameById(id) || (own[id] ? { own: true, key: id, ...own[id] } : null)).filter(Boolean);
  const key = JSON.stringify([p, games.map((g) => [g.id, coverOf(g), Math.floor(total(g) / 6e4)])]);
  if (!force && key === pfKey) return; pfKey = key;

  // banner: yours, else your most played game's art
  const top = ordered('most')[0];
  const b = $('#pfBanner');
  b.style.background = p.banner ? `${bgu(p.banner)} center/cover` : top && heroOf(top) ? `${bgu(heroOf(top))} center 30%/cover` : top ? fallbackBg(top) : 'linear-gradient(120deg,#1d1d27,#0d0d10)';
  b.classList.toggle('auto', !p.banner);
  $('#pfBannerReset').hidden = !p.customBanner;
  $('#pfBannerBtn').firstElementChild.textContent = p.customBanner ? 'Change banner' : 'Add a banner';

  const img = $('#pfAvatarImg');
  if (p.avatar) { img.src = p.avatar; img.hidden = false; $('#pfAvatarInit').textContent = ''; }
  else { img.hidden = true; $('#pfAvatarInit').textContent = ((p.name || 'P').trim()[0] || 'P').toUpperCase(); }
  $('#pfAvatarReset').hidden = !p.customAvatar;
  if (document.activeElement !== $('#pfName')) $('#pfName').value = p.name || '';
  if (document.activeElement !== $('#pfBio')) $('#pfBio').value = p.bio || '';
  if (document.activeElement !== $('#pfPron')) $('#pfPron').value = p.pronouns || '';
  $('#pfPron').size = Math.max(8, ($('#pfPron').value || $('#pfPron').placeholder).length + 1);

  // stats
  const y0 = new Date(new Date().getFullYear(), 0, 1).getTime();
  const all = games.reduce((t, g) => t + total(g), 0);
  const year = games.reduce((t, g) => t + within(g, y0, Infinity), 0);
  const sessions = games.reduce((t, g) => t + g.sessions.length, 0);
  const stat = (v, k) => `<div class="panel pf-stat"><b>${esc(v)}</b><span>${esc(k)}</span></div>`;
  $('#pfStats').innerHTML = stat(fmt(all), 'Played in Nightfall') + stat(fmt(year), 'This year') + stat(games.length, games.length === 1 ? 'Game' : 'Games')
    + stat(sessions, 'Sessions') + stat(top && total(top) ? top.name : '—', 'Most played') + stat(games.filter((g) => g.fav).length, 'Bookmarked');

  // showcase
  const grid = $('#pfGrid');
  if (!show.length) {
    grid.innerHTML = `<div class="pf-empty"><p>Show off the games you love. Pick up to 12 and they appear here, in your order.</p><button class="btn btn-solid sm" id="pfEmptyBtn"><span>Choose games</span></button></div>`;
    $('#pfEmptyBtn').onclick = openPicker;
    return;
  }
  grid.innerHTML = show.map((g) => {
    if (g.own) return `<button class="pf-card" data-own="${esc(g.key)}" title="${esc(g.name)}"><span class="im">${g.cover || g.header ? `<img class="cv-img" src="${esc(g.cover || g.header)}" alt="">` : `<span class="cv-comp"><span class="lg"><span class="t">${esc(g.name)}</span></span></span>`}</span>
      <span class="tx"><b>${esc(g.name)}</b><small>${esc(STORE_LABEL[g.store] || g.store || '')} · Not installed</small></span></button>`;
    return `<button class="pf-card" data-id="${g.id}" title="${esc(g.name)}"><span class="im">${tallArt(g)}</span>
      <span class="tx"><b>${esc(g.name)}</b><small>${total(g) ? fmt(total(g)) + ' played' : 'Not played yet'}</small></span></button>`;
  }).join('');
  grid.dataset.n = show.length;
  grid.querySelectorAll('[data-id]').forEach((x) => { x.onclick = () => select(x.dataset.id); });
  grid.querySelectorAll('[data-own]').forEach((x) => { x.onclick = () => openOwned(x.dataset.own); });
};

$('#pfName').onchange = () => { nf.profileSet({ name: $('#pfName').value }); toast('Name saved'); };
$('#pfBio').onchange = () => { nf.profileSet({ bio: $('#pfBio').value }); toast('Bio saved'); };
$('#pfPron').onchange = () => { nf.profileSet({ pronouns: $('#pfPron').value }); toast('Pronouns saved'); };
$('#pfPron').oninput = () => { $('#pfPron').size = Math.max(8, ($('#pfPron').value || $('#pfPron').placeholder).length + 1); };
$('#pfPron').onkeydown = (e) => { if (e.key === 'Enter') $('#pfPron').blur(); };
/* a showcased game you own but haven't installed opens its store page */
async function openOwned(key) {
  if (!state.owned) { try { state.owned = await nf.owned(false); } catch { return; } }
  const o = (state.owned.games || []).find((x) => 'own:' + dlKey(x) === key);
  if (o) renderers.openStorePage(o); else toast("This game isn't in your store libraries any more");
}
[$('#pfName'), $('#pfBio')].forEach((i) => { i.onkeydown = (e) => { if (e.key === 'Enter') i.blur(); }; });
$('#pfAvatar').onclick = async () => { if (await nf.profilePick('avatar')) toast('Profile picture updated'); };
$('#pfBannerBtn').onclick = async () => { if (await nf.profilePick('banner')) toast('Banner updated'); };
$('#pfAvatarReset').onclick = () => nf.profileClear('avatar');
$('#pfBannerReset').onclick = () => nf.profileClear('banner');
$('#pfEdit').onclick = () => openPicker();

/* ---------- showcase picker ---------- */
let picked = [], pickMeta = {};
async function openPicker() {
  const p = prof();
  pickMeta = { ...(p.showcaseOwned || {}) };
  picked = [...(p.showcase || [])].filter((id) => gameById(id) || pickMeta[id]);
  $('#scQ').value = '';
  paintPicker();
  modal('#showcase', true);
  if (!state.owned) { try { state.owned = await nf.owned(false); } catch { state.owned = { accounts: [], games: [] }; } paintPicker(); }
}
function pickItems() {
  const q = $('#scQ').value.trim().toLowerCase();
  const mine = ordered('most').map((g) => ({ id: g.id, name: g.name, art: tallArt(g) }));
  const owned = ((state.owned && state.owned.games) || []).filter((o) => !o.gameId).map((o) => ({ id: 'own:' + dlKey(o), name: o.name, o,
    art: o.cover || o.header ? `<img class="cv-img" src="${esc(o.cover || o.header)}" alt="" loading="lazy">` : `<span class="cv-comp"><span class="lg"><span class="t">${esc(o.name)}</span></span></span>` }));
  return [...mine, ...owned].filter((x) => !q || x.name.toLowerCase().includes(q)).slice(0, q ? 200 : 120);
}
function paintPicker() {
  $('#scGrid').innerHTML = pickItems().map((x) => {
    const i = picked.indexOf(x.id);
    return `<button class="pick-card ${i >= 0 ? 'on' : ''} ${x.o ? 'own' : ''}" data-id="${esc(x.id)}"><span class="im">${x.art}${i >= 0 ? `<i>${i + 1}</i>` : ''}</span><b>${esc(x.name)}</b></button>`;
  }).join('') || '<p class="help">No games match.</p>';
  $('#scCount').textContent = `${picked.length} of 12 picked`;
  $('#scGrid').querySelectorAll('[data-id]').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.id, i = picked.indexOf(id);
      if (i >= 0) picked.splice(i, 1); else if (picked.length < 12) picked.push(id); else return toast('Your showcase holds 12 games');
      if (id.startsWith('own:') && !pickMeta[id]) { const o = pickItems().find((x) => x.id === id).o; pickMeta[id] = { name: o.name, cover: o.cover || null, header: o.header || null, store: o.store, id: o.id }; }
      paintPicker();
    };
  });
}
$('#scClose').onclick = () => modal('#showcase', false);
$('#scSave').onclick = async () => { await nf.profileSet({ ownedMeta: Object.fromEntries(picked.filter((x) => x.startsWith('own:')).map((x) => [x, pickMeta[x]])), showcase: picked }); modal('#showcase', false); toast('Showcase saved'); };
$('#scQ').oninput = () => paintPicker();
