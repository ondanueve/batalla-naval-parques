# QA con Playwright

Suite al día con las reglas actuales: reglas Clásico (por defecto) y Reloaded, colocación con unidad
pendiente (tocar, arrastrar, girar, ✓, levantar otra vez), HUD de batalla plegado, disparar o maniobrar,
tablero girado en pantallas anchas, link a Google Maps, PvC y PvP (en los dos modos) con revancha.

```bash
cd tools/qa && npm install && npx playwright install chromium   # una vez
cd ../.. && python3 -m http.server 8765 &                         # servir el juego
node tools/qa/qa.mjs all          # o: modes | geo | place | hud | touch | ai | tuto | pvc | pvp (separados por coma)
RULES=clasico VP=desktop node tools/qa/qa.mjs pvp    # PvP de un solo modo, en escritorio
PREFIX=antes node tools/qa/troops.mjs                # capturas de las tropas con colocación fija
BASE=https://ondanueve.github.io/batalla-naval-parques/ node tools/qa/qa.mjs place,hud   # contra lo publicado
```

Las capturas quedan en `tools/qa/out/`. Balance de la IA: `node tools/sim.js 3000`.
