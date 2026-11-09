// Discord Rich Presence: shows the game you're in (and the Roblox experience / Minecraft instance) on your Discord profile.
// Needs your own Discord Application ID (Settings). Works only while the Discord desktop app is running.
const { Client } = require('@xhayper/discord-rpc');

let client = null, clientId = null, ready = false, last = '', retry = null;

async function connect(id) {
  if (client && clientId === id) return;
  await stop();
  clientId = id;
  client = new Client({ clientId: id, transport: { type: 'ipc' } });
  client.on('ready', () => { ready = true; last = ''; });
  client.on('disconnected', () => { ready = false; scheduleRetry(); });
  try { await client.login(); } catch { ready = false; scheduleRetry(); }
}
function scheduleRetry() {
  clearTimeout(retry);
  retry = setTimeout(() => { if (clientId) { const id = clientId; clientId = null; client = null; connect(id).catch(() => {}); } }, 30000);
}
async function stop() {
  clearTimeout(retry); ready = false; last = '';
  if (client) { try { await client.user?.clearActivity(); } catch {} try { await client.destroy(); } catch {} }
  client = null; clientId = null;
}

/* activity: { game, detail, image, detailImage, since, url } or null to clear */
async function update(settings, activity) {
  if (!settings.discordEnabled || !/^\d{15,22}$/.test(settings.discordClientId || '')) { if (client) await stop(); return { state: 'off' }; }
  await connect(settings.discordClientId);
  if (!ready) return { state: 'waiting' };
  const key = JSON.stringify(activity);
  if (key === last) return { state: 'on' };
  last = key;
  try {
    if (!activity) await client.user?.clearActivity();
    else {
      await client.user?.setActivity({
        details: activity.detail ? activity.game : 'Playing ' + activity.game,
        state: activity.detail || 'via Nightfall',
        startTimestamp: activity.since ? new Date(activity.since) : undefined,
        largeImageKey: (activity.detailImage || activity.image) || undefined,
        largeImageText: activity.detail || activity.game,
        smallImageKey: activity.detailImage && activity.image ? activity.image : undefined,
        smallImageText: activity.detailImage ? activity.game : undefined,
        buttons: activity.url ? [{ label: activity.detail ? 'Open experience' : 'View game', url: activity.url }] : undefined,
        instance: false,
      });
    }
  } catch { last = ''; }
  return { state: 'on' };
}

module.exports = { update, stop };
