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
  const rot = r.w / r.h > 1.2;
  const vw = rot ? r.h : r.w, vh = rot ? r.w : r.h;
  const aspect = vw / vh;
  const gw = aspect <= 0.62 || rot ? vw : Math.min(vw, vh * 0.5 * 1.6);
  const ox = (vw - gw) / 2, cw = gw / 10, ch = vh / 20;
  const vx = ox + (x + .5) * cw, vy = (y + .5) * ch;
  // girado: pantalla = (vy, alto - vx)
  return rot ? { x: r.l + vy, y: r.t + r.h - vx } : { x: r.l + vx, y: r.t + vy };
}
export async function clickCell(p, x, y) { const c = await cellXY(p, x, y); await p.mouse.click(c.x, c.y); }
export const dlg = (p) => p.textContent('#dialogue');
export const ended = (p) => p.evaluate(() => !document.getElementById('end').classList.contains('hidden'));
export async function waitAttack(p, timeout = 15000) {
  await p.waitForFunction(() => { const s = window.__parquesState(); return s.phase === 'attack' || !document.getElementById('end').classList.contains('hidden'); }, null, { timeout });
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));
export { wait };

export async function placeAll(p) {
  await p.waitForFunction(() => window.__parquesState && window.__parquesState().phase === 'place', null, { timeout: 40000 });
  for (let guard = 0; guard < 400; guard++) {
    const s0 = await st(p);
    if (!s0.place || s0.place.unplaced === 0) break;
    if (guard % 25 === 24) await p.keyboard.press('r');
    const c = await cellXY(p, Math.floor(Math.random() * 10), Math.floor(Math.random() * 20));
    await p.mouse.click(c.x, c.y);
  }
  await p.waitForSelector('#ready:not(.hidden)');
}
