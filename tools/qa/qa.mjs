/* QA de Parques en Guerra con Playwright (reglas actuales: colocación unidad por unidad, HUD mínimo,
   disparar o maniobrar, tablero girado en pantallas anchas).
   Uso: python3 -m http.server 8765 (en la raíz) y luego
        node tools/qa/qa.mjs [place|hud|tuto|pvc|pvp|all]      (BASE=url para probar otra URL)  */
import fs from 'fs';
import { chromium, BASE, mk, st, setup, cellXY, clickCell, wait, waitAttack, placeAll } from './lib.mjs';
import { playGame } from './bot.mjs';
const OUT = new URL('./out/', import.meta.url).pathname; fs.mkdirSync(OUT, { recursive: true });
const VPS = { mobile: { width: 390, height: 844 }, landscape: { width: 844, height: 390 }, desktop: { width: 1366, height: 768 }, square: { width: 900, height: 820 } };
const fails = [];
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) fails.push(m); };
const clean = (log) => log.filter((l) => !/AudioContext/.test(l));
const shot = (p, n) => p.screenshot({ path: OUT + n + '.png' });
const b = await chromium.launch();
const which = process.argv[2] || 'all';

async function newGame(vp, cfg = {}, fresh = false) {
  const g = await mk(b, { viewport: vp, fresh });
  await g.page.goto(BASE); await g.page.waitForSelector('#start');
  if (fresh) { await g.page.waitForSelector('#intro-go'); await wait(400); await g.page.click('#intro-go'); await wait(300); }
  await setup(g.page, { map: 'iguazu', terrain: 'mixto', ...cfg });
  await g.page.click('#start');
  await g.page.waitForFunction(() => window.__parquesState().phase === 'place', null, { timeout: 20000 });
  return g;
}
const hudVisible = (p) => p.evaluate(() => ['#hud-top', '#dock-btns', '#hud-bottom', '#clock', '#log'].filter((s) => { const e = document.querySelector(s); return e && e.offsetParent !== null && getComputedStyle(e).display !== 'none'; }));

async function suitePlace() {
  console.log('PLACE');
  for (const [tag, vp] of Object.entries(VPS)) {
    const { page: p, log } = await newGame(vp);
    let s = await st(p);
    ok(s.place.unplaced === 5 && s.units.every((u) => u.lifted), `${tag}: arranca sin unidades colocadas`);
    ok((await hudVisible(p)).length === 0, `${tag}: sin HUD en colocación (${await hudVisible(p)})`);
    ok(/Posicioná tu/.test(s.place.msg), `${tag}: mensaje "${s.place.msg.slice(0, 30)}…"`);
    const h0 = s.place.handH; const c = await cellXY(p, 4, 8);
    await p.mouse.move(c.x, c.y); await p.mouse.down(); await wait(700); await p.mouse.up(); await wait(150);
    s = await st(p); ok(s.place.handH !== h0 && s.place.unplaced === 5, `${tag}: pulsación larga rota sin soltar`);
    await shot(p, `place-${tag}`);
    await placeAll(p);
    ok(await p.isVisible('#ready'), `${tag}: «Estoy listo» aparece al final`);
    await p.click('#ready'); await waitAttack(p);
    ok(clean(log).length === 0, `${tag}: consola limpia ${JSON.stringify(clean(log))}`);
    await p.context().close();
  }
  const { page: p } = await newGame(VPS.mobile, { terrain: 'agua' });
  const t0 = Date.now();
  await p.waitForFunction(() => window.__parquesState().phase === 'attack', null, { timeout: 80000 });
  const s = await st(p);
  ok(s.units.every((u) => !u.lifted) && s.place.unplaced === 0, `timeout: autocompleta al azar (${Math.round((Date.now() - t0) / 1000)}s)`);
  await p.context().close();
}

async function suiteHud() {
  console.log('HUD');
  for (const tag of ['mobile', 'desktop', 'landscape']) {
    const { page: p, log } = await newGame(VPS[tag]);
    await placeAll(p); await p.click('#ready'); await waitAttack(p); await wait(600);
    const info = () => p.evaluate(() => ({ open: document.body.classList.contains('hud-open'), pill: !document.getElementById('hud-pill').classList.contains('hidden'), shoot: !!document.getElementById('act-shoot').offsetParent, dev: !!document.getElementById('act-dev').offsetParent, top: !!document.querySelector('#hud-top .hud')?.offsetParent }));
    let i = await info(); ok(!i.open && i.pill && i.shoot && i.dev && !i.top, `${tag}: plegado = píldora + Disparar/Maniobrar`);
    await shot(p, `battle-${tag}`);
    await p.click('#hud-pill'); await wait(400); i = await info(); ok(i.open && i.top, `${tag}: tocar la píldora despliega`);
    await shot(p, `battle-${tag}-open`);
    await p.click('#hud-pill'); await wait(300); i = await info(); ok(!i.open, `${tag}: se vuelve a plegar`);
    ok(clean(log).length === 0, `${tag}: consola limpia`);
    await p.context().close();
  }
}

async function suiteTouch() {
  console.log('TOUCH (apuntar con el dedo)');
  const g = await mk(b, { viewport: VPS.mobile, ctx: { hasTouch: true, isMobile: true } });
  const p = g.page;
  await p.goto(BASE); await p.waitForSelector('#start');
  await setup(p, { map: 'nahuel', terrain: 'agua' }); await p.click('#start');
  await p.waitForFunction(() => window.__parquesState().phase === 'place');
  await placeAll(p); await p.click('#ready'); await waitAttack(p); await wait(400);
  const t0 = (await st(p)).turnNo;
  const c = await cellXY(p, 4, 9), d = await cellXY(p, 6, 12);
  const cdp = await p.context().newCDPSession(p);
  const touch = (type, q) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: q ? [{ x: q.x, y: q.y }] : [] });
  await touch('touchStart', c); await wait(250);
  ok((await st(p)).turnNo === t0, 'apoyar el dedo no dispara todavía');
  await touch('touchMove', d); await wait(250);
  await shot(p, 'touch-aim');
  await touch('touchEnd'); await wait(400);
  const s1 = await st(p);
  ok(s1.turnNo === t0 + 1, 'soltar dispara (turno ' + t0 + ' → ' + s1.turnNo + ')');
  ok(s1.know.keys.includes('6,12') && !s1.know.keys.includes('4,9'), 'dispara donde se soltó, no donde se apoyó');
  ok(clean(g.log).length === 0, 'consola limpia ' + clean(g.log));
  await p.context().close();
}

async function suiteDaily() {
  console.log('DESAFÍO DEL DÍA + IA DIFÍCIL');
  const g = await mk(b, { viewport: VPS.mobile });
  const p = g.page;
  await p.goto(BASE); await p.waitForSelector('#daily');
  ok(/mismo parque/.test(await p.textContent('#daily')), 'botón del desafío en el menú');
  const sig = async () => { await p.waitForFunction(() => window.__parquesState().phase === 'place'); await placeAll(p); await p.click('#ready'); await waitAttack(p); await wait(300); const s = await st(p); return JSON.stringify([s.map, s.terrain, s.crop, s.pickups, await p.textContent('#inv-name')]); };
  await p.click('#daily'); const a = await sig();
  ok(/Desafío del día/.test(a), 'partida marcada como desafío: ' + JSON.parse(a)[4]);
  const r = await playGame(p, 'daily', { maxMs: 300000, pMan: 0.3 });
  ok(r.ended, 'desafío terminado en ' + r.turnNo + ' turnos');
  const note = await p.textContent('#end-note');
  ok(/Desafío del \d\d\/\d\d/.test(note) && /intento 1/.test(note), 'final muestra récord/intento: ' + note);
  await p.click('#rematch'); const a2 = await sig();
  ok(a === a2, 'revancha del desafío = mismo parque, tesoros e invasor');
  await p.click('#back').catch(() => {}); await p.evaluate(() => document.getElementById('back').click()); await wait(500);
  ok(/intento|récord/.test(await p.textContent('#daily')), 'menú muestra el récord/intentos: ' + await p.textContent('#daily'));
  // IA difícil
  await p.click('#ailevel [data-ai=dificil]');
  await setup(p, { map: 'iguazu', terrain: 'agua' }); await p.click('#start');
  await p.waitForFunction(() => window.__parquesState().phase === 'place'); await placeAll(p); await p.click('#ready'); await waitAttack(p);
  ok(/Difícil/.test(await p.textContent('#inv-name')) && !/Desafío/.test(await p.textContent('#inv-name')), 'IA difícil activa: ' + await p.textContent('#inv-name'));
  const r2 = await playGame(p, 'dificil', { maxMs: 300000, pMan: 0.3 });
  ok(r2.ended && !r2.notes.length, 'partida contra la difícil terminada (' + r2.turnNo + ' turnos, ' + r2.title + ')');
  ok(await p.evaluate(() => localStorage.getItem('parques.ai')) === 'dificil', 'la dificultad se recuerda');
  ok(clean(g.log).length === 0, 'consola limpia ' + clean(g.log));
  await shot(p, 'daily-end');
  await p.context().close();
}

async function suiteTuto() {
  console.log('TUTO');
  for (const tag of ['mobile', 'desktop']) {
    const { page: p, log } = await newGame(VPS[tag], {}, true);
    ok((await st(p)).tuto === 0, `${tag}: paso 0 en colocación`);
    await placeAll(p); await p.click('#ready'); await waitAttack(p); await wait(300);
    ok((await st(p)).tuto === 1, `${tag}: paso 1 (disparar)`);
    await shot(p, `tuto-${tag}-1`);
    await clickCell(p, 5, 10); await wait(300); await waitAttack(p, 25000); await wait(300);
    ok((await st(p)).tuto === 2, `${tag}: paso 2 (maniobrar)`);
    await shot(p, `tuto-${tag}-2`);
    await p.click('#act-dev'); await wait(200); await p.click('#manu [data-man=apuntar]'); await wait(300); await waitAttack(p, 25000); await wait(300);
    ok((await st(p)).tuto === 3, `${tag}: paso 3 (cobrar)`);
    await clickCell(p, 6, 9); await wait(300); await waitAttack(p, 25000); await wait(400);
    ok((await st(p)).tuto === 4, `${tag}: paso 4 (listo) → ${(await st(p)).tuto}`);
    await shot(p, `tuto-${tag}-4`);
    await p.click('#coach-ok'); await wait(200);
    ok(!(await p.isVisible('#coach')), `${tag}: coach se cierra`);
    ok(clean(log).length === 0, `${tag}: consola limpia ${JSON.stringify(clean(log))}`);
    await p.context().close();
  }
}

async function suitePvc() {
  console.log('PVC (bots contra la IA)');
  const cfgs = [['mobile', 'nahuel', 'agua'], ['desktop', 'iguazu', 'tierra'], ['landscape', 'glaciares', 'mixto'], ['mobile', 'iguazu', 'mixto']];
  const res = await Promise.all(cfgs.map(async ([vp, map, terrain], i) => {
    const { page: p, log } = await newGame(VPS[vp], { map, terrain });
    await placeAll(p); await p.click('#ready');
    const r = await playGame(p, `${vp}-${map}-${terrain}`, { maxMs: 300000, pMan: 0.45 });
    await shot(p, `pvc-end-${i}`);
    return { ...r, log: clean(log) };
  }));
  res.forEach((r) => ok(r.ended && !r.notes.length && !r.log.length, `${r.tag}: terminó en ${r.turnNo} turnos (${r.shots} disparos, ${r.mover + r.vigilar + r.reparar + r.apuntar} maniobras) ${r.notes.join(',')} ${r.log.join(',')}`));
}

async function suitePvp() {
  console.log('PVP');
  const vp = VPS[process.env.VP || 'mobile'];
  const H = await mk(b, { viewport: vp }), J = await mk(b, { viewport: vp });
  await H.page.goto(BASE, { waitUntil: 'networkidle' });
  await setup(H.page, { map: 'nahuel', terrain: 'mixto', nation: 'rusia', mode: 'pvp' });
  await H.page.click('#start');
  await H.page.waitForFunction(() => /\?sala=/.test(document.getElementById('link').value), null, { timeout: 30000 });
  const link = await H.page.inputValue('#link');
  await J.page.goto(link.replace(/^https?:\/\/[^/]+\/(batalla-naval-parques\/)?/, BASE), { waitUntil: 'domcontentloaded' });
  await J.page.waitForFunction(() => window.__parquesState && window.__parquesState().phase === 'place', null, { timeout: 40000 });
  ok((await st(J.page)).place.unplaced === 5, 'invitado coloca unidad por unidad');
  await placeAll(H.page); await placeAll(J.page); await H.page.click('#ready'); await wait(800); await J.page.click('#ready'); await wait(1500);
  let a = await st(H.page), c = await st(J.page);
  ok([a.phase, c.phase].sort().join() === 'attack,defend', `arrancan sincronizados (${a.phase}/${c.phase})`);
  await shot(H.page, 'pvp-host-start'); await shot(J.page, 'pvp-join-start');
  const [rh, rj] = await Promise.all([playGame(H.page, 'host', { maxMs: 700000, pMan: 0.3 }), playGame(J.page, 'joiner', { maxMs: 700000, pMan: 0.3 })]);
  a = await st(H.page); c = await st(J.page);
  ok(rh.ended && rj.ended && a.turnNo === c.turnNo, `partida completa, turnos iguales ${a.turnNo}/${c.turnNo}`);
  ok(JSON.stringify(a.pickups) === JSON.stringify(c.pickups), 'tesoros iguales en ambos');
  await H.page.click('#rematch'); await wait(600); await J.page.click('#rematch'); await wait(2500);
  ok((await st(H.page)).phase === 'place' && (await st(J.page)).place.unplaced === 5, 'revancha: se vuelve a colocar');
  await placeAll(H.page); await placeAll(J.page); await H.page.click('#ready'); await wait(800); await J.page.click('#ready'); await wait(2000);
  a = await st(H.page); c = await st(J.page);
  ok(a.turnNo === 0 && c.turnNo === 0 && JSON.stringify(a.pickups) === JSON.stringify(c.pickups), 'revancha arranca igual en ambos');
  ok(!clean(H.log).length && !clean(J.log).length, `consolas limpias ${clean(H.log)} ${clean(J.log)}`);
}

const suites = { place: suitePlace, hud: suiteHud, touch: suiteTouch, daily: suiteDaily, tuto: suiteTuto, pvc: suitePvc, pvp: suitePvp };
for (const k of which === 'all' ? Object.keys(suites) : which.split(',')) await suites[k]();
await b.close();
console.log(fails.length ? `\n${fails.length} FALLAS` : '\nTODO OK', '· capturas en', OUT);
process.exit(fails.length ? 1 : 0);
