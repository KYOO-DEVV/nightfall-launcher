/* global nf, lib, state, $, esc, bgu, ago, now, hue, toast, renderers, featured, gameById, openModal, openSettings, showShot, mId, ICON, LOCALE, P */
// 2.6: colour per game, achievements and screenshots, library layout, launch options, accent colour, notifications.

/* ---------------- each game page takes the colour of its art ---------------- */
function paintGameColour(g) {
  let [r, gg, b] = g.tint || [];
  if (r == null) { const h = hue(g.name); const c = `hsl(${h} 55% 55%)`; const t = document.createElement('i'); t.style.color = c; document.body.appendChild(t); [r, gg, b] = getComputedStyle(t).color.match(/\d+/g).map(Number); t.remove(); }
  // keep it bright enough to read on black, and not neon
  const mx = Math.max(r, gg, b, 1), lift = mx < 150 ? 150 / mx : 1;
  [r, gg, b] = [r, gg, b].map((v) => Math.min(235, Math.round(v * lift)));
  const v = $('#game').style;
  v.setProperty('--gr', r); v.setProperty('--gg', gg); v.setProperty('--gb', b);
}
window.paintGameColour = paintGameColour;

/* ---------------- achievements & screenshots tabs ---------------- */
const achCache = {}, shotCache = {};
async function loadAch(g) {
  if (!g.appid) return null;
  const c = achCache[g.appid]; if (c && now() - c.t < 60000) return c.v;
  const v = await nf.achievements(g.appid).catch(() => null);
  achCache[g.appid] = { t: now(), v: v && v.total ? v : null };
  return achCache[g.appid].v;
}
async function loadShots(g) {
  const c = shotCache[g.id]; if (c && now() - c.t < 60000) return c.v;
  const v = await nf.screenshotsOf(g.id).catch(() => []);
  shotCache[g.id] = { t: now(), v }; return v;
}
const dateTxt = (t) => new Date(t).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
renderers.gameExtras = async (g) => {
  const [ach, shots] = await Promise.all([loadAch(g), loadShots(g)]);
  if ((featured() || {}).id !== g.id || state.view !== 'game') return;
  const aBtn = $('#dTabs [data-t="achievements"]'), sBtn = $('#dTabs [data-t="shots"]');
  aBtn.hidden = !ach; sBtn.hidden = !shots.length;
  // while the hero text is switching games, wait for it so the old numbers never show the new count
  const stat = () => { if ((featured() || {}).id !== g.id) return; $('#hAchBox').hidden = !ach; if (ach) $('#hAch').textContent = `${ach.unlocked}/${ach.total}`; };
  if (document.querySelector('#hero .hero-stats.out')) setTimeout(stat, 320); else stat();
  const tab = document.querySelector('#dTabs button.on');
  // the tab you were on doesn't exist for this game: back to sessions
  if (tab && tab.hidden) document.querySelector('#dTabs [data-t="sessions"]').click();
  const cur = document.querySelector('#dTabs button.on')?.dataset.t;
  if (cur === 'achievements' && ach) {
    $('#dTabSub').textContent = `${Math.round((ach.unlocked / ach.total) * 100)}% · Steam`;
    const key = g.appid + ':' + ach.unlocked;
    if ($('#dAch').dataset.key !== key) {
      $('#dAch').dataset.key = key;
      $('#dAch').innerHTML = `<div class="ach-top"><b>${ach.unlocked}</b><span>of ${ach.total} unlocked</span><div class="bar"><i style="width:${(ach.unlocked / ach.total) * 100}%"></i></div></div>
        <ol>${ach.list.map((a) => `<li class="${a.on ? 'on' : ''}"><span class="a-ic" style="${a.icon ? `background-image:${bgu(a.icon)}` : ''}"></span>
          <span class="a-tx"><b>${a.hidden && !a.on ? 'Hidden achievement' : esc(a.name)}</b><small>${a.hidden && !a.on ? 'Keep playing to find out' : esc(a.desc || '')}</small></span>
          <span class="a-at">${a.on ? (a.at ? dateTxt(a.at) : 'Unlocked') : ''}</span></li>`).join('')}</ol>`;
    }
  }
  if (cur === 'shots' && shots.length) {
    $('#dTabSub').textContent = `${shots.length} on this PC`;
    const key = g.id + ':' + shots.length;
    if ($('#dShots').dataset.key !== key) {
      $('#dShots').dataset.key = key;
      $('#dShots').innerHTML = shots.map((s) => `<button style="background-image:${bgu(s.url)}" data-u="${esc(s.url)}" title="${esc(dateTxt(s.at))}" aria-label="Screenshot"></button>`).join('');
      $('#dShots').querySelectorAll('[data-u]').forEach((b) => { b.onclick = () => showShot(b.dataset.u); });
    }
  }
};

/* ---------------- library layout: grid or list, cover size ---------------- */
$('#avView').querySelector('[data-v="grid"]').innerHTML = P('<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>');
$('#avView').querySelector('[data-v="list"]').innerHTML = P('<path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>');
renderers.libLayout = () => {
  const s = lib.settings || {}, view = s.libView || 'grid', size = s.cardSize || 150;
  $('#avGrid').classList.toggle('list', view === 'list');
  $('#avGrid').style.setProperty('--card', size + 'px');
  $('#avView').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === view));
  $('#avSize').hidden = view === 'list';
  if (document.activeElement !== $('#avSize')) $('#avSize').value = size;
};
$('#avView').querySelectorAll('button').forEach((b) => { b.onclick = () => { lib.settings.libView = b.dataset.v; renderers.libLayout(); nf.set('libView', b.dataset.v); }; });
$('#avSize').oninput = () => { lib.settings.cardSize = +$('#avSize').value; $('#avGrid').style.setProperty('--card', $('#avSize').value + 'px'); };
$('#avSize').onchange = () => nf.set('cardSize', +$('#avSize').value);
$('#avHidden').onclick = () => { state.filter = state.filter === 'hidden' ? 'all' : 'hidden'; renderers.all(true); };

/* games added since you last opened Nightfall get a "New" badge */
try {
  const prev = +localStorage.getItem('nf.lastVisit');
  state.newSince = prev || now();
  localStorage.setItem('nf.lastVisit', String(now()));
} catch { state.newSince = now(); }

/* the store list refreshed in the background */
nf.onOwned(async () => { try { state.owned = await nf.owned(false); } catch { return; } if (state.view === 'all' && state.libTab === 'stores') renderers.all(true); });

/* ---------------- Game settings: launch options, limit, hide ---------------- */
const baseOpenModal = openModal;
// eslint-disable-next-line no-global-assign
openModal = (id) => {
  baseOpenModal(id);
  const g = gameById(id); if (!g) return;
  $('#mArgs').value = g.launchArgs || '';
  $('#mAdmin').checked = !!g.runAsAdmin; $('#mHideOnLaunch').checked = !!g.hideOnLaunch;
  $('#mLimit').value = String(g.limitMin || 0); if ($('#mLimit').selectedIndex < 0) $('#mLimit').value = '0';
  $('#mHidden').checked = !!g.hidden;
};
$('#mArgs').onchange = () => nf.update(mId, { launchArgs: $('#mArgs').value.trim() });
$('#mAdmin').onchange = (e) => nf.update(mId, { runAsAdmin: e.target.checked });
$('#mHideOnLaunch').onchange = (e) => nf.update(mId, { hideOnLaunch: e.target.checked });
$('#mLimit').onchange = () => { nf.update(mId, { limitMin: +$('#mLimit').value }); if (+$('#mLimit').value) toast("You'll get a reminder once you reach it each day"); };
$('#mHidden').onchange = async (e) => {
  const g = gameById(mId);
  await nf.update(mId, { hidden: e.target.checked });
  toast(e.target.checked ? `${g.name} is hidden · Library → Hidden brings it back` : `${g.name} is back in your library`);
};

/* ---------------- appearance: accent colour ---------------- */
function applyTheme() { document.documentElement.dataset.accent = (lib.settings && lib.settings.accent) || 'white'; }
const baseChrome26 = renderers.chrome;
renderers.chrome = () => { if (baseChrome26) baseChrome26(); applyTheme(); };
$('#sAccent').querySelectorAll('button').forEach((b) => { b.onclick = () => { lib.settings.accent = b.dataset.v; applyTheme(); paintLook(); nf.set('accent', b.dataset.v); }; });
$('#sLang').querySelectorAll('button').forEach((b) => { b.onclick = async () => { await nf.set('language', b.dataset.v); lib.settings.language = b.dataset.v; paintLook(); if (window.applyLanguage) applyLanguage(true); }; });
function paintLook() {
  const s = lib.settings || {};
  $('#sAccent').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === (s.accent || 'white')));
  $('#sLang').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === (s.language || 'auto')));
  $('#sNotifDl').checked = s.notifyDownloads !== false; $('#sRecap').checked = s.weeklyRecap !== false; $('#sWidget').checked = !!s.widget;
}
$('#sNotifDl').onchange = (e) => nf.set('notifyDownloads', e.target.checked);
$('#sRecap').onchange = (e) => nf.set('weeklyRecap', e.target.checked);
$('#sWidget').onchange = (e) => { nf.set('widget', e.target.checked); toast(e.target.checked ? 'The timer appears in the corner next time a game runs' : 'Session timer off'); };
const baseOpenSettings26 = openSettings;
// eslint-disable-next-line no-global-assign
openSettings = async (section) => { await baseOpenSettings26(section); paintLook(); };
applyTheme();
