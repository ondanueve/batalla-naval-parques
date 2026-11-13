/* Clásico: chequea reglas (sin repetir tiros, sin maniobras ni tesoros) y fuerza de la IA. Uso: node tools/sim-clasico.js [partidas] */
const C = require("../core.js");
const rng = C.mulberry32(77), terr = ["agua", "tierra", "mixto"], maps = ["nahuel", "iguazu", "glaciares"];
const N = +process.argv[2] || 600; let hw = 0, t = 0, bad = 0, rep = 0, man = 0, nn = 0, tn = 0;
for (let i = 0; i < N; i++) {
  const hardFirst = i % 2 === 0, base = { terrain: terr[i % 3], map: maps[Math.floor(i / 9) % 3], crop: i % 5, mode: "clasico" };
  const r = C.simulate(Object.assign({ hardArg: hardFirst, hardInv: !hardFirst }, base), rng);
  t += r.turns; rep += (r.stats.repeat || 0); man += r.stats.man.arg + r.stats.man.inv; if (!r.winner) bad++; if ((r.winner === "arg") === hardFirst) hw++;
  const n = C.simulate(Object.assign({}, base), rng); nn++; tn += n.turns;
  const w = C.newWorld(base, rng); if (w.shared.pickups.length || C.warLevel(Object.assign({}, w.shared, { turnNo: 99 }))) bad++;
}
console.log("clásico: difícil vs normal gana", (100 * hw / N).toFixed(0) + "%", "| turnos difícil-vs-normal", (t / N).toFixed(0), "| normal-vs-normal", (tn / nn).toFixed(0), "| sin terminar o con tesoros/escalada:", bad, "| tiros repetidos:", rep, "| maniobras:", man);
