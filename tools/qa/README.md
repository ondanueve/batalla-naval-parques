# QA con Playwright

Suite al día con las reglas actuales: colocación unidad por unidad sin HUD, HUD de batalla plegado,
disparar o maniobrar, tablero girado en pantallas anchas, PvC y PvP con revancha.

```bash
cd tools/qa && npm install && npx playwright install chromium   # una vez
cd ../.. && python3 -m http.server 8765 &                         # servir el juego
node tools/qa/qa.mjs all          # o: place | hud | tuto | pvc | pvp (separados por coma)
BASE=https://ondanueve.github.io/batalla-naval-parques/ node tools/qa/qa.mjs place,hud   # contra lo publicado
```

Las capturas quedan en `tools/qa/out/`. Balance de la IA: `node tools/sim.js 3000`.
