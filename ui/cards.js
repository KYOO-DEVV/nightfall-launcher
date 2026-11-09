/* global nf, $, fmt, hours, heroOf, coverOf, total, toast, renderers, modal, DAY, now */
// Shareable stat cards drawn on a canvas (1200×675), saved as PNG or copied to the clipboard.

const W = 1200, H = 675;
const FONT = '"Plus Jakarta Sans", "Manrope", "Segoe UI", sans-serif';
async function loadImg(src) {
  if (!src) return null;
  try {
    const data = await nf.imageData(src); // data: URL, so the canvas stays exportable
    if (!data) return null;
    return await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = data; });
  } catch { return null; }
}
function cover(ctx, img, x, y, w, h) {
  const r = Math.max(w / img.width, h / img.height), iw = img.width * r, ih = img.height * r;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function base(ctx, bg) {
  ctx.fillStyle = '#0b0b0d'; ctx.fillRect(0, 0, W, H);
  if (bg) { ctx.globalAlpha = 0.9; cover(ctx, bg, 0, 0, W, H); ctx.globalAlpha = 1; }
  let g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(11,11,13,.95)'); g.addColorStop(0.62, 'rgba(11,11,13,.55)'); g.addColorStop(1, 'rgba(11,11,13,.75)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createLinearGradient(0, H * 0.55, 0, H); g.addColorStop(0, 'rgba(11,11,13,0)'); g.addColorStop(1, 'rgba(11,11,13,.9)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function footer(ctx) {
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = `700 15px ${FONT}`;
  ctx.fillText('NIGHTFALL LAUNCHER', 64, H - 44);
}
function stat(ctx, x, y, v, k) {
  rr(ctx, x, y, 200, 104, 16); ctx.fillStyle = 'rgba(14,14,17,.72)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = `800 38px ${FONT}`; ctx.fillText(v, x + 20, y + 54);
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = `700 13px ${FONT}`; ctx.fillText(k.toUpperCase(), x + 20, y + 84);
}

let lastCanvas = null, lastName = 'nightfall.png';
function preview(canvas, name, title) {
  lastCanvas = canvas; lastName = name;
  $('#shTitle').textContent = title;
  const p = $('#shPreview'); p.innerHTML = ''; canvas.style.width = '100%'; p.appendChild(canvas);
  modal('#share', true);
}
$('#shClose').onclick = () => modal('#share', false);
$('#shSave').onclick = async () => {
  if (!lastCanvas) return;
  const p = await nf.saveCard(lastCanvas.toDataURL('image/png'), lastName).catch((e) => { toast(String(e)); return null; });
  if (p) { toast('Saved'); modal('#share', false); }
};
$('#shCopy').onclick = () => {
  if (!lastCanvas) return;
  lastCanvas.toBlob(async (b) => {
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); toast('Copied · paste it into Discord or anywhere'); }
    catch { toast("Couldn't copy here. Use Save as PNG instead."); }
  }, 'image/png');
};

/* year card */
renderers.shareYear = async (s) => {
  await document.fonts.ready;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const top = s.ranked[0];
  base(ctx, top ? await loadImg(heroOf(top.g)) : null);
  ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = `700 16px ${FONT}`; ctx.fillText('YEAR IN REVIEW', 64, 84);
  ctx.fillStyle = '#fff'; ctx.font = `800 84px ${FONT}`;
  ctx.fillText(`My ${s.Y}`, 60, 176); ctx.fillText('in games', 60, 262);
  stat(ctx, 64, 312, fmt(s.totalMs), 'played'); stat(ctx, 280, 312, String(s.plays.length), 'sessions'); stat(ctx, 496, 312, String(s.ranked.length), s.ranked.length === 1 ? 'game' : 'games');
  // top games with covers
  let y = 150;
  ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = `700 15px ${FONT}`; ctx.fillText('TOP GAMES', 790, 110);
  for (const [i, x] of s.ranked.slice(0, 4).entries()) {
    const img = await loadImg(coverOf(x.g));
    rr(ctx, 790, y, 64, 84, 10); ctx.save(); ctx.clip(); if (img) cover(ctx, img, 790, y, 64, 84); else { ctx.fillStyle = '#222'; ctx.fill(); } ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.font = `800 16px ${FONT}`; ctx.fillText(String(i + 1), 764, y + 48);
    ctx.fillStyle = '#fff'; ctx.font = `800 22px ${FONT}`;
    let n = x.g.name; while (ctx.measureText(n).width > 250 && n.length > 3) n = n.slice(0, -2); if (n !== x.g.name) n += '…';
    ctx.fillText(n, 870, y + 38); ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.font = `700 17px ${FONT}`; ctx.fillText(fmt(x.ms), 870, y + 66);
    y += 104;
  }
  if (s.extra[0]) { ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = `600 18px ${FONT}`; ctx.fillText(`Top ${s.extra[0].kind === 'roblox' ? 'Roblox experience' : 'Minecraft instance'}: ${s.extra[0].top.name}`, 64, 470); }
  footer(ctx);
  preview(c, `nightfall-${s.Y}-review.png`, `Share your ${s.Y}`);
};

/* game card */
renderers.shareGame = async (g, d) => {
  if (!g) return;
  await document.fonts.ready;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  base(ctx, await loadImg(heroOf(g)));
  const logo = await loadImg(g.art.logo);
  if (logo) {
    const h = 130, w = Math.min(560, logo.width * (h / logo.height));
    if (g.logoMono) ctx.filter = 'brightness(0) invert(1)';
    ctx.drawImage(logo, 64, 120, w, w / (logo.width / logo.height));
    ctx.filter = 'none';
  } else { ctx.fillStyle = '#fff'; ctx.font = `800 72px ${FONT}`; ctx.fillText(g.name, 60, 200); }
  const plays = d && d.plays && d.plays.length ? d.plays : g.sessions;
  const sum = Math.max(plays.reduce((t, p) => t + p.e - p.s, 0), total(g));
  const longest = plays.reduce((m, p) => Math.max(m, p.e - p.s), 0);
  stat(ctx, 64, 330, fmt(sum), 'played'); stat(ctx, 280, 330, String(plays.length), 'sessions'); stat(ctx, 496, 330, longest ? fmt(longest) : '—', 'longest');
  if (g.steamMin) stat(ctx, 712, 330, hours(g.steamMin), 'on Steam');
  // last 30 days
  const today = new Date(); today.setHours(0, 0, 0, 0); const start = today.getTime() - 29 * DAY;
  const days = [...Array(30)].map((_, i) => plays.reduce((t, p) => t + Math.max(0, Math.min(p.e, start + (i + 1) * DAY) - Math.max(p.s, start + i * DAY)), 0));
  const mx = Math.max(...days, 1);
  days.forEach((ms, i) => { const h = Math.max(3, ms / mx * 70); rr(ctx, 64 + i * 22, 540 - h, 14, h, 3); ctx.fillStyle = ms ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.15)'; ctx.fill(); });
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = `700 13px ${FONT}`; ctx.fillText('LAST 30 DAYS', 64, 568);
  const topItem = d && d.items && [...d.items].sort((a, b) => b.ms - a.ms)[0];
  if (topItem) { ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = `600 18px ${FONT}`; ctx.fillText(`Most played ${d.kind === 'roblox' ? 'experience' : 'instance'}: ${topItem.name} · ${fmt(topItem.ms)}`, 64, 300); }
  footer(ctx);
  preview(c, `nightfall-${g.name.replace(/[^\w-]+/g, '-').toLowerCase()}.png`, `Share ${g.name}`);
};
