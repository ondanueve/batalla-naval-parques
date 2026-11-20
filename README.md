# Parques en Guerra

Batalla territorial en los parques nacionales argentinos. Un jugador es siempre Argentina. El otro es un invasor: Chile, Reino Unido, EE.UU., China, Rusia o Brasil.

Tres mapas: Nahuel Huapi, Iguazú y Los Glaciares. No hay modos de terreno: cada mapa es real y mezcla agua y tierra.

**Sectores reales y contiguos.** Cada parque es una grilla real de 6×3 sectores pegados (`maps/{parque}-sNN.jpg`, norte arriba). En cada partida cada jugador recibe su propio sector, distinto de los demás, y todos los sectores en juego forman un bloque conexo. Solo se usan sectores donde entra la flota entera con la regla libre (los demás quedan excluidos). Un borde dorado punteado marca las fronteras con los sectores vecinos en juego. Hay un solo link a Google Maps por mapa (vista satelital, pestaña nueva), centrado en el área de todos los sectores en juego.

Las imágenes salen de `tools/geo/build.py` (zonas en `tools/geo/zones.json`), que también regenera la tabla `BOARDS` de `core.js` con la máscara agua/tierra de cada sector y si la flota entra. Créditos: imágenes satelitales *Sentinel-2 cloudless* – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016), licencia CC BY 4.0; polígonos de agua para Nahuel Huapi e Iguazú © colaboradores de OpenStreetMap (ODbL), en Los Glaciares la máscara sale del color de la imagen.

## Reglas: Clásico

La batalla naval de siempre. Un disparo por turno, alternado, sin tiro extra al acertar. Nada se mueve, no hay tesoros ni escalada, y no se puede repetir una celda. Los hundidos se revelan y gana la última flota en pie. La máquina caza y remata (en Difícil, con mapa de probabilidad).

Las reglas **Reloaded** (disparar o maniobrar, visión en vivo, tesoros, escalada) siguen en el código pero están ocultas (`RELOADED_ON = false` en `game.js`); lo que sigue en los puntos 3 a 6 aplica solo a Reloaded.

**Colocación libre.** Todos tienen las mismas piezas: 5, 4, 3, 3 y 2. Una pieza entera en el agua es un barco; entera en tierra, una unidad de tierra. Nunca cruzando la costa: si cruza, queda en rojo, ✓ se apaga y el aviso lo explica. El nombre depende del tamaño: 5 Portaaviones / Blindado pesado, 4 Acorazado / Tanque pesado, 3 Crucero / Tanque, 3 Submarino / Artillería, 2 Destructor / Jeep. La máquina sigue la misma regla.

**Menú en partida.** En colocación y en batalla, Menú (o Esc, o atrás del navegador) pregunta «¿Abandonar la partida?» con *Seguir jugando* / *Abandonar*. En línea, abandonar avisa a los demás.

**Todos contra todos (2 a 8).** Sala con lugares: vos, máquinas (Normal o Difícil) y personas que entran con el enlace de la sala (PeerJS). El anfitrión resuelve los tiros. Elegís a quién tirarle en una franja compacta de rivales (▾ despliega nombres y el link a Google Maps). Turno de 30 s: si no tirás, se tira solo. Quien queda eliminado sigue mirando; gana la última flota en pie. Si una persona se desconecta o abandona, una máquina juega por ella; si se va el anfitrión, la batalla termina para todos con aviso. Con más de 2 jugadores el final muestra la tabla de puestos en lugar de «Jugada a jugada».

## Cómo se juega

1. Grilla de **10×20** sobre un sector satelital real del parque. Colocás pieza por pieza: tocá dónde va (queda *pendiente*), arrastrala, tocala (o ⟳, o R) para girarla —se acomoda sola si no entra— y ✓ (o Enter) para dejarla. Cualquier pieza ya puesta se puede tocar para levantarla y ajustarla. Hay **60 segundos**; lo que falte se completa al azar. **Estoy listo** cierra antes. En PvP empieza cuando los dos están listos, o cuando el reloj llega a 0.
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
8. Al terminar, **Jugada a jugada** muestra la partida como un duelo de barras por ronda: arriba lo tuyo, abajo lo del rival, sobre las fases de la guerra. Naranja es disparo (más alto, más daño), amarillo disparo cargado (la maniobra que rindió), celeste maniobra, verde tesoro cobrado y blanco hundimiento. Marca el momento clave, cuenta cuánto rindió desarrollarse y, si tocás una ronda, te dice qué hizo cada uno. **Compartir** suma la tira de tus jugadas en emojis. En Clásico el resumen es solo de puntería (gris es agua, sin fases ni maniobras) y cierra con tu precisión contra la del rival.
9. En línea, Argentina crea la sala y comparte el enlace. Quien entra juega como invasor. Argentina dispara primero. Los tesoros salen de una semilla compartida, así que los dos ven los mismos.

## Gráficos

Las tropas (barcos, tanques y blindados) son siluetas vistas desde arriba dibujadas con canvas en `game.js`: sombra, sombreado, orugas o ruedas, torretas, puente, chimenea, estela. El color de cada unidad queda como franja de identificación. No usan imágenes ni tipografías externas; son parte del código, bajo la misma licencia MIT del repo.

## Simulación y pruebas

`node tools/sim.js` juega miles de partidas máquina contra máquina para balancear reglas y personalidades. Resultados en `tools/sim-resultados.txt`. `node tools/sim-clasico.js` verifica las reglas del Clásico y la fuerza de la IA.

QA con Playwright en `tools/qa` (ver su README): `node tools/qa/qa.mjs [quit|libre|sectors|modes|geo|place|hud|touch|ai|tuto|pvc|recap|pvp|ffa|ffatimer|ffanet|all]`. `tools/qa/troops.mjs` saca capturas de las tropas.

## Jukebox

Adaptada de choppy-bitcoin: temas en ABC, shuffle y repeat prendidos, volumen bajo. El navegador pide un toque para soltar el audio; después sigue sola.

MIT
