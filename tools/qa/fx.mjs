// Captura de juice: racha de impactos, nubes, botón Disparar potenciado. node tools/qa/fx.mjs [mobile|desktop]
import { chromium, BASE, mk, st, setup, clickCell, wait, waitAttack, placeAll } from './lib.mjs';
const OUT = new URL('./out/', import.meta.url).pathname;
const tag = process.argv[2] || 'mobile';
const vp = tag === 'desktop' ? { width: 1366, height: 768 } : { width: 390, height: 844 };
const b = await chromium.launch();
const { page: p, log } = await mk(b, { viewport: vp });
await p.goto(BASE); await p.waitForSelector('#start');
await setup(p, { map: 'nahuel', terrain: 'agua' }); await p.click('#start');
await placeAll(p); await p.click('#ready'); await waitAttack(p);
const shot = new Set(), stack = []; let streak = 0, best = 0, snapped = false;
for (let n = 0; n < 70 && !snapped; n++) {
  const s = await st(p); if (s.phase !== 'attack') { await waitAttack(p, 25000).catch(() => {}); continue; }
  let c = null;
  while (stack.length) { const q = stack.pop(); if (q.x >= 0 && q.y >= 0 && q.x < 10 && q.y < 20 && !shot.has(q.x + ',' + q.y)) { c = q; break; } }
  if (!c) { do { c = { x: Math.floor(Math.random() * 10), y: 2 + Math.floor(Math.random() * 16) }; } while (shot.has(c.x + ',' + c.y) || (c.x + c.y) % 2); }
  shot.add(c.x + ',' + c.y);
  const before = s.foeHp;
  await clickCell(p, c.x, c.y);
  await wait(560);
  const buf = streak >= 1 ? await p.screenshot() : null;
  await waitAttack(p, 25000).catch(() => {});
  const mid = await st(p);
  if (mid.foeHp < before) {
    streak++; best = Math.max(best, streak);
    [[1,0],[-1,0],[0,1],[0,-1]].forEach(([a, d]) => stack.push({ x: c.x + a, y: c.y + d }));
    if (streak >= 2 && buf) { (await import('fs')).writeFileSync(`${OUT}fx-streak-${tag}.png`, buf); snapped = true; }
  } else streak = 0;
}
await p.screenshot({ path: `${OUT}fx-board-${tag}.png` });
const boost = await p.evaluate(() => document.getElementById('act-shoot').classList.contains('boost'));
console.log(tag, 'best streak', best, 'snapped', snapped, 'boost', boost, log.filter((l) => !/AudioContext/.test(l)));
await b.close();
