# Parques en Guerra

Batalla territorial en los parques nacionales argentinos. Un jugador es siempre Argentina. El otro es un invasor: Chile, Reino Unido, EE.UU., China, Rusia o Brasil.

Tres mapas: Nahuel Huapi, Iguazú y Los Glaciares. El terreno puede ser agua, tierra o mixto.

**Tableros contiguos.** Tu tablero y el del enemigo son dos rectángulos geográficos reales, pegados uno al otro y nunca iguales: Argentina defiende el sector sur (`…-Na.jpg`) y el invasor el sector norte (`…-Nb.jpg`), con frontera común. Cada rectángulo es el fondo de su tablero y un borde dorado punteado marca de qué lado está el otro territorio. Cada partida usa uno de 5 pares por mapa y terreno; en PvP ambos lados ven el mismo par. Hay un solo link por mapa a Google Maps (vista satelital, pestaña nueva), centrado en el rectángulo que forman los dos sectores juntos y con un zoom que muestra ambos.

Las imágenes salen de `tools/geo/build.py` (zonas en `tools/geo/zones.json`), que también regenera la tabla `BOARDS` de `core.js` con la máscara agua/tierra de cada tablero. Créditos: imágenes satelitales *Sentinel-2 cloudless* – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016), licencia CC BY 4.0; polígonos de agua para Nahuel Huapi e Iguazú © colaboradores de OpenStreetMap (ODbL), en Los Glaciares la máscara sale del color de la imagen.

## Reglas: Clásico o Reloaded

- **Clásico** (por defecto): la batalla naval de siempre. Un disparo por turno, alternado, sin tiro extra al acertar. Nada se mueve, no hay tesoros ni escalada, y no se puede repetir una celda. Los hundidos se revelan y gana quien hunda toda la flota. La máquina caza y remata (en Difícil, con mapa de probabilidad).
- **Reloaded**: todo lo de abajo (disparar o maniobrar, visión en vivo, tesoros, escalada, patrones en cruz y 3×3).
- Se elige en el menú, antes de jugar. La elección dura la sesión (no se guarda en el navegador). En línea elige quien arma la sala; el invitado ve las reglas antes de estar listo y, si no coinciden, la partida se rechaza.
- El **Desafío del día** se juega siempre en Reloaded, así el récord es comparable para todos.

## Cómo se juega

1. Grilla de **10×20** sobre un recorte satelital del parque (cinco encuadres por terreno). Colocás unidad por unidad: tocá dónde va (queda *pendiente*), arrastrala, tocala (o ⟳, o R) para girarla —se acomoda sola si no entra— y ✓ (o Enter) para dejarla. Cualquier unidad ya puesta se puede tocar para levantarla y ajustarla. Hay **60 segundos**; lo que falte se completa al azar. **Estoy listo** cierra antes. En PvP empieza cuando los dos están listos, o cuando el reloj llega a 0. En agua van barcos, en tierra tanques, y en mixto cada uno en lo suyo. Si se pisan o se salen del mapa, quedan en rojo y no se apoyan.
2. La grilla ocupa toda la pantalla. Paneles, bitácora y botones son capas translúcidas: ◐ las oculta todas y ▾ pliega solo el panel de turno, para tocar las filas de abajo.
3. **Cada turno elegís una sola cosa: disparar o desarrollarte.** Es el dilema de ganar material o mejorar la posición en ajedrez. No hay dinero ni recursos.
   - **Disparar** hace daño ahora. Se puede disparar de nuevo a una celda ya golpeada: los barcos se mueven y se reparan.
   - **Maniobrar** no hace daño, pero rinde después:
     - **Mover** una unidad una o dos celdas. Si pisás un tesoro, lo cobrás.
     - **Vigilar** una zona de 3×3: ves en vivo todo lo que entre, un rato.
     - **Reparar** una unidad dañada. Recupera una celda de casco.
     - **Apuntar** carga el próximo disparo: en cruz, o en área 3×3 si apuntás dos veces. La carga caduca.
4. **Dos mapas, nada de niebla.** La *visión en vivo* es lo que tus zonas y torres ven ahora. El *mapa explorado* es lo último que supiste, atenuado y con "?" si el rival pudo moverse o repararse desde entonces. Lo que nunca viste se ve como mar o terreno normal.
5. **Tesoros en el mapa**, que se cobran moviendo una unidad encima: *Artillería* (disparo en área, vence con el tiempo), *Blindaje* (+2 de armadura a esa unidad), *Iniciativa* (una jugada extra, si la guardás se pierde) y *Torre* (visión en vivo fija de 5×5). Cada tesoro cuesta un turno sin disparar.
6. **La guerra escala** (Calma tensa, Tensión, Guerra total, Bombardeo): lo posicional se encarece y deja de rendir, así que las partidas no se estancan. En Bombardeo ya no se maniobra.
7. Contra la máquina, el invasor tiene personalidad: **agresivo**, **cauto** u **oportunista**. Juega con las mismas reglas que vos.
8. En línea, Argentina crea la sala y comparte el enlace. Quien entra juega como invasor. Argentina dispara primero. Los tesoros salen de una semilla compartida, así que los dos ven los mismos.

## Gráficos

Las tropas (barcos, tanques y blindados) son siluetas vistas desde arriba dibujadas con canvas en `game.js`: sombra, sombreado, orugas o ruedas, torretas, puente, chimenea, estela. El color de cada unidad queda como franja de identificación. No usan imágenes ni tipografías externas; son parte del código, bajo la misma licencia MIT del repo.

## Simulación y pruebas

`node tools/sim.js` juega miles de partidas máquina contra máquina para balancear reglas y personalidades. Resultados en `tools/sim-resultados.txt`. `node tools/sim-clasico.js` verifica las reglas del Clásico y la fuerza de la IA.

QA con Playwright en `tools/qa` (ver su README): `node tools/qa/qa.mjs [modes|geo|place|hud|touch|daily|tuto|pvc|pvp|all]`. `tools/qa/troops.mjs` saca capturas de las tropas.

## Jukebox

Adaptada de choppy-bitcoin: temas en ABC, shuffle y repeat prendidos, volumen bajo. El navegador pide un toque para soltar el audio; después sigue sola.

MIT
