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
      // sector real que muestra la imagen satelital (para el link a Google Maps)
      geo: { lat: -40.9531, lng: -71.5381, z: 11, sector: "Isla Victoria, lago Nahuel Huapi" },
      name: "Nahuel Huapi",
      blurb: "Lagos y viento andino"
    },
    iguazu: {
      id: "iguazu",
      // sector real que muestra la imagen satelital (para el link a Google Maps)
      geo: { lat: -25.6930, lng: -54.4400, z: 14, sector: "Garganta del Diablo, cataratas del Iguazú" },
      name: "Iguazú",
      blurb: "Selva y cataratas"
    },
    glaciares: {
      id: "glaciares",
      // sector real que muestra la imagen satelital (para el link a Google Maps)
      geo: { lat: -50.4714, lng: -73.0465, z: 12, sector: "Frente del glaciar Perito Moreno" },
      name: "Los Glaciares",
      blurb: "Hielo y silencio"
    }
  };

  // compatibilidad con código viejo: una sola flota (los nombres reales dependen de dónde cae cada pieza)
  const FLEETS = {};

  const COLORS = ["#fbbf24", "#fb7185", "#c4b5fd", "#34d399", "#7dd3fc"];
  ["agua", "tierra", "mixto"].forEach((t) => { FLEETS[t] = [5, 4, 3, 3, 2].map((size, i) => ({ id: i, size, name: "Pieza de " + size, kind: null })); });

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

  /* Sectores geográficos: cada parque es UNA grilla real de cols × rows sectores pegados, norte arriba
     (cada sector es un rectángulo de w × 2w km, 10 × 20 celdas). En cada partida cada jugador recibe un
     sector distinto y todos los sectores en juego forman un bloque conexo. Imágenes en
     maps/{parque}-s{NN}.jpg. Máscara de 10 columnas × 20 filas: W = agua, L = tierra o hielo.
     ok = la flota entera entra con la regla libre (los que no, nunca se usan). Lo genera tools/geo/build.py. */
  /* BOARDS:BEGIN */
  const BOARDS = {
    nahuel: { center: [-40.953, -71.573], km: [12.0, 12.0], cols: 6, rows: 3, bbox: [-71.64437, -41.0069, -71.50163, -40.8991], tiles: [
      {"bbox":[-71.64437,-40.93503,-71.62058,-40.8991],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-71.62058,-40.93503,-71.59679,-40.8991],"mask":["LWWWWWWWWW","LWWWWWWWWW","LLWWWWWWWW","LLWWWWWWWW","LLLWWWWWWW","LLLWWWWWWW","LLLWWWWWWW","LLLWWWWWWW","LLLWWWWWWW","LLLWWWWWWW","LLLWWWWWWW","LLLLWWWWWW","LLLLLWWWWW","LLLLLWWWWW","LLLLLWWWWW","LLLLLWWWWW","LLLLLLWWWW","LLLLLLLLWW","LLLLLLLLWW","LLLLLLLLLW"],"ok":true},
      {"bbox":[-71.59679,-40.93503,-71.573,-40.8991],"mask":["WWWWWWWWWL","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW"],"ok":true},
      {"bbox":[-71.573,-40.93503,-71.54921,-40.8991],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","WLLLLLLLLL","WLLLLLLLLL","WLLLLLLLLL","WLLLLLLLLL","WLLLLLLLLL","WLLLLLLLLL","WLLLLLLLLL","WLLLLLLLLL","WLLLLLLLLL","WWLLLLLLLL","WWLLLLLLLL","WWLLLLLLLL","WWWLLLLLLL","WWWWLLLLLL","WWWWLLLLLL","WWWWLLLLLL"],"ok":true},
      {"bbox":[-71.54921,-40.93503,-71.52542,-40.8991],"mask":["LLLLLLWWWW","LLLLLWWWWW","LLLLWWWWWW","LLLLWWWWWW","LLLLLWWWWW","LLLLLWWWWW","LLLLLWWWWW","LLLLLWWWWW","LLLLLWWWWW","LLWWLWWWWW","LWWWWWWWWW","LWWWWWWWWW","LWWWWWWWWW","LLWWWWWWWW","LLLWWWWWWW","LLLLWWWWWW","LLLLLWWWWW","LLLLLWWWWW","LLLLLWWWWW","LLLLLLWWWW"],"ok":true},
      {"bbox":[-71.52542,-40.93503,-71.50163,-40.8991],"mask":["WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW"],"ok":true},
      {"bbox":[-71.64437,-40.97097,-71.62058,-40.93503],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-71.62058,-40.97097,-71.59679,-40.93503],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-71.59679,-40.97097,-71.573,-40.93503],"mask":["WWWWWWWWWW","LWWWWWWWWW","LWWWWWWWWW","LLLWWWWWWW","LLLWWWWWWW","LLLLWWWWWW","LLLLWWWWWW","LLLLLWWWWW","LLLLLWWWWW","LLLLLWWWWW","LLLLLWWWWW","LLLLLLWWWW","LLLLLLLWWW","LLWLLLLLWW","LLWLLLLLWW","LLLWLLLLWW","LLLLLLLLWW","LLLLLLLLWW","LLLLLLLLWW","LLLLLLLLWW"],"ok":true},
      {"bbox":[-71.573,-40.97097,-71.54921,-40.93503],"mask":["WWWWLLLLLL","WWWWWLLLLL","WWWWWLLLLL","WWWWWWLLLL","WWWWWWWWLL","WWWWWWWWWL","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW"],"ok":true},
      {"bbox":[-71.54921,-40.97097,-71.52542,-40.93503],"mask":["LLLLLLWWWW","LLLLLLLWWW","LLLLLLLWWW","LLLLLLLLWW","LLLLLLWWWW","LLLLLLLWWW","LLLLLLLLWW","LLLLLLLLWW","LLLLLLLLWW","WLLLLLLLWW","WLLLLLLLLW","WLLLLLLLLW","WWLLLLLLLW","WWLLLLLLLL","WWWLLLLLLL","WWWLLLLLLL","WWWWLLLLLL","WWWWLLLLWL","WWWWWLLLWW","WWWWWLWLWW"],"ok":true},
      {"bbox":[-71.52542,-40.97097,-71.50163,-40.93503],"mask":["WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","LWWWWWWWWW","LWWWWWWWWW","LWWWWWWWWW","LLWWWWWWWW","LLWWWWWWWW","WLLWWWWWWW"],"ok":true},
      {"bbox":[-71.64437,-41.0069,-71.62058,-40.97097],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-71.62058,-41.0069,-71.59679,-40.97097],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-71.59679,-41.0069,-71.573,-40.97097],"mask":["LLLLLLLLWW","LLLLLLLWWW","LLLLLLLWWW","LLLLLLLLWW","LLLLLLLLWW","LLLLLLLLWW","LLLLLLLLLW","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLWWWWWW","LLLLWWWWWW"],"ok":true},
      {"bbox":[-71.573,-41.0069,-71.54921,-40.97097],"mask":["WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","LWWWWWLWWW","WWWWWWWWWW","WWWWWWWWWW","LWWWWWWWLW","LLWWWWWWWW","LLWWWWWWWW","LLWWWWWWWW","LLLWWWWWWW","LLLWWWWWWW","LLWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW"],"ok":true},
      {"bbox":[-71.54921,-41.0069,-71.52542,-40.97097],"mask":["WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWLL","WWWWWWWWLL","WWWWWWWWWL","WWWWWWWWWL","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW"],"ok":true},
      {"bbox":[-71.52542,-41.0069,-71.50163,-40.97097],"mask":["WLLLWWWWLW","WLLLLWWLWW","WLLLLWWLWW","LLLLLLLLWW","LLLLLLLLWW","LLLLLLLLWW","WLLLLLLLWW","WLLLLLLLLW","WLLLLLLLLW","WLLLLLLLLL","WWLLLLLLLL","WWLLLLLLLL","WWLLLLLLLL","WWWLLLLLLL","WWWLLLLLLL","WWWWLLLLLL","WWWWLLLLLL","WWWWWLLLLL","WWWWWLLLLL","WWWWWLLLLL"],"ok":true},
    ] },
    iguazu: { center: [-25.69, -54.42], km: [8.4, 8.4], cols: 6, rows: 3, bbox: [-54.46187, -25.72773, -54.37813, -25.65227], tiles: [
      {"bbox":[-54.46187,-25.67742,-54.44791,-25.65227],"mask":["LLLLWWLLLL","LLLLLWLLLL","LLLLLLWLLL","LLLLLLLWLL","LLLLLLLWLL","LLLLLLLLWL","LLLLLLLLLW","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-54.44791,-25.67742,-54.43396,-25.65227],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","WLLLLLLLLL","LWLLLLLLLL","LWLLLLLLLL","LLWLLLLLLL","LLWLLLLLLL","LLLLLLLLLL","LLLWLLLLLL","LLLWLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLWLLLLLL"],"ok":true},
      {"bbox":[-54.43396,-25.67742,-54.42,-25.65227],"mask":["LLLLLLWWWW","LLLLLWWWWW","LLLLWWWWWW","LLLWWWWWWW","LLLWWWWWWW","LLWWWWWWWW","LLWWWWWWWW","LLWWWWWWWW","LWWWWWWWWL","LWWWWWWWWL","LWWWWWWWWL","LWWWWWWWWW","LWWWWWWWWW","LWWWWWWWWW","LWWWWWWWWW","LWWWWWWWWW","LWWWWWWWWL","LLWWWWWWWL","LLWWWWWWWL","LLLWWWWWWL"],"ok":true},
      {"bbox":[-54.42,-25.67742,-54.40604,-25.65227],"mask":["WWWWWWWWWW","WWWWWWWWLL","WWWWLLLLLL","WWLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-54.40604,-25.67742,-54.39209,-25.65227],"mask":["WLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-54.39209,-25.67742,-54.37813,-25.65227],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-54.46187,-25.70258,-54.44791,-25.67742],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-54.44791,-25.70258,-54.43396,-25.67742],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLWLLLLL","LLLLWLLLLL","LLLWWLLLLL","LLWLLLLLLL","LLWLLWLLLL","LWWWWWLLLL","LWWWWWWLLL","LWWWWWWWWL","LWWWWWWWWW","LWWWLWWWWW","LLWWWWWWWW","LWWWWWLWWW","LLWWWWWWWW","LLWLWWWWWW","LLWLWWWWWL","LLLLWWWWWW"],"ok":true},
      {"bbox":[-54.43396,-25.70258,-54.42,-25.67742],"mask":["LLLWWWWWWL","LLLWWWWWWL","LLLWWWWWWL","LLLWWWWWWW","LLLWWWWWWW","LLLWWWWWWW","LLLWWWWWWW","LLLWWWWWWW","LLLWWWWWWW","LLLWWWWWWW","LLLWWWWWWW","LLWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWL","WWWWWWWWLW","LLWWWWWWWL","WWWWWWWLLL"],"ok":true},
      {"bbox":[-54.42,-25.70258,-54.40604,-25.67742],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","WLLLLLLLLL","WWLLLLLLLL","WWLLLLLLLL","WWLLLLLLLL","WWLLLLLLLL","WWLLLLLLLL","WLLLLLLLLL","WWLLLLLLLL","WWLLLLLLLL","WLLLLLLLLL","WLLLLLLLLL","WLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-54.40604,-25.70258,-54.39209,-25.67742],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-54.39209,-25.70258,-54.37813,-25.67742],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-54.46187,-25.72773,-54.44791,-25.70258],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-54.44791,-25.72773,-54.43396,-25.70258],"mask":["LLLLLLLWLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-54.43396,-25.72773,-54.42,-25.70258],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-54.42,-25.72773,-54.40604,-25.70258],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-54.40604,-25.72773,-54.39209,-25.70258],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-54.39209,-25.72773,-54.37813,-25.70258],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
    ] },
    glaciares: { center: [-50.454, -72.966], km: [15.0, 15.0], cols: 6, rows: 3, bbox: [-73.07182, -50.52137, -72.86018, -50.38663], tiles: [
      {"bbox":[-73.07182,-50.43154,-73.03654,-50.38663],"mask":["WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","LWWWWWWWWW","WLWWWWWWWW","LLWWWWWWWW","LLWWWWWWWW","LLLWWWWWWW","LLLWWWWWWW","LLLLWWWWWW","LLLWWWWWWW"],"ok":true},
      {"bbox":[-73.03654,-50.43154,-73.00127,-50.38663],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","WLLLLLLLLL","WLLLLLLLLL","WLLLLLLLLL","WLLLLLLLLL","WLLLLLLLLL","WWLLLLLLLL","WWLLLLLLLL","WWLLLLLLLL","WWLLLLLLLL","WWLLLLLLLL","WWWLLLLLLL","WWWLLLLLLL","WWWLLLLLLL","WWWLLLLLLL","WWWLLLLLLL","WWWLLLLLLL"],"ok":true},
      {"bbox":[-73.00127,-50.43154,-72.966,-50.38663],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-72.966,-50.43154,-72.93073,-50.38663],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-72.93073,-50.43154,-72.89546,-50.38663],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-72.89546,-50.43154,-72.86018,-50.38663],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-73.07182,-50.47646,-73.03654,-50.43154],"mask":["LWLLWWWWWW","LLWWWWWWWW","LLWWWWWWWW","LLWWWWWWWW","LLWWWWWWWW","LWWWWWWWWW","LLWWWWWWWW","LWWWWWWWWW","LLLWWWWWWW","LLLWWWWWWW","LLLWWWWWWW","LLWWWWWWWW","LLLWWWWWWW","LLLLLLWWWW","LLLLLLLWWW","LLLLLLLLWW","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-73.03654,-50.47646,-73.00127,-50.43154],"mask":["WWWLLLLLLL","WWWLLLLLLL","WWWWLLLLLL","WWWWLLLLLL","WWWWLLLLLL","WWWWLLLLLL","WWWWLLLLLL","WWWWLLLLLL","WWWWLLLLLL","WWWWLLLLLL","WWWWLLLLLL","WWWWLLLLLL","WWWWLLLLLL","WWWLLLLLLL","WLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-73.00127,-50.47646,-72.966,-50.43154],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LWWWLLLLLL"],"ok":true},
      {"bbox":[-72.966,-50.47646,-72.93073,-50.43154],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-72.93073,-50.47646,-72.89546,-50.43154],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-72.89546,-50.47646,-72.86018,-50.43154],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-73.07182,-50.52137,-73.03654,-50.47646],"mask":["LLLLLLLLLL","LLLLLLLLLW","LLLLLLLLWW","LLLLLLLWWW","LLLLLLWWWW","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-73.03654,-50.52137,-73.00127,-50.47646],"mask":["WLLLLLLLLL","WLLLWLLWWW","WLLWWWWWWW","WWLWWWWWWW","LLLWWWWWWW","LLLLWWWWWW","LLLLLLLLWW","LLLLLLLLWW","LLLLLLLWWW","LLLLLLWWWW","LLLLLLLWWW","LLLLLLLWWW","LLLLLLLLWW","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-73.00127,-50.52137,-72.966,-50.47646],"mask":["LWWWWLLLLL","WWWWWLLLLL","WWWWWLLLLL","WWWWWWWWLL","WWWWWWWWLL","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","LWWWWWWWWW","LLWWWWWWWW","LLLLLWWLWW","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-72.966,-50.52137,-72.93073,-50.47646],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","WLWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWLWW","WWWWWWLLLL","WLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],"ok":true},
      {"bbox":[-72.93073,-50.52137,-72.89546,-50.47646],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","LLLWWWWWWW","LLLWWWWWWW","LLLWWWWWWW","LLLWWWWWWW","LLLWWWWWWW"],"ok":true},
      {"bbox":[-72.89546,-50.52137,-72.86018,-50.47646],"mask":["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLWW","LLLWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWLLWWW","WWWWWLLWWW","WLWWWWWWLW","WWWWWLLLWW","WWWWWLLLWW","WWWWWWLLWW","WWWWWLLWWW","WWLLLWWWWW","WWWWWWWWWW","WLWWWWWWWW","WLWWWWWWWW","WWWWWWWWWW","WWWWWWWWWL"],"ok":true},
    ] },
  };
  /* BOARDS:END */
  const CROP_COUNT = 1; // compatibilidad: ya no hay encuadres fijos

  /* La flota: tamaños fijos, iguales para todos. Cada pieza es barco si queda entera sobre agua y
     unidad de tierra si queda entera sobre tierra (nunca cruzando la costa). */
  const FLEET = [
    { size: 5, barco: "Portaaviones", tanque: "Blindado pesado" },
    { size: 4, barco: "Acorazado", tanque: "Tanque pesado" },
    { size: 3, barco: "Crucero", tanque: "Tanque" },
    { size: 3, barco: "Submarino", tanque: "Artillería" },
    { size: 2, barco: "Destructor", tanque: "Jeep" }
  ];
  function unitName(id, kind) {
    const f = FLEET[id] || FLEET[0];
    return kind === "tanque" ? f.tanque : kind === "barco" ? f.barco : "Pieza de " + f.size;
  }

  function gridOf(map) { return BOARDS[map] || BOARDS.nahuel; }
  function tileOf(map, k) {
    const g = gridOf(map);
    const n = parseInt(k, 10);
    return g && g.tiles[Number.isFinite(n) ? ((n % g.tiles.length) + g.tiles.length) % g.tiles.length : 0];
  }
  function tileRC(map, k) { const g = gridOf(map); const n = k | 0; return { r: Math.floor(n / g.cols), c: n % g.cols }; }
  // sectores en juego: lista de índices de la grilla. boardKey(lista, "arg"|"inv") = el de cada lado en 1 vs 1.
  function boardKey(crop, who) {
    if (Array.isArray(crop)) return crop[who === "inv" ? 1 : 0] | 0;
    return crop | 0;
  }
  function boardOf(map, terrain, k) {
    const g = gridOf(map);
    const t = tileOf(map, k);
    if (!t) return null;
    return { zone: g, side: t, n: parseInt(k, 10) || 0 };
  }
  function okTiles(map) { const g = gridOf(map); return g.tiles.map((t, i) => (t.ok ? i : -1)).filter((i) => i >= 0); }
  function tileNeighbors(map, k) {
    const g = gridOf(map);
    const { r, c } = tileRC(map, k);
    const out = [];
    if (r > 0) out.push({ k: k - g.cols, dir: "n" });
    if (r < g.rows - 1) out.push({ k: k + g.cols, dir: "s" });
    if (c > 0) out.push({ k: k - 1, dir: "o" });
    if (c < g.cols - 1) out.push({ k: k + 1, dir: "e" });
    return out;
  }
  // el bloque conexo de sectores viables más grande (cuántos jugadores entran en el parque)
  function maxPlayers(map) {
    const ok = new Set(okTiles(map));
    let best = 0;
    const seen = new Set();
    ok.forEach((s) => {
      if (seen.has(s)) return;
      let n = 0;
      const q = [s];
      seen.add(s);
      while (q.length) {
        const k = q.pop();
        n++;
        tileNeighbors(map, k).forEach((nb) => { if (ok.has(nb.k) && !seen.has(nb.k)) { seen.add(nb.k); q.push(nb.k); } });
      }
      best = Math.max(best, n);
    });
    return Math.min(8, best);
  }
  // n sectores viables, distintos y pegados entre sí (bloque conexo), al azar
  function pickSectors(map, n, rng) {
    const r = rng || Math.random;
    const ok = okTiles(map);
    const okSet = new Set(ok);
    for (let attempt = 0; attempt < 60; attempt++) {
      const start = ok[Math.floor(r() * ok.length)];
      const chosen = [start];
      const inSet = new Set(chosen);
      while (chosen.length < n) {
        const front = [];
        chosen.forEach((k) => tileNeighbors(map, k).forEach((nb) => { if (okSet.has(nb.k) && !inSet.has(nb.k) && !front.includes(nb.k)) front.push(nb.k); }));
        if (!front.length) break;
        // preferir bloques compactos: más peso a los que tocan varios elegidos
        const w = front.map((k) => 1 + 2 * tileNeighbors(map, k).filter((nb) => inSet.has(nb.k)).length);
        let t = r() * w.reduce((a, b) => a + b, 0);
        let pick = front[0];
        for (let i = 0; i < front.length; i++) { t -= w[i]; if (t <= 0) { pick = front[i]; break; } }
        chosen.push(pick);
        inSet.add(pick);
      }
      if (chosen.length === n) return chosen;
    }
    return null;
  }
  function validSectors(map, list, n) {
    if (!Array.isArray(list) || list.length !== n) return false;
    const g = gridOf(map);
    const set = new Set();
    for (const k of list) {
      if (typeof k !== "number" || k < 0 || k >= g.tiles.length || !g.tiles[k].ok || set.has(k)) return false;
      set.add(k);
    }
    // conexo
    const seen = new Set([list[0]]);
    const q = [list[0]];
    while (q.length) { const k = q.pop(); tileNeighbors(map, k).forEach((nb) => { if (set.has(nb.k) && !seen.has(nb.k)) { seen.add(nb.k); q.push(nb.k); } }); }
    return seen.size === set.size;
  }
  // un solo link a Google Maps por partida: centro del rectángulo que forman todos los sectores en juego,
  // con un zoom que los muestra a todos (sin sectores: el parque entero)
  function geoView(map, terrain, sectors) {
    const g = gridOf(map);
    const list = Array.isArray(sectors) && sectors.length ? sectors : null;
    let bb = g.bbox;
    if (list) {
      bb = [Infinity, Infinity, -Infinity, -Infinity];
      list.forEach((k) => { const t = tileOf(map, k).bbox; bb = [Math.min(bb[0], t[0]), Math.min(bb[1], t[1]), Math.max(bb[2], t[2]), Math.max(bb[3], t[3])]; });
    }
    const lat = (bb[1] + bb[3]) / 2;
    const lng = (bb[0] + bb[2]) / 2;
    const kmW = (bb[2] - bb[0]) * 111.32 * Math.cos(lat * Math.PI / 180);
    const kmH = (bb[3] - bb[1]) * 111.32;
    const z = Math.floor(Math.log2(156543.03 * Math.cos(lat * Math.PI / 180) * 700 / (Math.max(kmW, kmH) * 1000)));
    const r5 = (v) => Math.round(v * 1e5) / 1e5;
    return { lat: r5(lat), lng: r5(lng), z: Math.max(3, Math.min(17, z)), km: [Math.round(kmW * 10) / 10, Math.round(kmH * 10) / 10] };
  }

  function isLand(terrain, map, k, x, y) {
    const t = tileOf(map, k);
    const row = (t && t.mask && t.mask[y]) || "";
    return row[x] === "L";
  }
  // medio de un conjunto de celdas: "barco" (todo agua), "tanque" (todo tierra) o "" (cruza la costa)
  function mediumOf(map, k, cells) {
    let land = 0;
    cells.forEach((c) => { if (isLand(null, map, k, c.x, c.y)) land++; });
    return land === 0 ? "barco" : land === cells.length ? "tanque" : "";
  }

  function overlaps(fleet, ship, ignoreId) {
    const taken = new Set();
    fleet.forEach((s) => {
      if (s.lifted || s.id === ignoreId) return;
      cellsOf(s).forEach((c) => taken.add(key(c.x, c.y)));
    });
    return cellsOf(ship).some((c) => !inBounds(c.x, c.y) || taken.has(key(c.x, c.y)));
  }

  // kind "auto" (regla libre): vale cualquier medio, pero la pieza entera sobre uno solo ("costa" si cruza)
  function placeIssue(fleet, x, y, size, horizontal, ignoreId, kind, terrain, map, crop) {
    const ghost = { x, y, size, horizontal, lifted: false };
    const cells = cellsOf(ghost);
    if (cells.some((c) => !inBounds(c.x, c.y))) return "borde";
    const taken = new Set();
    (fleet || []).forEach((s) => {
      if (s.lifted || (ignoreId != null && s.id === ignoreId)) return;
      cellsOf(s).forEach((c) => taken.add(key(c.x, c.y)));
    });
    if (cells.some((c) => taken.has(key(c.x, c.y)))) return "solape";
    if (kind === "auto" || kind == null) {
      if (!mediumOf(map, crop, cells)) return "costa";
    } else if (kind === "barco" || kind === "tanque") {
      const med = mediumOf(map, crop, cells);
      if (med !== kind) return kind === "barco" ? "tierra" : "agua";
    }
    return "";
  }

  function canPlace(fleet, x, y, size, horizontal, ignoreId, kind, terrain, map, crop) {
    return placeIssue(fleet, x, y, size, horizontal, ignoreId, kind, terrain, map, crop) === "";
  }

  // asigna medio y nombre según dónde quedó la pieza
  function settleKind(u, map, crop) {
    const med = mediumOf(map, crop, cellsOf(u));
    u.kind = med || u.kind || "barco";
    u.name = unitName(u.id, u.kind);
    return u;
  }
  // todas las posiciones de una pieza sobre un solo medio
  function slotsFor(map, crop, size) {
    const out = [];
    [true, false].forEach((horizontal) => {
      for (let y = 0; y < (horizontal ? H : H - size + 1); y++) {
        for (let x = 0; x < (horizontal ? W - size + 1 : W); x++) {
          if (mediumOf(map, crop, cellsOf({ x, y, size, horizontal }))) out.push({ x, y, horizontal });
        }
      }
    });
    return out;
  }
  // flota completa al azar con la regla libre (la máquina usa la misma regla que vos)
  function placeRandom(terrain, rng, map, crop) {
    const r = rng || Math.random;
    for (let restart = 0; restart < 40; restart++) {
      const fleet = [];
      let okAll = true;
      for (let id = 0; id < FLEET.length && okAll; id++) {
        const size = FLEET[id].size;
        const slots = slotsFor(map, crop, size).filter((sl) => !overlaps(fleet, { x: sl.x, y: sl.y, size, horizontal: sl.horizontal }));
        if (!slots.length) { okAll = false; break; }
        const sl = slots[Math.floor(r() * slots.length)];
        fleet.push(settleKind({ id, size, x: sl.x, y: sl.y, horizontal: sl.horizontal, color: COLORS[id], lifted: false, kind: null, name: "" }, map, crop));
      }
      if (okAll) return fleet;
    }
    // último recurso determinista (backtracking): el sector está verificado como viable
    const fleet = [];
    const rec = (id) => {
      if (id === FLEET.length) return true;
      const size = FLEET[id].size;
      for (const sl of slotsFor(map, crop, size)) {
        const u = { id, size, x: sl.x, y: sl.y, horizontal: sl.horizontal, color: COLORS[id], lifted: false, kind: null, name: "" };
        if (overlaps(fleet, u)) continue;
        fleet.push(settleKind(u, map, crop));
        if (rec(id + 1)) return true;
        fleet.pop();
      }
      return false;
    };
    if (rec(0)) return fleet;
    throw new Error("No entra la flota en el sector " + crop);
  }
  function fleetFits(map, crop) {
    try { placeRandom(null, mulberry32(7), map, crop); return true; } catch (e) { return false; }
  }

  // Completa al azar las unidades que todavía no se colocaron (unplaced). Devuelve true si entraron todas.
  function placeRemaining(fleet, terrain, rng, map, crop) {
    const r = rng || Math.random;
    const pending = fleet.filter((s) => s.unplaced);
    for (const s of pending) {
      s.lifted = true;
      const slots = slotsFor(map, crop, s.size).filter((sl) => !overlaps(fleet, { x: sl.x, y: sl.y, size: s.size, horizontal: sl.horizontal }, s.id));
      if (!slots.length) return false;
      const sl = slots[Math.floor(r() * slots.length)];
      s.x = sl.x; s.y = sl.y; s.horizontal = sl.horizontal;
      s.unplaced = false;
      s.lifted = false;
      settleKind(s, map, crop);
    }
    return true;
  }

  function fleetHp(fleet, hits) {
    let total = 0;
    let left = 0;
    fleet.forEach((s) => {
      if (s.lifted) return;
      cellsOf(s).forEach((c) => {
        total++;
        if (!hits.has(key(c.x, c.y))) left++;
      });
    });
    return { left, total: total || 17, pct: total ? left / total : 0 };
  }

  function shipAt(fleet, x, y) {
    return fleet.find((s) => !s.lifted && cellsOf(s).some((c) => c.x === x && c.y === y)) || null;
  }

  function shipStatus(ship, hits) {
    const cells = cellsOf(ship);
    const dmg = cells.filter((c) => hits.has(key(c.x, c.y))).length;
    return { dmg, sunk: dmg >= ship.size, left: ship.size - dmg };
  }

  function resolveShots(fleet, hits, shots, shield) {
    const results = [];
    let shielded = false;
    shots.forEach((shot) => {
      if (!inBounds(shot.x, shot.y)) return;
      const k = key(shot.x, shot.y);
      if (hits.has(k)) {
        results.push({ ...shot, kind: "repeat" });
        return;
      }
      if (shield) {
        shielded = true;
        results.push({ ...shot, kind: "shield" });
        return;
      }
      const ship = shipAt(fleet, shot.x, shot.y);
      hits.add(k);
      if (!ship) {
        results.push({ ...shot, kind: "miss" });
        return;
      }
      const st = shipStatus(ship, hits);
      results.push({
        ...shot,
        kind: st.sunk ? "sunk" : "hit",
        ship: ship.name,
        uid: ship.id,
        med: ship.kind,
        left: st.left,
        size: ship.size,
        cells: st.sunk ? cellsOf(ship).map((c) => ({ x: c.x, y: c.y })) : undefined
      });
    });
    const hp = fleetHp(fleet, hits);
    return { results, shielded, hp, lost: hp.left === 0 };
  }

  function cross(x, y) {
    return [
      { x, y },
      { x: x - 1, y },
      { x: x + 1, y },
      { x, y: y - 1 },
      { x, y: y + 1 }
    ].filter((c) => inBounds(c.x, c.y));
  }

  function area(x, y) {
    const cells = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (inBounds(x + dx, y + dy)) cells.push({ x: x + dx, y: y + dy });
      }
    }
    return cells;
  }

  function aiShot(fleet, hits, rng) {
    const hunt = [];
    hits.forEach((k) => {
      const [x, y] = k.split(",").map(Number);
      const ship = shipAt(fleet, x, y);
      if (!ship || shipStatus(ship, hits).sunk) return;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        if (inBounds(nx, ny) && !hits.has(key(nx, ny))) hunt.push({ x: nx, y: ny });
      });
    });
    if (hunt.length) return hunt[Math.floor(rng() * hunt.length)];
    const open = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if ((x + y) % 2 === 0 && !hits.has(key(x, y))) open.push({ x, y });
      }
    }
    const pool = open.length ? open : [];
    if (!pool.length) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (!hits.has(key(x, y))) pool.push({ x, y });
        }
      }
    }
    if (!pool.length) return null;
    return pool[Math.floor(rng() * pool.length)];
  }


  /* ================================================================
     Disparar o desarrollar: turnos con maniobras, vigilancia, tesoros del mapa.
     Todo es puro: lo usan el juego (PvC y PvP) y la simulación IA vs IA.
     ================================================================ */
  const PICKUPS = {
    torre: { id: "torre", name: "Torre de vigía", icon: "🗼", short: "Vigilancia permanente 5×5 alrededor. Se puede capturar." },
    artilleria: { id: "artilleria", name: "Artillería", icon: "🎯", short: "Tu próximo disparo cae en un área de 3×3." },
    blindaje: { id: "blindaje", name: "Blindaje", icon: "🛡", short: "Esa unidad absorbe los próximos 2 impactos." },
    iniciativa: { id: "iniciativa", name: "Iniciativa", icon: "⚡", short: "Una acción extra: guardala para el momento justo." }
  };
  const MANEUVERS = {
    mover: { id: "mover", name: "Mover", icon: "↔", short: "Corré una unidad hasta 2 celdas. Lleva su daño y puede recoger tesoros." },
    reconocer: { id: "reconocer", name: "Vigilar", icon: "◎", short: "Zona 3×3 visible en vivo unos turnos. El rival ve qué zona." },
    reparar: { id: "reparar", name: "Reparar", icon: "✚", short: "Curá 1 segmento dañado de una unidad. Las marcas del rival quedan viejas." },
    apuntar: { id: "apuntar", name: "Apuntar", icon: "⌖", short: "Cargá el próximo disparo: 1 carga = cruz, 2 = área 3×3. Caduca." }
  };
  const PERSONALITIES = ["agresivo", "cauto", "oportunista"];
  const PERS_LABEL = { agresivo: "Agresivo", cauto: "Cauto", oportunista: "Oportunista" };

  /* perillas de la IA (ajustadas con tools/sim.js para que las 3 personalidades ganen parejo) */
  const AI_TUNE = {
    lineSense: 0.85,
    hardAim: 0.5,
    agresivo: { aim: 0.35, move: 0.55, moveMin: 4.1, repair: 0.03 },
    cauto: { repair: 0.6, dodge: 0.8, watch: 0.8, aim: 0.85, grab: 0.6, grabMin: 4.1 },
    oportunista: { moveMin: 4.45, aim: 0.2, repair: 0.3, watch: 0.2 }
  };

  function other(who) { return who === "arg" ? "inv" : "arg"; }

  function newSide(fleet) {
    fleet.forEach((s) => { if (typeof s.armor !== "number") s.armor = 0; });
    return { fleet, hits: new Set(), misses: new Set(), charge: 0, chargeUntil: 0, init: 0, initUntil: 0 };
  }

  function newKnow() {
    return { marks: new Map(), live: new Map(), ghosts: new Map() };
  }

  function validPickupCell(terrain, map, crop, x, y) {
    return inBounds(x, y) && x >= 1 && x <= W - 2 && y >= 2 && y <= H - 3;
  }

  function spawnPickup(shared, type, rng) {
    for (let n = 0; n < 200; n++) {
      const x = 1 + Math.floor(rng() * (W - 2));
      const y = 2 + Math.floor(rng() * (H - 4));
      if (shared.pickups.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) < 4)) continue;
      shared.pickups.push({ id: shared.nextId++, type, x, y, owner: null });
      return;
    }
  }

  /* Dos reglamentos sobre el mismo tablero:
     - "clasico": batalla naval tradicional (un disparo por turno, nada se mueve, sin tesoros ni escalada).
     - "reloaded": disparar o desarrollar (maniobras, tesoros, visión en vivo, escalada, patrones). */
  const MODES = ["clasico", "reloaded"];
  function normMode(m) { return m === "reloaded" ? "reloaded" : "clasico"; }
  function isClassic(shared) { return !!shared && shared.mode === "clasico"; }

  function pairFor(map, crop) {
    if (Array.isArray(crop) && crop.length >= 2) return crop.slice(0, 2);
    return pickSectors(map || "nahuel", 2, mulberry32(((crop | 0) + 1) * 2654435761)) || [0, 1];
  }
  function newShared(seed, terrain, map, crop, mode) {
    const shared = {
      seed: seed >>> 0, terrain, map, crop: pairFor(map, crop), turnNo: 0, nextId: 1, mode: mode === "clasico" ? "clasico" : "reloaded",
      pickups: [], zones: [], log: [], lastChange: { arg: 0, inv: 0 }
    };
    if (shared.mode === "clasico") return shared;
    const rng = mulberry32(shared.seed ^ 0x9e3779b9);
    ["torre", "artilleria", "blindaje", "iniciativa", "torre"].forEach((t) => spawnPickup(shared, t, rng));
    return shared;
  }

  function warLevel(shared) {
    if (isClassic(shared)) return 0;
    const r = Math.floor(shared.turnNo / 2);
    return r < 8 ? 0 : r < 13 ? 1 : r < 18 ? 2 : 3;
  }
  const WAR_NAMES = ["Calma tensa", "Tensión", "Guerra total", "Bombardeo"];
  function roundOf(shared) { return Math.floor(shared.turnNo / 2) + 1; }
  function roundsToNextLevel(shared) {
    if (isClassic(shared)) return 0;
    const lim = [8, 13, 18];
    const lvl = warLevel(shared);
    if (lvl >= 3) return 0;
    return lim[lvl] - Math.floor(shared.turnNo / 2);
  }

  /* qué maniobras se pueden hacer hoy */
  function maneuverAllowed(kind, shared, consec) {
    if (isClassic(shared)) return { ok: false, why: "Clásico: solo se dispara." };
    const lvl = warLevel(shared);
    const cap = [2, 1, 1, 0][lvl];
    if (consec >= cap) return { ok: false, why: lvl >= 3 ? "Bombardeo: solo se dispara." : "Ya maniobraste; ahora disparás." };
    if (lvl === 2 && kind !== "mover") return { ok: false, why: "Guerra total: solo se puede mover." };
    return { ok: true, why: "" };
  }

  function inZone(z, x, y) { return Math.abs(z.x - x) <= z.r && Math.abs(z.y - y) <= z.r; }

  function zonesOf(shared, who) {
    const out = shared.zones.filter((z) => z.who === who && z.until > shared.turnNo);
    shared.pickups.forEach((p) => {
      if (p.type === "torre" && p.owner === who) out.push({ id: "t" + p.id, who, x: p.x, y: p.y, r: 2, until: Infinity, tower: true });
    });
    return out;
  }

  function addWatch(shared, who, x, y) {
    const lvl = warLevel(shared);
    const mine = shared.zones.filter((z) => z.who === who && z.until > shared.turnNo);
    if (mine.length >= 2) {
      mine.sort((a, b) => a.until - b.until);
      shared.zones = shared.zones.filter((z) => z !== mine[0]);
    }
    const z = { id: "w" + shared.nextId++, who, x, y, r: 1, until: shared.turnNo + (lvl === 0 ? 7 : 5), tower: false };
    shared.zones.push(z);
    return z;
  }

  /* celdas de mis unidades (no hundidas) dentro de las zonas dadas */
  function spottedCells(side, zones) {
    const out = [];
    if (!zones.length) return out;
    side.fleet.forEach((s) => {
      if (s.lifted || shipStatus(s, side.hits).sunk) return;
      cellsOf(s).forEach((c) => {
        if (zones.some((z) => inZone(z, c.x, c.y))) out.push({ x: c.x, y: c.y, kind: s.kind });
      });
    });
    return out;
  }

  function noteSpot(know, cells, turnNo) {
    const next = new Map();
    cells.forEach((c) => next.set(key(c.x, c.y), c.kind || "barco"));
    know.live.forEach((kind, k) => {
      if (!next.has(k)) know.ghosts.set(k, { kind, t: turnNo });
    });
    next.forEach((kind, k) => know.ghosts.delete(k));
    know.live = next;
  }

  function noteResults(know, results, turnNo) {
    results.forEach((r) => {
      const k = key(r.x, r.y);
      if (r.kind === "miss") { know.marks.set(k, { kind: "miss", t: turnNo }); know.ghosts.delete(k); }
      else if (r.kind === "hit") { know.marks.set(k, { kind: "hit", t: turnNo }); know.ghosts.delete(k); }
      else if (r.kind === "sunk") {
        (r.cells && r.cells.length ? r.cells : [{ x: r.x, y: r.y }]).forEach((c) => {
          know.marks.set(key(c.x, c.y), { kind: "sunk", t: turnNo });
          know.ghosts.delete(key(c.x, c.y));
        });
      } else if (r.kind === "wreck") know.marks.set(k, { kind: "sunk", t: turnNo });
    });
  }

  /* una marca es vieja si el rival movió o reparó después de que la anotaste */
  function isStale(shared, who, mark) {
    if (mark.kind === "sunk") return false;
    return mark.t < shared.lastChange[other(who)];
  }

  function shotCells(side, shared, cell) {
    if (isClassic(shared)) return { cells: [{ x: cell.x, y: cell.y }], charged: false, level: 0 };
    const lvl = warLevel(shared);
    let lvlEff = side.charge >= 2 ? 2 : side.charge >= 1 ? 1 : 0;
    if (lvl >= 3) lvlEff = 2;
    else if (lvl >= 2) lvlEff = Math.max(1, lvlEff);
    const cells = lvlEff >= 2 ? area(cell.x, cell.y) : lvlEff === 1 ? cross(cell.x, cell.y) : [{ x: cell.x, y: cell.y }];
    return { cells, charged: side.charge > 0, level: lvlEff };
  }

  /* Un disparo sobre una celda siempre es válido: las unidades se mueven y se reparan. */
  function resolveVolley(side, cells) {
    const results = [];
    cells.forEach((cell) => {
      if (!inBounds(cell.x, cell.y)) return;
      const k = key(cell.x, cell.y);
      const ship = shipAt(side.fleet, cell.x, cell.y);
      if (!ship) {
        side.misses.add(k);
        results.push({ x: cell.x, y: cell.y, kind: "miss" });
        return;
      }
      if (shipStatus(ship, side.hits).sunk) {
        results.push({ x: cell.x, y: cell.y, kind: "wreck", ship: ship.name });
        return;
      }
      if (side.hits.has(k)) {
        const st0 = shipStatus(ship, side.hits);
        results.push({ x: cell.x, y: cell.y, kind: "hit", again: true, ship: ship.name, left: st0.left, size: ship.size });
        return;
      }
      if (ship.armor > 0) {
        ship.armor--;
        side.misses.add(k);
        results.push({ x: cell.x, y: cell.y, kind: "miss", blocked: true });
        return;
      }
      side.hits.add(k);
      const st = shipStatus(ship, side.hits);
      results.push({
        x: cell.x, y: cell.y, kind: st.sunk ? "sunk" : "hit", ship: ship.name, uid: ship.id, med: ship.kind, left: st.left, size: ship.size,
        cells: st.sunk ? cellsOf(ship).map((c) => ({ x: c.x, y: c.y })) : undefined
      });
    });
    const hp = fleetHp(side.fleet, side.hits);
    return { results, hp, lost: hp.left === 0 };
  }

  function pickupsUnder(shared, unit, who) {
    const cells = new Set(cellsOf(unit).map((c) => key(c.x, c.y)));
    return shared.pickups.filter((p) => cells.has(key(p.x, p.y)) && !(p.type === "torre" && p.owner === who));
  }

  function moveOptions(side, shared, unit, who) {
    if (unit.lifted || shipStatus(unit, side.hits).sunk) return [];
    const out = [];
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
      for (let step = 1; step <= 2; step++) {
        const nx = unit.x + dx * step;
        const ny = unit.y + dy * step;
        if (placeIssue(side.fleet, nx, ny, unit.size, unit.horizontal, unit.id, unit.kind, shared.terrain, shared.map, boardKey(shared.crop, who)) !== "") break;
        const ghost = { x: nx, y: ny, size: unit.size, horizontal: unit.horizontal };
        out.push({ unit: unit.id, dx: dx * step, dy: dy * step, x: nx, y: ny, collect: pickupsUnder(shared, ghost, who).map((p) => p.type) });
      }
    });
    return out;
  }

  function translateUnit(side, unit, dx, dy) {
    const old = cellsOf(unit).map((c) => key(c.x, c.y));
    const dmg = old.map((k) => side.hits.has(k));
    old.forEach((k) => side.hits.delete(k));
    unit.x += dx;
    unit.y += dy;
    cellsOf(unit).forEach((c, i) => { if (dmg[i]) side.hits.add(key(c.x, c.y)); });
  }

  /* recoge lo que haya bajo la unidad. Devuelve el anuncio público. */
  function collectUnder(side, shared, who, unit) {
    const found = pickupsUnder(shared, unit, who);
    const pub = [];
    found.forEach((p) => {
      pub.push({ type: p.type, x: p.x, y: p.y });
      if (p.type === "torre") p.owner = who;
      else shared.pickups = shared.pickups.filter((q) => q !== p);
      if (p.type === "artilleria") { side.charge = 2; side.chargeUntil = shared.turnNo + 9; }
      if (p.type === "blindaje") unit.armor = (unit.armor || 0) + 2;
      if (p.type === "iniciativa") { side.init = 1; side.initUntil = shared.turnNo + 9; }
    });
    return pub;
  }

  /* lo que ve el rival cuando alguien recoge algo */
  function applyPublicCollect(shared, who, list) {
    (list || []).forEach((c) => {
      const p = shared.pickups.find((q) => q.type === c.type && q.x === c.x && q.y === c.y);
      if (!p) return;
      if (p.type === "torre") p.owner = who;
      else shared.pickups = shared.pickups.filter((q) => q !== p);
    });
  }

  function repairable(side) {
    return side.fleet.filter((s) => !s.lifted && !shipStatus(s, side.hits).sunk && shipStatus(s, side.hits).dmg > 0);
  }
  function applyRepair(side, unit) {
    const cells = cellsOf(unit).filter((c) => side.hits.has(key(c.x, c.y)));
    if (!cells.length) return false;
    const c = cells[cells.length - 1];
    side.hits.delete(key(c.x, c.y));
    return true;
  }

  function applyAim(side, shared) {
    side.charge = Math.min(2, side.charge + 1);
    side.chargeUntil = shared.turnNo + (warLevel(shared) >= 1 ? 5 : 9);
  }

  function expireSide(side, shared) {
    if (side.charge > 0 && shared.turnNo >= side.chargeUntil) side.charge = 0;
    if (side.init > 0 && shared.turnNo >= side.initUntil) side.init = 0;
  }

  /* cierra una acción: avanza el reloj común, vence zonas y hace aparecer tesoros */
  function advance(shared, who, kind) {
    shared.turnNo++;
    shared.log.push({ n: shared.turnNo, who, kind });
    if (kind === "move" || kind === "repair") shared.lastChange[who] = shared.turnNo;
    shared.zones = shared.zones.filter((z) => z.until > shared.turnNo);
    if (shared.mode !== "clasico" && shared.turnNo % 12 === 0 && shared.pickups.filter((p) => p.type !== "torre").length < 4) {
      const rng = mulberry32(shared.seed ^ (shared.turnNo * 7919));
      const types = ["artilleria", "blindaje", "iniciativa", "torre"];
      const nt = shared.pickups.filter((p) => p.type === "torre").length;
      const t = types[Math.floor(rng() * (nt >= 3 ? 3 : 4))];
      spawnPickup(shared, t, rng);
    }
  }

  /* IA difícil: mapa de probabilidad. Cuenta en cuántas posiciones legales (terreno + lo que ya sabe)
     podría estar cada unidad de la flota rival (misma composición que la propia: es info pública).
     No mira nada oculto. */
  function densityTarget(env, rng) {
    const { know, shared, who } = env;
    const heat = densityHeat(env);
    let best = null, bw = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const m = know.marks.get(key(x, y));
        if (m && !isStale(shared, who, m)) continue;
        if (m && m.kind === "sunk") continue;
        const v = heat[y * W + x] * (1 + rng() * 0.08);
        if (v > bw) { bw = v; best = { x, y }; }
      }
    }
    return best;
  }
  function densityHeat(env) {
    const { know, shared, who, side } = env;
    if (!shared._fit) shared._fit = {};
    const blocked = (x, y) => {
      const m = know.marks.get(key(x, y));
      if (!m) return 0;
      if (m.kind === "sunk") return 1;
      if (m.kind === "miss") return isStale(shared, who, m) ? 0.5 : 1;
      return 0;
    };
    const heat = new Float32Array(W * H);
    side.fleet.forEach((u) => {
      [true, false].forEach((hz) => {
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const fb = boardKey(shared.crop, other(who)); // la flota que busca está en el tablero del rival
            const fk = fb + "a" + u.size + (hz ? "h" : "v") + x + "," + y;
            if (shared._fit[fk] === undefined) shared._fit[fk] = placeIssue([], x, y, u.size, hz, null, "auto", shared.terrain, shared.map, fb) === "";
            if (!shared._fit[fk]) continue;
            let w = 1, hits = 0;
            for (let i = 0; i < u.size && w > 0; i++) {
              const cx = hz ? x + i : x, cy = hz ? y : y + i;
              w *= 1 - blocked(cx, cy);
              const m = know.marks.get(key(cx, cy));
              if (m && m.kind === "hit" && !isStale(shared, who, m)) hits++;
            }
            w *= 1 + 4 * hits;
            if (w <= 0) continue;
            for (let i = 0; i < u.size; i++) heat[(hz ? y : y + i) * W + (hz ? x + i : x)] += w;
          }
        }
      });
    });
    return heat;
  }

  /* ---------- IA con conocimiento propio ---------- */
  function shotTarget(env, rng) {
    const { know, shared, who } = env;
    // 1) contactos en vivo
    const live = [];
    know.live.forEach((kind, k) => live.push(k));
    const fresh = live.filter((k) => {
      const m = know.marks.get(k);
      return !(m && m.kind !== "miss" && !isStale(shared, who, m));
    });
    if (fresh.length) { const [fx, fy] = fresh[Math.floor(rng() * fresh.length)].split(",").map(Number); return { x: fx, y: fy }; }
    // 2) seguir impactos
    const hunt = [];
    know.marks.forEach((m, k) => {
      if (m.kind !== "hit") return;
      const [x, y] = k.split(",").map(Number);
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        if (!inBounds(nx, ny)) return;
        const mm = know.marks.get(key(nx, ny));
        if (!mm || isStale(shared, who, mm)) hunt.push({ x: nx, y: ny });
      });
    });
    if (hunt.length) {
      // si hay dos impactos en línea, seguir esa línea primero (se siente "inteligente")
      const isHit = (x, y) => { const m = know.marks.get(key(x, y)); return m && m.kind === "hit"; };
      const lined = hunt.filter((c) => [[1, 0], [0, 1]].some(([dx, dy]) =>
        (isHit(c.x + dx, c.y + dy) && isHit(c.x + 2 * dx, c.y + 2 * dy)) || (isHit(c.x - dx, c.y - dy) && isHit(c.x - 2 * dx, c.y - 2 * dy))));
      const pool = lined.length && (env.hard || rng() < AI_TUNE.lineSense) ? lined : hunt;
      if (env.hard) {
        // difícil: entre los candidatos, el que más posiciones de flota explica
        const heat = densityHeat(env);
        let best = pool[0], bw = -1;
        pool.forEach((c) => { const v = heat[c.y * W + c.x] * (1 + rng() * 0.05); if (v > bw) { bw = v; best = c; } });
        return best;
      }
      return pool[Math.floor(rng() * pool.length)];
    }
    // 3) marcas viejas de impacto: ir a confirmar
    const stale = [];
    know.marks.forEach((m, k) => { if (m.kind === "hit" && isStale(shared, who, m)) { const [x, y] = k.split(",").map(Number); stale.push({ x, y }); } });
    if (stale.length && rng() < 0.6) return stale[Math.floor(rng() * stale.length)];
    if (env.hard) { const d = densityTarget(env, rng); if (d) return d; }
    // 4) paridad sobre lo no marcado (o marcado viejo)
    const open = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const m = know.marks.get(key(x, y));
        if (m && !isStale(shared, who, m)) continue;
        if (m && m.kind === "sunk") continue;
        if ((x + y) % 2 === 0) open.push({ x, y });
      }
    }
    if (open.length) return open[Math.floor(rng() * open.length)];
    // sin celdas de paridad: cualquier celda sin disparar (en clásico nunca se repite un tiro)
    const rest = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!know.marks.has(key(x, y))) rest.push({ x, y });
    if (rest.length) return rest[Math.floor(rng() * rest.length)];
    return { x: Math.floor(rng() * W), y: Math.floor(rng() * H) };
  }

  function aiChoose(env, rng) {
    const { side, shared, who, pers, consec, know } = env;
    const enemy = other(who);
    const myZoneHit = (u) => zonesOf(shared, enemy).some((z) => cellsOf(u).some((c) => inZone(z, c.x, c.y)));
    const can = (k) => maneuverAllowed(k, shared, consec).ok;
    const alive = side.fleet.filter((s) => !s.lifted && !shipStatus(s, side.hits).sunk);
    const hasFreshHit = (() => { let f = false; know.marks.forEach((m) => { if (m.kind === "hit" && !isStale(shared, who, m)) f = true; }); return f || know.live.size > 0; })();
    const shoot = () => ({ t: "shot", cell: shotTarget(env, rng) });
    const pickMove = (wantPickup, avoidZones) => {
      let best = null;
      alive.forEach((u) => {
        moveOptions(side, shared, u, who).forEach((o) => {
          const ghost = { x: o.x, y: o.y, size: u.size, horizontal: u.horizontal };
          const exposed = zonesOf(shared, enemy).some((z) => cellsOf(ghost).some((c) => inZone(z, c.x, c.y)));
          let score = rng() * 0.5;
          if (wantPickup && o.collect.length) {
            const wmap = { torre: 3, artilleria: 2.4, iniciativa: 1.6, blindaje: 2 };
            score += Math.max.apply(null, o.collect.map((t) => wmap[t] || 1)) + 2;
          }
          if (avoidZones) {
            const was = myZoneHit(u);
            if (was && !exposed) score += 4;
            if (!was && exposed) score -= 4;
            const dmg = shipStatus(u, side.hits).dmg;
            score += dmg * 0.5;
          }
          if (!wantPickup && !avoidZones) return;
          if (!best || score > best.score) best = { score, o };
        });
      });
      return best;
    };
    if (isClassic(shared)) return shoot();
    const roll = rng();
    const dmgUnits = repairable(side);
    const T = AI_TUNE[pers] || AI_TUNE.agresivo;
    // difícil: con un impacto fresco y sin carga, cargar la cruz antes de rematar
    if (env.hard && can("apuntar") && side.charge < 1 && hasFreshHit && rng() < AI_TUNE.hardAim) return { t: "aim" };
    if (pers === "cauto") {
      if (can("reparar") && dmgUnits.length && roll < T.repair) {
        dmgUnits.sort((a, b) => shipStatus(b, side.hits).dmg / b.size - shipStatus(a, side.hits).dmg / a.size);
        return { t: "repair", unit: dmgUnits[0].id };
      }
      if (can("mover") && alive.some(myZoneHit) && roll < T.dodge) {
        const b = pickMove(false, true);
        if (b && b.score > 2) return { t: "move", unit: b.o.unit, dx: b.o.dx, dy: b.o.dy };
      }
      if (can("mover") && roll < T.grab) {
        const b = pickMove(true, false);
        if (b && b.score > T.grabMin) return { t: "move", unit: b.o.unit, dx: b.o.dx, dy: b.o.dy };
      }
      if (can("reconocer") && !zonesOf(shared, who).length && roll < T.watch && shared.turnNo > 2) {
        const fresh = [];
        for (let y = 1; y < H - 1; y += 3) for (let x = 1; x < W - 1; x += 3) { const m = know.marks.get(key(x, y)); if (!m) fresh.push({ x, y }); }
        if (fresh.length) { const f = fresh[Math.floor(rng() * fresh.length)]; return { t: "watch", x: f.x, y: f.y }; }
      }
      if (can("apuntar") && side.charge < 1 && hasFreshHit && roll < T.aim) return { t: "aim" };
      return shoot();
    }
    if (pers === "oportunista") {
      if (can("mover")) {
        const b = pickMove(true, alive.some(myZoneHit));
        if (b && b.score > T.moveMin) return { t: "move", unit: b.o.unit, dx: b.o.dx, dy: b.o.dy };
      }
      if (can("apuntar") && side.charge < 2 && hasFreshHit && roll < T.aim) return { t: "aim" };
      if (can("reparar") && dmgUnits.length && roll < T.repair) return { t: "repair", unit: dmgUnits[0].id };
      if (can("reconocer") && !zonesOf(shared, who).length && roll < T.watch && shared.turnNo > 3) return { t: "watch", x: 1 + Math.floor(rng() * (W - 2)), y: 2 + Math.floor(rng() * (H - 4)) };
      return shoot();
    }
    // agresivo
    if (can("apuntar") && side.charge < 1 && hasFreshHit && roll < T.aim) return { t: "aim" };
    if (can("mover") && roll < T.move) {
      const b = pickMove(true, false);
      if (b && b.score > T.moveMin) return { t: "move", unit: b.o.unit, dx: b.o.dx, dy: b.o.dy };
    }
    if (can("reparar") && dmgUnits.length && roll > 1 - T.repair) return { t: "repair", unit: dmgUnits[0].id };
    return shoot();
  }

  /* ---------- mundo completo (PvC y simulaciones) ---------- */
  function newWorld(o, rng) {
    const r = rng || Math.random;
    const crop = pairFor(o.map, o.crop);
    const mk = (who) => placeRandom(o.terrain, r, o.map, boardKey(crop, who));
    const shared = newShared(o.seed != null ? o.seed : Math.floor(r() * 4294967296), o.terrain, o.map, crop, o.mode || "reloaded");
    return {
      shared,
      p: {
        arg: { side: newSide(mk("arg")), know: newKnow(), pers: o.persArg || "oportunista", consec: 0, hard: !!o.hardArg },
        inv: { side: newSide(mk("inv")), know: newKnow(), pers: o.persInv || "agresivo", consec: 0, hard: !!o.hardInv }
      }
    };
  }

  function refreshVision(world) {
    ["arg", "inv"].forEach((who) => {
      const foe = world.p[other(who)];
      noteSpot(world.p[who].know, spottedCells(foe.side, zonesOf(world.shared, who)), world.shared.turnNo);
    });
  }

  /* Ejecuta una acción completa de `who`. Devuelve un resumen para narrar/animar. */
  function execAction(world, who, act) {
    const me = world.p[who];
    const foe = world.p[other(who)];
    const sh = world.shared;
    expireSide(me.side, sh);
    const out = { who, t: act.t, results: null, lost: false, pub: null };
    if (act.t === "shot") {
      const pat = shotCells(me.side, sh, act.cell);
      if (pat.charged) { me.side.charge = 0; }
      out.pattern = pat;
      const res = resolveVolley(foe.side, pat.cells);
      out.results = res.results;
      out.lost = res.lost;
      noteResults(me.know, res.results, sh.turnNo);
      me.consec = 0;
      advance(sh, who, "shot");
    } else {
      const unit = act.unit != null ? me.side.fleet.find((s) => s.id === act.unit) : null;
      if (act.t === "move") {
        translateUnit(me.side, unit, act.dx, act.dy);
        out.pub = collectUnder(me.side, sh, who, unit);
        out.pub.forEach((p) => foe.know.ghosts.set(key(p.x, p.y), { kind: unit.kind, t: sh.turnNo }));
        advance(sh, who, "move");
      } else if (act.t === "repair") {
        applyRepair(me.side, unit);
        advance(sh, who, "repair");
      } else if (act.t === "aim") {
        applyAim(me.side, sh);
        advance(sh, who, "aim");
      } else if (act.t === "watch") {
        addWatch(sh, who, act.x, act.y);
        advance(sh, who, "watch");
      }
      me.consec++;
    }
    refreshVision(world);
    return out;
  }

  /* simulación IA vs IA para balancear */
  function simulate(o, rng) {
    const world = newWorld(o, rng);
    let who = "arg";
    const stats = { man: { arg: 0, inv: 0 }, shot: { arg: 0, inv: 0 } };
    for (let guard = 0; guard < 600; guard++) {
      const me = world.p[who];
      const env = { side: me.side, shared: world.shared, who, pers: me.pers, consec: me.consec, know: me.know, hard: me.hard };
      let act = aiChoose(env, rng);
      if (act.t === "shot" && me.know.marks.has(key(act.cell.x, act.cell.y))) stats.repeat = (stats.repeat || 0) + 1;
      let out = execAction(world, who, act);
      stats[act.t === "shot" ? "shot" : "man"][who]++;
      if (out.lost) return { winner: who, turns: world.shared.turnNo, level: warLevel(world.shared), stats };
      if (me.side.init > 0 && world.shared.turnNo < me.side.initUntil) {
        me.side.init = 0;
        const env2 = { side: me.side, shared: world.shared, who, pers: me.pers, consec: me.consec, know: me.know, hard: me.hard };
        act = aiChoose(env2, rng);
        out = execAction(world, who, act);
        stats[act.t === "shot" ? "shot" : "man"][who]++;
        if (out.lost) return { winner: who, turns: world.shared.turnNo, level: warLevel(world.shared), stats };
      }
      who = other(who);
    }
    return { winner: null, turns: world.shared.turnNo, level: warLevel(world.shared), stats, world };
  }

  /* Todos contra todos (Clásico, 2 a 8): la máquina elige a quién y dónde tirar con lo público
     (todos ven todos los tiros sobre todos los sectores). Reusa la IA de 1 vs 1 con un "mundo" de dos. */
  function ffaShot(o, rng) {
    const r = rng || Math.random;
    const shared = { mode: "clasico", terrain: "mixto", map: o.map, crop: [o.myTile, o.foeTile], turnNo: o.turnNo || 0, lastChange: { arg: 0, inv: 0 }, _fit: o.fitCache || {} };
    const env = { side: { fleet: o.fleet }, shared, who: "arg", know: o.know, hard: !!o.hard };
    let c = shotTarget(env, r);
    if (!c || o.know.marks.has(key(c.x, c.y))) {
      const rest = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!o.know.marks.has(key(x, y))) rest.push({ x, y });
      c = rest.length ? rest[Math.floor(r() * rest.length)] : null;
    }
    return c;
  }
  // a quién le tira la máquina: rematar lo que quedó tocado; si no, al azar (Difícil: al más débil)
  function ffaPickTarget(foes, hard, rng) {
    const r = rng || Math.random;
    const alive = foes.filter((f) => f.left > 0);
    if (!alive.length) return null;
    const wounded = alive.filter((f) => { let w = false; f.know.marks.forEach((m) => { if (m.kind === "hit") w = true; }); return w; });
    if (wounded.length && r() < (hard ? 0.9 : 0.7)) return wounded[Math.floor(r() * wounded.length)];
    if (hard && r() < 0.6) return alive.slice().sort((a, b) => a.left - b.left)[0];
    return alive[Math.floor(r() * alive.length)];
  }

  function battleMayStart(mode, localReady, remoteReady, secondsLeft, forced) {
    if (secondsLeft <= 0 || forced) return true;
    if (mode === "pvp") return !!(localReady && remoteReady);
    return !!localReady;
  }

  return {
    W, H, NATIONS, MAPS, FLEETS, FLEET, COLORS, unitName, settleKind, mediumOf, slotsFor, fleetFits, pairFor,
    gridOf, tileOf, tileRC, tileNeighbors, okTiles, maxPlayers, pickSectors, validSectors, ffaShot, ffaPickTarget,
    key, cellsOf, inBounds, canPlace, placeIssue, placeRandom, placeRemaining, fleetHp,
    shipAt, shipStatus, resolveShots, cross, area, aiShot, mulberry32,
    battleMayStart, isLand, CROP_COUNT, BOARDS, boardKey, boardOf, geoView,
    MODES, normMode, isClassic, PICKUPS, MANEUVERS, PERSONALITIES, PERS_LABEL, WAR_NAMES, other, newSide, newKnow, newShared, newWorld,
    warLevel, roundOf, roundsToNextLevel, maneuverAllowed, inZone, zonesOf, addWatch, spottedCells, noteSpot,
    noteResults, isStale, shotCells, resolveVolley, moveOptions, translateUnit, collectUnder, applyPublicCollect,
    repairable, applyRepair, AI_TUNE, applyAim, expireSide, advance, shotTarget, densityTarget, aiChoose, refreshVision, execAction, simulate
  };
});
