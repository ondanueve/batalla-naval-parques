/* Capturas de las tropas (barcos y terrestres) con la misma colocación siempre.
   Uso: BASE=url PREFIX=antes node tools/qa/troops.mjs */
import fs from 'fs';
import { chromium, BASE, mk, setup, placeAll, wait } from './lib.mjs';
const OUT = new URL('./out/', import.meta.url).pathname; fs.mkdirSync(OUT, { recursive: true });
const PREFIX = process.env.PREFIX || 'tropas';
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const b = await chromium.launch();
for (const [terrain, map] of [['tierra', 'glaciares'], ['mixto', 'nahuel'], ['agua', 'iguazu']]) {
  for (const [tag, vp] of [['mobile', { width: 390, height: 844 }], ['desktop', { width: 1366, height: 768 }]]) {
    Math.random = mulberry(1234);
    const g = await mk(b, { viewport: vp, ctx: { deviceScaleFactor: 2 } });
    const p = g.page;
    await p.addInitScript(() => { let a = 99; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; });
    await p.goto(BASE); await p.waitForSelector('#start');
    await setup(p, { map, terrain, rules: 'clasico' }); await p.click('#start');
    await placeAll(p); await wait(700);
    await p.screenshot({ path: `${OUT}${PREFIX}-${terrain}-${tag}.png` });
    if (g.log.length) console.log(terrain, tag, g.log);
    await g.ctx.close();
  }
}
await b.close();
console.log('ok', OUT + PREFIX + '-*.png');
