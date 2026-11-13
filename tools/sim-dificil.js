/* IA difícil (mapa de probabilidad) contra IA normal. Uso: node tools/sim-dificil.js [partidas] [clasico|reloaded] */
const C = require("../core.js");
const P = C.PERSONALITIES, rng = C.mulberry32(4242), terr = ["agua","tierra","mixto"], maps = ["nahuel","iguazu","glaciares"];
const N = +process.argv[2] || 900; let hw = 0, n = 0, t = 0;
const per = {}; P.forEach(p => per[p] = [0,0]);
for (let i = 0; i < N; i++) {
  const hardFirst = i % 2 === 0, a = P[i % 3], b = P[Math.floor(i / 3) % 3];
  const r = C.simulate({ terrain: terr[i % 3], map: maps[Math.floor(i/9) % 3], crop: i % 5, mode: process.argv[3] || "reloaded", persArg: a, persInv: b, hardArg: hardFirst, hardInv: !hardFirst }, rng);
  n++; t += r.turns;
  const hardWon = (r.winner === "arg") === hardFirst; if (hardWon) hw++;
  const hp = hardFirst ? a : b; per[hp][1]++; if (hardWon) per[hp][0]++;
}
console.log("difícil gana", (100*hw/n).toFixed(0)+"%", "turnos", (t/n).toFixed(0), P.map(p => p+" "+(100*per[p][0]/per[p][1]).toFixed(0)+"%").join(" | "));
