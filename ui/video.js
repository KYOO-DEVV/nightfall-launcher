/* global nf, state, $, toast, renderers, featured, go, P, ICON */
// Video: a game's trailer plays where its picture is (YouTube's privacy-enhanced player, muted until you turn the sound on).
// One trailer plays at a time, in one of three places: a game's page, a store page, or the Continue card on Home.
const trailer = { place: null, key: null, ids: [], i: 0, wrap: null, muted: true, cache: {}, t: 0 };
const SPEAKER = P('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>');
const SPEAKER_OFF = P('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>');
const STOP_ICON = '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>';
function ytSend(func, args = []) {
  const f = trailer.wrap && trailer.wrap.querySelector('iframe');
  if (f && f.contentWindow) f.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
}
/* cover the box like a background picture, cropping YouTube's edges */
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
  w.appendChild(f); trailer.place.mount(w); trailer.wrap = w; sizeVideo();
  // shown once it really plays; if YouTube never says so, show it anyway
  clearTimeout(trailer.t); trailer.t = setTimeout(() => w.classList.add('on'), 3500);
}
/* paints one place's Video and sound buttons */
function paintVidButtons(btn, mute, on) {
  if (btn) {
    const tx = btn.querySelector('span:not(.ic)'); if (tx) tx.textContent = on ? 'Stop video' : 'Video';
    const ic = btn.querySelector('.ic'); if (ic) ic.innerHTML = on ? STOP_ICON : ICON.play;
    btn.classList.toggle('on', on);
  }
  if (mute) {
    mute.hidden = !on;
    mute.innerHTML = trailer.muted ? SPEAKER_OFF : SPEAKER;
    mute.setAttribute('aria-label', trailer.muted ? 'Turn the sound on' : 'Mute');
    mute.title = mute.getAttribute('aria-label');
  }
}
const PLACES = {
  game: {
    view: 'game', btn: () => $('#vidBtn'),
    key: () => (featured() || {}).id, name: () => (featured() || {}).name,
    mount: (w) => $('#heroArt').after(w),
    paint: (on) => { paintVidButtons($('#vidBtn'), $('#vidMute'), on); $('#hero').classList.toggle('playing', on); },
  },
  store: {
    view: 'store', btn: () => $('#sgVidBtn'),
    key: () => state.store && 's:' + state.store.id, name: () => state.store && state.store.name,
    mount: (w) => $('#sgArt').after(w),
    paint: (on) => { paintVidButtons($('#sgVidBtn'), $('#sgVidMute'), on); $('#sgDesc').classList.toggle('faded', on); },
  },
  home: {
    view: 'home', btn: () => $('#hmVid'),
    key: () => state.homeTop && 'h:' + state.homeTop.id, name: () => state.homeTop && state.homeTop.name,
    mount: (w) => $('#hmVideoSlot').appendChild(w),
    paint: (on) => { paintVidButtons($('#hmVid'), $('#hmMute'), on); $('#hmBanner').classList.toggle('playing', on); },
  },
};
function paintVideo() { for (const p of Object.values(PLACES)) p.paint(trailer.place === p && !!trailer.wrap); }
async function startVideo(place) {
  const key = place.key(), name = place.name(); if (!key || !name) return;
  if (trailer.wrap) stopVideo();
  const btn = place.btn(); if (btn) btn.classList.add('busy');
  let ids = trailer.cache[name];
  if (!ids) { ids = await nf.trailer(name).catch(() => []); trailer.cache[name] = ids; }
  const b2 = place.btn(); if (b2) b2.classList.remove('busy');
  if (place.key() !== key || state.view !== place.view) return;
  if (!ids.length) { toast("Couldn't find a trailer for this game"); return; }
  Object.assign(trailer, { place, key, ids, i: 0, muted: true });
  mountVideo(); paintVideo();
}
function stopVideo() {
  clearTimeout(trailer.t);
  if (trailer.wrap) { const w = trailer.wrap; w.classList.remove('on'); setTimeout(() => w.remove(), 700); }
  trailer.wrap = null; trailer.place = null; trailer.key = null; paintVideo();
}
const toggleVideo = (place) => (trailer.wrap && trailer.place === place ? stopVideo() : startVideo(place));
function toggleMute() {
  trailer.muted = !trailer.muted;
  ytSend(trailer.muted ? 'mute' : 'unMute');
  if (!trailer.muted) ytSend('setVolume', [60]);
  paintVideo();
}
$('#vidBtn').onclick = () => toggleVideo(PLACES.game);
$('#vidMute').onclick = toggleMute;
$('#sgVidBtn').onclick = () => toggleVideo(PLACES.store);
$('#sgVidMute').onclick = toggleMute;
renderers.homeVideo = () => toggleVideo(PLACES.home);
renderers.videoMute = toggleMute;
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
/* another game or another page: back to the picture */
const stale = (p) => trailer.wrap && trailer.place === p && p.key() !== trailer.key;
for (const [name, p] of [['game', PLACES.game], ['store', PLACES.store], ['home', PLACES.home]]) {
  const base = renderers[name];
  renderers[name] = (force) => {
    if (name !== 'home' && stale(p)) stopVideo();
    const r = base(force);
    // Home redraws its card: stop if the game on it changed, then repaint its buttons
    if (name === 'home') { if (stale(p)) stopVideo(); p.paint(trailer.place === p && !!trailer.wrap); }
    return r;
  };
}
const baseGoVid = go;
// eslint-disable-next-line no-global-assign
go = (view) => { if (trailer.wrap && trailer.place && view !== trailer.place.view) stopVideo(); return baseGoVid(view); };
