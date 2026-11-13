import { createRequire } from 'module';
// playwright desde tools/qa/node_modules, o desde QA_PW (carpeta con node_modules/playwright)
const require = createRequire(process.env.QA_PW ? process.env.QA_PW.replace(/\/?$/, '/') : import.meta.url);
export const { chromium } = require('playwright');
export const BASE = process.env.BASE || 'http://localhost:8765/';
export async function mk(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 430, height: 900 }, deviceScaleFactor: 1, ...(opts.ctx||{}) });
  if (!opts.fresh) await ctx.addInitScript(() => { try { localStorage.setItem('parques.intro.v1','1'); localStorage.setItem('parques.tuto.v1','1'); } catch (e) {} });
  const page = await ctx.newPage();
  const log = [];
  page.on('console', m => { if (['error','warning'].includes(m.type())) log.push(`[console.${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => log.push('[pageerror] ' + e.message));
  page.on('requestfailed', r => log.push('[reqfailed] ' + r.url() + ' ' + (r.failure()||{}).errorText));
  page.on('response', r => { if (r.status() >= 400) log.push('[http' + r.status() + '] ' + r.url()); });
  return { ctx, page, log };
}
export const st = (p) => p.evaluate(() => window.__parquesState());
export async function setup(p, { map='nahuel', terrain='agua', mode='pvc', nation='chile' } = {}) {
  await p.click(`#maps [data-map=${map}]`);
  await p.click(`#terrains [data-terrain=${terrain}]`);
  await p.click(`#modes [data-mode=${mode}]`);
  const idx = ['chile','uk','usa','china','rusia','brasil'].indexOf(nation);
  await p.click(`#nations .nation >> nth=${idx}`);
}
export async function cellXY(p, x, y) {
  const r = await p.evaluate(() => { const c = document.getElementById('board').getBoundingClientRect(); return { l: c.left, t: c.top, w: c.width, h: c.height }; });
  const DOCK = 46; // franja reservada abajo (game.js)
  const rot = r.w / r.h > 1.2;
  let vx, vy;
  if (rot) {
    const cw = (r.h - DOCK) / 10, ch = r.w / 20;
    vx = DOCK + (x + .5) * cw; vy = (y + .5) * ch;
    return { x: r.l + vy, y: r.t + r.h - vx }; // girado: pantalla = (vy, alto - vx)
  }
  const bh = r.h - DOCK, aspect = r.w / bh;
  const gw = aspect <= 0.62 ? r.w : Math.min(r.w, bh * 0.5 * 1.6);
  const ox = (r.w - gw) / 2;
  return { x: r.l + ox + (x + .5) * gw / 10, y: r.t + (y + .5) * bh / 20 };
}
export async function clickCell(p, x, y) { const c = await cellXY(p, x, y); await p.mouse.click(c.x, c.y); }
export const dlg = (p) => p.textContent('#dialogue');
export const ended = (p) => p.evaluate(() => !document.getElementById('end').classList.contains('hidden'));
export async function waitAttack(p, timeout = 15000) {
  await p.waitForFunction(() => { const s = window.__parquesState(); return s.phase === 'attack' || !document.getElementById('end').classList.contains('hidden'); }, null, { timeout });
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));
export { wait };

// Colocación con unidad pendiente: tocar apoya (sin fijar), ✓ confirma y pasa a la siguiente.
export async function placeAll(p) {
  await p.waitForFunction(() => window.__parquesState && window.__parquesState().phase === 'place', null, { timeout: 40000 });
  for (let guard = 0; guard < 400; guard++) {
    const s0 = await st(p);
    if (s0.phase !== 'place') break;
    if (s0.place.unplaced === 0 && !s0.place.pending) break;
    const pend = s0.place.pending;
    if (pend && pend.ok) { await p.click('#pc-ok'); await wait(40); continue; }
    if (pend && guard % 7 === 6) { await p.keyboard.press('r'); continue; }
    // tocar un lugar libre (no sobre otra unidad ya puesta)
    let x, y, tries = 0;
    do { x = Math.floor(Math.random() * 10); y = Math.floor(Math.random() * 20); tries++; }
    while (tries < 50 && s0.units.some((u) => !u.lifted && (u.horizontal ? (y === u.y && x >= u.x && x < u.x + u.size) : (x === u.x && y >= u.y && y < u.y + u.size))));
    const c = await cellXY(p, x, y);
    await p.mouse.click(c.x, c.y);
  }
  await p.waitForSelector('#ready:not(.hidden)');
}
