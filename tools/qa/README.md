# QA con Playwright

Suite al día con las reglas actuales: solo Clásico (Reloaded oculto), Menú con confirmación, colocación libre
(agua = barco, tierra = tanque, nunca cruzando la costa), sectores reales jugables y contiguos en los 3 mapas,
colocación con pieza pendiente, HUD plegado, tablero girado en pantallas anchas, link a Google Maps, PvC y PvP
con revancha, Todos contra todos (1 persona + 7 máquinas; 3 personas + 2 máquinas en línea con corte y abandono;
reloj de turno).

```bash
cd tools/qa && npm install && npx playwright install chromium   # una vez
cd ../.. && python3 -m http.server 8765 &                         # servir el juego
node tools/qa/qa.mjs all          # o: quit | libre | sectors | modes | geo | place | hud | touch | ai | tuto | pvc | recap | pvp | ffa | ffatimer | ffanet (separados por coma)
VP=desktop node tools/qa/qa.mjs pvp    # PvP en escritorio
PREFIX=antes node tools/qa/troops.mjs                # capturas de las tropas con colocación fija
BASE=https://ondanueve.github.io/batalla-naval-parques/ node tools/qa/qa.mjs place,hud   # contra lo publicado
```

Las capturas quedan en `tools/qa/out/`. Balance de la IA: `node tools/sim.js 3000`.
