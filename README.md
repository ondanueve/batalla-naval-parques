# Parques en Guerra

Batalla territorial en los parques nacionales argentinos. Un jugador es siempre Argentina. El otro es un invasor: Chile, Reino Unido, EE.UU., China, Rusia o Brasil.

Tres mapas: Nahuel Huapi, Iguazú y Los Glaciares. El terreno puede ser agua, tierra o mixto.

## Cómo se juega

1. La flota aparece al azar en una grilla de **10×20** sobre un recorte satelital del parque (cinco encuadres por terreno). Hay **60 segundos** para moverla. **Estoy listo** cierra antes. En PvP empieza cuando los dos están listos, o cuando el reloj llega a 0. En agua van barcos, en tierra tanques, y en mixto cada uno en lo suyo. Si se pisan o se salen del mapa, quedan en rojo y no se apoyan.
2. La grilla ocupa toda la pantalla. Paneles, bitácora y botones son capas translúcidas que se ocultan con el botón ◐.
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

## Simulación y pruebas

`node tools/sim.js` juega miles de partidas máquina contra máquina para balancear reglas y personalidades. Resultados en `tools/sim-resultados.txt`.

## Jukebox

Adaptada de choppy-bitcoin: temas en ABC, shuffle y repeat prendidos, volumen bajo. El navegador pide un toque para soltar el audio; después sigue sola.

MIT
