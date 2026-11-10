import { st, clickCell, wait, dlg, ended, waitAttack } from './lib.mjs';
// Bot mixto: dispara (a veces repite celdas golpeadas), y de tanto en tanto maniobra por la UI.
async function back(p) { await p.evaluate(() => { const c = document.getElementById('man-cancel'); const sh = document.getElementById('act-shoot'); if (c.offsetParent) c.click(); else if (sh.offsetParent) sh.click(); }); await wait(120); }
async function fold(p, on) { const cur = await p.evaluate(() => document.body.classList.contains('hud-fold')); if (cur !== on) { await p.evaluate(() => document.getElementById('hud-fold').click()); await wait(80); } }
export async function playGame(p, tag, o = {}) {
  const rnd = o.rnd || Math.random;
  const stats = { shots: 0, repeat: 0, mover: 0, vigilar: 0, reparar: 0, apuntar: 0, init: 0, blocked: 0, notes: [], levels: new Set() };
  const hitCells = [];
  const tried = new Set();
  const t0 = Date.now();
  let lastHp = null, guard = 0;
  while (!(await ended(p))) {
    if (Date.now() - t0 > (o.maxMs || 240000)) { stats.notes.push('TIMEOUT'); break; }
    const s = await st(p);
    if (s.phase !== 'attack') { await wait(150); continue; }
    if (++guard > 400) { stats.notes.push('GUARD'); break; }
    stats.levels.add(s.level);
    if (lastHp != null && s.foeHp < lastHp) { /* hit happened on last shot */ }
    lastHp = s.foeHp;
    const r = rnd();
    const devOff = await p.evaluate(() => document.getElementById('act-dev').disabled);
    if (devOff) stats.devOff = (stats.devOff || 0) + 1;
    const maneuver = !o.shootOnly && !devOff && r < (o.pMan ?? 0.5) && s.level < 3;
    if (maneuver) {
      await fold(p, false);
      const kinds = ['apuntar', 'vigilar', 'mover', 'reparar'];
      const k = kinds[Math.floor(rnd() * kinds.length)];
      if (s.sel.open) { stats.notes.push('open-at-start:' + s.sel.mode + ' lvl' + s.level); await back(p); continue; } else { await p.click('#act-dev'); await wait(150); }
      const dis = await p.evaluate((k) => { const m = { apuntar: 'apuntar', vigilar: 'reconocer', mover: 'mover', reparar: 'reparar' }[k]; return document.querySelector(`#manu [data-man=${m}]`).getAttribute('aria-disabled') === 'true'; }, k);
      const mkey = { apuntar: 'apuntar', vigilar: 'reconocer', mover: 'mover', reparar: 'reparar' }[k];
      if (dis) { stats.blocked++; await p.click(`#manu [data-man=${mkey}]`, { force: true, timeout: 3000 }); await back(p); }
      else {
        await p.click(`#manu [data-man=${mkey}]`);
        if (k !== 'apuntar') { await fold(p, true); await wait(900); }
        if (k === 'apuntar') { stats.apuntar++; }
        else if (k === 'vigilar') { await clickCell(p, 1 + Math.floor(rnd() * 8), 1 + Math.floor(rnd() * 18)); stats.vigilar++; }
        else if (k === 'mover') {
          const s1 = await st(p);
          if (!s1.movable.length) { await back(p); continue; }
          const u = s1.movable[Math.floor(rnd() * s1.movable.length)];
          await wait(900);
          const c = u.cells[Math.floor(u.cells.length / 2)];
          await clickCell(p, c.x, c.y);
          const s2 = await st(p);
          if (!s2.handles.length) { await back(p); continue; }
          let h = s2.handles.find((q) => q.collect && q.collect.length) || s2.handles[Math.floor(rnd() * s2.handles.length)];
          await clickCell(p, h.x, h.y); await clickCell(p, h.x, h.y); stats.mover++;
        } else if (k === 'reparar') {
          const s1 = await st(p);
          if (!s1.repairable.length) { await back(p); continue; }
          await wait(900);
          await clickCell(p, s1.repairable[0].x, s1.repairable[0].y); stats.reparar++;
        }
        await wait(250);
        await waitAttack(p, 25000).catch(() => stats.notes.push('hang after ' + k));
        continue;
      }
    }
    // disparar
    await fold(p, true);
    let c;
    const fresh = (q) => q.x >= 0 && q.y >= 0 && q.x < 10 && q.y < 20 && !tried.has(q.x + ',' + q.y);
    const near = hitCells.flatMap((h) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, d]) => ({ x: h.x + a, y: h.y + d }))).filter(fresh);
    if (hitCells.length && rnd() < 0.15) { c = hitCells[Math.floor(rnd() * hitCells.length)]; stats.repeat++; }
    else if (near.length) c = near[Math.floor(rnd() * near.length)];
    else { let n = 0; do { c = { x: Math.floor(rnd() * 10), y: Math.floor(rnd() * 20) }; } while (n++ < 60 && (!fresh(c) || (c.x + c.y) % 2)); }
    tried.add(c.x + ',' + c.y);
    if (tried.size > 120) tried.clear();
    const before = s.foeHp;
    await clickCell(p, c.x, c.y);
    stats.shots++;
    await wait(150);
    await waitAttack(p, 25000).catch(async () => { stats.notes.push('hang after shot'); const d = await st(p); stats.hang = { phase: d.phase, turn: d.turnNo, sel: d.sel, dlg: await dlg(p), c: c }; await p.screenshot({ path: 'hang-' + tag + '.png' }); });
    if (stats.hang) break;
    const a = await st(p);
    if (a.foeHp < before) hitCells.push(c);
  }
  const f = await st(p);
  return { tag, ...stats, levels: [...stats.levels], ended: await ended(p), title: await p.textContent('#end-title'), turnNo: f.turnNo };
}
