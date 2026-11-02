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
      name: "Nahuel Huapi",
      blurb: "Lagos y viento andino",
      scout: "El lago devuelve un eco: hay algo ahí."
    },
    iguazu: {
      id: "iguazu",
      name: "Iguazú",
      blurb: "Selva y cataratas",
      scout: "La niebla de las cataratas marca una presencia."
    },
    glaciares: {
      id: "glaciares",
      name: "Los Glaciares",
      blurb: "Hielo y silencio",
      scout: "El hielo cruje sobre una unidad enemiga."
    }
  };

  const FLEETS = {
    agua: [
      { name: "Portaaviones", size: 5, kind: "barco" },
      { name: "Acorazado", size: 4, kind: "barco" },
      { name: "Crucero", size: 3, kind: "barco" },
      { name: "Submarino", size: 3, kind: "barco" },
      { name: "Destructor", size: 2, kind: "barco" }
    ],
    tierra: [
      { name: "Tanque pesado", size: 5, kind: "tanque" },
      { name: "Tanque", size: 4, kind: "tanque" },
      { name: "Tanque medio", size: 3, kind: "tanque" },
      { name: "Tanque ligero", size: 3, kind: "tanque" },
      { name: "Blindado", size: 2, kind: "tanque" }
    ],
    mixto: [
      { name: "Crucero", size: 5, kind: "barco" },
      { name: "Lancha", size: 3, kind: "barco" },
      { name: "Destructor", size: 2, kind: "barco" },
      { name: "Tanque pesado", size: 4, kind: "tanque" },
      { name: "Tanque", size: 3, kind: "tanque" }
    ]
  };

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

  const CROP_COUNT = 5;

  /* 10 columnas × 20 filas, alineadas al jpg maps/{parque}-mixto-{0-4}.jpg.
     W = agua (barcos). L = tierra o hielo (tanques). */
  const MIXED = {
    nahuel: [
      ["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLWWW","LLLLLLWWWW","WLLLLWWWWW","WWLLLWWWWW","WWWWLLLWWW","WWWWWWLWWW","WWWWWWWWWW","WWWWWWWWWW","LLLWWWWWWW","LLLLLWWWWW","LLWLLWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW"],
      ["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","WLLLLLLLLL","WLLLLLLLLL","WWLLLLLLLL","WWLLLLLLLL","WWWWLLLLLL","WWWWWLLLLL","WWWWWWLLLL","WWWWWWLLLL","WWWWWWWLWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW"],
      ["WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","LWWWWWWWWW","LWWWWWWWWW","LLWWWWWWWW","LLLWWWWWWW","LLLLWWWWWW","LLLLWWWWWW","LLLLWWWWWW","LLLLWWWWWW","LLLLLWWWWW","LLLLLLWWWW","LLLLLLLWWW"],
      ["WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","LLWWWWWWWW","LLLWWWWWWW","LLWWWWWWWW","LLWWWWWWWW","LLWWWWWWWW","LLLWWWWWWW","LLWWWWWWWW","LLLWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW"],
      ["WWWWWWWLLL","WWWWWWLLLL","WWWWWWLLLL","WWWWWWLLLL","WWWWWWLLLL","WWWWWWWLLL","WWWWWWWWWL","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW"]
    ],
    iguazu: [
      ["LLLWWWWWWW","LLLLWWWWWW","LLLLWWWWWW","LLLLWWWWWW","LLLLLWWWWW","LLLLLWWWWW","LLLLLLWWWW","LLLLLLWWWW","LLLLLLWWWW","LLLLLLWWWW","LLLLLLLWWW","LLLLLLLWWW","LLLLLLLWWW","LLLLLLLWWW","LLLLLLLWWW","LLLLLLLWWW","LLLLLLLWWW","LLLLLLLWWW","LLLLLLLWWW","LLLLLLLWWW"],
      ["LLLLLLLWWW","LLLLLLLWWW","LLLLLLLWWW","LLLLLLLWWW","LLLLLLLWWW","LLLLLLLWWW","LLLLLLWWWW","LLLLLLWWWW","LLLLLLWWWW","LLLLLLWWWW","LLLLLLWWWW","LLLLLLWWWW","LLLLLLWWWW","LLLLLLLWWW","LLLLLLWWWW","LLLLLLWWWW","LLLLLLWWWW","LLLLLWWWWW","LLLLWWWWWW","LLLWWWWWWW"],
      ["WLLLLLLLLL","WLLLLLLLLL","WLLLLLLLLL","WLLLLLLLLL","WLLLLLLLLL","WWLLLLLLLL","WWLLLLLLLL","WWWLLLLLLL","WWWWWLLLLL","WWWWWWLLLL","WWWWWWWWLL","WWWWWWWWWL","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWLWW","WWWWWWWLWW","WWWWWWWLWW","WWWWWWWWWW","WWWWWWWWWW"],
      ["LLLLLLWWWW","LLLLLLWWWW","LLLLLLWWWW","LLLLLLWWWW","LLLLLLLWWW","LLLLLLWWWW","LLLLLLWWWW","LLLLLLWWWW","LLLLLWWWWW","LLLLWWWWWW","LLLWWWWWWW","LWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW"],
      ["LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","WLLLLLLLLL","WWLLLLLLLL","WWWWWWLLLL","WWWWWWWLLW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW"]
    ],
    glaciares: [
      ["WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","LLLWWWWWWW","LLLLLWWWWW","LLLLLLLWWW","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],
      ["LLLLLLLWWW","LLLLLLLWWW","LLLLLLWWWW","LLLLLWWWWW","LLLLWWWWWW","LLLWWWWWWW","LLWWWWWWWW","LWWWWWWWWW","WWWWWWWWWW","WWWWWWLLLL","WWWWLLLLLL","WWLLLLLLLL","WLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],
      ["LLLLWWWWWW","LLLWWWWWWW","LLWWWWWWWW","LWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWLLWWWW","WWLLLLLLLL","WLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],
      ["WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWWWWWWW","WWWWLLWWWW","WWWLLLLWWW","WWLLLLLLWW","WLLLLLLLLW","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL","LLLLLLLLLL"],
      ["LLLWWWWWWW","LLLWWWWWWW","LLLWWWWWWW","LLLLWWWWWW","LLLLLWWWWW","LLLLLWWWWW","LLLLLWWWWW","LLLLLLWWWW","LLLLLWWWWW","LLLLWWWWWW","LLLWWWWWWW","LLLWWWWWWW","LLWWWWWWWW","LLWWWWWWWW","LLWWWWWWWW","LLWWWWWWWW","LLWWWWWWWW","LLLWWWWWWW","LLLWWWWWWW","LLLWWWWWWW"]
    ]
  };

  function isLand(terrain, map, crop, x, y) {
    if (terrain === "tierra") return true;
    if (terrain !== "mixto") return false;
    const table = MIXED[map] || MIXED.nahuel;
    const rows = table[(crop || 0) % CROP_COUNT];
    const row = rows[y] || "";
    return row[x] === "L";
  }

  function overlaps(fleet, ship, ignoreId) {
    const taken = new Set();
    fleet.forEach((s) => {
      if (s.lifted || s.id === ignoreId) return;
      cellsOf(s).forEach((c) => taken.add(key(c.x, c.y)));
    });
    return cellsOf(ship).some((c) => !inBounds(c.x, c.y) || taken.has(key(c.x, c.y)));
  }

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
    if (kind === "barco" || kind === "tanque") {
      const bad = cells.some((c) => {
        const land = isLand(terrain, map, crop, c.x, c.y);
        return kind === "tanque" ? !land : land;
      });
      if (bad) return kind === "barco" ? "tierra" : "agua";
    }
    return "";
  }

  function canPlace(fleet, x, y, size, horizontal, ignoreId, kind, terrain, map, crop) {
    return placeIssue(fleet, x, y, size, horizontal, ignoreId, kind, terrain, map, crop) === "";
  }

  function placeRandom(terrain, rng, map, crop) {
    const spec = FLEETS[terrain] || FLEETS.agua;
    const fleet = [];
    spec.forEach((u, id) => {
      let placed = false;
      const kind = u.kind || (terrain === "tierra" ? "tanque" : "barco");
      for (let n = 0; n < 900 && !placed; n++) {
        const horizontal = rng() > 0.42;
        const x = Math.floor(rng() * (horizontal ? W - u.size + 1 : W));
        const y = Math.floor(rng() * (horizontal ? H : H - u.size + 1));
        if (canPlace(fleet, x, y, u.size, horizontal, null, kind, terrain, map, crop || 0)) {
          fleet.push({
            id,
            name: u.name,
            size: u.size,
            kind,
            x,
            y,
            horizontal,
            color: COLORS[id],
            lifted: false
          });
          placed = true;
        }
      }
      if (!placed) throw new Error("No se pudo colocar " + u.name);
    });
    return fleet;
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

  function scout(fleet, rng) {
    const alive = fleet.filter((s) => !s.lifted);
    const ship = alive[Math.floor(rng() * alive.length)];
    const cells = cellsOf(ship);
    return cells[Math.floor(rng() * cells.length)];
  }

  function battleMayStart(mode, localReady, remoteReady, secondsLeft, forced) {
    if (secondsLeft <= 0 || forced) return true;
    if (mode === "pvp") return !!(localReady && remoteReady);
    return !!localReady;
  }

  return {
    W, H, NATIONS, MAPS, FLEETS, COLORS,
    key, cellsOf, inBounds, canPlace, placeIssue, placeRandom, fleetHp,
    shipAt, shipStatus, resolveShots, cross, area, aiShot, scout, mulberry32,
    battleMayStart, isLand, CROP_COUNT, MIXED
  };
});
