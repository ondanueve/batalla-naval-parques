/* Parques en Guerra — reglas puras. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ParquesCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  const W = 10;
  const H = 20;

  const NATIONS = {
    chile: { id: "chile", name: "Chile", flag: "🇨🇱" },
    uk: { id: "uk", name: "Reino Unido", flag: "🇬🇧" },
    usa: { id: "usa", name: "EE.UU.", flag: "🇺🇸" },
    china: { id: "china", name: "China", flag: "🇨🇳" },
    rusia: { id: "rusia", name: "Rusia", flag: "🇷🇺" },
    brasil: { id: "brasil", name: "Brasil", flag: "🇧🇷" }
  };

  const MAPS = {
    nahuel: {
      id: "nahuel",
      geo: { lat: -40.9531, lng: -71.5381, z: 11, sector: "Isla Victoria, lago Nahuel Huapi" },
      name: "Nahuel Huapi",
      blurb: "Lagos y viento andino"
    },
    iguazu: {
      id: "iguazu",
      geo: { lat: -25.6930, lng: -54.4400, z: 14, sector: "Garganta del Diablo, cataratas del Iguazú" },
      name: "Iguazú",
      blurb: "Selva y cataratas"
    },
    glaciares: {
      id: "glaciares",
      geo: { lat: -50.4714, lng: -73.0465, z: 12, sector: "Frente del glaciar Perito Moreno" },
      name: "Los Glaciares",
      blurb: "Hielo y silencio"
    }
  };

  // Flota única de tamaños fijos. El kind (barco/tanque) se decide al soltar según el terreno bajo las celdas.
  // Nunca cruza costa: todas las celdas de la pieza deben ser del mismo medio.
  const FLEET = [
    { size: 5, nameBarco: "Portaaviones", nameTanque: "Tanque pesado" },
    { size: 4, nameBarco: "Acorazado", nameTanque: "Tanque" },
    { size: 3, nameBarco: "Crucero", nameTanque: "Tanque medio" },
    { size: 3, nameBarco: "Submarino", nameTanque: "Tanque ligero" },
    { size: 2, nameBarco: "Destructor", nameTanque: "Blindado" }
  ];

  const COLORS = ["#fbbf24", "#fb7185", "#c4b5fd", "#34d399", "#7dd3fc"];

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function key(x, y) {
    return x + "," + y;
  }

  function cellsOf(ship) {
    const out = [];
    for (let i = 0; i < ship.size; i++) {
      out.push(ship.horizontal ? { x: ship.x + i, y: ship.y } : { x: ship.x, y: ship.y + i });
    }
    return out;
  }

  function inBounds(x, y) {
    return x >= 0 && y >= 0 && x < W && y < H;
  }

  // Determina el kind según el terreno bajo la primera celda (asume que no cruza).
  function kindFor(mask, x, y) {
    if (!mask) return "barco"; // default si no hay máscara
    const row = mask[y];
    if (!row) return "barco";
    return row[x] === "W" ? "barco" : "tanque";
  }

  function nameFor(fleetItem, kind) {
    return kind === "barco" ? fleetItem.nameBarco : fleetItem.nameTanque;
  }

  // ... el resto de BOARDS, newShared, etc. se mantiene igual por ahora
  // (se adaptará en game.js para free placement y multi hasta 8)

  return {
    W, H, NATIONS, MAPS, FLEET, COLORS,
    mulberry32, key, cellsOf, inBounds, kindFor, nameFor
    // BOARDS y el resto se exportan igual que antes
  };
});
