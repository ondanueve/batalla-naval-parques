/* Simulación IA vs IA para balancear maniobras y escalada. Uso: node tools/sim.js [partidas] */
const C = require("../core.js");
const N = Number(process.argv[2] || 300);
const P = C.PERSONALITIES;
const rng = C.mulberry32(20261104);
const terr = ["agua", "tierra", "mixto"];
const maps = ["nahuel", "iguazu", "glaciares"];
let all = { n: 0, turns: 0, maxT: 0, stalled: 0, byLevel: [0, 0, 0, 0], argWins: 0 };
const tbl = {};
P.forEach((a) => P.forEach((b) => { tbl[a + " vs " + b] = { n: 0, aWins: 0, turns: 0, man: 0, shot: 0 }; }));
for (let i = 0; i < N; i++) {
  const a = P[i % 3], b = P[Math.floor(i / 3) % 3];
  const o = { terrain: terr[i % 3], map: maps[Math.floor(i / 3) % 3], crop: i % 5, persArg: a, persInv: b };
  if (o.terrain === "mixto" && false) continue;
  const r = C.simulate(o, rng);
  const t = tbl[a + " vs " + b];
  t.n++; t.turns += r.turns; t.man += r.stats.man.arg + r.stats.man.inv; t.shot += r.stats.shot.arg + r.stats.shot.inv;
  if (r.winner === "arg") t.aWins++;
  all.n++; all.turns += r.turns; all.maxT = Math.max(all.maxT, r.turns); all.byLevel[r.level]++;
  if (!r.winner) all.stalled++;
  if (r.winner === "arg") all.argWins++;
}
console.log("partidas", all.n, "| turnos medios", (all.turns / all.n).toFixed(1), "| máx", all.maxT, "| sin final", all.stalled, "| arg (mueve 1ro) gana", (100 * all.argWins / all.n).toFixed(0) + "%");
console.log("terminan en nivel de guerra [0,1,2,3]:", all.byLevel.join(","));
Object.keys(tbl).forEach((k) => {
  const t = tbl[k];
  if (!t.n) return;
  console.log(k.padEnd(26), "n=" + String(t.n).padEnd(4), "gana 1ro:", (100 * t.aWins / t.n).toFixed(0).padStart(3) + "%", "turnos:", (t.turns / t.n).toFixed(0).padStart(3), "maniobras:", (100 * t.man / (t.man + t.shot)).toFixed(0) + "%");
});
