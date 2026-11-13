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
  for (const tag of ['mobile', 'desktop', 'landscape']) {
    const vp = VPS[tag], touch = tag !== 'desktop';
    const g = await mk(b, { viewport: vp, ctx: touch ? { hasTouch: true, isMobile: tag === 'mobile' } : {} });
    const { page: p, log } = g;
    await p.goto(BASE); await p.waitForSelector('#start');
    await setup(p, { map: 'iguazu', terrain: 'mixto' }); await p.click('#start');
    await p.waitForFunction(() => window.__parquesState().phase === 'place', null, { timeout: 20000 });
    const tap = async (x, y) => { const c = await cellXY(p, x, y); if (touch) await p.touchscreen.tap(c.x, c.y); else await p.mouse.click(c.x, c.y); await wait(120); };
    const drag = async (x0, y0, x1, y1) => {
      const a = await cellXY(p, x0, y0), z = await cellXY(p, x1, y1);
      // Playwright no arrastra con touchscreen: el puntero sirve igual para el gesto (pointer events)
      await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move((a.x + z.x) / 2, (a.y + z.y) / 2, { steps: 4 }); await p.mouse.move(z.x, z.y, { steps: 4 }); await p.mouse.up(); await wait(150);
    };
    let s = await st(p);
    ok(s.place.unplaced === 5 && s.units.every((u) => u.lifted), `${tag}: arranca sin unidades colocadas`);
    ok((await hudVisible(p)).length === 0, `${tag}: sin HUD en colocación (${await hudVisible(p)})`);
    ok(/Posicioná tu/.test(s.place.msg) && /tocá dónde va/.test(s.place.msg), `${tag}: mensaje "${s.place.msg.slice(0, 50)}…"`);
    // buscar un lugar libre válido tocando: la unidad queda pendiente, no fijada
    let pend = null;
    for (let i = 0; i < 40 && !(pend && pend.ok); i++) { await tap(2 + (i % 5), 3 + ((i * 3) % 14)); pend = (await st(p)).place.pending; }
    s = await st(p);
    ok(pend && pend.ok && s.place.unplaced === 5, `${tag}: tocar apoya la unidad pendiente sin fijarla (${JSON.stringify(pend)})`);
    ok(await p.isVisible('#place-ctl') && await p.isVisible('#pc-ok') && await p.isVisible('#pc-rot'), `${tag}: ⟳ y ✓ flotan al lado`);
    ok(/arrastrá · tocá para girar · ✓/.test(s.place.msg), `${tag}: pista "arrastrá · tocá para girar · ✓"`);
    await shot(p, `place-pending-${tag}`);
    // tocar la pendiente la gira en el lugar (con ajuste automático)
    const h0 = pend.h; await tap(pend.x, pend.y);
    let p2 = (await st(p)).place.pending;
    ok(p2 && p2.h !== h0, `${tag}: tocar la pendiente la gira (${h0}→${p2 && p2.h})`);
    // botón ⟳ y tecla R también giran
    await p.click('#pc-rot'); await wait(120); p2 = (await st(p)).place.pending;
    ok(p2 && p2.h === h0, `${tag}: ⟳ gira`);
    if (!touch) { await p.keyboard.press('r'); await wait(80); ok((await st(p)).place.pending.h !== h0, `${tag}: R gira`); await p.keyboard.press('r'); await wait(80); }
    // arrastrar la pendiente la mueve y sigue pendiente
    p2 = (await st(p)).place.pending;
    await drag(p2.x, p2.y, p2.x, Math.min(17, p2.y + 2));
    let p3 = (await st(p)).place.pending;
    ok(p3 && (p3.x !== p2.x || p3.y !== p2.y) && (await st(p)).place.unplaced === 5, `${tag}: arrastrar mueve sin fijar (${p2.x},${p2.y}→${p3 && p3.x},${p3 && p3.y})`);
    // confirmar (✓ o Enter) fija y pasa a la siguiente
    for (let i = 0; i < 40 && !((await st(p)).place.pending || {}).ok; i++) await tap(1 + (i % 7), 2 + ((i * 5) % 16));
    if (touch) await p.click('#pc-ok'); else await p.keyboard.press('Enter');
    await wait(150); s = await st(p);
    ok(s.place.unplaced === 4 && !s.place.pending, `${tag}: ${touch ? '✓' : 'Enter'} confirma y pasa a la siguiente (${s.place.unplaced} por poner)`);
    const placed = s.units.find((u) => !u.lifted);
    // levantar una ya puesta para ajustarla
    await tap(placed.x, placed.y); s = await st(p);
    ok(s.place.pending && s.place.pending.name === placed.name, `${tag}: tocar una unidad puesta la levanta (${s.place.pending && s.place.pending.name})`);
    await p.click('#pc-rot'); await wait(120);
    for (let i = 0; i < 40 && !((await st(p)).place.pending || {}).ok; i++) await tap(1 + (i % 7), 2 + ((i * 5) % 16));
    await p.click('#pc-ok'); await wait(150); s = await st(p);
    ok(s.place.unplaced === 4 && !s.units.find((u) => u.name === placed.name).lifted, `${tag}: reajustada y confirmada otra vez`);
    await placeAll(p);
    ok(await p.isVisible('#ready'), `${tag}: «Estoy listo» aparece al final`);
    await p.click('#ready'); await waitAttack(p);
    ok(clean(log).length === 0, `${tag}: consola limpia ${JSON.stringify(clean(log))}`);
    await g.ctx.close();
  }
  // tiempo agotado: la pendiente válida se fija donde está y el resto se completa al azar
  const { page: p } = await newGame(VPS.mobile, { terrain: 'agua' });
  let pend = null;
  for (let i = 0; i < 40 && !(pend && pend.ok); i++) { await clickCell(p, 2 + (i % 5), 3 + ((i * 3) % 14)); pend = (await st(p)).place.pending; }
  const t0 = Date.now();
  await p.waitForFunction(() => window.__parquesState().phase === 'attack', null, { timeout: 80000 });
  const s = await st(p);
  const kept = s.units.find((u) => u.name === pend.name);
  ok(s.units.every((u) => !u.lifted) && s.place.unplaced === 0, `timeout: autocompleta al azar (${Math.round((Date.now() - t0) / 1000)}s)`);
  ok(kept && kept.x === pend.x && kept.y === pend.y && kept.horizontal === pend.h, `timeout: la pendiente válida queda donde estaba`);
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
  console.log('PVC (bots contra la IA, Clásico y Reloaded)');
  const cfgs = [['mobile', 'nahuel', 'agua', 'clasico'], ['desktop', 'iguazu', 'tierra', 'clasico'], ['desktop', 'glaciares', 'mixto', 'reloaded'], ['landscape', 'iguazu', 'mixto', 'reloaded']];
  const res = await Promise.all(cfgs.map(async ([vp, map, terrain, rules], i) => {
    const { page: p, log } = await newGame(VPS[vp], { map, terrain, rules });
    await placeAll(p); await p.click('#ready'); await waitAttack(p);
    const s0 = await st(p);
    const r = await playGame(p, `${rules}-${vp}-${map}-${terrain}`, { maxMs: 300000, pMan: 0.45, shootOnly: rules === 'clasico' });
    const s1 = await st(p);
    await shot(p, `pvc-end-${i}`);
    return { ...r, rules, s0, s1, log: clean(log) };
  }));
  res.forEach((r) => {
    ok(r.ended && !r.notes.length && !r.log.length && r.s0.rules === r.rules, `${r.tag}: terminó en ${r.turnNo} turnos (${r.shots} disparos, ${r.mover + r.vigilar + r.reparar + r.apuntar} maniobras) ${r.notes.join(',')} ${r.log.join(',')}`);
    if (r.rules === 'clasico') ok(r.s1.pickups.length === 0 && r.s1.level === 0, `${r.tag}: clásico sin tesoros ni escalada (nivel ${r.s1.level}, ${r.s1.pickups.length} tesoros)`);
  });
}

async function suiteModes() {
  console.log('MODOS (Clásico por defecto / Reloaded)');
  for (const tag of ['mobile', 'desktop']) {
    const g = await mk(b, { viewport: VPS[tag] }); const p = g.page;
    await p.goto(BASE); await p.waitForSelector('#start');
    const sel = () => p.evaluate(() => document.querySelector('#rules .selected')?.dataset.rules);
    ok(await sel() === 'clasico', `${tag}: Clásico elegido por defecto`);
    ok(/de siempre/.test(await p.textContent('#rules-hint')), `${tag}: pista de Clásico`);
    if (tag === 'mobile') await p.locator('#rules-block').screenshot({ path: OUT + 'rules-selector-mobile.png' });
    await shot(p, `menu-rules-${tag}`);
    await p.click('#rules [data-rules=reloaded]');
    ok(/Disparar o maniobrar/.test(await p.textContent('#rules-hint')), `${tag}: pista de Reloaded`);
    await p.reload(); await p.waitForSelector('#start');
    ok(await sel() === 'reloaded', `${tag}: se recuerda en la sesión (recarga)`);
    ok(await p.evaluate(() => Object.keys(localStorage).filter((k) => /rules|reglas|modo/i.test(k)).length === 0), `${tag}: nada de reglas en localStorage`);
    await g.ctx.close();
    const g2 = await mk(b, { viewport: VPS[tag] }); const q = g2.page;
    await q.goto(BASE); await q.waitForSelector('#start');
    ok(await q.evaluate(() => document.querySelector('#rules .selected')?.dataset.rules) === 'clasico', `${tag}: sesión nueva vuelve a Clásico`);
    // batalla clásica: HUD aún más mínimo y sin repetir celdas
    await setup(q, { map: 'nahuel', terrain: 'agua', rules: null }); await q.click('#start');
    await placeAll(q); await q.click('#ready'); await waitAttack(q); await wait(500);
    let s = await st(q);
    const vis = await q.evaluate(() => ({ turnbar: !!document.getElementById('turnbar').offsetParent, war: document.getElementById('pill-war').textContent, next: document.getElementById('pill-next').textContent, coach: !document.getElementById('coach').classList.contains('hidden') }));
    ok(s.rules === 'clasico' && !vis.turnbar && !vis.war && !vis.next && !vis.coach, `${tag}: clásico = solo la píldora ${JSON.stringify(vis)}`);
    ok(s.pickups.length === 0, `${tag}: clásico sin tesoros`);
    await clickCell(q, 0, 0); await waitAttack(q, 30000);
    const t1 = (await st(q)).turnNo;
    await clickCell(q, 0, 0); await wait(400);
    s = await st(q);
    ok(s.turnNo === t1 && s.phase === 'attack' && /ya disparaste/i.test(await q.textContent('#dialogue')), `${tag}: no se puede repetir una celda`);
    await shot(q, `battle-clasico-${tag}`);
    // reglas distintas desde el rival: se rechaza
    await q.evaluate(() => window.__parquesInject({ t: 'ready', rules: 'reloaded' })); await wait(400);
    ok(await q.evaluate(() => !document.getElementById('menu').classList.contains('hidden')) && /otras reglas/.test(await q.textContent('.lede')), `${tag}: reglas que no coinciden = se rechaza`);
    // Reloaded: HUD con Disparar/Maniobrar
    await setup(q, { map: 'glaciares', terrain: 'mixto', rules: 'reloaded' }); await q.click('#start');
    await placeAll(q); await q.click('#ready'); await waitAttack(q); await wait(600);
    s = await st(q);
    ok(s.rules === 'reloaded' && await q.evaluate(() => !!document.getElementById('act-dev').offsetParent) && s.pickups.length > 0, `${tag}: Reloaded con Maniobrar y tesoros`);
    await shot(q, `battle-reloaded-${tag}`);
    // desafío del día: siempre Reloaded
    await q.evaluate(() => document.getElementById('back').click()); await wait(300);
    await q.click('#rules [data-rules=clasico]');
    ok(/Reloaded/.test(await q.textContent('#daily')), `${tag}: el desafío del día dice Reloaded`);
    await q.click('#daily'); await q.waitForFunction(() => window.__parquesState().phase === 'place');
    ok((await st(q)).rules === 'reloaded', `${tag}: el desafío se juega en Reloaded`);
    await q.evaluate(() => document.getElementById('back').click()); await wait(300);
    ok(await q.evaluate(() => document.querySelector('#rules .selected')?.dataset.rules) === 'clasico', `${tag}: después del desafío vuelve a lo elegido (Clásico)`);
    ok(clean(g2.log).length === 0, `${tag}: consola limpia ${clean(g2.log)}`);
    await g2.ctx.close();
  }
}

async function suitePvp() {
  for (const rules of (process.env.RULES || 'clasico,reloaded').split(',')) await pvpOnce(rules);
}
async function pvpOnce(rules) {
  console.log('PVP ' + rules + ' ' + (process.env.VP || 'mobile'));
  const vp = VPS[process.env.VP || 'mobile'];
  const H = await mk(b, { viewport: vp }), J = await mk(b, { viewport: vp });
  await H.page.goto(BASE, { waitUntil: 'networkidle' });
  await setup(H.page, { map: 'nahuel', terrain: 'mixto', nation: 'rusia', mode: 'pvp', rules });
  await H.page.click('#start');
  await H.page.waitForFunction(() => /\?sala=/.test(document.getElementById('link').value), null, { timeout: 30000 });
  const link = await H.page.inputValue('#link');
  await J.page.goto(link.replace(/^https?:\/\/[^/]+\/(batalla-naval-parques\/)?/, BASE), { waitUntil: 'domcontentloaded' });
  await J.page.waitForFunction(() => window.__parquesState && window.__parquesState().phase === 'place', null, { timeout: 40000 });
  ok((await st(J.page)).place.unplaced === 5, 'invitado coloca unidad por unidad');
  ok((await st(J.page)).rules === rules && new RegExp(rules === 'clasico' ? 'Clásico' : 'Reloaded').test(await J.page.textContent('#place-msg')), `el invitado ve las reglas (${rules}) antes de estar listo`);
  await placeAll(H.page); await placeAll(J.page); await H.page.click('#ready'); await wait(800); await J.page.click('#ready'); await wait(1500);
  let a = await st(H.page), c = await st(J.page);
  ok([a.phase, c.phase].sort().join() === 'attack,defend', `arrancan sincronizados (${a.phase}/${c.phase})`);
  await shot(H.page, 'pvp-host-start'); await shot(J.page, 'pvp-join-start');
  const [rh, rj] = await Promise.all([playGame(H.page, 'host', { maxMs: 700000, pMan: 0.3, shootOnly: rules === 'clasico' }), playGame(J.page, 'joiner', { maxMs: 700000, pMan: 0.3, shootOnly: rules === 'clasico' })]);
  a = await st(H.page); c = await st(J.page);
  ok(rh.ended && rj.ended && a.turnNo === c.turnNo, `partida completa, turnos iguales ${a.turnNo}/${c.turnNo}`);
  if (!(rh.ended && rj.ended)) {
    console.log('DIAG host', JSON.stringify(rh.hang || rh.notes), '\nDIAG joiner', JSON.stringify(rj.hang || rj.notes));
    console.log('DIAG logs', clean(H.log), clean(J.log), await H.page.evaluate(() => window.__parquesErr), await J.page.evaluate(() => window.__parquesErr));
    console.log('DIAG phases', a.phase, c.phase, await H.page.evaluate(() => window.__parquesStage), await J.page.evaluate(() => window.__parquesStage));
    console.log('STAGE', await H.page.evaluate(() => window.__parquesStage), await J.page.evaluate(() => window.__parquesStage));
    console.log('NET host\n' + (await H.page.evaluate(() => window.__parquesNet.join('\n'))));
    console.log('NET joiner\n' + (await J.page.evaluate(() => window.__parquesNet.join('\n'))));
    await b.close(); process.exit(1);
  }
  ok(JSON.stringify(a.pickups) === JSON.stringify(c.pickups) && a.rules === rules && c.rules === rules && (rules === 'reloaded' || a.pickups.length === 0), `reglas ${a.rules}/${c.rules} y tesoros iguales en ambos (${a.pickups.length})`);
  await shot(H.page, `pvp-${rules}-host-end`);
  const rem = (pg) => pg.evaluate(() => { document.getElementById('juke-panel')?.classList.add('hidden'); document.getElementById('rematch').click(); });
  await rem(H.page); await wait(600); await rem(J.page); await wait(2500);
  ok((await st(H.page)).phase === 'place' && (await st(J.page)).place.unplaced === 5, 'revancha: se vuelve a colocar');
  await placeAll(H.page); await placeAll(J.page); await H.page.click('#ready'); await wait(800); await J.page.click('#ready'); await wait(2000);
  a = await st(H.page); c = await st(J.page);
  ok(a.turnNo === 0 && c.turnNo === 0 && JSON.stringify(a.pickups) === JSON.stringify(c.pickups), 'revancha arranca igual en ambos');
  ok(a.rules === rules && c.rules === rules, `revancha con las mismas reglas (${a.rules}/${c.rules})`);
  ok(!clean(H.log).length && !clean(J.log).length, `consolas limpias ${clean(H.log)} ${clean(J.log)}`);
  await H.ctx.close(); await J.ctx.close();
}

const suites = { modes: suiteModes, place: suitePlace, hud: suiteHud, touch: suiteTouch, daily: suiteDaily, tuto: suiteTuto, pvc: suitePvc, pvp: suitePvp };
for (const k of which === 'all' ? Object.keys(suites) : which.split(',')) await suites[k]();
await b.close();
console.log(fails.length ? `\n${fails.length} FALLAS` : '\nTODO OK', '· capturas en', OUT);
process.exit(fails.length ? 1 : 0);
