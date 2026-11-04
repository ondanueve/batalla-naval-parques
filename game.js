/* Parques en Guerra — partida, tablero y duelo. */
(function () {
  if (window.__parquesGame) return;
  window.__parquesGame = true;

  const C = window.ParquesCore;
  if (!C) return;

  const PAD_L = 28;
  const PAD_T = 16;
  const WAIT = (ms) => new Promise((r) => setTimeout(r, ms));
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const THEME = {
    nahuel: { sea: "#1d6fbf", deep: "#0c4a8a", foam: "rgba(255,255,255,.45)", land: "#3f7d32", spec: "#14532d", ice: null },
    iguazu: { sea: "#0f766e", deep: "#115e59", foam: "rgba(236,253,245,.55)", land: "#166534", spec: "#052e16", ice: null },
    glaciares: { sea: "#bae6fd", deep: "#7dd3fc", foam: "rgba(255,255,255,.75)", land: "#94a3b8", spec: "#e2e8f0", ice: "#f8fafc" }
  };
  const HINTS = {
    agua: "Solo barcos, sobre agua. Tienen que entrar enteros y sin pisarse.",
    tierra: "Solo tanques, sobre tierra. Enteros: si se salen o se pisan, no se apoyan.",
    mixto: "Barcos en el agua y tanques en la tierra. En rojo, esa postura no vale."
  };
  const ISSUE_TEXT = {
    borde: "No entra: se sale del mapa. Tiene que quedar entera.",
    solape: "No entra: se pisa con otra unidad.",
    tierra: "Ahí hay tierra. Este es un barco: solo puede ir al agua.",
    agua: "Ahí hay agua. Este es un tanque: solo puede ir a tierra."
  };
  const ISSUE_BANNER = {
    borde: "NO ENTRA · se sale",
    solape: "NO ENTRA · se pisa",
    tierra: "NO ENTRA · solo agua",
    agua: "NO ENTRA · solo tierra"
  };

  const ui = {
    menu: document.getElementById("menu"),
    battle: document.getElementById("battle"),
    canvas: document.getElementById("board"),
    label: document.getElementById("board-label"),
    pips: document.getElementById("pips"),
    dialogue: document.getElementById("dialogue"),
    clock: document.getElementById("clock"),
    linkbox: document.getElementById("linkbox"),
    link: document.getElementById("link"),
    end: document.getElementById("end"),
    endTitle: document.getElementById("end-title"),
    stage: document.getElementById("stage"),
    hurt: document.getElementById("hurt"),
    radar: document.getElementById("radar"),
    bomb: document.getElementById("bomb"),
    camo: document.getElementById("camo"),
    rotate: document.getElementById("rotate"),
    ready: document.getElementById("ready")
  };
  if (!ui.canvas) return;
  const ctx = ui.canvas.getContext("2d");

  const opts = { map: "nahuel", terrain: "agua", mode: "pvc", nation: "chile", crop: 0 };
  let match = null;
  let peer = null;
  let conn = null;
  let raf = 0;
  let lastT = 0;
  let parts = [];
  let rings = [];
  let floats = [];
  let flashes = [];
  let shocks = [];
  let zoom = { z: 0, x: 0, y: 0 };
  let hitstop = 0;
  let slow = 0;
  let flashScreen = 0;
  let nowT = 0;
  let fxDt = 0.016;
  let mapCache = null;
  const SPARKLES = Array.from({ length: 34 }, (_, i) => ({ x: (i * 37 % 100) / 100, y: (i * 61 % 100) / 100, ph: i * 1.7 }));
  let viewOverride = null;
  let armed = null;
  let hand = null;
  let dragging = false;
  let moved = false;
  let gestureHeld = false;
  let preview = null;
  let lastPlaceTag = "";
  let clockLeft = 60;
  let clockId = 0;
  let busy = false;
  const inbox = [];
  let localReady = false;
  let remoteReady = false;
  let remoteLeft = 17;
  let hudDirty = true;
  let trauma = 0;
  let sealed = false;
  let published = false;
  let remoteForced = false;
  let battleStarted = false;
  let gotHello = false;
  let helloTimer = 0;
  let hereTimer = 0;
  let hostTries = 0;
  const mapImgs = {};

  function say(text) {
    ui.dialogue.textContent = text;
  }
  function juke() { return window.Juke; }
  function blip() { const j = juke(); if (j) j.sfx.ui(); }

  function lock(fn) {
    inbox.push(fn);
    drain();
  }
  function drain() {
    if (busy || !inbox.length) return;
    busy = true;
    Promise.resolve()
      .then(() => inbox.shift()())
      .catch((err) => console.error(err))
      .then(() => { busy = false; drain(); });
  }

  function applyTheme() {
    document.body.dataset.map = opts.map;
    document.body.dataset.terrain = opts.terrain;
  }

  function buildNations() {
    const box = document.getElementById("nations");
    if (!box || box.childElementCount) return;
    Object.keys(C.NATIONS).forEach((id) => {
      const n = C.NATIONS[id];
      const b = document.createElement("button");
      b.type = "button";
      b.className = "nation" + (id === opts.nation ? " selected" : "");
      b.textContent = n.flag + " " + n.name;
      b.addEventListener("click", () => {
        opts.nation = id;
        box.querySelectorAll(".nation").forEach((el) => el.classList.toggle("selected", el === b));
        blip();
      });
      box.appendChild(b);
    });
  }

  function selectGroup(root, attr, key) {
    if (!root) return;
    root.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => {
        opts[key] = b.dataset[attr];
        root.querySelectorAll("button").forEach((el) => el.classList.toggle("selected", el === b));
        if (key === "terrain") document.getElementById("terrain-hint").textContent = HINTS[opts.terrain];
        if (key === "map" || key === "terrain") applyTheme();
        if (key === "mode") {
          document.getElementById("start").textContent = opts.mode === "pvp" ? "Crear enlace" : "Entrar al parque";
        }
        blip();
      });
    });
  }

  function destroyNet() {
    clearInterval(helloTimer);
    clearInterval(hereTimer);
    helloTimer = 0;
    hereTimer = 0;
    try { if (conn) conn.close(); } catch (e) {}
    try { if (peer) peer.destroy(); } catch (e) {}
    conn = null;
    peer = null;
  }

  function showMenu() {
    stopClock();
    destroyNet();
    match = null;
    hand = null;
    armed = null;
    viewOverride = null;
    parts = [];
    rings = [];
    floats = [];
    shocks = [];
    flashes = [];
    zoom.z = 0;
    hitstop = 0;
    slow = 0;
    flashScreen = 0;
    hideBanner();
    ui.end.classList.add("hidden");
    ui.battle.classList.add("hidden");
    ui.menu.classList.remove("hidden");
    ui.stage.classList.remove("under-fire", "shake");
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function showBattle() {
    ui.menu.classList.add("hidden");
    ui.battle.classList.remove("hidden");
    ui.end.classList.add("hidden");
    applyTheme();
    const nation = C.NATIONS[opts.nation];
    document.getElementById("inv-name").textContent = nation.flag + " " + nation.name.toUpperCase();
    fit();
    hudDirty = true;
    requestAnimationFrame(fit);
    if (!raf) {
      lastT = 0;
      raf = requestAnimationFrame(loop);
    }
  }

  function fit() {
    const stage = ui.stage;
    const chrome = (ui.label ? ui.label.offsetHeight : 16) + (ui.pips ? ui.pips.offsetHeight : 18) + 8;
    const availW = Math.max(80, stage.clientWidth);
    const availH = Math.max(80, stage.clientHeight - chrome);
    let h = availH;
    let w = h * (C.W / C.H);
    if (w > availW) {
      w = availW;
      h = w * (C.H / C.W);
    }
    w = Math.max(40, Math.floor(w));
    h = Math.max(40, Math.floor(h));
    if (h > availH) {
      h = Math.floor(availH);
      w = Math.floor(h * (C.W / C.H));
    }
    if (w > availW) w = Math.floor(availW);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const bw = Math.floor(w * dpr);
    const bh = Math.floor(h * dpr);
    ui.canvas.style.width = w + "px";
    ui.canvas.style.height = h + "px";
    if (ui.canvas.width !== bw || ui.canvas.height !== bh) {
      ui.canvas.width = bw;
      ui.canvas.height = bh;
    }
  }

  function gridGeom() {
    const dpr = ui.canvas.width / Math.max(1, ui.canvas.clientWidth || ui.canvas.width);
    const padL = PAD_L * dpr;
    const padT = PAD_T * dpr;
    const cellW = (ui.canvas.width - padL) / C.W;
    const cellH = (ui.canvas.height - padT) / C.H;
    return { dpr, padL, padT, cellW, cellH };
  }

  function cellFromEvent(e, loose) {
    const r = ui.canvas.getBoundingClientRect();
    const cw = (r.width - PAD_L) / C.W;
    const ch = (r.height - PAD_T) / C.H;
    if (cw <= 0 || ch <= 0) return null;
    let x = Math.floor((e.clientX - r.left - PAD_L) / cw);
    let y = Math.floor((e.clientY - r.top - PAD_T) / ch);
    if (loose) {
      x = Math.max(-2, Math.min(C.W + 1, x));
      y = Math.max(-2, Math.min(C.H + 1, y));
      return { x, y };
    }
    if (!C.inBounds(x, y)) return null;
    return { x, y };
  }

  function viewKind() {
    if (viewOverride) return viewOverride;
    if (!match) return "local";
    if (match.phase === "place" || match.phase === "sealed" || match.phase === "defend" || match.phase === "lobby") return "local";
    return "remote";
  }

  function hpOf(fleet, hits) {
    let total = 0;
    let left = 0;
    (fleet || []).forEach((s) => {
      C.cellsOf(s).forEach((c) => {
        total++;
        if (!hits.has(C.key(c.x, c.y))) left++;
      });
    });
    return { left, total: total || 17, pct: total ? left / total : 1 };
  }

  function foeHp() {
    if (match && match.remote) return hpOf(match.remote, match.hitsOnRemote);
    return { left: remoteLeft, total: 17, pct: remoteLeft / 17 };
  }

  function setBar(side, hp) {
    const bar = document.getElementById("bar-" + side);
    const label = document.getElementById("hp-" + side);
    bar.firstElementChild.style.width = Math.max(0, Math.round(hp.pct * 100)) + "%";
    bar.classList.toggle("low", hp.pct <= 0.34);
    bar.classList.toggle("mid", hp.pct > 0.34 && hp.pct <= 0.66);
    label.textContent = hp.left + "/" + hp.total;
  }

  function paintPips(localView) {
    ui.pips.replaceChildren();
    const fleet = localView ? match.local : null;
    const list = fleet || C.FLEETS[opts.terrain] || [];
    list.forEach((s) => {
      const el = document.createElement("span");
      el.className = "pip";
      let dead = false;
      if (fleet) dead = C.shipStatus(s, match.hitsOnLocal).sunk;
      else dead = match.wrecks.some((w) => w.name === s.name);
      if (dead) el.classList.add("dead");
      el.textContent = s.name + " " + s.size;
      ui.pips.appendChild(el);
    });
  }

  function flushHud() {
    if (!hudDirty || !match) return;
    hudDirty = false;
    const localHp = hpOf(match.local, match.hitsOnLocal);
    const enemyHp = foeHp();
    setBar("arg", match.role === "arg" ? localHp : enemyHp);
    setBar("inv", match.role === "inv" ? localHp : enemyHp);
    document.getElementById("tag-arg").classList.toggle("hidden", match.role !== "arg");
    document.getElementById("tag-inv").classList.toggle("hidden", match.role !== "inv");
    const localView = viewKind() === "local";
    let label = (localView ? "Tu territorio" : "Territorio enemigo") + " · " + (C.MAPS[opts.map] ? C.MAPS[opts.map].name : "");
    if (match.shield && localView) label += " · camuflaje";
    if (match.phase === "lobby") label = "Esperando al invasor";
    if (match.phase === "sealed") label = "Flota cerrada · " + (C.MAPS[opts.map] ? C.MAPS[opts.map].name : "");
    ui.label.textContent = label;
    paintPips(localView);
    const placing = match.phase === "place" && !sealed;
    const waitingReady = match.phase === "sealed";
    const combat = match.phase === "attack" || match.phase === "defend" || match.phase === "resolving" || match.phase === "end";
    ui.rotate.classList.toggle("hidden", !placing);
    ui.ready.classList.toggle("hidden", !(placing || waitingReady));
    ui.ready.disabled = waitingReady;
    ui.ready.textContent = waitingReady ? "Esperando" : "Estoy listo";
    ui.radar.classList.toggle("hidden", !combat);
    ui.bomb.classList.toggle("hidden", !combat);
    ui.camo.classList.toggle("hidden", !combat);
    const myTurn = match.phase === "attack";
    ui.radar.disabled = !myTurn || match.powers.radar <= 0;
    ui.bomb.disabled = !myTurn || match.powers.bomb <= 0;
    ui.camo.disabled = !myTurn || match.powers.camo <= 0 || match.shield;
    ui.radar.textContent = "Radar " + match.powers.radar;
    ui.bomb.textContent = "Bomba " + match.powers.bomb;
    ui.camo.textContent = match.shield ? "Camu ON" : "Camu " + match.powers.camo;
    ui.radar.setAttribute("aria-pressed", armed === "radar" ? "true" : "false");
    ui.bomb.setAttribute("aria-pressed", armed === "bomb" ? "true" : "false");
    ui.rotate.disabled = sealed || !hand;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function cellPx(g, x, y) {
    return { x: g.padL + x * g.cellW, y: g.padT + y * g.cellH };
  }

  function isLand(x, y) {
    return C.isLand(opts.terrain, opts.map, opts.crop, x, y);
  }

  function asset(path) {
    const nodes = document.querySelectorAll("script[src*='game.js']");
    const src = nodes.length ? nodes[nodes.length - 1].getAttribute("src") || "game.js" : "game.js";
    return src.replace(/game\.js(\?.*)?$/, path);
  }

  function parkImage() {
    const id = (opts.map || "nahuel") + "-" + (opts.terrain || "agua") + "-" + ((opts.crop || 0) % 5);
    if (!mapImgs[id]) {
      const img = new Image();
      img.src = asset("maps/" + id + ".jpg");
      mapImgs[id] = img;
    }
    return mapImgs[id];
  }

  function vividMap(img, gw, gh) {
    const w = Math.max(2, Math.round(gw));
    const h = Math.max(2, Math.round(gh));
    if (mapCache && mapCache.img === img && mapCache.w === w && mapCache.h === h) return mapCache.canvas;
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const c2 = cv.getContext("2d");
    const hasFilter = "filter" in c2;
    // auto-level: dark satellite shots get a bigger lift than already bright ones
    let lum = 0.45;
    try {
      const sm = document.createElement("canvas");
      sm.width = 16;
      sm.height = 32;
      const sc = sm.getContext("2d");
      sc.drawImage(img, 0, 0, 16, 32);
      const d = sc.getImageData(0, 0, 16, 32).data;
      let t = 0;
      for (let i = 0; i < d.length; i += 4) t += (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
      lum = t / (d.length / 4);
    } catch (e) { /* tainted canvas: keep default */ }
    const lift = Math.max(1.12, Math.min(2.1, 0.5 / Math.max(0.08, lum)));
    if (hasFilter) c2.filter = "saturate(1.5) brightness(" + lift.toFixed(2) + ") contrast(1.1)";
    c2.drawImage(img, 0, 0, w, h);
    c2.filter = "none";
    if (!hasFilter) {
      // Browsers without canvas filters: lift the satellite shots with a soft-light wash instead.
      c2.globalCompositeOperation = "soft-light";
      c2.fillStyle = "rgba(255,255,255,.28)";
      c2.fillRect(0, 0, w, h);
      c2.globalCompositeOperation = "source-over";
    }
    const warm = c2.createLinearGradient(0, 0, w, h * 0.7);
    warm.addColorStop(0, "rgba(255,236,190,.16)");
    warm.addColorStop(1, "rgba(120,200,255,.06)");
    c2.fillStyle = warm;
    c2.fillRect(0, 0, w, h);
    mapCache = { img, w, h, canvas: cv };
    return cv;
  }

  function draw(time) {
    nowT = time;
    const g = gridGeom();
    const theme = THEME[opts.map] || THEME.nahuel;
    const w = ui.canvas.width;
    const h = ui.canvas.height;
    ctx.clearRect(0, 0, w, h);
    const shake = trauma * trauma * 11 * g.dpr;
    const ox = shake ? Math.sin(time / 17) * shake : 0;
    const oy = shake ? Math.cos(time / 23) * shake * 0.6 : 0;
    ctx.save();
    ctx.translate(ox, oy);
    if (zoom.z > 0.002) {
      ctx.translate(zoom.x, zoom.y);
      ctx.scale(1 + zoom.z, 1 + zoom.z);
      ctx.translate(-zoom.x, -zoom.y);
    }

    const gw = g.cellW * C.W;
    const gh = g.cellH * C.H;
    const img = parkImage();
    if (img && img.complete && img.naturalWidth) {
      ctx.drawImage(vividMap(img, gw, gh), g.padL, g.padT, gw, gh);
      if (!reduceMotion) {
        // slow light sweep + water glints so the park feels alive
        ctx.save();
        ctx.beginPath();
        ctx.rect(g.padL, g.padT, gw, gh);
        ctx.clip();
        const sx = ((time / 11000) % 1.7 - 0.35) * gw;
        const lg = ctx.createLinearGradient(g.padL + sx - gw * 0.28, g.padT, g.padL + sx + gw * 0.28, g.padT + gh * 0.55);
        lg.addColorStop(0, "rgba(255,244,214,0)");
        lg.addColorStop(0.5, "rgba(255,244,214,.16)");
        lg.addColorStop(1, "rgba(255,244,214,0)");
        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = lg;
        ctx.fillRect(g.padL, g.padT, gw, gh);
        ctx.fillStyle = "#fff";
        SPARKLES.forEach((sp) => {
          const cx = Math.min(C.W - 1, Math.floor(sp.x * C.W));
          const cy = Math.min(C.H - 1, Math.floor(sp.y * C.H));
          if (isLand(cx, cy) && opts.terrain !== "agua") return;
          const a = Math.max(0, Math.sin(time / 600 + sp.ph));
          if (a < 0.2) return;
          ctx.globalAlpha = a * 0.55;
          const px = g.padL + (sp.x * C.W) * g.cellW;
          const py = g.padT + (sp.y * C.H) * g.cellH;
          const r = (0.8 + a * 1.6) * g.dpr;
          ctx.fillRect(px - r, py - r * 0.3, r * 2, r * 0.6);
          ctx.fillRect(px - r * 0.3, py - r, r * 0.6, r * 2);
        });
        ctx.restore();
      }
    } else {
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, theme.deep);
      bg.addColorStop(1, theme.sea);
      ctx.fillStyle = bg;
      ctx.fillRect(g.padL, g.padT, gw, gh);
    }

    if (opts.terrain === "mixto") {
      for (let y = 0; y < C.H; y++) {
        for (let x = 0; x < C.W; x++) {
          const p = cellPx(g, x, y);
          ctx.fillStyle = isLand(x, y) ? "rgba(250, 204, 21, .15)" : "rgba(56, 189, 248, .09)";
          ctx.fillRect(p.x, p.y, g.cellW, g.cellH);
        }
      }
    }
    // grid: one soft dark line under one thin light line, so the map stays bright
    ctx.beginPath();
    for (let x = 0; x <= C.W; x++) { ctx.moveTo(g.padL + x * g.cellW, g.padT); ctx.lineTo(g.padL + x * g.cellW, g.padT + gh); }
    for (let y = 0; y <= C.H; y++) { ctx.moveTo(g.padL, g.padT + y * g.cellH); ctx.lineTo(g.padL + gw, g.padT + y * g.cellH); }
    ctx.save();
    ctx.translate(0.6 * g.dpr, 0.6 * g.dpr);
    ctx.strokeStyle = "rgba(4,10,24,.22)";
    ctx.lineWidth = Math.max(1, g.dpr * 0.7);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,.34)";
    ctx.lineWidth = Math.max(1, g.dpr * 0.6);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.55)";
    ctx.lineWidth = Math.max(1.5, g.dpr * 1.2);
    ctx.strokeRect(g.padL, g.padT, gw, gh);

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.85)";
    ctx.shadowBlur = 4 * g.dpr;
    ctx.fillStyle = "#f8fafc";
    ctx.font = "800 " + Math.max(9, Math.floor(g.padT * 0.72)) + "px Nunito, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let x = 0; x < C.W; x++) {
      ctx.fillText(String.fromCharCode(65 + x), g.padL + (x + 0.5) * g.cellW, g.padT * 0.48);
    }
    ctx.textAlign = "right";
    ctx.font = "800 " + Math.max(8, Math.floor(Math.min(g.cellH, g.padL) * 0.42)) + "px Nunito, sans-serif";
    for (let y = 0; y < C.H; y++) {
      ctx.fillText(String(y + 1), g.padL - 3 * g.dpr, g.padT + (y + 0.5) * g.cellH);
    }
    ctx.restore();

    if (match) drawPieces(g, time);
    drawFx(g);
    ctx.restore();
    if (flashScreen > 0.01) {
      ctx.fillStyle = "rgba(255,236,200," + (flashScreen * 0.42).toFixed(3) + ")";
      ctx.fillRect(0, 0, w, h);
    }
    flushHud();
  }

  function unitDir(ship) {
    if (ship.horizontal) return { x: -1, y: 0 };
    return { x: 0, y: -1 };
  }

  function drawShipHull(g, ship, color) {
    const dir = unitDir(ship);
    const bow = cellPx(g, ship.x, ship.y);
    const sternI = ship.size - 1;
    const stern = cellPx(
      g,
      ship.horizontal ? ship.x + sternI : ship.x,
      ship.horizontal ? ship.y : ship.y + sternI
    );
    const bcx = bow.x + g.cellW * 0.5;
    const bcy = bow.y + g.cellH * 0.5;
    const scx = stern.x + g.cellW * 0.5;
    const scy = stern.y + g.cellH * 0.5;
    const dx = dir.x;
    const dy = dir.y;
    const px = -dy;
    const py = dx;
    const beam = Math.min(g.cellW, g.cellH) * 0.36;
    const tipX = bcx + dx * g.cellW * 0.46;
    const tipY = bcy + dy * g.cellH * 0.46;
    const shX = bcx - dx * g.cellW * 0.02;
    const shY = bcy - dy * g.cellH * 0.02;
    const back = Math.min(g.cellW, g.cellH) * 0.36;
    const bkX = scx - dx * back;
    const bkY = scy - dy * back;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(shX + px * beam, shY + py * beam);
    ctx.lineTo(bkX + px * beam * 0.86, bkY + py * beam * 0.86);
    ctx.lineTo(bkX - px * beam * 0.86, bkY - py * beam * 0.86);
    ctx.lineTo(shX - px * beam, shY - py * beam);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.55)";
    ctx.lineWidth = Math.max(1.5, g.dpr);
    ctx.stroke();
    const cabX = bcx * 0.35 + scx * 0.65;
    const cabY = bcy * 0.35 + scy * 0.65;
    ctx.fillStyle = "rgba(15,23,42,.55)";
    ctx.beginPath();
    ctx.ellipse(cabX, cabY, beam * 0.42, beam * 0.62, Math.atan2(dy, dx), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.95)";
    ctx.beginPath();
    ctx.arc(bcx + dx * g.cellW * 0.08, bcy + dy * g.cellH * 0.08, Math.min(g.cellW, g.cellH) * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTankCell(g, x, y, dir, color) {
    const p = cellPx(g, x, y);
    const cx = p.x + g.cellW * 0.5;
    const cy = p.y + g.cellH * 0.5;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.atan2(dir.y, dir.x));
    const bw = Math.min(g.cellW, g.cellH);
    ctx.fillStyle = "rgba(15,23,42,.8)";
    ctx.fillRect(-bw * 0.16, -bw * 0.34, bw * 0.62, bw * 0.16);
    ctx.fillRect(-bw * 0.16, bw * 0.18, bw * 0.62, bw * 0.16);
    ctx.fillStyle = color;
    roundRect(-bw * 0.22, -bw * 0.2, bw * 0.62, bw * 0.4, bw * 0.08);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.45)";
    ctx.lineWidth = Math.max(1, g.dpr * 0.8);
    ctx.stroke();
    ctx.fillStyle = "rgba(15,23,42,.72)";
    ctx.beginPath();
    ctx.arc(bw * 0.02, 0, bw * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(248,250,252,.9)";
    ctx.lineWidth = Math.max(2, bw * 0.07);
    ctx.beginPath();
    ctx.moveTo(bw * 0.08, 0);
    ctx.lineTo(bw * 0.4, 0);
    ctx.stroke();
    ctx.restore();
  }

  function drawHull(g, ship, alpha, color) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const fill = color || ship.color;
    const kind = ship.kind || (opts.terrain === "tierra" ? "tanque" : "barco");
    if (kind === "tanque") {
      const dir = unitDir(ship);
      for (let i = 0; i < ship.size; i++) {
        const c = ship.horizontal ? { x: ship.x + i, y: ship.y } : { x: ship.x, y: ship.y + i };
        drawTankCell(g, c.x, c.y, dir, fill);
      }
    } else {
      drawShipHull(g, ship, fill);
    }
    ctx.restore();
  }

  function drawIllegalMarks(g, ship) {
    ctx.save();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = Math.max(2, 2 * g.dpr);
    for (let i = 0; i < ship.size; i++) {
      const c = ship.horizontal ? { x: ship.x + i, y: ship.y } : { x: ship.x, y: ship.y + i };
      if (!C.inBounds(c.x, c.y)) continue;
      const p = cellPx(g, c.x, c.y);
      const m = Math.min(g.cellW, g.cellH) * 0.22;
      const cx = p.x + g.cellW / 2;
      const cy = p.y + g.cellH / 2;
      ctx.beginPath();
      ctx.moveTo(cx - m, cy - m);
      ctx.lineTo(cx + m, cy + m);
      ctx.moveTo(cx + m, cy - m);
      ctx.lineTo(cx - m, cy + m);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawIssueBanner(g, text) {
    ctx.save();
    ctx.font = "800 " + Math.max(13, Math.floor(14 * g.dpr)) + "px Nunito, sans-serif";
    const tw = ctx.measureText(text).width;
    const x = g.padL + 6 * g.dpr;
    const y = g.padT + 6 * g.dpr;
    const h = Math.max(22, 24 * g.dpr);
    ctx.fillStyle = "rgba(127, 29, 29, .94)";
    roundRect(x, y, tw + 16 * g.dpr, h, 8);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + 8 * g.dpr, y + h / 2);
    ctx.restore();
  }

  function drawPieces(g, time) {
    const local = viewKind() === "local";
    if (local && match.local) {
      match.local.forEach((s) => {
        if (s.lifted) return;
        const sunk = C.shipStatus(s, match.hitsOnLocal).sunk;
        drawHull(g, s, 1, sunk ? "#6b7280" : undefined);
        C.cellsOf(s).forEach((c) => {
          if (match.hitsOnLocal.has(C.key(c.x, c.y))) drawMark(g, c.x, c.y, sunk ? "sunk" : "hit");
        });
      });
      match.hitsOnLocal.forEach((k) => {
        const [x, y] = k.split(",").map(Number);
        if (!C.shipAt(match.local, x, y)) drawMark(g, x, y, "miss");
      });
      if (hand && preview) {
        const ghost = {
          x: preview.x,
          y: preview.y,
          size: hand.ship.size,
          horizontal: hand.horizontal,
          kind: hand.ship.kind,
          color: hand.ship.color
        };
        const issue = C.placeIssue(
          match.local, ghost.x, ghost.y, ghost.size, ghost.horizontal,
          hand.ship.id, ghost.kind, opts.terrain, opts.map, opts.crop
        );
        drawHull(g, ghost, 0.92, issue ? "#f87171" : "#4ade80");
        if (issue) {
          drawIllegalMarks(g, ghost);
          drawIssueBanner(g, ISSUE_BANNER[issue] || "NO ENTRA");
        }
      }
    } else {
      match.wrecks.forEach((w) => {
        if (!w.cells || !w.cells.length) return;
        const horizontal = w.cells.length < 2 || w.cells[0].y === w.cells[1].y;
        const spec = (C.FLEETS[opts.terrain] || []).find((s) => s.name === w.name);
        const unit = {
          x: Math.min.apply(null, w.cells.map((c) => c.x)),
          y: Math.min.apply(null, w.cells.map((c) => c.y)),
          size: w.cells.length,
          horizontal,
          kind: spec ? spec.kind : "barco",
          color: "#64748b"
        };
        const age = w.t0 ? (performance.now() - w.t0) / 1000 : 9;
        const mid = cellPx(g, unit.x + (horizontal ? unit.size / 2 - 0.5 : 0), unit.y + (horizontal ? 0 : unit.size / 2 - 0.5));
        const mx = mid.x + g.cellW / 2;
        const my = mid.y + g.cellH / 2;
        // oil slick under the wreck, growing slowly
        ctx.save();
        ctx.fillStyle = "rgba(8,10,16,.34)";
        ctx.beginPath();
        const grow = Math.min(1, age / 2.2);
        ctx.ellipse(mx, my, (horizontal ? unit.size * 0.62 : 0.9) * g.cellW * (0.6 + grow * 0.4), (horizontal ? 0.9 : unit.size * 0.62) * g.cellH * (0.6 + grow * 0.4), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.save();
        if (age < 1.4 && !reduceMotion) {
          ctx.translate(mx, my);
          ctx.rotate(Math.sin(age * 11) * (1 - age / 1.4) * 0.09);
          ctx.translate(-mx, -my);
        }
        drawHull(g, unit, 0.95, "#64748b");
        if (age < 1.4) {
          ctx.globalAlpha = 1 - age / 1.4;
          drawHull(g, unit, 0.85, "#ef4444");
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      });
      match.intelShip.forEach((k) => {
        if (match.remoteMarks.get(k)) return;
        const [x, y] = k.split(",").map(Number);
        const p = cellPx(g, x, y);
        ctx.fillStyle = "rgba(250,204,21,.9)";
        ctx.fillRect(p.x + 2, p.y + 2, g.cellW - 4, g.cellH - 4);
        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = Math.max(2, 2.5 * g.dpr);
        ctx.strokeRect(p.x + 2, p.y + 2, g.cellW - 4, g.cellH - 4);
      });
      match.intelEmpty.forEach((k) => {
        if (match.remoteMarks.get(k)) return;
        const [x, y] = k.split(",").map(Number);
        drawMark(g, x, y, "ping");
      });
      match.remoteMarks.forEach((kind, k) => {
        const [x, y] = k.split(",").map(Number);
        drawMark(g, x, y, kind);
      });
      if (match.phase === "attack" && preview && C.inBounds(preview.x, preview.y)) {
        const cells = armed === "radar" ? C.area(preview.x, preview.y) : armed === "bomb" ? C.cross(preview.x, preview.y) : [preview];
        ctx.fillStyle = armed === "radar" ? "rgba(250,204,21,.38)" : armed === "bomb" ? "rgba(248,113,113,.42)" : "rgba(255,255,255,.18)";
        cells.forEach((c) => {
          const p = cellPx(g, c.x, c.y);
          ctx.fillRect(p.x + 1, p.y + 1, g.cellW - 2, g.cellH - 2);
        });
      }
    }
    flashes.forEach((f) => {
      const p = cellPx(g, f.x, f.y);
      ctx.globalAlpha = Math.max(0, f.life);
      ctx.fillStyle = "#fff";
      ctx.fillRect(p.x, p.y, g.cellW, g.cellH);
      ctx.globalAlpha = 1;
    });
  }

  function spawnSmoke(cx, cy, g, strong) {
    if (reduceMotion || parts.length > 340) return;
    if (Math.random() < (strong ? 3.4 : 1.1) * fxDt) {
      parts.push({
        kind: "smoke",
        x: cx + (Math.random() - 0.5) * g.cellW * 0.4,
        y: cy - g.cellH * 0.1,
        vx: (6 + Math.random() * 14) * g.dpr,
        vy: -(16 + Math.random() * 22) * g.dpr,
        r: g.cellW * (0.12 + Math.random() * 0.08),
        grow: g.cellW * 0.42,
        life: 1,
        decay: 0.5 + Math.random() * 0.3,
        g: 0
      });
    }
    if (strong && Math.random() < 1.1 * fxDt) {
      parts.push({
        kind: "spark",
        x: cx + (Math.random() - 0.5) * g.cellW * 0.5,
        y: cy,
        vx: (Math.random() - 0.5) * 22 * g.dpr,
        vy: -(30 + Math.random() * 40) * g.dpr,
        r: (0.8 + Math.random() * 1.2) * g.dpr,
        life: 1,
        decay: 1.1,
        g: -10,
        color: "#fdba74"
      });
    }
  }

  function drawFlame(cx, cy, r, t, seed) {
    const f = 0.8 + 0.2 * Math.sin(t / 80 + seed) + 0.1 * Math.sin(t / 31 + seed * 3);
    const sway = Math.sin(t / 140 + seed) * r * 0.18;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const R = r * 1.5 * f;
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    gr.addColorStop(0, "rgba(255,245,170,.95)");
    gr.addColorStop(0.35, "rgba(255,150,40,.7)");
    gr.addColorStop(1, "rgba(220,38,38,0)");
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,170,50,.7)";
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.42, cy + r * 0.35);
    ctx.quadraticCurveTo(cx - r * 0.5 + sway, cy - R * 0.5, cx + sway * 2, cy - R * 1.05);
    ctx.quadraticCurveTo(cx + r * 0.5 + sway, cy - R * 0.5, cx + r * 0.42, cy + r * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawMark(g, x, y, kind) {
    const p = cellPx(g, x, y);
    const cx = p.x + g.cellW / 2;
    const cy = p.y + g.cellH / 2;
    const rad = Math.min(g.cellW, g.cellH) * 0.28;
    if (kind === "miss" || kind === "ping") {
      const seed = x * 7 + y * 13;
      if (kind === "miss" && !reduceMotion) {
        const ph = ((nowT / 2200) + seed * 0.37) % 1;
        ctx.strokeStyle = "rgba(255,255,255," + (0.5 * (1 - ph)).toFixed(3) + ")";
        ctx.lineWidth = Math.max(1, g.dpr);
        ctx.beginPath();
        ctx.arc(cx, cy, rad * (0.6 + ph * 1.5), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = kind === "ping" ? "rgba(226,232,240,.75)" : "#f8fafc";
      ctx.lineWidth = Math.max(1.5, 2 * g.dpr * 0.6);
      ctx.beginPath();
      ctx.arc(cx, cy, rad * 0.72, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    const seed = x * 7 + y * 13;
    const burning = kind === "hit";
    // scorch mark under the fire
    ctx.fillStyle = "rgba(10,8,8,.5)";
    ctx.beginPath();
    ctx.ellipse(cx, cy, g.cellW * 0.42, g.cellH * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    if (burning) {
      drawFlame(cx, cy + g.cellH * 0.05, Math.min(g.cellW, g.cellH) * 0.46, nowT, seed);
      spawnSmoke(cx, cy, g, true);
    } else {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(255,120,40," + (0.16 + 0.08 * Math.sin(nowT / 400 + seed)).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(cx, cy, rad * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      spawnSmoke(cx, cy, g, false);
    }
    ctx.strokeStyle = burning ? "#fff1f2" : "rgba(255,241,242,.75)";
    ctx.lineWidth = Math.max(2, 2.4 * g.dpr);
    ctx.beginPath();
    ctx.moveTo(cx - rad, cy - rad);
    ctx.lineTo(cx + rad, cy + rad);
    ctx.moveTo(cx + rad, cy - rad);
    ctx.lineTo(cx - rad, cy + rad);
    ctx.stroke();
  }

  function drawFx(g) {
    rings.forEach((r) => {
      if (r.delay > 0) return;
      const p = cellPx(g, r.x, r.y);
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = Math.max(0, r.life);
      ctx.lineWidth = (r.w || 3) * g.dpr * 0.8 * Math.max(0.3, r.life);
      ctx.beginPath();
      ctx.arc(p.x + g.cellW / 2, p.y + g.cellH / 2, (1 - r.life) * g.cellW * (r.size || 1.15), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
    shocks.forEach((s) => {
      const rad = Math.max(0, 1 - s.life) * s.max;
      if (rad < 2) return;
      const a = Math.min(1, Math.max(0, s.life));
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const gr = ctx.createRadialGradient(s.px, s.py, rad * 0.55, s.px, s.py, Math.max(1, rad));
      gr.addColorStop(0, "rgba(255,255,255,0)");
      gr.addColorStop(0.8, s.color.replace("A", (a * 0.45).toFixed(3)));
      gr.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(s.px, s.py, Math.max(1, rad), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    parts.forEach((p) => {
      const a = Math.max(0, p.life);
      if (p.kind === "smoke") {
        ctx.globalAlpha = Math.min(0.36, a * 0.42);
        ctx.fillStyle = "#2c3038";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        return;
      }
      if (p.kind === "spark") {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.6 + a * 0.6), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    floats.forEach((f) => {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.4));
      ctx.font = "800 " + Math.floor((f.size || 14) * (g.dpr || 1)) + "px Nunito, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3 * g.dpr;
      ctx.strokeStyle = "rgba(2,6,23,.85)";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    });
  }

  function cellCenter(g, x, y) {
    const p = cellPx(g, x, y);
    return { x: p.x + g.cellW / 2, y: p.y + g.cellH / 2 };
  }

  function addParts(n, o) {
    for (let i = 0; i < n; i++) {
      const a = o.arc ? o.arc[0] + Math.random() * (o.arc[1] - o.arc[0]) : Math.random() * Math.PI * 2;
      const sp = o.sp[0] + Math.random() * (o.sp[1] - o.sp[0]);
      parts.push({
        kind: o.kind,
        x: o.x + (Math.random() - 0.5) * (o.spread || 0),
        y: o.y + (Math.random() - 0.5) * (o.spread || 0),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        r: o.r[0] + Math.random() * (o.r[1] - o.r[0]),
        grow: o.grow || 0,
        life: 1,
        decay: o.decay[0] + Math.random() * (o.decay[1] - o.decay[0]),
        g: o.g,
        color: Array.isArray(o.color) ? o.color[Math.floor(Math.random() * o.color.length)] : o.color
      });
    }
  }

  function plateFlash(incoming) {
    if (!match) return;
    const side = incoming ? match.role : (match.role === "arg" ? "inv" : "arg");
    const el = document.getElementById("plate-" + side);
    if (!el) return;
    el.classList.remove("dmg");
    void el.offsetWidth;
    el.classList.add("dmg");
    setTimeout(() => el.classList.remove("dmg"), 600);
  }

  function fxHit(x, y, incoming) {
    const g = gridGeom();
    const c = cellCenter(g, x, y);
    const k = reduceMotion ? 0.4 : 1;
    addParts(Math.round(18 * k), { kind: "spark", x: c.x, y: c.y, sp: [60 * g.dpr, 230 * g.dpr], r: [1.2 * g.dpr, 3 * g.dpr], decay: [1.2, 2.2], g: 150 * g.dpr, color: ["#fde047", "#fb923c", "#fff7ed"] });
    addParts(Math.round(7 * k), { kind: "debris", x: c.x, y: c.y, sp: [50 * g.dpr, 150 * g.dpr], r: [1.5 * g.dpr, 3 * g.dpr], decay: [1.0, 1.6], g: 260 * g.dpr, color: ["#1f2937", "#475569", "#7f1d1d"] });
    addParts(Math.round(5 * k), { kind: "smoke", x: c.x, y: c.y, spread: g.cellW * 0.4, sp: [8 * g.dpr, 40 * g.dpr], arc: [-Math.PI * 0.95, -Math.PI * 0.05], r: [g.cellW * 0.16, g.cellW * 0.28], grow: g.cellW * 0.9, decay: [0.45, 0.8], g: 0 });
    rings.push({ x, y, life: 1, color: "#fff7ed", size: 2.3, w: 4 });
    rings.push({ x, y, life: 1, color: "#fb923c", size: 1.5, w: 3, delay: 0.04 });
    shocks.push({ px: c.x, py: c.y, life: 1, max: g.cellW * 3.2, color: "rgba(255,200,120,A)" });
    flashes.push({ x, y, life: 1 });
    floats.push({ x: c.x, y: c.y, vy: -38 * g.dpr, life: 1, color: "#fca5a5", text: "TOCADO", size: 14 });
    shake(incoming, 0.55);
    plateFlash(incoming);
    if (!reduceMotion) hitstop = Math.max(hitstop, 0.05);
  }

  function fxMiss(x, y) {
    const g = gridGeom();
    const c = cellCenter(g, x, y);
    const land = isLand(x, y);
    const k = reduceMotion ? 0.4 : 1;
    if (land) {
      addParts(Math.round(10 * k), { kind: "smoke", x: c.x, y: c.y, spread: g.cellW * 0.3, sp: [10 * g.dpr, 50 * g.dpr], r: [g.cellW * 0.1, g.cellW * 0.2], grow: g.cellW * 0.6, decay: [0.8, 1.3], g: 0 });
      floats.push({ x: c.x, y: c.y, vy: -30 * g.dpr, life: 1, color: "#fde68a", text: "VACÍO", size: 12 });
    } else {
      addParts(Math.round(12 * k), { kind: "drop", x: c.x, y: c.y, sp: [50 * g.dpr, 150 * g.dpr], arc: [-Math.PI * 0.9, -Math.PI * 0.1], r: [1 * g.dpr, 2.4 * g.dpr], decay: [1.3, 2], g: 340 * g.dpr, color: ["#e0f2fe", "#ffffff", "#bae6fd"] });
      floats.push({ x: c.x, y: c.y, vy: -30 * g.dpr, life: 1, color: "#e0f2fe", text: "AGUA", size: 12 });
    }
    rings.push({ x, y, life: 1, color: "#e0f2fe", size: 1.7, w: 3 });
    rings.push({ x, y, life: 1, color: "#ffffff", size: 1.1, w: 2, delay: 0.1 });
  }

  function fxSunk(r, incoming) {
    const g = gridGeom();
    const cells = r.cells && r.cells.length ? r.cells : [{ x: r.x, y: r.y }];
    let sx = 0;
    let sy = 0;
    cells.forEach((c) => { const p = cellCenter(g, c.x, c.y); sx += p.x; sy += p.y; });
    sx /= cells.length;
    sy /= cells.length;
    const k = reduceMotion ? 0.35 : 1;
    cells.forEach((c, i) => {
      const p = cellCenter(g, c.x, c.y);
      addParts(Math.round(10 * k), { kind: "spark", x: p.x, y: p.y, sp: [80 * g.dpr, 280 * g.dpr], r: [1.4 * g.dpr, 3.4 * g.dpr], decay: [0.9, 1.8], g: 170 * g.dpr, color: ["#fde047", "#fb923c", "#ef4444", "#fff7ed"] });
      addParts(Math.round(5 * k), { kind: "debris", x: p.x, y: p.y, sp: [60 * g.dpr, 200 * g.dpr], r: [2 * g.dpr, 4.5 * g.dpr], decay: [0.7, 1.2], g: 280 * g.dpr, color: ["#111827", "#475569", "#7f1d1d", "#9ca3af"] });
      addParts(Math.round(4 * k), { kind: "smoke", x: p.x, y: p.y, spread: g.cellW * 0.5, sp: [10 * g.dpr, 60 * g.dpr], arc: [-Math.PI * 0.95, -Math.PI * 0.05], r: [g.cellW * 0.2, g.cellW * 0.36], grow: g.cellW * 1.2, decay: [0.35, 0.65], g: 0 });
      rings.push({ x: c.x, y: c.y, life: 1, color: "#fef3c7", size: 2.8, w: 5, delay: i * 0.07 });
    });
    shocks.push({ px: sx, py: sy, life: 1, max: g.cellW * 7, color: "rgba(255,170,80,A)" });
    shocks.push({ px: sx, py: sy, life: 1.25, max: g.cellW * 10, color: "rgba(255,255,255,A)" });
    floats.push({ x: sx, y: sy - g.cellH * 0.6, vy: -26 * g.dpr, life: 1.4, color: incoming ? "#fecaca" : "#fde047", text: incoming ? "PERDIDO" : "HUNDIDO", size: 22 });
    shake(incoming, 1);
    if (!reduceMotion) {
      hitstop = 0.13;
      slow = 1.0;
      flashScreen = 1;
      zoom.z = 0.075;
      zoom.x = sx;
      zoom.y = sy;
    }
    showBanner(incoming ? "¡PERDISTE EL " + String(r.ship || "").toUpperCase() + "!" : "¡HUNDIDO!", incoming ? "El invasor te lo hundió" : (r.ship || ""), incoming ? "bad" : "good");
    const j = juke();
    if (j && j.sfx.boom) j.sfx.boom();
  }

  let bannerTimer = 0;
  function showBanner(title, sub, kind) {
    const el = document.getElementById("banner");
    if (!el) return;
    el.querySelector("b").textContent = title;
    el.querySelector("small").textContent = sub || "";
    el.className = "";
    void el.offsetWidth;
    el.className = "show " + (kind || "good");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(hideBanner, 1700);
  }
  function hideBanner() {
    const el = document.getElementById("banner");
    if (el) el.className = "";
  }

  function burst(x, y, color) {
    const g = gridGeom();
    const c = cellCenter(g, x, y);
    const n = reduceMotion ? 6 : 14;
    addParts(n, { kind: "spark", x: c.x, y: c.y, sp: [50 * g.dpr, 160 * g.dpr], r: [1.5 * g.dpr, 3 * g.dpr], decay: [1.2, 2], g: 60 * g.dpr, color });
    rings.push({ x, y, life: 1, color, size: 3.4, w: 3 });
    rings.push({ x, y, life: 1, color, size: 1.8, w: 2, delay: 0.12 });
    shocks.push({ px: c.x, py: c.y, life: 1, max: g.cellW * 3.4, color: color === "#facc15" ? "rgba(250,204,21,A)" : "rgba(255,255,255,A)" });
    floats.push({ x: c.x, y: c.y, vy: -34 * g.dpr, life: 1, color, text: color === "#facc15" ? "BLOQUEO" : "", size: 13 });
  }

  function shake(localHit, power) {
    const p = power || 0.6;
    trauma = Math.min(1, trauma + (localHit ? p * 1.2 : p * 0.75));
    if (!reduceMotion) {
      ui.stage.classList.remove("shake");
      void ui.stage.offsetWidth;
      ui.stage.classList.add("shake");
    }
    if (localHit) {
      ui.hurt.classList.add("on");
      setTimeout(() => ui.hurt.classList.remove("on"), 280);
      const j = juke();
      if (j) j.sfx.alarm();
    }
  }

  function narrate(results, incoming) {
    if (!results.length) return "Nada que disparar.";
    if (results.every((r) => r.kind === "repeat")) return "Esa zona ya está marcada.";
    if (results.some((r) => r.kind === "shield")) {
      return incoming ? "Tu camuflaje desvió el ataque. No quedó marca." : "El camuflaje enemigo desvió el disparo.";
    }
    const sunk = results.find((r) => r.kind === "sunk");
    if (sunk) return (incoming ? "Te destruyeron " : "Destruiste ") + sunk.ship + ".";
    const hit = results.find((r) => r.kind === "hit");
    if (hit) {
      return incoming
        ? "Impacto en tu " + hit.ship + ". Quedan " + hit.left + "."
        : "Impacto en " + hit.ship + ". Quedan " + hit.left + ".";
    }
    return incoming ? "El disparo cayó al vacío." : "Agua. Ahora te pueden atacar.";
  }

  async function playResults(results, incoming) {
    viewOverride = incoming ? "local" : "remote";
    hudDirty = true;
    if (incoming) ui.stage.classList.add("under-fire");
    let sunkAny = false;
    const j = juke();
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.kind === "hit" || r.kind === "sunk") {
        fxHit(r.x, r.y, incoming);
        if (j) j.sfx.hit();
        if (r.kind === "sunk") {
          sunkAny = true;
          fxSunk(r, incoming);
          if (j) j.sfx.sunk();
        }
      } else if (r.kind === "miss") {
        fxMiss(r.x, r.y);
        if (j) j.sfx.miss();
      } else if (r.kind === "shield") {
        burst(r.x, r.y, "#facc15");
        if (j) j.sfx.shield();
      }
      if (i < results.length - 1) await WAIT(incoming ? 200 : 120);
    }
    say(narrate(results, incoming));
    hudDirty = true;
    await WAIT((incoming ? 880 : 520) + (sunkAny ? 750 : 0));
    ui.stage.classList.remove("under-fire");
    viewOverride = null;
    hudDirty = true;
  }

  function freshMatch(role) {
    let local;
    try { local = C.placeRandom(opts.terrain, Math.random, opts.map, opts.crop); }
    catch (e) { local = C.placeRandom(opts.terrain, Math.random, opts.map, opts.crop); }
    let remote = null;
    if (role === "arg" && opts.mode === "pvc") {
      try { remote = C.placeRandom(opts.terrain, Math.random, opts.map, opts.crop); }
      catch (e) { remote = C.placeRandom(opts.terrain, Math.random, opts.map, opts.crop); }
    }
    match = {
      role,
      phase: "wait",
      local,
      remote,
      hitsOnLocal: new Set(),
      hitsOnRemote: new Set(),
      remoteMarks: new Map(),
      wrecks: [],
      intelShip: new Set(),
      intelEmpty: new Set(),
      powers: { radar: 2, bomb: 1, camo: 1 },
      shield: false
    };
    remoteLeft = 17;
    hand = null;
    armed = null;
    preview = null;
    localReady = false;
    remoteReady = opts.mode !== "pvp";
    sealed = false;
    published = false;
    remoteForced = false;
    battleStarted = false;
    hudDirty = true;
    const nation = C.NATIONS[opts.nation];
    document.getElementById("inv-name").textContent = nation.flag + " " + nation.name.toUpperCase();
  }

  function beginPlace() {
    match.phase = "place";
    sealed = false;
    battleStarted = false;
    hand = null;
    hudDirty = true;
    ui.linkbox.classList.add("hidden");
    ui.ready.disabled = false;
    ui.ready.textContent = "Estoy listo";
    say(opts.mode === "pvp"
      ? "60 segundos. Estoy listo cierra tu flota. Empieza cuando los dos están listos, o al llegar a 0."
      : "60 segundos para mover la flota. Estoy listo empieza ya.");
    startClock();
    requestAnimationFrame(fit);
  }

  function startClock() {
    stopClock();
    clockLeft = 60;
    ui.clock.textContent = "60";
    ui.clock.classList.remove("hidden", "urgent");
    clockId = setInterval(() => {
      clockLeft--;
      if (clockLeft <= 0) {
        clockLeft = 0;
        ui.clock.textContent = "0";
        ui.clock.classList.add("urgent");
        clearInterval(clockId);
        clockId = 0;
        onClockDone();
        return;
      }
      ui.clock.textContent = String(clockLeft);
      ui.clock.classList.toggle("urgent", clockLeft <= 10);
    }, 1000);
  }
  function stopClock() {
    clearInterval(clockId);
    clockId = 0;
    ui.clock.classList.add("hidden");
    ui.clock.classList.remove("urgent");
  }

  function sealFleet() {
    if (sealed) return;
    settleHand();
    sealed = true;
    localReady = true;
    if (match && (match.phase === "place" || match.phase === "lobby")) match.phase = "sealed";
    hudDirty = true;
  }

  function publishReady(force) {
    if (opts.mode !== "pvp") return;
    if (!published) {
      published = true;
      const sc = C.scout(match.local, Math.random);
      send({ t: force ? "go" : "ready", scout: { x: sc.x, y: sc.y }, force: !!force });
      return;
    }
    if (force) send({ t: "go", force: true });
  }

  function maybeStart() {
    if (!match || battleStarted || opts.mode !== "pvp") return;
    if (!C.battleMayStart("pvp", localReady, remoteReady, clockLeft, remoteForced)) return;
    if (!sealed) sealFleet();
    publishReady(clockLeft <= 0 || remoteForced);
    beginBattle();
  }

  function beginBattle() {
    if (!match || battleStarted) return;
    battleStarted = true;
    settleHand();
    stopClock();
    hudDirty = true;
    if (opts.mode !== "pvp") {
      const sc = C.scout(match.remote, Math.random);
      match.intelShip.add(C.key(sc.x, sc.y));
      match.phase = "attack";
      say(C.MAPS[opts.map].scout + " Tu turno: tocá una celda enemiga.");
      requestAnimationFrame(fit);
      return;
    }
    match.phase = match.role === "arg" ? "attack" : "defend";
    say(match.role === "arg"
      ? C.MAPS[opts.map].scout + " Empezás vos. Tocá el territorio enemigo."
      : "Argentina dispara primero. Si te pegan, lo vas a ver en tu parque.");
    requestAnimationFrame(fit);
  }

  function markReady() {
    if (!match || battleStarted || sealed) return;
    if (match.phase !== "place") return;
    sealFleet();
    if (opts.mode !== "pvp") {
      beginBattle();
      return;
    }
    publishReady(false);
    say("Listo. Empieza si el rival también marca, o cuando el reloj llegue a 0.");
    maybeStart();
  }

  function onClockDone() {
    if (!match || battleStarted) return;
    if (match.phase !== "place" && match.phase !== "sealed") return;
    sealFleet();
    if (opts.mode !== "pvp") {
      beginBattle();
      return;
    }
    remoteForced = true;
    publishReady(true);
    say("Tiempo. Empieza la batalla.");
    maybeStart();
  }

  function cancelHand() {
    if (!hand) return;
    hand.ship.x = hand.ox;
    hand.ship.y = hand.oy;
    hand.ship.horizontal = hand.oh;
    hand.ship.lifted = false;
    hand = null;
    preview = null;
  }

  function handIssue(x, y) {
    if (!hand || !match) return "borde";
    return C.placeIssue(
      match.local, x, y, hand.ship.size, hand.horizontal,
      hand.ship.id, hand.ship.kind, opts.terrain, opts.map, opts.crop
    );
  }

  function settleHand() {
    if (!hand) return;
    if (preview && handIssue(preview.x, preview.y) === "") {
      hand.ship.x = preview.x;
      hand.ship.y = preview.y;
      hand.ship.horizontal = hand.horizontal;
      hand.ship.lifted = false;
      hand = null;
      preview = null;
      return;
    }
    cancelHand();
  }

  function lift(ship, cell) {
    hand = {
      ship,
      ox: ship.x,
      oy: ship.y,
      oh: ship.horizontal,
      horizontal: ship.horizontal,
      grabDx: cell.x - ship.x,
      grabDy: cell.y - ship.y
    };
    ship.lifted = true;
    preview = { x: ship.x, y: ship.y };
    lastPlaceTag = "";
    hudDirty = true;
    const where = ship.kind === "tanque" ? "Solo tierra." : "Solo agua.";
    say(ship.name + " arriba. La proa es el punto blanco. " + where + " Verde entra, rojo no.");
  }

  function tryDrop(cell) {
    if (!hand || !cell) return;
    const issue = handIssue(cell.x, cell.y);
    if (issue) {
      say(ISSUE_TEXT[issue] || "Ahí no entra.");
      trauma = Math.min(1, trauma + 0.45);
      hudDirty = true;
      return;
    }
    hand.ship.x = cell.x;
    hand.ship.y = cell.y;
    hand.ship.horizontal = hand.horizontal;
    hand.ship.lifted = false;
    hand = null;
    preview = null;
    hudDirty = true;
    say("Reacomodada. Quedan " + Math.max(0, clockLeft) + "s, o tocá Estoy listo.");
  }

  function onPointerDown(e) {
    if (!match) return;
    if (match.phase === "place") {
      if (sealed) return;
      const cell = cellFromEvent(e, !!hand);
      if (!cell) return;
      e.preventDefault();
      if (hand) {
        gestureHeld = true;
        dragging = true;
        moved = false;
        hand.grabDx = 0;
        hand.grabDy = 0;
        preview = { x: cell.x, y: cell.y };
        return;
      }
      if (!C.inBounds(cell.x, cell.y)) return;
      const ship = C.shipAt(match.local, cell.x, cell.y);
      if (!ship) return;
      lift(ship, cell);
      gestureHeld = false;
      dragging = true;
      moved = false;
      return;
    }
    const cell = cellFromEvent(e);
    if (match.phase === "defend" || match.phase === "resolving" || match.phase === "wait" || match.phase === "sealed") {
      say(match.phase === "sealed" ? "Flota cerrada. Esperando para empezar." : match.phase === "wait" ? "Esperá a que cierre la otra flota." : "Ahora no: están disparando sobre tu parque.");
      return;
    }
    if (match.phase !== "attack" || busy) return;
    if (!cell) return;
    preview = cell;
    if (armed === "radar") lock(() => doRadar(cell));
    else lock(() => doShot(cell));
  }

  function onPointerMove(e) {
    const placing = match && match.phase === "place" && hand;
    const cell = cellFromEvent(e, !!placing);
    if (match && match.phase === "attack") {
      preview = cell;
      return;
    }
    if (!dragging || !hand || !cell) return;
    const origin = { x: cell.x - hand.grabDx, y: cell.y - hand.grabDy };
    if (!preview || origin.x !== preview.x || origin.y !== preview.y) moved = true;
    preview = origin;
    const issue = handIssue(origin.x, origin.y);
    const tag = issue || "ok";
    if (tag !== lastPlaceTag) {
      lastPlaceTag = tag;
      say(issue ? ISSUE_TEXT[issue] : "Verde: entra entera. Soltá para apoyarla.");
    }
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    if (!hand) return;
    if ((gestureHeld || moved) && preview) tryDrop(preview);
  }

  async function doRadar(cell) {
    if (!match || match.phase !== "attack" || match.powers.radar <= 0) return;
    const zone = C.area(cell.x, cell.y);
    const known = (c) => {
      const k = C.key(c.x, c.y);
      return match.remoteMarks.has(k) || match.intelShip.has(k) || match.intelEmpty.has(k);
    };
    if (zone.every(known)) {
      say("Esa zona ya la viste. Elegí otro centro.");
      return;
    }
    match.powers.radar--;
    armed = null;
    hudDirty = true;
    if (opts.mode === "pvc") {
      let n = 0;
      zone.forEach((c) => {
        const k = C.key(c.x, c.y);
        if (C.shipAt(match.remote, c.x, c.y)) { match.intelShip.add(k); n++; }
        else match.intelEmpty.add(k);
      });
      burst(cell.x, cell.y, "#facc15");
      const j = juke();
      if (j) j.sfx.shield();
      say(n ? "Radar: " + n + " contacto" + (n === 1 ? "" : "s") + " en el área. Seguís de turno." : "Radar limpio. Seguís de turno.");
      hudDirty = true;
      return;
    }
    say("Ping de radar…");
    send({ t: "ping", x: cell.x, y: cell.y });
  }

  async function doShot(cell) {
    if (!match || match.phase !== "attack") return;
    const bomb = armed === "bomb";
    if (bomb && match.powers.bomb <= 0) return;
    const shots = (bomb ? C.cross(cell.x, cell.y) : [{ x: cell.x, y: cell.y }]).filter((c) => {
      const k = C.key(c.x, c.y);
      if (opts.mode === "pvc") return !match.hitsOnRemote.has(k);
      const mark = match.remoteMarks.get(k);
      return mark !== "hit" && mark !== "miss" && mark !== "sunk";
    });
    if (!shots.length) {
      say("Esa zona ya está marcada.");
      return;
    }
    if (bomb) match.powers.bomb--;
    armed = null;
    match.phase = "resolving";
    hudDirty = true;
    if (opts.mode === "pvc") {
      const res = C.resolveShots(match.remote, match.hitsOnRemote, shots, false);
      const m = match;
      rememberRemote(res.results);
      await playResults(res.results, false);
      if (match !== m) return;
      if (res.lost) return finish(true);
      await enemyStrike();
      return;
    }
    say("Disparo en camino…");
    send({ t: "fire", shots });
  }

  function rememberRemote(results) {
    results.forEach((r) => {
      if (r.kind === "miss") match.remoteMarks.set(C.key(r.x, r.y), "miss");
      if (r.kind === "hit") match.remoteMarks.set(C.key(r.x, r.y), "hit");
      if (r.kind === "sunk") {
        const cells = r.cells && r.cells.length ? r.cells : [{ x: r.x, y: r.y }];
        cells.forEach((c) => match.remoteMarks.set(C.key(c.x, c.y), "sunk"));
        if (!match.wrecks.some((w) => w.name === r.ship)) match.wrecks.push({ name: r.ship, cells, t0: performance.now() });
      }
    });
    hudDirty = true;
  }

  function enrich(results) {
    return results.map((r) => {
      if (r.kind !== "sunk") return r;
      const ship = match.local.find((s) => s.name === r.ship);
      return ship ? Object.assign({}, r, { cells: C.cellsOf(ship).map((c) => ({ x: c.x, y: c.y })) }) : r;
    });
  }

  async function enemyStrike() {
    const m = match;
    if (!m) return;
    match.phase = "defend";
    ui.stage.classList.add("under-fire");
    hudDirty = true;
    say("El invasor apunta a tu parque…");
    await WAIT(420);
    if (match !== m) return; // user left to the menu while the AI was "thinking"
    const shot = C.aiShot(match.local, match.hitsOnLocal, Math.random);
    if (!shot) return finish(true);
    const res = C.resolveShots(match.local, match.hitsOnLocal, [shot], match.shield);
    if (res.shielded) match.shield = false;
    await playResults(res.results, true);
    if (match !== m) return;
    if (res.lost) return finish(false);
    match.phase = "attack";
    hudDirty = true;
    say("Tu turno. Tocá una celda del enemigo.");
  }

  async function handleFire(msg) {
    if (!match) return;
    const m = match;
    match.phase = "defend";
    hudDirty = true;
    const res = C.resolveShots(match.local, match.hitsOnLocal, msg.shots || [], match.shield);
    if (res.shielded) match.shield = false;
    await playResults(res.results, true);
    if (match !== m) return;
    send({ t: "resolved", results: enrich(res.results), hpLeft: res.hp.left, lost: res.lost });
    if (res.lost) return finish(false);
    match.phase = "attack";
    hudDirty = true;
    say("Tu turno. Tocá el territorio enemigo.");
  }

  async function handleResolved(msg) {
    if (!match) return;
    const m = match;
    remoteLeft = typeof msg.hpLeft === "number" ? msg.hpLeft : remoteLeft;
    rememberRemote(msg.results || []);
    await playResults(msg.results || [], false);
    if (match !== m) return;
    if (msg.lost) return finish(true);
    match.phase = "defend";
    hudDirty = true;
    say("Disparo resuelto. Si el rival acierta, lo ves en tu territorio.");
  }

  function finish(win) {
    if (!match || match.phase === "end") return;
    match.phase = "end";
    stopClock();
    hudDirty = true;
    // "win" is from the local player's side; the joiner plays the invader (role "inv"),
    // so the Argentine-flavored headline must be flipped for them.
    const argentinaHolds = match.role === "inv" ? !win : win;
    ui.endTitle.textContent = argentinaHolds ? "El parque sigue siendo argentino." : "El invasor tomó el territorio.";
    ui.end.classList.remove("hidden");
    say(win ? (match.role === "inv" ? "Tomaste el territorio. No queda nada de la defensa." : "No queda nada del invasor.") : "Perdiste la flota.");
    ui.stage.classList.remove("under-fire");
    if (win) { const j = juke(); if (j) j.sfx.sunk(); }
  }

  function send(msg) {
    if (conn && conn.open) conn.send(msg);
  }

  function onData(msg) {
    if (!msg || !msg.t) return;
    if (msg.t === "here") {
      sendHello();
      if (match && match.phase === "lobby") beginPlace();
      return;
    }
    if (msg.t === "hello") {
      if (gotHello) return;
      gotHello = true;
      clearInterval(hereTimer);
      hereTimer = 0;
      if (C.MAPS[msg.map]) opts.map = msg.map;
      if (C.FLEETS[msg.terrain]) opts.terrain = msg.terrain;
      if (C.NATIONS[msg.nation]) opts.nation = msg.nation;
      if (typeof msg.crop === "number") opts.crop = ((msg.crop % 5) + 5) % 5;
      applyTheme();
      freshMatch("inv");
      showBattle();
      beginPlace();
      return;
    }
    if (msg.t === "ready" || msg.t === "go") {
      if (match && msg.scout && C.inBounds(msg.scout.x, msg.scout.y)) {
        match.intelShip.add(C.key(msg.scout.x, msg.scout.y));
      }
      remoteReady = true;
      if (msg.t === "go" || msg.force) remoteForced = true;
      if (remoteForced && match && !battleStarted && (match.phase === "place" || match.phase === "sealed")) {
        sealFleet();
        publishReady(true);
      } else if (match && !battleStarted && !localReady && !remoteForced) {
        say("El rival ya marcó Estoy listo. Marcá vos, o el juego arranca solo al llegar a 0.");
      }
      maybeStart();
      hudDirty = true;
      return;
    }
    if (msg.t === "ping" && match) {
      const cells = C.area(msg.x, msg.y).map((c) => ({
        x: c.x, y: c.y, ship: !!C.shipAt(match.local, c.x, c.y)
      }));
      send({ t: "pong", cells });
      return;
    }
    if (msg.t === "pong" && match) {
      let n = 0;
      (msg.cells || []).forEach((c) => {
        if (!C.inBounds(c.x, c.y)) return;
        const k = C.key(c.x, c.y);
        if (c.ship) { match.intelShip.add(k); n++; }
        else match.intelEmpty.add(k);
      });
      say(n ? "Radar: " + n + " contacto" + (n === 1 ? "" : "s") + ". Seguís de turno." : "Radar limpio. Seguís de turno.");
      if (match.phase !== "end") match.phase = "attack";
      hudDirty = true;
      return;
    }
    if (msg.t === "fire") lock(() => handleFire(msg));
    if (msg.t === "resolved") lock(() => handleResolved(msg));
  }

  function bindConn(c) {
    conn = c;
    c.on("data", onData);
    c.on("close", () => {
      if (match && match.phase !== "end") say("Se cortó la conexión.");
    });
    c.on("error", () => say("Problema de red con el rival."));
  }

  const PEER_CFG = {
    secure: true,
    host: "0.peerjs.com",
    port: 443,
    path: "/",
    serialization: "json",
    config: {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun.cloudflare.com:3478" }
      ]
    }
  };

  function whenOpen(c, fn) {
    if (!c) return;
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      fn();
    };
    if (c.open) run();
    c.on("open", run);
  }

  function sendHello() {
    send({ t: "hello", map: opts.map, terrain: opts.terrain, nation: opts.nation, crop: opts.crop || 0 });
  }

  function noteMenu(text) {
    const note = document.querySelector(".lede");
    if (note) note.textContent = text;
    say(text);
  }

  function inviteUrl(id) {
    const path = location.pathname.endsWith("/") ? location.pathname : location.pathname.replace(/[^/]*$/, "");
    return location.origin + path + "?sala=" + encodeURIComponent(id);
  }

  function hostGame() {
    const id = "parques-" + Math.random().toString(36).slice(2, 8);
    peer = new Peer(id, PEER_CFG);
    peer.on("open", (pid) => {
      ui.link.value = inviteUrl(pid);
      ui.linkbox.classList.remove("hidden");
      say("Sala lista. Copiá el enlace. Al entrar el invasor arrancan los 60 segundos.");
    });
    peer.on("connection", (c) => {
      bindConn(c);
      whenOpen(c, () => {
        sendHello();
        clearInterval(helloTimer);
        helloTimer = setInterval(() => {
          if (!match || (match.phase !== "lobby" && gotHello)) {
            clearInterval(helloTimer);
            return;
          }
          sendHello();
        }, 1000);
      });
    });
    peer.on("disconnected", () => {
      say("Se cayó la sala. Reconectando…");
      try { if (peer && !peer.destroyed) peer.reconnect(); } catch (e) {}
    });
    peer.on("error", (err) => {
      const typ = (err && err.type) || "red";
      if (typ === "unavailable-id" && hostTries < 3) {
        hostTries++;
        try { peer.destroy(); } catch (e) {}
        peer = null;
        hostGame();
        return;
      }
      if (typ === "disconnected" || typ === "network") return;
      say("No se pudo abrir la sala (" + typ + "). Volvé al menú y probá otra vez.");
    });
  }

  function joinGame(id, attempt) {
    if (!window.Peer) {
      noteMenu("No se pudo cargar el modo en línea.");
      return;
    }
    const n = attempt || 1;
    gotHello = false;
    showBattle();
    say(n === 1 ? "Conectando con Argentina…" : "Reintentando la sala… (" + n + ")");
    peer = new Peer(PEER_CFG);
    peer.on("open", () => {
      const c = peer.connect(id, { reliable: true, serialization: "json" });
      if (!c) {
        say("No se pudo armar el enlace.");
        return;
      }
      bindConn(c);
      whenOpen(c, () => {
        const ping = () => {
          if (gotHello) {
            clearInterval(hereTimer);
            hereTimer = 0;
            return;
          }
          send({ t: "here" });
        };
        ping();
        clearInterval(hereTimer);
        hereTimer = setInterval(ping, 800);
      });
      setTimeout(() => {
        if (!gotHello && match == null && n < 4) {
          try { peer.destroy(); } catch (e) {}
          peer = null;
          joinGame(id, n + 1);
        } else if (!gotHello && n >= 4) {
          noteMenu("No aparece la sala. Pedile a Argentina que la deje abierta y volvé a abrir el enlace.");
          showMenu();
        }
      }, 7000);
    });
    peer.on("error", (err) => {
      const typ = (err && err.type) || "red";
      if ((typ === "peer-unavailable" || typ === "network" || typ === "server-error" || typ === "socket-error") && n < 4) {
        try { peer.destroy(); } catch (e) {}
        peer = null;
        setTimeout(() => joinGame(id, n + 1), 600);
        return;
      }
      noteMenu("No se pudo entrar (" + typ + ").");
      showMenu();
    });
  }

  function startGame() {
    const j = juke();
    if (j) j.start();
    blip();
    opts.crop = Math.floor(Math.random() * 5);
    applyTheme();
    if (opts.mode === "pvp") {
      if (!window.Peer) {
        say("Falta la conexión en línea. Recargá e intentá de nuevo.");
        const note = document.querySelector(".lede");
        if (note && ui.menu && !ui.menu.classList.contains("hidden")) {
          note.textContent = "No cargó el modo en línea. Probá contra la máquina o recargá.";
        }
        return;
      }
      freshMatch("arg");
      match.phase = "lobby";
      showBattle();
      ui.linkbox.classList.remove("hidden");
      ui.link.value = "Abriendo sala…";
      say("Abriendo la sala…");
      hostGame();
      return;
    }
    freshMatch("arg");
    showBattle();
    beginPlace();
  }

  function loop(t) {
    try {
      const rdt = Math.min(0.05, lastT ? (t - lastT) / 1000 : 0.016);
      lastT = t;
      let ts = 1;
      if (hitstop > 0) { hitstop -= rdt; ts = 0.03; }
      else if (slow > 0) {
        slow -= rdt;
        ts = slow > 0.4 ? 0.3 : 0.3 + ((0.4 - Math.max(0, slow)) / 0.4) * 0.7;
      }
      const dt = rdt * ts;
      fxDt = Math.max(dt, 0.0001);
      trauma = Math.max(0, trauma - rdt * 1.5);
      zoom.z = Math.max(0, zoom.z - rdt * (slow > 0 ? 0.03 : 0.12));
      flashScreen = Math.max(0, flashScreen - rdt * 2.2);
      parts.forEach((p) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += (p.g === undefined ? 90 * (ui.canvas.width / 300) : p.g) * dt;
        if (p.grow) p.r += p.grow * dt;
        p.life -= dt * (p.decay || 1.6);
      });
      parts = parts.filter((p) => p.life > 0);
      rings.forEach((r) => { if (r.delay > 0) r.delay -= dt; else r.life -= dt * 1.5; });
      rings = rings.filter((r) => r.life > 0);
      shocks.forEach((s) => { s.life -= dt * 1.7; });
      shocks = shocks.filter((s) => s.life > 0);
      flashes.forEach((f) => { f.life -= dt * 3.2; });
      flashes = flashes.filter((f) => f.life > 0);
      floats.forEach((f) => {
        f.y += (f.vy || -30) * dt;
        f.life -= dt * 0.8;
      });
      floats = floats.filter((f) => f.life > 0 && f.text);
      if (match && !ui.battle.classList.contains("hidden")) draw(t);
    } catch (err) {
      window.__parquesErr = String(err && err.stack || err);
    }
    raf = requestAnimationFrame(loop);
  }

  function wireJuke() {
    const panel = document.getElementById("juke-panel");
    const title = document.getElementById("juke-title");
    const fab = document.getElementById("juke-fab");
    const vol = document.getElementById("juke-vol");
    if (!panel || !fab) return;
    fab.addEventListener("click", (ev) => {
      ev.stopPropagation();
      panel.classList.toggle("hidden");
    });
    document.getElementById("juke-close").addEventListener("click", (ev) => {
      ev.stopPropagation();
      panel.classList.add("hidden");
    });
    document.getElementById("juke-play").addEventListener("click", (ev) => {
      ev.stopPropagation();
      const j = juke();
      if (j) j.start(true);
    });
    document.getElementById("juke-stop").addEventListener("click", (ev) => {
      ev.stopPropagation();
      const j = juke();
      if (j) j.stop();
    });
    document.getElementById("juke-next").addEventListener("click", () => { const j = juke(); if (j) j.next(); });
    vol.addEventListener("input", () => { const j = juke(); if (j) j.setVol(vol.value); });
    const sh = document.getElementById("juke-shuffle");
    const rp = document.getElementById("juke-repeat");
    sh.addEventListener("click", () => {
      const on = sh.getAttribute("aria-pressed") !== "true";
      sh.setAttribute("aria-pressed", on ? "true" : "false");
      sh.textContent = on ? "Shuffle ON" : "Shuffle OFF";
      const j = juke();
      if (j) j.setShuffle(on);
    });
    rp.addEventListener("click", () => {
      const on = rp.getAttribute("aria-pressed") !== "true";
      rp.setAttribute("aria-pressed", on ? "true" : "false");
      rp.textContent = on ? "Repeat ON" : "Repeat OFF";
      const j = juke();
      if (j) j.setRepeat(on);
    });
    window.addEventListener("juke", (ev) => {
      const d = ev.detail || {};
      title.textContent = d.playing ? d.title : "En silencio — tocá Play";
      fab.classList.toggle("on", !!d.playing);
    });
  }

  selectGroup(document.getElementById("maps"), "map", "map");
  selectGroup(document.getElementById("terrains"), "terrain", "terrain");
  selectGroup(document.getElementById("modes"), "mode", "mode");
  buildNations();
  document.getElementById("start").addEventListener("click", startGame);
  document.getElementById("back").addEventListener("click", showMenu);
  document.getElementById("again").addEventListener("click", showMenu);
  document.getElementById("copy").addEventListener("click", async () => {
    const value = ui.link.value;
    try {
      await navigator.clipboard.writeText(value);
      say("Enlace copiado.");
    } catch (e) {
      ui.link.select();
      say("Seleccioná el enlace y copialo.");
    }
  });
  ui.rotate.addEventListener("click", () => {
    if (!hand) {
      say("Primero levantá una unidad tocándola.");
      return;
    }
    hand.horizontal = !hand.horizontal;
    hand.grabDx = 0;
    hand.grabDy = 0;
    const issue = preview ? handIssue(preview.x, preview.y) : "";
    say(issue ? ISSUE_TEXT[issue] : (hand.horizontal ? "Horizontal. " : "Vertical. ") + hand.ship.name + ". Verde entra, rojo no.");
    blip();
  });
  ui.ready.addEventListener("click", () => markReady());
  ui.radar.addEventListener("click", () => {
    if (!match || match.phase !== "attack" || match.powers.radar <= 0) return;
    armed = armed === "radar" ? null : "radar";
    hudDirty = true;
    say(armed === "radar" ? "Radar armado: tocá el centro de un área de 3×3. No gasta el turno." : "Radar guardado.");
  });
  ui.bomb.addEventListener("click", () => {
    if (!match || match.phase !== "attack" || match.powers.bomb <= 0) return;
    armed = armed === "bomb" ? null : "bomb";
    hudDirty = true;
    say(armed === "bomb" ? "Bomba armada: el próximo toque estalla en cruz y gasta el turno." : "Bomba guardada.");
  });
  ui.camo.addEventListener("click", () => {
    if (!match || match.phase !== "attack" || match.powers.camo <= 0 || match.shield) return;
    match.powers.camo--;
    match.shield = true;
    armed = null;
    hudDirty = true;
    const j = juke();
    if (j) j.sfx.shield();
    say("Camuflaje activo. El próximo ataque enemigo no deja marca.");
  });

  ui.canvas.addEventListener("pointerdown", onPointerDown);
  ui.canvas.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  ui.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("resize", () => {
    if (ui.battle && !ui.battle.classList.contains("hidden")) fit();
  });

  wireJuke();
  applyTheme();

  window.__parquesState = () => match ? ({
    phase: match.phase,
    view: viewKind(),
    ships: match.local.map((s) => s.name + (s.lifted ? "*" : "")).join(","),
    units: match.local.map((s) => ({ name: s.name, kind: s.kind, x: s.x, y: s.y, size: s.size, horizontal: s.horizontal, lifted: !!s.lifted })),
    lifted: !!hand,
    terrain: opts.terrain,
    crop: opts.crop,
    map: opts.map,
    hp: hpOf(match.local, match.hitsOnLocal).left,
    powers: { ...match.powers },
    shield: match.shield,
    clock: clockLeft,
    sealed,
    localReady,
    remoteReady,
    battleStarted
  }) : { phase: "menu" };

  const sala = new URLSearchParams(location.search).get("sala");
  if (sala) {
    opts.mode = "pvp";
    if (window.Peer) joinGame(sala);
    else say("No se pudo cargar el modo en línea.");
  }
})();
