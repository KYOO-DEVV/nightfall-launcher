/* global nf, lib, state, $, esc, toast, renderers, go, STORE_LABEL, ICON */
// Settings page (its own view, with a section list on the left), Discord status and the update banner.

const DISCORD_TEXT = {
  off: 'Off',
  noid: 'Add your Discord Application ID below to turn it on.',
  waiting: 'Waiting for Discord. Make sure the Discord desktop app is open.',
  on: 'Connected to Discord',
};
function discordText(s) {
  if (DISCORD_TEXT[s]) return DISCORD_TEXT[s];
  if (/^error:/.test(s || '')) {
    const m = s.slice(6);
    if (/invalid client id/i.test(m)) return "Discord says this isn't a valid Application ID. Copy the Application ID from your app's General Information page, not your user ID, server ID or Public Key.";
    return 'Discord: ' + m;
  }
  return '—';
}
const STORE_COLOR = { steam: 'linear-gradient(150deg,#1e3a5c,#111d2b)', epic: 'linear-gradient(150deg,#3a3a3a,#161616)', gog: 'linear-gradient(150deg,#7b3fc4,#3d1d66)', amazon: 'linear-gradient(150deg,#2c3c52,#141c27)', itch: 'linear-gradient(150deg,#ff6b6b,#c43c3c)' };
const STORE_MARK = { steam: 'S', epic: 'E', gog: 'G', amazon: 'a', itch: 'i' };

async function openSettings(section) {
  go('settings');
  const s = await nf.settings();
  $('#sAutoAdd').checked = s.autoAddInstalled !== false;
  $('#sDiscord').checked = !!s.discordEnabled;
  $('#sIdle').checked = !!s.discordIdle;
  $('#sClientId').value = s.discordClientId || '';
  $('#sSteamKey').value = s.steamApiKey || '';
  $('#sLogin').checked = !!s.startWithWindows;
  $('#sTray').checked = s.closeToTray !== false;
  $('#sFilters').checked = !!s.showFilters;
  paintIconChoice(s.settingsIcon || 'cog');
  renderSettingsLive();
  if (typeof section === 'string') jumpTo(section);
  renderStores();
  renderFriendsState();
}
renderers.openSettings = (focus) => openSettings(focus === '#sSteamKey' ? 'accounts' : focus);
renderers.settings = () => renderSettingsLive();

async function renderStores() {
  if (!state.owned) { $('#sStores').innerHTML = '<div class="st-acct"><div class="st-acct-tx"><b>Looking for your stores…</b></div></div>'; try { state.owned = await nf.owned(false); } catch { state.owned = { accounts: [], games: [] }; } }
  const acc = state.owned.accounts || [];
  const p = lib.profile || {};
  $('#sStores').innerHTML = ['steam', 'epic', 'gog', 'amazon', 'itch'].map((k) => {
    const a = acc.find((x) => x.store === k);
    const who = a && k === 'steam' ? `Signed in as <b>${esc(a.name)}</b> · ` : '';
    const mark = k === 'steam' && a && p.avatar && !p.customAvatar ? `<img src="${esc(p.avatar)}" alt="">` : STORE_MARK[k];
    return `<div class="st-acct ${a ? 'ok' : 'off'}"><span class="st-logo" style="background:${STORE_COLOR[k]}">${mark}</span>
      <div class="st-acct-tx"><b>${STORE_LABEL[k]}</b><small>${a ? `${who}${a.games} games · found automatically` : `Not on this PC. Sign in to the ${STORE_LABEL[k]} app once and it's picked up by itself.`}</small></div>
      ${a ? '<span class="tag-ok">Connected</span>' : '<span class="tag-off">Not found</span>'}</div>`;
  }).join('');
}
async function renderFriendsState(force) {
  const st = $('#sFriendsState'), tag = $('#sFriendsTag');
  const r = await nf.friends(!!force).catch(() => ({ error: 'Something went wrong.' }));
  const set = (text, label, ok) => { st.textContent = text; tag.textContent = label; tag.className = ok ? 'tag-ok' : 'tag-off'; };
  if (r.error === 'nosteam') return set('Sign in to the Steam app on this PC to see your friends.', 'Not available');
  if (r.error === 'nofriends') return set('No friends found in your Steam app yet.', 'Automatic');
  if (r.error) return set(r.error, 'Error');
  const f = r.friends || [];
  set(`${f.length} friends · ${f.filter((x) => x.state !== 'offline' && x.state !== 'unknown').length} online now · ${r.via === 'key' ? 'read with your API key' : 'read from your Steam app, no key needed'}`, r.via === 'key' ? 'API key' : 'Automatic', true);
}
function renderSettingsLive() {
  if (state.view !== 'settings') return;
  $('#sDiscordState').textContent = discordText(lib.presence);
  $('#sDiscordState').classList.toggle('err', /^error:/.test(lib.presence || ''));
  $('#sDiscordState').classList.toggle('ok', lib.presence === 'on');
  $('#sVersion').textContent = 'Nightfall ' + (lib.version || '');
  $('#sVersionSide').textContent = 'Nightfall ' + (lib.version || '');
  const u = lib.update || {};
  $('#sUpdate').textContent = ({ dev: 'Updates are off in development builds.', checking: 'Checking for updates…', latest: "You're on the latest version.",
    available: `Version ${u.version} is available.`, downloading: `Downloading ${u.version || 'update'}… ${u.percent || 0}%`,
    error: "Couldn't check for updates. Try again later.", idle: 'Checks automatically every 6 hours.' })[u.state] || '—';
}

/* section list ↔ scroll position */
function jumpTo(sec) {
  const el = $('#st-' + sec); if (!el) return;
  $('#stBody').scrollTo({ top: el.offsetTop - 28, behavior: 'smooth' });
  markNav(sec);
}
function markNav(sec) { $('#stNav').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.s === sec)); }
$('#stNav').querySelectorAll('button').forEach((b) => { b.onclick = () => jumpTo(b.dataset.s); });
$('#stBody').addEventListener('scroll', () => {
  const body = $('#stBody'); let cur = 'accounts';
  body.querySelectorAll('.st-sec').forEach((s) => { if (s.offsetTop - 80 <= body.scrollTop) cur = s.id.slice(3); });
  if (body.scrollTop + body.clientHeight >= body.scrollHeight - 4) cur = [...body.querySelectorAll('.st-sec')].pop().id.slice(3);
  markNav(cur);
});

$('#settingsBtn').onclick = () => (state.view === 'settings' ? go('home') : openSettings());
$('#sAutoAdd').onchange = (e) => nf.set('autoAddInstalled', e.target.checked);
$('#sDiscord').onchange = (e) => nf.set('discordEnabled', e.target.checked);
$('#sIdle').onchange = (e) => nf.set('discordIdle', e.target.checked);
$('#sClientId').onchange = (e) => { nf.set('discordClientId', e.target.value.trim()); toast('Discord Application ID saved'); };
$('#sTest').onclick = async () => {
  await nf.set('discordClientId', $('#sClientId').value.trim());
  if (!$('#sDiscord').checked) { $('#sDiscord').checked = true; await nf.set('discordEnabled', true); }
  await nf.testPresence();
  toast('Test sent. Check your Discord profile in the next 20 seconds');
};
$('#sDevLink').onclick = () => nf.openLink('https://discord.com/developers/applications');
$('#sKeyLink').onclick = () => nf.openLink('https://steamcommunity.com/dev/apikey');
$('#sSteamKey').onchange = async (e) => {
  await nf.set('steamApiKey', e.target.value.trim());
  $('#sFriendsState').textContent = 'Checking…';
  await renderFriendsState(true);
  if (renderers.home) renderers.home(true);
};
function paintIconChoice(v) {
  $('#sSetIcon').querySelectorAll('button').forEach((b) => { if (b.dataset.v !== 'none' && !b.innerHTML) b.innerHTML = ICON[b.dataset.v]; b.classList.toggle('on', b.dataset.v === v); });
}
$('#sFilters').onchange = (e) => nf.set('showFilters', e.target.checked);
$('#sSetIcon').querySelectorAll('button').forEach((b) => { b.onclick = async () => { paintIconChoice(b.dataset.v); await nf.set('settingsIcon', b.dataset.v); }; });
$('#sLogin').onchange = (e) => nf.set('startWithWindows', e.target.checked);
$('#sTray').onchange = (e) => nf.set('closeToTray', e.target.checked);
$('#sCheck').onclick = async () => { const err = await nf.checkUpdate(); if (err) toast(err); };

/* update banner */
function renderUpdateBar() {
  const u = lib.update || {};
  const show = u.state === 'available' || u.state === 'downloading';
  $('#updBar').hidden = !show;
  if (!show) return;
  $('#updTxt').textContent = u.state === 'available' ? `Nightfall ${u.version} is available.` : `Downloading Nightfall ${u.version}… ${u.percent || 0}%`;
  $('#updGo').hidden = u.state !== 'available';
}
$('#updGo').onclick = () => { nf.installUpdate().catch((e) => toast(String(e))); };

renderers.chrome = () => { renderUpdateBar(); renderSettingsLive(); };
