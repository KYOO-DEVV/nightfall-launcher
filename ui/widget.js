// The small always-on-top session timer.
(() => {
  const T = window.__TAURI__;
  let game = null;
  const pick = (lib) => lib.games.filter((g) => g.open).sort((a, b) => b.open.s - a.open.s)[0] || null;
  const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  function paint(lib) {
    game = pick(lib);
    if (!game) return;
    const fr = lib.settings && (lib.settings.language === 'fr' || (lib.settings.language !== 'en' && /^fr/i.test(navigator.language)));
    document.getElementById('nm').textContent = (game.live ? game.live.name : game.name) + (fr ? ' · en jeu' : ' · playing');
    const ic = game.art.icon || game.art.cover;
    document.getElementById('ic').style.backgroundImage = ic ? `url('${ic.replace(/'/g, '%27')}')` : '';
    document.getElementById('x').title = fr ? 'Désactiver le chrono' : 'Turn off the session timer';
  }
  const tick = () => { if (game) document.getElementById('tm').textContent = clock(Date.now() - (game.live ? game.live.since : game.open.s)); };
  T.core.invoke('lib_get').then((l) => { paint(l); tick(); });
  T.event.listen('lib:changed', (e) => { paint(e.payload); tick(); });
  setInterval(tick, 1000);
  document.getElementById('x').onclick = () => T.core.invoke('widget_close');
  document.addEventListener('contextmenu', (e) => e.preventDefault());
})();
