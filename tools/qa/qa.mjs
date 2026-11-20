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
// la música (abcjs) viene de un CDN externo y a veces la red la corta: no es un error del juego
const clean = (log) => log.filter((l) => !/AudioContext/.test(l) && !/abcjs.*ERR_ABORTED/.test(l));
const shot = (p, n) => p.screenshot({ path: OUT + n + '.png' });
const b = await chromium.launch();
const which = process.argv[2] || 'all';

async function newGame(vp, cfg = {}, fresh = false) {
  const g = await mk(b, { viewport: vp, fresh });
  await g.page.goto(BASE); await g.page.waitForSelector('#start');
  if (fresh) { await g.page.waitForSelector('#intro-go'); await wait(400); await g.page.click('#intro-go'); await wait(300); }
  await setup(g.page, { map: 'iguazu', ...cfg });
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
    await p.waitForFunction(() => window.__parquesState().phase === 'place' && document.body.classList.contains('placing'), null, { timeout: 20000 }); await wait(200);
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
  const { page: p } = await newGame(VPS.mobile, {});
  let pend = null;
  for (let i = 0; i < 40 && !(pend && pend.ok); i++) { await clickCell(p, 2 + (i % 5), 3 + ((i * 3) % 14)); pend = (await st(p)).place.pending; }
  const t0 = Date.now();
  await p.waitForFunction(() => window.__parquesState().phase === 'attack', null, { timeout: 80000 });
  const s = await st(p);
  const kept = s.units[0]; // la primera pieza (5) era la pendiente; su nombre cambia según dónde quedó
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
    let i = await info(); ok(!i.open && i.pill && !i.shoot && !i.dev && !i.top, `${tag}: Clásico plegado = solo la píldora (sin Disparar/Maniobrar)`);
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
  await setup(p, { map: 'nahuel' }); await p.click('#start');
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

async function suiteAi() {
  console.log('IA NORMAL / DIFÍCIL (sin desafío del día)');
  const g = await mk(b, { viewport: VPS.mobile });
  const p = g.page;
  await p.goto(BASE); await p.waitForSelector('#start');
  await p.evaluate(() => localStorage.setItem('parques.daily.2026-01-01', '{"tries":3}'));
  await p.reload(); await p.waitForSelector('#start');
  ok(!(await p.$('#daily')), 'no hay botón de desafío del día');
  ok(await p.evaluate(() => !Object.keys(localStorage).some((k) => k.startsWith('parques.daily.'))), 'se borran los récords viejos del desafío');
  ok(await p.isVisible('#ailevel [data-ai=normal]') && await p.isVisible('#ailevel [data-ai=dificil]'), 'selector Normal/Difícil presente');
  await p.click('#ailevel [data-ai=dificil]');
  await setup(p, { map: 'iguazu' }); await p.click('#start');
  await p.waitForFunction(() => window.__parquesState().phase === 'place'); await placeAll(p); await p.click('#ready'); await waitAttack(p);
  ok(/Difícil/.test(await p.textContent('#inv-name')), 'IA difícil activa: ' + await p.textContent('#inv-name'));
  const r2 = await playGame(p, 'dificil', { maxMs: 400000, pMan: 0.3 });
  ok(r2.ended && !r2.notes.length, 'partida contra la difícil terminada (' + r2.turnNo + ' turnos, ' + r2.title + ')');
  ok(await p.evaluate(() => localStorage.getItem('parques.ai')) === 'dificil', 'la dificultad se recuerda');
  await p.click('#rematch'); await p.waitForFunction(() => window.__parquesState().phase === 'place');
  ok(clean(g.log).length === 0, 'consola limpia ' + clean(g.log));
  await shot(p, 'ai-end');
  await p.context().close();
}

async function suiteTuto() {
  console.log('TUTO (Clásico, sin mensajes que se van solos)');
  for (const tag of ['mobile', 'desktop']) {
    const g = await mk(b, { viewport: VPS[tag], fresh: true, ctx: tag === 'mobile' ? { hasTouch: true, isMobile: true } : {} });
    const { page: p, log } = g;
    await p.goto(BASE); await p.waitForSelector('#intro-go'); await wait(400); await p.click('#intro-go'); await wait(300);
    await p.click('#maps [data-map=nahuel]');
    await p.click('#how');
    await p.waitForFunction(() => window.__parquesState().phase === 'place', null, { timeout: 20000 });
    let s = await st(p);
    ok(s.rules === 'clasico', `${tag}: el tutorial juega Clásico (${s.rules})`);
    ok(s.tuto === 0 && /UBICÁ TU FLOTA/.test(await p.textContent('#coach-step')), `${tag}: paso 1 = ubicar la flota`);
    ok(await p.isHidden('#clock'), `${tag}: sin reloj mientras aprendés`);
    if (tag === 'mobile') await wait(500), await shot(p, 'tuto-clasico-1-mobile');
    await wait(7000);
    ok((await st(p)).tuto === 0 && await p.isVisible('#coach') && (await st(p)).phase === 'place', `${tag}: tras 7 s el mensaje sigue y nada se autocompleta`);
    await placeAll(p); await wait(200);
    ok((await st(p)).tuto === 1 && await p.isVisible('#coach'), `${tag}: paso 2 = Estoy listo`);
    await p.click('#ready'); await waitAttack(p); await wait(300);
    ok((await st(p)).tuto === 2 && /DISPARÁ/.test(await p.textContent('#coach-step')), `${tag}: paso 3 = disparar`);
    if (tag === 'mobile') await wait(500), await shot(p, 'tuto-clasico-3-mobile');
    await wait(6000);
    ok((await st(p)).tuto === 2, `${tag}: el paso de disparar no se va solo`);
    await clickCell(p, 5, 10);
    await p.waitForFunction(() => window.__parquesState().tuto === 3, null, { timeout: 20000 });
    ok(/RESULTADO/.test(await p.textContent('#coach-step')) && await p.isVisible('#coach-ok') && (await p.textContent('#coach-ok')) === 'Siguiente', `${tag}: paso 4 = leer el tiro, con «Siguiente»`);
    await waitAttack(p, 25000); await wait(6000);
    ok((await st(p)).tuto === 3, `${tag}: el paso de leer el tiro espera a «Siguiente»`);
    if (tag === 'mobile') await wait(500), await shot(p, 'tuto-clasico-4-mobile');
    await p.click('#coach-ok'); await wait(200);
    ok((await st(p)).tuto === 4 && /Gana quien hunda/.test(await p.textContent('#coach-text')), `${tag}: cierre con la condición de victoria en una línea`);
    if (tag === 'mobile') await wait(500), await shot(p, 'tuto-clasico-5-mobile');
    await p.click('#coach-ok'); await wait(200);
    ok(!(await p.isVisible('#coach')), `${tag}: coach se cierra`);
    ok(clean(log).length === 0, `${tag}: consola limpia ${JSON.stringify(clean(log))}`);
    await g.ctx.close();
  }
}

async function suiteQuit() {
  console.log('MENÚ EN PARTIDA (confirmación)');
  for (const tag of ['mobile', 'desktop']) {
    const { page: p, log } = await newGame(VPS[tag], { map: 'nahuel', rules: null });
    // colocación
    const c0 = await p.textContent('#clock');
    await p.click('#place-menu'); await wait(250);
    let s = await st(p);
    ok(s.quit && s.phase === 'place' && await p.isVisible('#quit-stay') && await p.isVisible('#quit-leave'), `${tag}: Menú en colocación pregunta`);
    if (tag === 'mobile') await shot(p, 'quit-confirm-place-mobile');
    await wait(2200);
    ok((await p.textContent('#clock')) === c0 || (await p.isHidden('#clock')), `${tag}: contra la máquina el reloj se congela con el diálogo abierto`);
    await p.click('#quit-stay'); await wait(200); s = await st(p);
    ok(!s.quit && s.phase === 'place', `${tag}: Seguir jugando vuelve a la colocación`);
    await placeAll(p); await p.click('#ready'); await waitAttack(p);
    await clickCell(p, 3, 3); await waitAttack(p, 25000);
    const t1 = (await st(p)).turnNo;
    // batalla: Menú (con el HUD abierto), Esc y atrás del navegador piden confirmación
    if (!(await p.isVisible('#back'))) await p.click('#hud-pill'); await wait(200);
    await p.click('#back'); await wait(250);
    ok((await st(p)).quit && (await st(p)).turnNo === t1, `${tag}: Menú en batalla pregunta sin tocar la partida`);
    if (tag === 'mobile') await shot(p, 'quit-confirm-battle-mobile');
    await p.keyboard.press('Escape'); await wait(150);
    ok(!(await st(p)).quit && (await st(p)).phase === 'attack', `${tag}: Esc cierra el diálogo`);
    await p.keyboard.press('Escape'); await wait(150);
    ok((await st(p)).quit, `${tag}: Esc en partida abre la confirmación`);
    await p.click('#quit-stay'); await wait(150);
    await p.goBack().catch(() => {}); await wait(400);
    ok((await st(p)).quit && (await st(p)).phase === 'attack', `${tag}: atrás del navegador también pregunta`);
    await p.click('#quit-leave'); await wait(300);
    ok(await p.isVisible('#menu') && (await st(p)).phase === 'menu', `${tag}: Abandonar vuelve al menú`);
    // rival abandona en PvP: gana por abandono
    ok(clean(log).length === 0, `${tag}: consola limpia ${JSON.stringify(clean(log))}`);
    await p.context().close();
  }
  const { page: q } = await newGame(VPS.mobile, { map: 'nahuel', rules: null });
  await placeAll(q); await q.click('#ready'); await waitAttack(q);
  await q.evaluate(() => window.__parquesInject({ t: 'bye' })); await wait(500);
  ok(await q.isVisible('#end') && /abandonó/.test(await q.textContent('#end-note')), 'PvP: el rival que abandona da la victoria con aviso');
  await q.context().close();
}

async function suiteLibre() {
  console.log('COLOCACIÓN LIBRE (agua = barco, tierra = tanque, nunca cruzando la costa)');
  // core: la regla libre en todos los sectores jugables de los tres mapas (la máquina coloca con placeRandom)
  const g0 = await mk(b, { viewport: VPS.desktop }); await g0.page.goto(BASE); await g0.page.waitForSelector('#start');
  const core = await g0.page.evaluate(() => {
    const C = window.ParquesCore; const out = { bad: 0, n: 0, names: 0, fleets: 0, mixed: 0 };
    for (const m of Object.keys(C.BOARDS)) for (const k of C.okTiles(m)) for (let i = 0; i < 10; i++) {
      const f = C.placeRandom(null, Math.random, m, k); out.fleets++;
      const kinds = new Set();
      f.forEach((u) => { out.n++; kinds.add(u.kind); if (C.mediumOf(m, k, C.cellsOf(u)) !== u.kind) out.bad++; if (u.name !== C.unitName(u.id, u.kind)) out.names++; });
      if (kinds.size === 2) out.mixed++;
      if (f.map((u) => u.size).join() !== '5,4,3,3,2') out.bad++;
    }
    const table = C.FLEET.map((f) => f.size + ':' + f.barco + '/' + f.tanque).join(' · ');
    const coast = C.placeIssue([], 0, 0, 5, true, null, 'auto', null, 'iguazu', C.okTiles('iguazu').find((k) => { const t = C.BOARDS.iguazu.tiles[k]; return t.mask.some((r) => /W/.test(r)) && t.mask.some((r) => /L/.test(r)); }));
    return { ...out, table, coast };
  });
  ok(core.n > 0 && core.bad === 0 && core.names === 0, `core: ${core.fleets} flotas al azar (como la máquina), ${core.n} piezas: 0 cruzan la costa, 0 nombres mal, siempre 5-4-3-3-2`);
  ok(core.mixed > 0, `core: hay flotas con barcos y tanques a la vez (${core.mixed})`);
  ok(/5:Portaaviones\/Blindado pesado · 4:Acorazado\/Tanque pesado · 3:Crucero\/Tanque · 3:Submarino\/Artillería · 2:Destructor\/Jeep/.test(core.table), `nombres: ${core.table}`);
  await g0.ctx.close();
  // UI: en el celular, una pieza que cruza la costa se rechaza; en el agua es barco, en tierra es tanque
  for (const [map, tag] of (process.env.LIBRE ? JSON.parse(process.env.LIBRE) : [['iguazu', 'mobile'], ['nahuel', 'mobile'], ['glaciares', 'desktop']])) {
    const touch = tag === 'mobile';
    const g = await mk(b, { viewport: VPS[tag], ctx: touch ? { hasTouch: true, isMobile: true } : {} });
    const { page: p, log } = g;
    await p.goto(BASE); await p.waitForSelector('#start');
    await setup(p, { map }); await p.click('#start');
    // el sector propio es al azar: se busca uno con costa (agua y tierra) para probar las dos cosas
    let s;
    for (let tries = 0; tries < 40; tries++) {
      await p.waitForFunction(() => window.__parquesState().phase === 'place', null, { timeout: 20000 }); await wait(200);
      s = await st(p);
      if (s.land.length >= 40 && s.land.length <= 160) break;
      await p.click('#place-menu'); await wait(150); await p.click('#quit-leave'); await wait(250); await p.click('#start');
    }
    const landSet = new Set(s.land.map(([x, y]) => x + ',' + y));
    const cellsP = (q, size) => Array.from({ length: size }, (_, i) => q.h ? (q.x + i) + ',' + q.y : q.x + ',' + (q.y + i));
    const medium = (cells) => { const l = cells.filter((k) => landSet.has(k)).length; return l === 0 ? 'barco' : l === cells.length ? 'tanque' : ''; };
    const tap = async (x, y) => { const c = await cellXY(p, x, y); if (touch) await p.touchscreen.tap(c.x, c.y); else await p.mouse.click(c.x, c.y); await wait(110); };
    // cada celda vecina de la costa es buena candidata para cruzarla
    const coastCells = [];
    for (let y = 0; y < 20; y++) for (let x = 0; x < 10; x++) { const L = landSet.has(x + ',' + y), R = landSet.has((x + 1) + ',' + y); if (x < 9 && L !== R) coastCells.push([Math.max(0, x - 2), y]); }
    let seenCoast = false;
    // tocar cerca de la costa acomoda la pieza sola en el lugar válido más cercano; arrastrarla y soltarla
    // cruzando la costa la deja en rojo: ✓ no anda y Enter avisa
    for (let i = 0; i < 30 && !((await st(p)).place.pending || {}).ok; i++) await tap(1 + (i % 7), 2 + ((i * 5) % 16));
    if (!(await st(p)).place.pending.h) { await p.click('#pc-rot'); await wait(120); }
    const straddle = [];
    for (let y = 0; y < 20; y++) for (let x = 0; x <= 5; x++) if (medium(cellsP({ x, y, h: true }, 5)) === '') straddle.push([x, y]);
    straddle.sort(() => Math.random() - 0.5);
    for (const [x, y] of straddle.slice(0, 12)) {
      const pend0 = (await st(p)).place.pending; if (!pend0) break;
      const a = await cellXY(p, pend0.x, pend0.y), z = await cellXY(p, x, y);
      await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move((a.x + z.x) / 2, (a.y + z.y) / 2, { steps: 4 }); await p.mouse.move(z.x, z.y, { steps: 4 }); await p.mouse.up(); await wait(180);
      const pend = (await st(p)).place.pending; if (!pend) continue;
      const size = (await st(p)).units.find((u) => u.lifted).size;
      if (process.env.DBG) console.log('   drag', JSON.stringify(pend0), '→', x, y, '=', JSON.stringify(pend), medium(cellsP(pend, size)));
      if (medium(cellsP(pend, size)) === '') {
        ok(!pend.ok && await p.isDisabled('#pc-ok'), `${map}: pieza soltada cruzando la costa en (${pend.x},${pend.y}) queda en rojo y ✓ deshabilitado`);
        await p.keyboard.press('Enter'); await wait(150);
        const s2 = await st(p);
        ok(s2.place.unplaced === 5 && /costa/i.test(s2.place.msg), `${map}: Enter no la fija y avisa «${s2.place.msg.slice(0, 80)}»`);
        if (touch) await shot(p, `libre-costa-rechazada-${map}-mobile`);
        seenCoast = true; break;
      }
    }
    ok(seenCoast, `${map}: se probó una pieza cruzando la costa`);
    // primera pieza en el agua y segunda en tierra (o al revés según el sector)
    const want = ['barco', 'tanque'];
    const dragTo = async (from, x, y) => {
      const a = await cellXY(p, from.x, from.y), z = await cellXY(p, x, y);
      await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move((a.x + z.x) / 2, (a.y + z.y) / 2, { steps: 4 }); await p.mouse.move(z.x, z.y, { steps: 4 }); await p.mouse.up(); await wait(180);
    };
    for (const kind of want) {
      let done = false;
      for (let attempt = 0; attempt < 4 && !done; attempt++) {
        const s1 = await st(p); let pend = s1.place.pending;
        if (!pend) { for (let i = 0; i < 30 && !((await st(p)).place.pending); i++) await tap(1 + (i % 7), 2 + ((i * 5) % 16)); pend = (await st(p)).place.pending; }
        if (attempt === 2) { await p.click('#pc-rot'); await wait(150); pend = (await st(p)).place.pending; }
        const u = (await st(p)).units.find((q) => q.lifted);
        const taken = new Set(); (await st(p)).units.filter((q) => !q.lifted).forEach((q) => cellsP({ x: q.x, y: q.y, h: q.horizontal }, q.size).forEach((k) => taken.add(k)));
        const spots = [];
        for (let y = 0; y < 20; y++) for (let x = 0; x < 10; x++) {
          const c = cellsP({ x, y, h: pend.h }, u.size);
          if (c.some((k) => { const [cx, cy] = k.split(',').map(Number); return cx > 9 || cy > 19 || taken.has(k); })) continue;
          if (medium(c) === kind) spots.push([x, y]);
        }
        if (!spots.length) continue;
        const [tx, ty] = spots[Math.floor(Math.random() * spots.length)];
        await dragTo(pend, tx, ty);
        const p2 = (await st(p)).place.pending;
        if (p2 && p2.ok && medium(cellsP(p2, u.size)) === kind) {
          await p.click('#pc-ok'); await wait(150);
          const s2 = await st(p); const got = s2.units.find((q) => q.x === p2.x && q.y === p2.y && !q.lifted);
          const NAMES = { barco: ['Portaaviones', 'Acorazado'], tanque: ['Blindado pesado', 'Tanque pesado'] };
          ok(got && got.kind === kind && NAMES[kind].includes(got.name), `${map}: en ${kind === 'barco' ? 'el agua' : 'tierra'} la pieza de ${u.size} es ${got && got.kind} «${got && got.name}»`);
          done = true;
        }
      }
      ok(done, `${map}: se pudo poner una pieza ${kind === 'barco' ? 'en el agua' : 'en tierra'}`);
    }
    await placeAll(p); await wait(250); s = await st(p);
    const bad = s.units.filter((u) => medium(cellsP({ x: u.x, y: u.y, h: u.horizontal }, u.size)) !== u.kind);
    ok(bad.length === 0 && new Set(s.units.map((u) => u.kind)).size === 2, `${map}: flota con barcos y tanques, todo en su medio (${s.units.map((u) => u.name).join(', ')})`);
    if (touch) await shot(p, `libre-barcos-y-tanques-${map}-mobile`);
    await p.click('#ready'); await waitAttack(p); await wait(300); s = await st(p);
    ok(s.botsOk === true, `${map}: la máquina respeta la misma regla (${s.foeKinds.join(',')})`);
    ok(clean(log).length === 0, `${map}: consola limpia ${JSON.stringify(clean(log))}`);
    await g.ctx.close();
  }
}

async function suiteSectors() {
  console.log('SECTORES (reales, contiguos, sin superponerse, todos jugables)');
  const g = await mk(b, { viewport: VPS.desktop }); await g.page.goto(BASE); await g.page.waitForSelector('#start');
  const r = await g.page.evaluate(() => {
    const C = window.ParquesCore; const out = {};
    for (const m of Object.keys(C.BOARDS)) {
      const grid = C.BOARDS[m]; const ok = C.okTiles(m);
      const o = { tiles: grid.tiles.length, ok: ok.length, max: C.maxPlayers(m), flagMismatch: 0, overlap: 0, picks: 0, bad: 0, rejects: 0 };
      // "ok" del build = la flota 5-4-3-3-2 entra con la regla libre; los no jugables nunca se usan
      grid.tiles.forEach((t, k) => { if (!!t.ok !== C.fleetFits(m, k)) o.flagMismatch++; });
      // bboxes de sectores distintos no se pisan (solo comparten borde)
      for (let i = 0; i < grid.tiles.length; i++) for (let j = i + 1; j < grid.tiles.length; j++) {
        const a = grid.tiles[i].bbox, c = grid.tiles[j].bbox, e = 1e-9;
        if (a[0] < c[2] - e && c[0] < a[2] - e && a[1] < c[3] - e && c[1] < a[3] - e) o.overlap++;
      }
      for (let n = 2; n <= o.max; n++) for (let i = 0; i < 40; i++) {
        const list = C.pickSectors(m, n, Math.random); o.picks++;
        if (!C.validSectors(m, list, n) || list.some((k) => !grid.tiles[k].ok) || new Set(list).size !== n) o.bad++;
      }
      // validSectors rechaza: repetidos, fuera de rango, no conexos
      if (!C.validSectors(m, [ok[0], ok[0]], 2)) o.rejects++;
      if (!C.validSectors(m, [0, 999], 2)) o.rejects++;
      const far = ok.find((k) => k !== ok[0] && !C.tileNeighbors(m, ok[0]).some((nb) => nb.k === k));
      if (far != null && !C.validSectors(m, [ok[0], far], 2)) o.rejects++;
      const v = C.geoView(m, null, C.pickSectors(m, o.max, Math.random));
      o.geo = v.km.join('×') + 'km z' + v.z;
      out[m] = o;
    }
    return out;
  });
  for (const [m, o] of Object.entries(r)) {
    ok(o.flagMismatch === 0 && o.ok > 0, `${m}: ${o.ok}/${o.tiles} sectores jugables; la marca coincide con «la flota entra» en todos`);
    ok(o.overlap === 0, `${m}: ningún par de sectores se superpone`);
    ok(o.max >= 2 && o.max <= 8, `${m}: hasta ${o.max} jugadores`);
    ok(o.bad === 0, `${m}: ${o.picks} sorteos de 2..${o.max} sectores, todos distintos, jugables y contiguos`);
    ok(o.rejects === 3, `${m}: se rechazan sectores repetidos, inexistentes o separados (${o.rejects}/3)`);
    console.log(`   ${m}: Google Maps con ${o.max} sectores → ${o.geo}`);
  }
  await g.ctx.close();
}

async function ffaLobby(p, map, extra) {
  await p.goto(BASE + (BASE.includes('?') ? '&' : '?') + 'rapido=1'); await p.waitForSelector('#start');
  await setup(p, { map, mode: 'ffa' });
  await p.click('#start'); await p.waitForSelector('#lobby:not(.hidden)');
  for (let i = 0; i < extra; i++) await p.click('#seat-add');
}
const randCell = () => [Math.floor(Math.random() * 10), Math.floor(Math.random() * 20)];
async function suiteFfa() {
  console.log('TODOS CONTRA TODOS: 1 persona + 7 máquinas');
  const g = await mk(b, { viewport: VPS.mobile, ctx: { hasTouch: true, isMobile: true } });
  const { page: p, log } = g;
  await p.goto(BASE); await p.waitForSelector('#start');
  await p.click('#modes [data-mode=ffa]');
  ok(await p.isHidden('#ai-block') && await p.isHidden('#nations-block') && /Armar la batalla/.test(await p.textContent('#start')), 'menú: Todos contra todos sin invasor ni nivel; botón «Armar la batalla»');
  ok(await p.isHidden('#rules-block') && !(await p.$('#terrains')), 'menú: sin Reloaded ni modos de terreno a la vista');
  await ffaLobby(p, 'nahuel', 0);
  let s = await st(p);
  ok(s.phase === 'lobby' && s.lobby.seats.length === 4 && s.lobby.seats[0].kind === 'me', `sala: arranca con vos + 3 máquinas (${s.lobby.seats.map((q) => q.kind + (q.ai ? '/' + q.ai : '')).join(',')})`);
  for (let i = 0; i < 4; i++) await p.click('#seat-add');
  s = await st(p);
  ok(s.lobby.seats.length === 8 && await p.isDisabled('#seat-add'), `sala: tope de 8 lugares (${s.lobby.seats.length})`);
  await p.click('#seats li:nth-child(3) .seat-kind button:nth-child(2)'); await wait(100);
  ok((await st(p)).lobby.seats[2].ai === 'dificil', 'sala: un lugar pasa a Difícil');
  await p.click('#seats li:nth-child(8) .seat-x'); await p.click('#seat-add'); await wait(100);
  ok((await st(p)).lobby.seats.length === 8, 'sala: ✕ quita un lugar y se puede volver a sumar');
  await shot(p, 'ffa-sala-mobile');
  await p.click('#lobby-go');
  await p.waitForFunction(() => window.__parquesState().phase === 'place', null, { timeout: 20000 }); await wait(300);
  s = await st(p);
  const valid = await p.evaluate((l) => window.ParquesCore.validSectors('nahuel', l, 8), s.sectors);
  ok(s.ffa && s.ffa.seats.length === 8 && valid, `8 sectores reales distintos y contiguos ${JSON.stringify(s.sectors)}`);
  ok(await p.isVisible('#place-menu'), 'colocación: Menú a mano');
  await placeAll(p); await p.click('#ready');
  await p.waitForFunction(() => { const q = window.__parquesState(); return q.phase === 'attack' || q.phase === 'defend'; }, null, { timeout: 30000 });
  await wait(400); s = await st(p);
  ok(s.botsOk === true, `las 7 máquinas respetan la regla libre (${new Set(s.foeKinds).size === 2 ? 'barcos y tanques' : s.foeKinds.join(',')})`);
  ok(s.ffa.chips === 8 && await p.isVisible('#ffa-strip') && await p.isHidden('#hud-pill'), `franja compacta con los 8 (${s.ffa.chips}) y sin píldora 1v1`);
  const geo = await p.getAttribute('#ffa-geo', 'href');
  // primer turno propio: elegir rival en la franja y disparar a su sector
  await p.waitForFunction(() => window.__parquesState().phase === 'attack', null, { timeout: 60000 });
  const pick = (await st(p)).ffa.seats.findIndex((q, i) => i !== 0 && !q.out && i !== (s.ffa.view));
  await p.click(`#ffa-chips .fchip[data-seat="${pick}"]`); await wait(200);
  s = await st(p);
  ok(s.ffa.view === pick && s.view === 'remote', `tocar un rival lo muestra grande (${s.ffa.seats[pick].flag} ${s.ffa.seats[pick].name})`);
  const m0 = s.ffa.seats[pick].marks;
  const [x0, y0] = randCell(); await clickCell(p, x0, y0);
  await p.waitForFunction(([i, m]) => window.__parquesState().ffa.seats[i].marks > m, [pick, m0], { timeout: 8000 }).catch(() => {});
  ok((await st(p)).ffa.seats[pick].marks >= m0 + 1, 'el disparo cae en el sector del rival elegido');
  await p.click('#ffa-more'); await wait(200);
  s = await st(p);
  const geo2 = await p.getAttribute('#ffa-geo', 'href');
  const want = await p.evaluate((l) => { const v = window.ParquesCore.geoView('nahuel', null, l); return 'https://www.google.com/maps/@' + v.lat + ',' + v.lng + ',' + v.z + 'z/data=!3m1!1e3'; }, s.sectors);
  ok(s.ffa.open && await p.isVisible('#ffa-geo') && geo2 === want, `▾ despliega nombres y un solo link a Google Maps del área de los 8 (${geo2})`);
  await shot(p, 'ffa-batalla-8-abierta-mobile');
  await p.click('#ffa-more'); await wait(150);
  // Menú en batalla: confirma
  await p.click('#place-menu'); await wait(200);
  ok((await st(p)).quit && /progreso/.test(await p.textContent('#quit-text')), `Menú en batalla pregunta («${await p.textContent('#quit-text')}»)`);
  await p.click('#quit-stay'); await wait(150);
  let shots = 0, t0 = Date.now(), shotTaken = false, spect = false;
  while (Date.now() - t0 < 400000) {
    s = await st(p);
    if (s.phase === 'end') break;
    if (s.ffa.seats[0].out && !spect) { spect = true; await wait(400); ok(s.phase !== 'end' && (await st(p)).ffa.alive >= 2, `eliminado: queda mirando (${(await st(p)).ffa.alive} en pie)`); }
    if (s.phase === 'attack') {
      const [x, y] = randCell(); await clickCell(p, x, y); shots++;
      if (!shotTaken && shots >= 8) { await wait(500); await shot(p, 'ffa-batalla-8-mobile'); shotTaken = true; }
    }
    await wait(60);
  }
  s = await st(p); await wait(1400);
  const ranks = s.ffa.seats.map((q) => q.rank).sort((a, c) => a - c).join();
  ok(s.phase === 'end' && ranks === '1,2,3,4,5,6,7,8', `terminó: puestos ${s.ffa.seats.map((q) => q.flag + q.rank).join(' ')} (${shots} disparos propios, ${Math.round((Date.now() - t0) / 1000)} s)`);
  const end = await p.evaluate(() => ({ rank: document.querySelectorAll('#ffa-rank li').length, recap: !document.getElementById('recap').classList.contains('hidden'), rematch: !document.getElementById('rematch').classList.contains('hidden'), dock: getComputedStyle(document.getElementById('dock-btns')).display, strip: getComputedStyle(document.getElementById('ffa-strip')).display }));
  ok(end.rank === 8 && !end.recap && !end.rematch, `final: tabla de 8 puestos; «Jugada a jugada» y revancha se ocultan con más de 2 (${JSON.stringify(end)})`);
  ok(end.dock === 'none' && end.strip === 'none', 'final en celular: ni ♪ ni franja tapan las estadísticas');
  await shot(p, 'ffa-final-mobile');
  await p.click('#again'); await wait(300);
  ok((await st(p)).phase === 'menu' && await p.isHidden('#ffa-strip'), 'Menú vuelve limpio al inicio');
  ok(clean(log).length === 0, `consola limpia ${JSON.stringify(clean(log))}`);
  await g.ctx.close();
}

async function suiteFfaNet() {
  console.log('TODOS CONTRA TODOS EN LÍNEA: 3 personas + 2 máquinas (PeerJS), una se corta');
  const V = { viewport: VPS.mobile };
  const H = await mk(b, V); const p = H.page;
  await ffaLobby(p, 'glaciares', 1);
  await p.click('#seats li:nth-child(2) .seat-kind button:nth-child(3)');
  await p.click('#seats li:nth-child(3) .seat-kind button:nth-child(3)');
  await p.waitForFunction(() => /sala=/.test(document.getElementById('lobby-url').value), null, { timeout: 30000 });
  const url = (await p.inputValue('#lobby-url')).replace(/^https?:\/\/[^/]+\/(batalla-naval-parques\/)?/, BASE);
  ok(await p.isVisible('#lobby-link') && /\?sala=/.test(url), `la sala tiene enlace para invitar (${url})`);
  const G = [];
  for (let i = 0; i < 2; i++) { const g = await mk(b, V); await g.page.goto(url + '&rapido=1'); G.push(g); }
  await p.waitForFunction(() => window.__parquesState().lobby.seats.filter((s) => s.kind === 'human' && s.on).length === 2, null, { timeout: 40000 });
  await G[0].page.waitForSelector('#lobby:not(.hidden)'); await wait(300);
  ok(await G[0].page.isHidden('#lobby-go') && /Esperando/.test(await G[0].page.textContent('#lobby-note')), 'invitado: ve la sala y espera al anfitrión');
  await shot(p, 'ffa-sala-anfitrion-mobile'); await shot(G[0].page, 'ffa-sala-invitado-mobile');
  await p.click('#lobby-go');
  const all = [p, ...G.map((g) => g.page)];
  await Promise.all(all.map(async (q) => { await placeAll(q); await q.click('#ready'); }));
  await p.waitForFunction(() => { const s = window.__parquesState(); return s.ffa && (s.phase === 'attack' || s.phase === 'defend'); }, null, { timeout: 40000 });
  const ss = await Promise.all(all.map((q) => st(q)));
  ok(ss.every((s) => s.ffa && JSON.stringify(s.sectors) === JSON.stringify(ss[0].sectors)) && new Set(ss.map((s) => s.ffa.me)).size === 3, `los 3 ven los mismos 5 sectores ${JSON.stringify(ss[0].sectors)}; cada uno el suyo`);
  ok(ss[0].ffa.seats.map((q) => q.kind).join() === 'me,human,human,bot,bot', `lugares: ${ss[0].ffa.seats.map((q) => q.kind).join(',')}`);
  const pages = all.slice(); const shots = [0, 0, 0]; let dropped = false, t0 = Date.now(), tDrop = 0, took = false;
  while (Date.now() - t0 < 420000) {
    const s = await Promise.all(pages.map((q) => st(q)));
    if (s.every((q) => q.phase === 'end')) break;
    if (!dropped && shots[2] >= 2) { dropped = true; tDrop = Date.now(); await G[1].ctx.close(); pages.pop(); continue; }
    if (dropped && tDrop && (s[0].ffa.seats[2].kind === 'bot')) { ok(true, `la persona que se cortó pasa a ser máquina en ${Math.round((Date.now() - tDrop) / 1000)} s (latido)`); tDrop = 0; }
    for (let i = 0; i < pages.length; i++) if (s[i].phase === 'attack') { const [x, y] = randCell(); await clickCell(pages[i], x, y); shots[i]++; if (i === 1 && shots[1] === 3 && !took) { took = true; await wait(400); await shot(pages[1], 'ffa-online-invitado-mobile'); } }
    await wait(50);
  }
  if (tDrop) ok(false, 'la persona que se cortó nunca pasó a máquina');
  const fin = await Promise.all(pages.map((q) => st(q)));
  ok(fin.every((s) => s.phase === 'end') && fin[0].ffa.seats.map((q) => q.rank).join() === fin[1].ffa.seats.map((q) => q.rank).join(), `terminó igual para los que siguen: ${fin[0].ffa.seats.map((q) => q.flag + q.rank).join(' ')}`);
  ok(fin[1].ffa.seats[2].kind === 'bot', 'el invitado también ve que la máquina tomó el lugar');
  ok(!clean(H.log).length && !clean(G[0].log).length, `consolas limpias ${clean(H.log)} ${clean(G[0].log)}`);
  // abandonar con el Menú en plena batalla avisa limpio a los demás
  const H2 = await mk(b, V); const q = H2.page;
  await ffaLobby(q, 'iguazu', 0);
  await q.click('#seats li:nth-child(2) .seat-kind button:nth-child(3)');
  await q.waitForFunction(() => /sala=/.test(document.getElementById('lobby-url').value), null, { timeout: 30000 });
  const url2 = (await q.inputValue('#lobby-url')).replace(/^https?:\/\/[^/]+\/(batalla-naval-parques\/)?/, BASE);
  const J = await mk(b, V); await J.page.goto(url2 + '&rapido=1');
  await q.waitForFunction(() => window.__parquesState().lobby.seats.some((s) => s.kind === 'human' && s.on), null, { timeout: 40000 });
  await q.click('#lobby-go');
  await Promise.all([q, J.page].map(async (x) => { await placeAll(x); await x.click('#ready'); }));
  await J.page.waitForFunction(() => { const s = window.__parquesState(); return s.ffa && (s.phase === 'attack' || s.phase === 'defend'); }, null, { timeout: 40000 });
  await J.page.click('#place-menu'); await wait(200); await J.page.click('#quit-leave');
  await q.waitForFunction(() => window.__parquesState().ffa.seats[1].kind === 'bot', null, { timeout: 8000 }).catch(() => {});
  ok((await st(q)).ffa.seats[1].kind === 'bot' && /abandonó/.test(await q.textContent('#dialogue') + (await q.evaluate(() => (document.getElementById('log') || {}).textContent || ''))), 'invitado abandona: el anfitrión recibe aviso y juega la máquina por él');
  await q.click('#place-menu'); await wait(150); await q.click('#quit-leave'); await wait(300);
  ok((await st(q)).phase === 'menu', 'anfitrión abandona: vuelve al menú');
  await H.ctx.close(); await G[0].ctx.close(); await H2.ctx.close(); await J.ctx.close();
  // caso inverso con 2 personas
  const H3 = await mk(b, V); const h = H3.page;
  await ffaLobby(h, 'nahuel', 0);
  await h.click('#seats li:nth-child(2) .seat-kind button:nth-child(3)');
  await h.waitForFunction(() => /sala=/.test(document.getElementById('lobby-url').value), null, { timeout: 30000 });
  const url3 = (await h.inputValue('#lobby-url')).replace(/^https?:\/\/[^/]+\/(batalla-naval-parques\/)?/, BASE);
  const K = await mk(b, V); await K.page.goto(url3 + '&rapido=1');
  await h.waitForFunction(() => window.__parquesState().lobby.seats.some((s) => s.kind === 'human' && s.on), null, { timeout: 40000 });
  await h.click('#lobby-go');
  await Promise.all([h, K.page].map(async (x) => { await placeAll(x); await x.click('#ready'); }));
  await K.page.waitForFunction(() => { const s = window.__parquesState(); return s.ffa && (s.phase === 'attack' || s.phase === 'defend'); }, null, { timeout: 40000 });
  await h.click('#place-menu'); await wait(200);
  ok(/anfitrión/.test(await h.textContent('#quit-text')), `anfitrión: la confirmación avisa que termina para todos`);
  await h.click('#quit-leave');
  await K.page.waitForFunction(() => window.__parquesState().phase === 'end', null, { timeout: 20000 }).catch(() => {});
  ok((await st(K.page)).phase === 'end' && /anfitri/i.test(await K.page.textContent('#end-title')), `anfitrión abandona: el invitado ve el final con aviso («${await K.page.textContent('#end-title')}»)`);
  await H3.ctx.close(); await K.ctx.close();
}

async function suiteFfaTimer() {
  console.log('TODOS CONTRA TODOS: reloj de turno (2 jugadores, la persona no tira)');
  const g = await mk(b, { viewport: VPS.mobile });
  const { page: p, log } = g;
  await p.goto(BASE); await p.waitForSelector('#start');
  await setup(p, { map: 'iguazu', mode: 'ffa' });
  await p.click('#start'); await p.waitForSelector('#lobby:not(.hidden)');
  await p.click('#seats li:nth-child(4) .seat-x'); await p.click('#seats li:nth-child(3) .seat-x'); await wait(100);
  ok((await st(p)).lobby.seats.length === 2 && await p.isDisabled('#seats li:nth-child(2) .seat-x'), 'sala: mínimo 2 (vos + 1 máquina)');
  await p.click('#lobby-go'); await placeAll(p); await p.click('#ready');
  await p.waitForFunction(() => window.__parquesState().phase === 'attack', null, { timeout: 60000 });
  const t0 = Date.now(), m0 = (await st(p)).ffa.seats[1].marks;
  await p.waitForFunction((m) => window.__parquesState().ffa.seats[1].marks > m, m0, { timeout: 45000 }).catch(() => {});
  const dt = Math.round((Date.now() - t0) / 1000);
  ok((await st(p)).ffa.seats[1].marks > m0 && dt >= 25 && dt <= 40, `a los ${dt} s sin tocar, el turno se juega solo y sigue (sin colgarse)`);
  ok(clean(log).length === 0, `consola limpia ${JSON.stringify(clean(log))}`);
  await g.ctx.close();
}

async function suitePvc() {
  console.log('PVC (bots contra la IA, Clásico)');
  const cfgs = [['mobile', 'nahuel', '-', 'clasico'], ['desktop', 'iguazu', '-', 'clasico'], ['desktop', 'glaciares', '-', 'clasico'], ['landscape', 'iguazu', '-', 'clasico']];
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
  console.log('SOLO CLÁSICO (Reloaded oculto detrás de una bandera, sin modos de terreno)');
  for (const tag of ['mobile', 'desktop']) {
    const g = await mk(b, { viewport: VPS[tag] }); const p = g.page;
    await p.goto(BASE + '?reglas=reloaded'); await p.waitForSelector('#start');
    const txt = await p.evaluate(() => document.getElementById('menu').innerText);
    ok(await p.isHidden('#rules-block') && !/Reloaded/i.test(txt), `${tag}: el menú no muestra Reloaded (ni con ?reglas=reloaded)`);
    ok(!(await p.$('#terrains')) && !/tierra\s*\/|mixto|\d+\s*%/i.test(txt), `${tag}: sin modos de terreno ni porcentajes`);
    await shot(p, `menu-${tag}`);
    await setup(p, { map: 'nahuel' }); await p.click('#start');
    await placeAll(p); await p.click('#ready'); await waitAttack(p); await wait(500);
    let s = await st(p);
    const vis = await p.evaluate(() => ({ turnbar: !!document.getElementById('turnbar').offsetParent, war: document.getElementById('pill-war').textContent, next: document.getElementById('pill-next').textContent, dev: !!(document.getElementById('act-dev') || {}).offsetParent }));
    ok(s.rules === 'clasico' && !vis.turnbar && !vis.war && !vis.next && !vis.dev, `${tag}: juega Clásico, solo la píldora ${JSON.stringify(vis)}`);
    ok(s.pickups.length === 0, `${tag}: sin tesoros`);
    await clickCell(p, 0, 0); await waitAttack(p, 30000);
    const t1 = (await st(p)).turnNo;
    await clickCell(p, 0, 0); await wait(400);
    s = await st(p);
    ok(s.turnNo === t1 && s.phase === 'attack' && /ya disparaste/i.test(await p.textContent('#dialogue')), `${tag}: no se puede repetir una celda`);
    await shot(p, `battle-clasico-${tag}`);
    // un rival que pide otras reglas: se rechaza
    await p.evaluate(() => window.__parquesInject({ t: 'ready', rules: 'reloaded' })); await wait(400);
    ok(await p.evaluate(() => !document.getElementById('menu').classList.contains('hidden')) && /otras reglas/.test(await p.textContent('.lede')), `${tag}: reglas que no coinciden = se rechaza`);
    ok(!(await p.$('#daily')) && !/Desafío del día/i.test(await p.textContent('body')), `${tag}: sin desafío del día`);
    ok(clean(g.log).length === 0, `${tag}: consola limpia ${clean(g.log)}`);
    await g.ctx.close();
  }
}

async function suitePvp() {
  for (const rules of (process.env.RULES || 'clasico').split(',')) await pvpOnce(rules);
}
async function pvpOnce(rules) {
  console.log('PVP ' + rules + ' ' + (process.env.VP || 'mobile'));
  const vp = VPS[process.env.VP || 'mobile'];
  const H = await mk(b, { viewport: vp }), J = await mk(b, { viewport: vp });
  await H.page.goto(BASE, { waitUntil: 'networkidle' });
  await setup(H.page, { map: 'nahuel', nation: 'rusia', mode: 'pvp', rules });
  await H.page.click('#start');
  await H.page.waitForFunction(() => /\?sala=/.test(document.getElementById('link').value), null, { timeout: 30000 });
  const link = await H.page.inputValue('#link');
  await J.page.goto(link.replace(/^https?:\/\/[^/]+\/(batalla-naval-parques\/)?/, BASE), { waitUntil: 'domcontentloaded' });
  await J.page.waitForFunction(() => window.__parquesState && window.__parquesState().phase === 'place', null, { timeout: 40000 });
  ok((await st(J.page)).place.unplaced === 5, 'invitado coloca unidad por unidad');
  ok((await st(J.page)).rules === rules && JSON.stringify((await st(J.page)).sectors) === JSON.stringify((await st(H.page)).sectors), `el invitado juega ${rules} en los mismos dos sectores ${JSON.stringify((await st(J.page)).sectors)}`);
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
  await wait(900);
  const rc = (pg) => pg.evaluate(() => ({ vis: !!document.getElementById('recap').offsetParent, cols: document.querySelectorAll('#recap-chart .col').length, bars: document.querySelectorAll('#recap-chart .b').length, cap: document.getElementById('recap-cap').textContent }));
  const [ra, rb] = [await rc(H.page), await rc(J.page)];
  ok(ra.vis && rb.vis && ra.bars === rb.bars && ra.bars >= a.turnNo - 1 && ra.cols === rb.cols, `resumen en ambos (${rules}): ${ra.cols}/${rb.cols} rondas, ${ra.bars}/${rb.bars} jugadas, ${a.turnNo} turnos · «${ra.cap}» / «${rb.cap}»`);
  await shot(H.page, `pvp-${rules}-host-end`); await shot(J.page, `pvp-${rules}-join-end`);
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

async function suiteGeo() {
  console.log('LINK A GOOGLE MAPS (uno solo: el parque en el menú, el área de los sectores en juego en la partida)');
  const exp = (p, m, sec) => p.evaluate(([m, sec]) => { const v = window.ParquesCore.geoView(m, null, sec); return 'https://www.google.com/maps/@' + v.lat + ',' + v.lng + ',' + v.z + 'z/data=!3m1!1e3'; }, [m, sec]);
  for (const tag of ['mobile', 'desktop']) {
    const g = await mk(b, { viewport: VPS[tag] }); const p = g.page;
    await p.goto(BASE); await p.waitForSelector('#start');
    for (const m of ['nahuel', 'iguazu', 'glaciares']) {
      await p.click(`#maps [data-map=${m}]`);
      const a = await p.evaluate(() => { const e = document.getElementById('map-geo'); return { href: e.href, target: e.target, rel: e.rel, vis: !!e.offsetParent, n: document.querySelectorAll('#menu a[href*="google.com/maps"]:not(.hidden)').length }; });
      ok(a.vis && a.n === 1 && a.href === await exp(p, m, null) && a.target === '_blank' && /noopener/.test(a.rel), `${tag}: menú ${m} → ${a.href}`);
    }
    await p.click('#maps [data-map=iguazu]');
    await g.ctx.route('https://www.google.com/**', (r) => r.fulfill({ status: 200, body: 'ok' }));
    const [pop] = await Promise.all([g.ctx.waitForEvent('page'), p.click('#map-geo')]);
    ok(pop.url() === await exp(p, 'iguazu', null), `${tag}: abre pestaña nueva`); await pop.close();
    await setup(p, { map: 'iguazu' }); await p.click('#start');
    await p.waitForFunction(() => document.body.classList.contains('placing')); await wait(200);
    ok(!(await p.isVisible('#board-geo')), `${tag}: en colocación el link no aparece`);
    await placeAll(p); await p.click('#ready'); await waitAttack(p); await wait(500);
    const s = await st(p);
    const img = await p.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((u) => /maps\/iguazu-s\d\d\.jpg/.test(u)));
    const nn = (k) => 'iguazu-s' + String(k).padStart(2, '0') + '.jpg';
    ok(s.sectors.length === 2 && await p.evaluate((l) => window.ParquesCore.validSectors('iguazu', l, 2), s.sectors) && s.sectors.every((k) => img.some((u) => u.endsWith(nn(k)))), `${tag}: dos sectores reales contiguos ${JSON.stringify(s.sectors)}, cargó sus imágenes`);
    await p.click('#hud-pill'); await wait(400);
    const bh = await p.getAttribute('#board-geo', 'href');
    ok(await p.isVisible('#board-geo') && bh === await exp(p, 'iguazu', s.sectors), `${tag}: con el panel abierto, un solo link al área de ambos ${bh}`);
    await shot(p, `geo-battle-${tag}`);
    await p.click('#hud-pill'); await wait(300);
    ok(clean(g.log).length === 0, `${tag}: consola limpia ${clean(g.log)}`);
    await g.ctx.close();
  }
}

async function suiteRecap() {
  console.log('RESUMEN FINAL (jugada a jugada)');
  const cfgs = [['mobile', 'nahuel', '-', 'normal', 'clasico'], ['desktop', 'iguazu', '-', 'dificil', 'clasico'], ['landscape', 'glaciares', '-', 'normal', 'clasico']];
  await Promise.all(cfgs.map(async ([vp, map, terrain, ai, rules]) => {
    const g = await mk(b, { viewport: VPS[vp] });
    const p = g.page;
    await p.goto(BASE); await p.waitForSelector('#start');
    await p.click(`#ailevel [data-ai=${ai}]`);
    await setup(p, { map, terrain, rules }); await p.click('#start');
    await p.waitForFunction(() => window.__parquesState().phase === 'place', null, { timeout: 20000 });
    await placeAll(p); await p.click('#ready');
    vp = vp + '-' + rules;
    const r = await playGame(p, `recap-${vp}`, { maxMs: 480000, pMan: 0.35, shootOnly: rules === 'clasico' });
    if (!r.ended) { ok(false, `${vp}/${ai}: la partida no terminó a tiempo (${r.turnNo} turnos) ${r.notes.join(',')}`); await shot(p, `recap-${vp}-sin-final`); await p.context().close(); return; }
    await wait(900);
    const info = await p.evaluate(() => {
      const box = document.getElementById('recap'), vh = innerHeight;
      const cols = document.querySelectorAll('#recap-chart .col').length;
      const btns = ['rematch', 'share', 'again'].map((id) => { const q = document.getElementById(id).getBoundingClientRect(); return q.top >= 0 && q.bottom <= vh + 1; });
      const top = document.getElementById('end-kicker').getBoundingClientRect().top;
      return { vis: !box.classList.contains('hidden') && !!box.offsetParent, cols, cap: document.getElementById('recap-cap').textContent, tip: document.getElementById('recap-tip').textContent, btns, top, rounds: Math.floor((window.__parquesState().turnNo - 1) / 2) + 1, bars: document.querySelectorAll('#recap-chart .b').length, chron: window.__parquesState().chron };
    });
    ok(r.ended && !r.notes.length, `${vp}/${ai}: partida terminada (${r.turnNo} turnos, ${r.title}) ${r.notes.join(',')}`);
    ok(info.vis && info.cols === info.rounds && info.bars === info.chron && info.bars >= r.turnNo, `${vp}: resumen con ${info.cols} rondas y ${info.bars} jugadas (crónica ${info.chron}, turnos ${r.turnNo})`);
    ok(info.cap.length > 10, `${vp}: momento clave «${info.cap}»`);
    ok(info.btns.every(Boolean), `${vp}: botones a la vista ${info.btns}`);
    ok(info.top >= 0, `${vp}: arriba no se corta (kicker en ${Math.round(info.top)})`);
    await shot(p, `recap-${vp}`);
    const col = p.locator('#recap-chart .col').nth(Math.floor(info.cols / 2));
    await col.click(); await wait(200);
    const cap2 = await p.textContent('#recap-cap');
    ok(/^Ronda \d+/.test(cap2) && cap2 !== info.cap, `${vp}: tocar una ronda la explica «${cap2.slice(0, 90)}…»`);
    await shot(p, `recap-${vp}-tap`);
    // compartir copia el texto con la tira de jugadas
    await p.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin });
    await p.click('#share'); await wait(400);
    const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    ok(/[🟥🟦🟨🟩⬛💥]/u.test(clip) && /\?parque=/.test(clip), `${vp}: compartir lleva la tira «${clip.split('\n').slice(1, 2).join('')}»`);
    // la revancha limpia la crónica
    await p.evaluate(() => { document.getElementById('juke-panel')?.classList.add('hidden'); document.getElementById('rematch').click(); });
    await p.waitForFunction(() => window.__parquesState().phase === 'place', null, { timeout: 20000 });
    ok((await st(p)).chron === 0, `${vp}: revancha arranca con la crónica vacía`);
    ok(clean(g.log).length === 0, `${vp}: consola limpia ${JSON.stringify(clean(g.log))}`);
    console.log('   tip:', info.tip);
    await p.context().close();
  }));
}

const suites = { quit: suiteQuit, libre: suiteLibre, sectors: suiteSectors, geo: suiteGeo, modes: suiteModes, place: suitePlace, hud: suiteHud, touch: suiteTouch, ai: suiteAi, tuto: suiteTuto, pvc: suitePvc, recap: suiteRecap, pvp: suitePvp, ffa: suiteFfa, ffatimer: suiteFfaTimer, ffanet: suiteFfaNet };
for (const k of which === 'all' ? Object.keys(suites) : which.split(',')) await suites[k]();
await b.close();
console.log(fails.length ? `\n${fails.length} FALLAS` : '\nTODO OK', '· capturas en', OUT);
process.exit(fails.length ? 1 : 0);
