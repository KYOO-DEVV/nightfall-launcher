/* global nf, state, $, toast, renderers, featured, go, P, ICON */
// Video: the game page's hero becomes the game's trailer (YouTube's privacy-enhanced player, muted until you turn the sound on).
const trailer = { gid: null, ids: [], i: 0, wrap: null, muted: true, cache: {}, t: 0 };
const SPEAKER = P('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>');
const SPEAKER_OFF = P('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>');
function ytSend(func, args = []) {
  const f = trailer.wrap && trailer.wrap.querySelector('iframe');
  if (f && f.contentWindow) f.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
}
/* cover the hero like a background picture, cropping YouTube's edges */
function sizeVideo() {
  const w = trailer.wrap; if (!w) return;
  const r = w.getBoundingClientRect();
  const vw = Math.max(r.width, (r.height * 16) / 9) * 1.08;
  w.style.setProperty('--vw', vw + 'px'); w.style.setProperty('--vh', (vw * 9) / 16 + 'px');
}
window.addEventListener('resize', sizeVideo);
function mountVideo() {
  const id = trailer.ids[trailer.i];
  if (trailer.wrap) trailer.wrap.remove();
  const w = document.createElement('div'); w.className = 'hero-video';
  const f = document.createElement('iframe');
  f.allow = 'autoplay; encrypted-media; picture-in-picture'; f.referrerPolicy = 'strict-origin-when-cross-origin'; f.tabIndex = -1; f.title = 'Trailer';
  f.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&controls=0&loop=1&playlist=${id}&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&disablekb=1&fs=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
  f.onload = () => { try { f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*'); } catch { /* not ready yet */ } };
  w.appendChild(f); $('#heroArt').after(w); trailer.wrap = w; sizeVideo();
  // shown once it really plays; if YouTube never says so, show it anyway
  clearTimeout(trailer.t); trailer.t = setTimeout(() => w.classList.add('on'), 3500);
}
async function startVideo() {
  const g = featured(); if (!g) return;
  const btn = $('#vidBtn');
  btn.classList.add('busy');
  let ids = trailer.cache[g.id];
  if (!ids) { ids = await nf.trailer(g.name).catch(() => []); trailer.cache[g.id] = ids; }
  btn.classList.remove('busy');
  if ((featured() || {}).id !== g.id || state.view !== 'game') return;
  if (!ids.length) { toast("Couldn't find a trailer for this game"); return; }
  Object.assign(trailer, { gid: g.id, ids, i: 0, muted: true });
  mountVideo(); paintVideoBtns();
}
function stopVideo() {
  clearTimeout(trailer.t);
  if (trailer.wrap) { const w = trailer.wrap; w.classList.remove('on'); setTimeout(() => w.remove(), 700); }
  trailer.wrap = null; trailer.gid = null; paintVideoBtns();
}
function paintVideoBtns() {
  const on = !!trailer.wrap;
  $('#vidTxt').textContent = on ? 'Stop video' : 'Video';
  $('#vidBtn').querySelector('.ic').innerHTML = on ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>' : ICON.play;
  $('#vidBtn').classList.toggle('on', on);
  $('#vidMute').hidden = !on;
  $('#vidMute').innerHTML = trailer.muted ? SPEAKER_OFF : SPEAKER;
  $('#vidMute').setAttribute('aria-label', trailer.muted ? 'Turn the sound on' : 'Mute');
  $('#vidMute').title = $('#vidMute').getAttribute('aria-label');
  $('#hero').classList.toggle('playing', on);
}
$('#vidBtn').onclick = () => (trailer.wrap ? stopVideo() : startVideo());
$('#vidMute').onclick = () => {
  trailer.muted = !trailer.muted;
  ytSend(trailer.muted ? 'mute' : 'unMute');
  if (!trailer.muted) ytSend('setVolume', [60]);
  paintVideoBtns();
};
window.addEventListener('message', (e) => {
  if (e.origin !== 'https://www.youtube-nocookie.com' || !trailer.wrap) return;
  let d; try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
  if (!d) return;
  const playing = (d.event === 'infoDelivery' && d.info && d.info.playerState === 1) || (d.event === 'onStateChange' && d.info === 1);
  if (d.event === 'onError') {
    // this one can't be embedded: try the next search result
    if (++trailer.i < trailer.ids.length) mountVideo(); else { stopVideo(); toast("This game's trailer can't be played here"); }
  } else if (playing) { clearTimeout(trailer.t); trailer.wrap.classList.add('on'); }
});
// another game or another page: back to the picture
const baseGameVid = renderers.game;
renderers.game = (force) => { const g = featured(); if (trailer.wrap && (!g || g.id !== trailer.gid)) stopVideo(); return baseGameVid(force); };
const baseGoVid = go;
// eslint-disable-next-line no-global-assign
go = (view) => { if (view !== 'game' && trailer.wrap) stopVideo(); return baseGoVid(view); };
