/* global nf, lib, state, $, esc, toast, renderers, modal, STORE_LABEL */
// Settings, Discord status, update banner.

const DISCORD_TEXT = {
  off: 'Off',
  noid: 'Paste your Discord Application ID below to turn it on.',
  waiting: "Waiting for Discord… make sure the Discord desktop app is open.",
  on: 'Connected to Discord ✓',
};
function discordText(s) {
  if (DISCORD_TEXT[s]) return DISCORD_TEXT[s];
  if (/^error:/.test(s || '')) {
    const m = s.slice(6);
    if (/invalid client id/i.test(m)) return "Discord says this isn't a valid Application ID. Copy the Application ID from your app's General Information page — not your user ID, server ID or Public Key.";
    return 'Discord: ' + m;
  }
  return '—';
}
async function openSettings(focus) {
  modal('#settings', true);
  const s = await nf.settings();
  $('#sAutoAdd').checked = s.autoAddInstalled !== false;
  $('#sDiscord').checked = !!s.discordEnabled;
  $('#sIdle').checked = !!s.discordIdle;
  $('#sClientId').value = s.discordClientId || '';
  $('#sSteamKey').value = s.steamApiKey || '';
  $('#sLogin').checked = !!s.startWithWindows;
  $('#sTray').checked = s.closeToTray !== false;
  renderSettingsLive();
  if (focus) setTimeout(() => $(focus).focus(), 50);
  if (!state.owned) { try { state.owned = await nf.owned(false); } catch { state.owned = { accounts: [], games: [] }; } }
  const acc = state.owned.accounts || [];
  $('#sStores').innerHTML = ['steam', 'epic', 'gog', 'amazon', 'itch'].map((k) => {
    const a = acc.find((x) => x.store === k);
    return `<div class="s-row"><div><b>${STORE_LABEL[k]}</b><small>${a ? (k === 'steam' ? `Signed in as ${esc(a.name)} · ` : '') + `${a.games} games · read from the ${STORE_LABEL[k]} app on this PC` : `Not found. Sign in to the ${STORE_LABEL[k]} app on this PC once, then reopen Settings.`}</small></div>${a ? '<span class="tag-ok">Connected</span>' : '<span class="tag-off">Not found</span>'}</div>`;
  }).join('');
}
renderers.openSettings = openSettings;
function renderSettingsLive() {
  if ($('#settings').hidden) return;
  $('#sDiscordState').textContent = discordText(lib.presence);
  $('#sDiscordState').classList.toggle('err', /^error:/.test(lib.presence || ''));
  $('#sVersion').textContent = 'Nightfall ' + (lib.version || '');
  const u = lib.update || {};
  $('#sUpdate').textContent = ({ dev: 'Updates are off in development.', checking: 'Checking for updates…', latest: "You're on the latest version.",
    available: `Version ${u.version} is available.`, downloading: `Downloading ${u.version || 'update'}… ${u.percent || 0}%`,
    error: "Couldn't check for updates. Try again later.", idle: 'Checks automatically every 6 hours.' })[u.state] || '—';
}
$('#settingsBtn').onclick = () => openSettings();
$('#sClose').onclick = () => modal('#settings', false);
$('#sAutoAdd').onchange = (e) => nf.set('autoAddInstalled', e.target.checked);
$('#sDiscord').onchange = (e) => nf.set('discordEnabled', e.target.checked);
$('#sIdle').onchange = (e) => nf.set('discordIdle', e.target.checked);
$('#sClientId').onchange = (e) => { nf.set('discordClientId', e.target.value.trim()); toast('Discord Application ID saved'); };
$('#sTest').onclick = async () => {
  await nf.set('discordClientId', $('#sClientId').value.trim());
  if (!$('#sDiscord').checked) { $('#sDiscord').checked = true; await nf.set('discordEnabled', true); }
  await nf.testPresence();
  toast('Sent a test: look at your Discord profile for the next 20 seconds');
};
$('#sDevLink').onclick = () => nf.openLink('https://discord.com/developers/applications');
$('#sKeyLink').onclick = () => nf.openLink('https://steamcommunity.com/dev/apikey');
$('#sSteamKey').onchange = async (e) => {
  await nf.set('steamApiKey', e.target.value.trim());
  $('#sFriendsState').textContent = 'Checking your key…';
  const r = await nf.friends(true).catch(() => ({ error: 'Something went wrong.' }));
  $('#sFriendsState').textContent = r.error === 'nokey' ? 'Your key stays on this PC and is only sent to Steam.' : r.error ? r.error : `Working · ${r.friends.length} friends found.`;
  if (state.view === 'home') renderers.home(true);
};
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
