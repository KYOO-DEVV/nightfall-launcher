/* global nf, state, $, esc, bgu, renderers, achHtml, showShot */
// 2.7: store pages for games you haven't installed show your achievements, your old screenshots and the space they need.

renderers.storeExtras = async (o, info) => {
  const steam = o.store === 'steam' && o.appid;
  const [ach, shots, disk] = await Promise.all([
    steam ? nf.achievements(o.appid).catch(() => null) : null,
    nf.ownedShots(o.appid, o.name).catch(() => []),
    info.size ? nf.driveFree(o.store).catch(() => null) : null,
  ]);
  if (state.store !== o || state.view !== 'store') return;

  // space needed, and what's free on the drive it installs to
  if (info.size) {
    const gb = disk ? disk.free / 1073741824 : 0;
    const need = parseFloat(info.size) || 0;
    const tight = disk && need && gb < need;
    $('#sgSize').innerHTML = `<b>Needs about ${esc(info.size)}</b>${disk ? `<span class="${tight ? 'low' : ''}">${gb >= 100 ? Math.round(gb) : gb.toFixed(1)} GB free on ${esc(disk.drive)}</span>` : ''}`;
    $('#sgSize').hidden = false;
  }

  // achievements you already earned (Steam keeps them on this PC)
  if (ach && ach.total) {
    $('#sgStats').insertAdjacentHTML('beforeend', `<div class="hstat"><div class="v"><span>${ach.unlocked}/${ach.total}</span></div><div class="k">Achievements</div></div>`);
    $('#sgAchSub').textContent = `${Math.round((ach.unlocked / ach.total) * 100)}% · Steam`;
    $('#sgAch').innerHTML = achHtml(ach);
    $('#sgAchPanel').hidden = false;
    $('#sgDetail').dataset.n = 3;
  }

  // your own screenshots come first, then the store's
  if (shots.length) {
    const box = $('#sgShots');
    box.querySelector('.msg')?.remove(); box.querySelectorAll('.skel-shot').forEach((x) => x.remove());
    const mine = shots.slice(0, 3).map((s) => `<button class="mine" style="background-image:${bgu(s.url)}" data-u="${esc(s.url)}" aria-label="Screenshot"><i>Yours</i></button>`).join('');
    box.insertAdjacentHTML('afterbegin', mine);
    [...box.children].slice(6).forEach((x) => x.remove());
    box.querySelectorAll('.mine').forEach((b) => { b.onclick = () => showShot(b.dataset.u); });
  }
};
