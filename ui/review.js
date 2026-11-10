/* global nf, lib, state, $, esc, bgu, artBg, fmt, hours, heroOf, coverOf, fallbackBg, gameById, ICON, renderers, loadDetail, DAY, now */
// Year in review — one screen, like a poster.

const DOW = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* the numbers, shared with the share card */
async function yearStats() {
  const Y = new Date().getFullYear(), a = new Date(Y, 0, 1).getTime(), b = new Date(Y + 1, 0, 1).getTime();
  // Roblox / Minecraft: their own logs go back further than Nightfall, so they replace the tracked sessions
  const extra = [], logPlays = {};
  for (const g of lib.games.filter((x) => x.detail)) {
    const d = await loadDetail(g).catch(() => null);
    if (!d) continue;
    if (d.plays && d.plays.length) logPlays[g.id] = d.plays;
    const top = d.items.map((i) => ({ ...i, ms: (d.plays || []).filter((p) => p.key === i.key && p.e > a).reduce((t, p) => t + p.e - Math.max(p.s, a), 0) })).sort((x, y) => y.ms - x.ms)[0];
    if (top && top.ms > 0) extra.push({ g, kind: d.kind, top });
  }
  const plays = [];
  for (const g of lib.games) {
    const src = logPlays[g.id] || g.sessions.concat(g.open ? [{ s: g.open.s, e: now() }] : []);
    for (const s of src) if (s.e > a && s.s < b) plays.push({ g, s: Math.max(s.s, a), e: Math.min(s.e, b) });
  }
  const totalMs = plays.reduce((t, p) => t + p.e - p.s, 0);
  const byGame = {};
  for (const p of plays) byGame[p.g.id] = (byGame[p.g.id] || 0) + (p.e - p.s);
  const ranked = Object.entries(byGame).map(([id, ms]) => ({ g: gameById(id), ms })).filter((x) => x.g).sort((x, y) => y.ms - x.ms);
  const months = [...Array(12)].map((_, m) => plays.reduce((t, p) => t + Math.max(0, Math.min(p.e, new Date(Y, m + 1, 1).getTime()) - Math.max(p.s, new Date(Y, m, 1).getTime())), 0));
  const dow = Array(7).fill(0), byDay = {}; let night = 0;
  for (const p of plays) {
    const d = new Date(p.s); dow[(d.getDay() + 6) % 7] += p.e - p.s;
    const k = d.toDateString(); byDay[k] = (byDay[k] || 0) + p.e - p.s;
    if (d.getHours() >= 22 || d.getHours() < 5) night += p.e - p.s;
  }
  const busiest = Object.entries(byDay).sort((x, y) => y[1] - x[1])[0];
  const longest = plays.reduce((m, p) => (p.e - p.s > (m ? m.e - m.s : 0) ? p : m), null);
  const first = plays.reduce((m, p) => Math.min(m, p.s), Infinity);
  return { Y, a, plays, totalMs, ranked, months, dow, busiest, longest, first, night, extra };
}

renderers.review = async () => {
  const el = $('#reviewView');
  const s = await yearStats();
  if (state.view !== 'review') return;
  const { Y, a, plays, totalMs, ranked, months, dow, busiest, longest, first, night, extra } = s;
  const favDow = dow.indexOf(Math.max(...dow));
  const mmax = Math.max(...months, 1);
  const top = ranked[0];
  const heroBg = top ? heroOf(top.g) : null;
  if (!state.owned) { try { state.owned = await nf.owned(false); } catch { state.owned = { games: [] }; } }
  const steamTop = (state.owned.games || []).filter((x) => x.playMin).sort((x, y) => y.playMin - x.playMin).slice(0, 4);
  const fact = (k, v, sub) => `<div class="panel rv-fact"><small>${k}</small><b>${v}</b><span>${sub}</span></div>`;
  el.innerHTML = `
    <div class="rv-card rv-main" style="${heroBg ? `background-image:linear-gradient(90deg,rgba(11,11,13,.94),rgba(11,11,13,.55) 65%,rgba(11,11,13,.8)),${bgu(heroBg)}` : ''}">
      <div class="rv-head"><p class="eyebrow">Nightfall · Year in review</p>
        <button class="btn btn-ghost sm" id="rvShare"><span>Share</span><span class="ic">${ICON.share}</span></button></div>
      <h1>Your ${Y}<br>in games</h1>
      <p class="sub">${plays.length ? `Counted from ${new Date(first).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' })}${first > a + 7 * DAY ? ', the oldest play history Nightfall found on this PC' : ''}.` : 'Nothing tracked yet this year. Play something and come back.'}</p>
      <div class="rv-big">
        <div><b>${fmt(totalMs)}</b><span>played</span></div><div><b>${plays.length}</b><span>sessions</span></div>
        <div><b>${ranked.length}</b><span>${ranked.length === 1 ? 'game' : 'games'}</span></div><div><b>${longest ? fmt(longest.e - longest.s) : '—'}</b><span>longest</span></div>
      </div>
    </div>
    <div class="panel rv-months-p"><div class="row-head"><h2>Month by month</h2></div>
      <div class="rv-months">${months.map((ms, m) => `<div class="${ms ? 'has' : ''}"><em>${ms >= 36e5 ? Math.round(ms / 36e5) + 'h' : ''}</em><i style="height:${Math.max(2, Math.round(ms / mmax * 100))}%"></i>${MON[m]}</div>`).join('')}</div>
    </div>
    <div class="panel rv-top"><div class="row-head"><h2>Your top games</h2></div>
      ${ranked.length ? ranked.slice(0, 5).map((x, i) => `<div class="rv-row"><span class="no">${i + 1}</span><i class="cv" style="background:${artBg(coverOf(x.g), x.g)}"></i>
        <span class="nm"><b>${esc(x.g.name)}</b><span class="bar"><i style="width:${Math.max(4, x.ms / ranked[0].ms * 100)}%"></i></span></span><span class="tm">${fmt(x.ms)}</span></div>`).join('') : '<p class="muted">Your most played games appear here.</p>'}
    </div>
    <div class="rv-facts2">
      ${fact('Favorite day', plays.length ? DOW[favDow] : '—', plays.length ? fmt(dow[favDow]) + ' on ' + DOW[favDow] + 's' : '')}
      ${fact('Biggest day', busiest ? new Date(busiest[0]).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' }) : '—', busiest ? fmt(busiest[1]) + ' in one day' : '')}
      ${fact('Night owl', (totalMs ? Math.round(night / totalMs * 100) : 0) + '%', 'played after 10 pm')}
      ${extra.slice(0, 2).map((x) => fact('Top ' + (x.kind === 'roblox' ? 'Roblox experience' : 'Minecraft instance'), esc(x.top.name), fmt(x.top.ms) + ' this year')).join('')}
      ${steamTop.length ? `<div class="panel rv-fact rv-steam2"><small>All-time on Steam</small><div>${steamTop.map((x) => `<span><i style="background-image:${bgu(x.cover)}"></i><b>${hours(x.playMin)}</b></span>`).join('')}</div></div>` : ''}
    </div>`;
  $('#rvShare').onclick = () => renderers.shareYear && renderers.shareYear(s);
};
