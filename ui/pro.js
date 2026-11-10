/* global nf, lib, state, $, esc, ago, toast, renderers, go, select, featured, launch, modal, drawer, openSearch, addDialog, openSettings, connectAll, STORE_LABEL, ICON, paintIcons, busy, gameById */
// The parts that make Nightfall feel finished: splash, first-run welcome, What's new, keyboard & controller,
// reduced motion, offline notice, backups and problem reports.

/* ---------------- errors go to the log file ---------------- */
window.addEventListener('error', (e) => nf.log('error', `${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => nf.log('error', 'promise: ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason)));

/* ---------------- release builds behave like an app, not a web page ---------------- */
document.addEventListener('keydown', (e) => {
  if (lib.debug) return;
  if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R')) || e.key === 'F7' || ((e.ctrlKey) && e.shiftKey && /^[ijc]$/i.test(e.key))) e.preventDefault();
}, true);
document.addEventListener('contextmenu', (e) => { if (!lib.debug && !e.target.closest('input, textarea')) e.preventDefault(); });

/* ---------------- changelog ---------------- */
const CHANGELOG = [
  { v: '2.5.0', date: 'November 2026', title: 'Built to be relied on', items: [
    'A welcome tour the first time you open Nightfall: it finds your games, sets things up and creates your profile in under a minute.',
    'This page: see what changed after every update.',
    'Your library is backed up every day (10 copies kept) and can be restored from Settings → Backups. A damaged library file is repaired from the newest backup by itself.',
    'Report a problem in two clicks from Settings → Help: a plain-text report with no personal data, ready to attach to a GitHub issue.',
    'Full keyboard control (press ? for the shortcuts) and controller support: move with the D-pad, A to open, B to go back, LB / RB to switch pages.',
    'Reduce motion setting that can follow Windows, and an optional launch sound.',
    'Offline notice, loading placeholders and clearer error messages with a way to retry.',
    'A smoother start with a splash screen, a nicer installer and a smaller minimum window size for laptops and high-DPI screens.',
  ] },
  { v: '2.4.1', date: 'November 2026', items: ['Store covers turn grey and fill back up with colour as a game downloads.'] },
  { v: '2.4.0', date: 'November 2026', items: ['A brand-new icon set across the app.', 'Correct artwork for Minecraft and portrait covers for HoYoverse games.', 'Cleaner game names, a working Change banner and smoother title transitions.'] },
  { v: '2.3.0', date: 'November 2026', items: ['No more flicker: pages update in place and images fade in once loaded.', 'Smooth transitions between game pages.', 'Downloads live in the sidebar with a progress ring.', 'Discord shows "Playing <game>" with a button to Nightfall on GitHub.'] },
  { v: '2.2.0', date: 'November 2026', items: ['A real Settings page.', 'News moved to its own page, with a drawer on game pages.', 'Detailed downloads: speed, time left, disk activity.', 'Steam friends without an API key.'] },
  { v: '2.1.0', date: 'November 2026', items: ['News for HoYoverse, Fortnite, Valorant, League and Steam games.', 'Fortnite and Valorant match history.', 'Store pages for games you own but haven\'t installed.', 'Your profile: picture, banner, bio and showcase.', 'Pin games to the sidebar.'] },
];
function openWhatsNew(onlyLatest) {
  const list = onlyLatest ? CHANGELOG.slice(0, 1) : CHANGELOG;
  $('#wnBody').innerHTML = list.map((c, i) => `<section class="wn-ver ${i ? 'old' : ''}">
      <header><b>Nightfall ${esc(c.v)}</b><small>${esc(c.date)}</small></header>${c.title ? `<h4>${esc(c.title)}</h4>` : ''}
      <ul>${c.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>`).join('')
    + (onlyLatest ? '<button class="wn-more" id="wnAll">See earlier versions</button>' : '');
  $('#wnFoot').textContent = onlyLatest ? `You're now on Nightfall ${lib.version}.` : '';
  const all = $('#wnAll'); if (all) all.onclick = () => openWhatsNew(false);
  modal('#whatsnew', true);
}
const seenVersion = () => { nf.set('lastSeenVersion', lib.version); lib.settings.lastSeenVersion = lib.version; };
$('#wnOk').onclick = () => { modal('#whatsnew', false); seenVersion(); };
$('#wnClose').onclick = () => { modal('#whatsnew', false); seenVersion(); };

/* ---------------- splash, then welcome or What's new ---------------- */
const BOOT_AT = performance.now();
function afterBoot() {
  nf.ready();
  applyMotion();
  const wait = Math.max(0, 650 - (performance.now() - BOOT_AT));
  setTimeout(() => {
    $('#splash').classList.add('out');
    setTimeout(() => { $('#splash').hidden = true; }, 500);
    const s = lib.settings || {};
    if (!s.onboarded) startTour();
    else if (s.lastSeenVersion !== lib.version) setTimeout(() => openWhatsNew(true), 350);
  }, wait);
}
window.afterBoot = afterBoot;

/* ---------------- first-run welcome ---------------- */
const tour = { step: 0, found: null, scanning: false, prefs: null };
function startTour() { tour.step = 0; tour.found = null; $('#onb').hidden = false; requestAnimationFrame(() => $('#onb').classList.add('in')); paintTour(); }
function endTour() {
  nf.set('onboarded', true); lib.settings.onboarded = true; seenVersion();
  $('#onb').classList.remove('in'); setTimeout(() => { $('#onb').hidden = true; }, 350);
  go('home');
}
async function tourScan() {
  if (tour.scanning) return; tour.scanning = true;
  try { tour.found = await nf.scan(); } catch (e) { nf.log('warn', 'tour scan: ' + e); tour.found = []; }
  tour.scanning = false;
  if (tour.step === 0) paintTour();
}
function paintTour() {
  const p = $('#onbPage'), next = $('#onbNext').firstElementChild;
  $('#onbDots').querySelectorAll('i').forEach((d, i) => { d.className = i === tour.step ? 'on' : i < tour.step ? 'done' : ''; });
  $('#onbBack').style.visibility = tour.step ? 'visible' : 'hidden';
  $('#onbSkip').hidden = tour.step === 2;
  p.classList.remove('turn'); void p.offsetWidth; p.classList.add('turn');
  if (tour.step === 0) {
    if (!tour.found && !tour.scanning) tourScan();
    const f = tour.found || [], fresh = f.filter((x) => !x.connected);
    const by = {}; f.forEach((x) => { by[x.source] = (by[x.source] || 0) + 1; });
    p.innerHTML = `<div class="onb-hero"><img src="icon.png" alt=""><h2 id="onbTitle">Welcome to Nightfall</h2>
        <p>Every game on your PC in one place, with its official artwork and the time you really spend playing. Let's set it up.</p></div>
      <div class="onb-box">${!tour.found
        ? '<div class="onb-scan"><div class="spinner"></div><div><b>Looking for your games…</b><small>Steam, Epic Games, GOG, Ubisoft, Riot, HoYoPlay, EA, Xbox, Minecraft and more</small></div></div>'
        : f.length ? `<b class="onb-count">${f.length} ${f.length === 1 ? 'game' : 'games'} found${fresh.length < f.length ? `<small> · ${f.length - fresh.length} already in your library</small>` : ''}</b><div class="onb-stores">${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<span>${esc(STORE_LABEL[k] || k)}<i>${n}</i></span>`).join('')}</div>`
          : '<b class="onb-count">No games found yet</b><small class="onb-sub">You can add any game later by dropping its .exe into the window.</small>'}</div>`;
    next.textContent = !tour.found ? 'Continue' : fresh.length ? `Add ${fresh.length} ${fresh.length === 1 ? 'game' : 'games'}` : 'Continue';
    $('#onbNext').disabled = !tour.found;
  } else if (tour.step === 1) {
    const s = tour.prefs || {};
    const row = (id, t, d, on) => `<label class="s-row toggle"><div><b>${t}</b><small>${d}</small></div><input type="checkbox" data-k="${id}" ${on ? 'checked' : ''}></label>`;
    p.innerHTML = `<div class="onb-hero sm"><h2 id="onbTitle">Make it yours</h2><p>You can change all of this later in Settings.</p></div>
      <div class="onb-box list">${row('autoAddInstalled', 'Add new games automatically', 'Steam and Epic games you install join your library by themselves.', s.autoAddInstalled !== false)}
        ${row('startWithWindows', 'Start with Windows', 'Opens quietly in the tray so no play session is missed.', !!s.startWithWindows)}
        ${row('closeToTray', 'Keep tracking when closed', 'Closing the window hides Nightfall to the tray.', s.closeToTray !== false)}
        ${row('sounds', 'Launch sound', 'A soft chime when a game starts.', !!s.sounds)}</div>`;
    p.querySelectorAll('input[data-k]').forEach((i) => { i.onchange = () => { nf.set(i.dataset.k, i.checked); tour.prefs[i.dataset.k] = i.checked; }; });
    next.textContent = 'Continue';
  } else {
    const pr = lib.profile || {};
    p.innerHTML = `<div class="onb-hero sm"><h2 id="onbTitle">Your profile</h2><p>Only you see it, unless you share a stats card.</p></div>
      <div class="onb-box onb-prof"><button class="pf-avatar" id="onbAv" aria-label="Choose a picture">${pr.avatar ? `<img src="${esc(pr.avatar)}" alt="">` : `<span>${esc(((pr.name || 'P').trim()[0] || 'P').toUpperCase())}</span>`}<i>Change</i></button>
        <div class="grow"><label for="onbName">Name</label><input id="onbName" maxlength="32" value="${esc(pr.name || '')}" spellcheck="false"><small class="onb-sub">${pr.avatar ? 'Your picture comes from Steam. Click it to use another one.' : 'Click the circle to add a picture.'}</small></div></div>`;
    $('#onbAv').onclick = async () => { if (await nf.profilePick('avatar')) setTimeout(paintTour, 300); };
    $('#onbName').onchange = () => nf.profileSet({ name: $('#onbName').value });
    next.textContent = 'Start playing';
  }
  if (document.documentElement.classList.contains('pad')) $('#onbNext').focus({ preventScroll: true });
}
$('#onbNext').onclick = async () => {
  if (tour.step === 0) {
    const fresh = (tour.found || []).filter((x) => !x.connected);
    if (fresh.length) { $('#onbNext').disabled = true; await nf.connect(fresh.map((x) => x.i)); $('#onbNext').disabled = false; toast(`${fresh.length} ${fresh.length === 1 ? 'game' : 'games'} added · fetching artwork`); tour.found.forEach((x) => { x.connected = true; }); }
    tour.prefs = await nf.settings();
  } else if (tour.step === 2) { if ($('#onbName')) await nf.profileSet({ name: $('#onbName').value }); return endTour(); }
  tour.step++; paintTour();
};
$('#onbBack').onclick = () => { if (tour.step) { tour.step--; paintTour(); } };
$('#onbSkip').onclick = endTour;

/* ---------------- reduce motion ---------------- */
const sysReduce = matchMedia('(prefers-reduced-motion: reduce)');
function applyMotion() {
  const v = (lib.settings && lib.settings.reduceMotion) || 'system';
  document.documentElement.classList.toggle('reduce', v === 'on' || (v === 'system' && sysReduce.matches));
}
sysReduce.addEventListener('change', applyMotion);

/* ---------------- launch sound ---------------- */
let actx = null;
function chime() {
  try {
    actx = actx || new AudioContext();
    const t = actx.currentTime, out = actx.createGain(); out.gain.value = 0.08; out.connect(actx.destination);
    [[659.25, 0], [987.77, 0.09]].forEach(([f, d]) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(out);
      g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(1, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.6);
      o.start(t + d); o.stop(t + d + 0.65);
    });
  } catch { /* no audio device */ }
}
const baseLaunch = launch;
// eslint-disable-next-line no-global-assign
launch = async (g) => { if (g && !g.open && lib.settings && lib.settings.sounds) chime(); return baseLaunch(g); };

/* ---------------- history: Back with Alt+←, the mouse's back button or B on a controller ---------------- */
const hist = [];
const baseGo = go;
// eslint-disable-next-line no-global-assign
go = (view) => {
  const cur = { view: state.view, sel: state.sel, store: state.store };
  if (cur.view !== view || (view === 'game' && hist.length && hist[hist.length - 1].sel !== state.sel)) { hist.push(cur); if (hist.length > 40) hist.shift(); }
  return baseGo(view);
};
function back() {
  const h = hist.pop(); if (!h) return;
  state.sel = h.sel; state.store = h.store; baseGo(h.view);
}
window.addEventListener('mouseup', (e) => { if (e.button === 3) { e.preventDefault(); back(); } });

/* ---------------- what's on top right now ---------------- */
function topLayer() {
  if (!$('#onb').hidden) return $('#onb');
  const m = [...document.querySelectorAll('.modal-bg')].find((x) => !x.hidden); if (m) return m;
  const d = document.querySelector('.drawer.open'); if (d) return d;
  if (!$('#searchPop').hidden) return $('#searchPop');
  return null;
}
function closeTop() {
  const t = topLayer();
  if (!t) return false;
  if (t.id === 'onb') return true; // the welcome closes with Skip, not by accident
  if (t.classList.contains('drawer')) drawer('#' + t.id, false);
  else { t.hidden = true; if (t.id === 'whatsnew') seenVersion(); }
  return true;
}

/* ---------------- keyboard ---------------- */
const SHORTCUTS = [
  ['Go to', [['Ctrl', '1'], 'Home'], [['Ctrl', '2'], 'Library'], [['Ctrl', '3'], 'News'], [['Ctrl', '4'], 'Profile'], [['Ctrl', ','], 'Settings'], [['Ctrl', 'J'], 'Downloads']],
  ['Actions', [['Ctrl', 'K'], 'Search your games'], [['Ctrl', 'N'], 'Add a game'], [['Ctrl', 'Enter'], 'Play the game on screen'], [['Alt', '←'], 'Back'], [['Esc'], 'Close'], [['?'], 'This list']],
  ['Moving around', [['←', '↑', '→', '↓'], 'Move between games and buttons'], [['Enter'], 'Open'], [['Tab'], 'Next control']],
  ['Controller', [['D-pad'], 'Move'], [['A'], 'Open / press'], [['B'], 'Back / close'], [['X'], 'Play'], [['Y'], 'Search'], [['LB', 'RB'], 'Switch page'], [['Menu'], 'Settings']],
];
function openKeys() {
  $('#kBody').innerHTML = SHORTCUTS.map(([h, ...rows]) => `<div><h4>${h}</h4>${rows.map(([k, t]) => `<div class="k-row"><span>${k.map((x) => `<kbd>${esc(x)}</kbd>`).join('')}</span><small>${esc(t)}</small></div>`).join('')}</div>`).join('');
  modal('#keys', true);
}
$('#kClose').onclick = () => modal('#keys', false);
const typing = (el) => !!el && !!el.matches && (el.matches('input:not([type=checkbox]), textarea, select') || el.isContentEditable);
const PAGES = ['home', 'all', 'news', 'profile'];
function playOnScreen() {
  if (state.view === 'game') { $('#playBtn').click(); return true; }
  if (state.view === 'store') { $('#sgInstall').click(); return true; }
  return false;
}
document.addEventListener('keydown', (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (!$('#onb').hidden && !ctrl) { if (e.key === 'Escape') e.preventDefault(); if (/^Arrow/.test(e.key) && !typing(e.target)) { e.preventDefault(); move(e.key.slice(5).toLowerCase()); } return; }
  if (ctrl && (e.key === 'k' || e.key === 'K' || e.key === 'f' || e.key === 'F')) { e.preventDefault(); openSearch(); return; }
  if (ctrl && /^[1-4]$/.test(e.key)) { e.preventDefault(); closeTop(); go(PAGES[+e.key - 1]); return; }
  if (ctrl && e.key === ',') { e.preventDefault(); closeTop(); openSettings(); return; }
  if (ctrl && (e.key === 'j' || e.key === 'J')) { e.preventDefault(); $('#dlBtn').click(); return; }
  if (ctrl && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); addDialog(); return; }
  if (ctrl && e.key === 'Enter') { e.preventDefault(); playOnScreen(); return; }
  if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); back(); return; }
  if (typing(e.target)) return;
  if (e.key === '?' || (e.shiftKey && e.key === '/')) { e.preventDefault(); openKeys(); return; }
  if (e.key === 'Backspace' && !topLayer()) { e.preventDefault(); back(); return; }
  if (/^Arrow/.test(e.key) && !e.altKey) { if (move(e.key.slice(5).toLowerCase())) e.preventDefault(); return; }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[tabindex]:not(button):not(input), [role=button]:not(button)')) { e.preventDefault(); e.target.click(); }
});

/* ---------------- moving focus by direction (arrow keys, D-pad) ---------------- */
const FOCUSABLE = 'button:not([disabled]), [tabindex="0"], input:not([type=hidden]), select, textarea, summary, a[href]';
function candidates() {
  const root = topLayer() || document;
  return [...root.querySelectorAll(FOCUSABLE)].filter((el) => {
    if (el.closest('[hidden]') || el.closest('.splash')) return false;
    if (root === document && (el.closest('.modal-bg') || el.closest('.drawer:not(.open)') || el.closest('#searchPop') || el.closest('.onb'))) return false;
    const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== 'hidden';
  });
}
function move(dir) {
  const list = candidates(); if (!list.length) return false;
  const cur = document.activeElement && list.includes(document.activeElement) ? document.activeElement : null;
  if (!cur) { const first = list.find((el) => el.closest('#main') && el.matches('.av-card, .tile-g, .side-item, .pf-card, #playBtn, .btn-solid')) || list[0]; focusEl(first); return true; }
  const a = navRect(cur), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bestD = Infinity;
  for (const el of list) {
    if (el === cur) continue;
    // up / down stays on its side of the window (sidebar or page)
    if ((dir === 'up' || dir === 'down') && !!el.closest('.rail') !== !!cur.closest('.rail')) continue;
    const r = navRect(el), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const dx = x - ax, dy = y - ay;
    const main = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy;
    const side = dir === 'right' || dir === 'left' ? Math.abs(dy) : Math.abs(dx);
    // must actually be in that direction, and overlap the row / column when possible
    const edge = dir === 'right' ? r.left >= a.right - 4 : dir === 'left' ? r.right <= a.left + 4 : dir === 'down' ? r.top >= a.bottom - 4 : r.bottom <= a.top + 4;
    if (main <= 0 || !edge) continue;
    const d = main + side * 2.2;
    if (d < bestD) { bestD = d; best = el; }
  }
  if (best) { focusEl(best); return true; }
  return false;
}
/* a game card is aimed at by its picture, so Down from a cover reaches its Play button */
function navRect(el) { const img = el.matches('.av-card, .pf-card') && el.querySelector('.av-img, .im'); return (img || el).getBoundingClientRect(); }
function focusEl(el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: document.documentElement.classList.contains('reduce') ? 'auto' : 'smooth' }); }

/* ---------------- controller ---------------- */
const pad = { on: false, prev: [], held: {}, raf: 0, name: '' };
function padLoop() {
  const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(Boolean);
  if (!gp) { pad.raf = 0; return; }
  const t = performance.now();
  const pressed = gp.buttons.map((b) => b.pressed || b.value > 0.5);
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  const dirs = { up: pressed[12] || ay < -0.55, down: pressed[13] || ay > 0.55, left: pressed[14] || ax < -0.55, right: pressed[15] || ax > 0.55 };
  for (const [d, on] of Object.entries(dirs)) {
    if (!on) { delete pad.held[d]; continue; }
    const h = pad.held[d];
    if (!h) { pad.held[d] = { next: t + 380 }; padUsed(); move(d); } else if (t >= h.next) { h.next = t + 120; move(d); }
  }
  const down = (i) => pressed[i] && !pad.prev[i];
  if (down(0)) { padUsed(); const el = document.activeElement; if (el && el !== document.body) { if (el.matches('input[type=checkbox]')) el.click(); else el.click(); } else move('down'); }
  if (down(1)) { padUsed(); if (!closeTop()) back(); }
  if (down(2)) { padUsed(); playOnScreen(); }
  if (down(3)) { padUsed(); openSearch(); }
  if (down(4) || down(5)) { padUsed(); if (!topLayer()) { const i = PAGES.indexOf(state.view); go(PAGES[(Math.max(0, i) + (down(5) ? 1 : PAGES.length - 1)) % PAGES.length]); } }
  if (down(9)) { padUsed(); closeTop(); openSettings(); }
  // right stick scrolls the page
  const sy = gp.axes[3] || 0;
  if (Math.abs(sy) > 0.25) { const sc = document.querySelector('.view:not([hidden]) .st-body') || ($('#main').scrollHeight > $('#main').clientHeight ? $('#main') : document.querySelector('.view:not([hidden])')); if (sc) sc.scrollTop += sy * 18; }
  pad.prev = pressed;
  pad.raf = requestAnimationFrame(padLoop);
}
function padUsed() {
  if (!document.documentElement.classList.contains('pad')) {
    document.documentElement.classList.add('pad');
    $('#padHint').innerHTML = '<span><kbd>A</kbd>Open</span><span><kbd>B</kbd>Back</span><span><kbd>X</kbd>Play</span><span><kbd>Y</kbd>Search</span><span><kbd>LB</kbd><kbd>RB</kbd>Pages</span>';
    $('#padHint').hidden = false;
  }
}
window.addEventListener('mousemove', () => { if (document.documentElement.classList.contains('pad')) { document.documentElement.classList.remove('pad'); $('#padHint').hidden = true; } });
window.addEventListener('gamepadconnected', (e) => { pad.name = e.gamepad.id.replace(/\s*\(.*$/, ''); toast(`Controller connected${pad.name ? ' · ' + pad.name : ''}`); paintPadState(); if (!pad.raf) pad.raf = requestAnimationFrame(padLoop); });
window.addEventListener('gamepaddisconnected', () => { toast('Controller disconnected'); pad.name = ''; paintPadState(); document.documentElement.classList.remove('pad'); $('#padHint').hidden = true; });
function paintPadState() {
  const on = [...(navigator.getGamepads ? navigator.getGamepads() : [])].some(Boolean);
  $('#sPad').textContent = on ? `${pad.name || 'Controller'} is ready. D-pad to move, A to open, B to go back.` : 'Plug in or turn on a controller and press any button.';
  $('#sPadTag').textContent = on ? 'Connected' : 'Not connected'; $('#sPadTag').className = on ? 'tag-ok' : 'tag-off';
}

/* ---------------- offline ---------------- */
function paintNet() { $('#netPill').hidden = navigator.onLine; }
window.addEventListener('online', () => { paintNet(); toast('Back online'); if (renderers.home && state.view === 'home') renderers.home(true); });
window.addEventListener('offline', paintNet);
paintNet();

/* ---------------- Settings: accessibility, backups, help ---------------- */
function paintMotionSeg() { const v = (lib.settings && lib.settings.reduceMotion) || 'system'; $('#sMotion').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === v)); }
$('#sMotion').querySelectorAll('button').forEach((b) => { b.onclick = async () => { lib.settings.reduceMotion = b.dataset.v; paintMotionSeg(); applyMotion(); await nf.set('reduceMotion', b.dataset.v); }; });
$('#sSounds').onchange = (e) => { nf.set('sounds', e.target.checked); if (e.target.checked) chime(); };
$('#sKeys').onclick = openKeys;
$('#sNew').onclick = () => openWhatsNew(false);
$('#sTour').onclick = () => startTour();
$('#sPrivacy').onclick = () => nf.openLink('https://github.com/KYOO-DEVV/nightfall-launcher/blob/main/PRIVACY.md');
$('#sIssue').onclick = () => nf.openIssue();
$('#sLogs').onclick = () => nf.openLogs();
$('#sRep').onclick = () => busy($('#sRep'), async () => {
  try { const name = await nf.report($('#sRepTxt').value); toast(`Report saved to Downloads · ${name}`); $('#sRepTxt').value = ''; } catch (e) { toast("Couldn't save the report: " + e); }
});
const size = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
async function paintBackups() {
  const list = await nf.backups().catch(() => []);
  $('#sBkSum').textContent = list.length ? `Last backup ${ago(list[0].at)} · ${list.length} ${list.length === 1 ? 'copy' : 'copies'} kept` : 'No backups yet. The first one is made today.';
  $('#sBkList').innerHTML = list.slice(0, 10).map((b) => `<div class="bk"><span class="ic">${ICON.hdd}</span><div><b>${esc(new Date(b.at).toLocaleString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</b><small>${size(b.size)}</small></div><button class="btn btn-ghost sm" data-n="${esc(b.name)}"><span>Restore</span></button></div>`).join('');
  $('#sBkList').querySelectorAll('[data-n]').forEach((btn) => {
    btn.onclick = async () => {
      if (!btn.classList.contains('confirm')) { btn.classList.add('confirm'); btn.firstElementChild.textContent = 'Click again to restore'; setTimeout(() => { btn.classList.remove('confirm'); btn.firstElementChild.textContent = 'Restore'; }, 4000); return; }
      try { await nf.backupRestore(btn.dataset.n); toast('Backup restored · what you had before was saved as a backup too'); paintBackups(); } catch (e) { toast(String(e)); }
    };
  });
}
$('#sBkNow').onclick = () => busy($('#sBkNow'), async () => { const n = await nf.backupNow(); toast(n ? 'Backup saved' : "Couldn't save a backup"); paintBackups(); });
const baseOpenSettings = openSettings;
// eslint-disable-next-line no-global-assign
openSettings = async (section) => {
  await baseOpenSettings(section);
  $('#sSounds').checked = !!(lib.settings && lib.settings.sounds);
  paintMotionSeg(); paintPadState(); paintBackups();
};

/* keep the motion class in step with the setting */
const baseChrome = renderers.chrome;
renderers.chrome = () => { if (baseChrome) baseChrome(); applyMotion(); };
