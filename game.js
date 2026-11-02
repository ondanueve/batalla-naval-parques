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
    agua: "Flota naval sobre el lago.",
    tierra: "Vehículos sobre el parque. Misma grilla.",
    mixto: "Unidades anfibias. Agua y tierra se alternan."
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

  const opts = { map: "nahuel", terrain: "agua", mode: "pvc", nation: "chile" };
  let match = null;
  let peer = null;
  let conn = null;
  let raf = 0;
  let lastT = 0;
  let parts = [];
  let rings = [];
  let floats = [];
  let flashes = [];
  let viewOverride = null;
  let armed = null;
  let hand = null;
  let dragging = false;
  let moved = false;
  let gestureHeld = false;
  let preview = null;
  let clockLeft = 10;
  let clockId = 0;
  let busy = false;
  const inbox = [];
  let localReady = false;
  let remoteReady = false;
  let remoteLeft = 17;
  let hudDirty = true;
  let trauma = 0;

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

  function cellFromEvent(e) {
    const r = ui.canvas.getBoundingClientRect();
    const cw = (r.width - PAD_L) / C.W;
    const ch = (r.height - PAD_T) / C.H;
    if (cw <= 0 || ch <= 0) return null;
    const x = Math.floor((e.clientX - r.left - PAD_L) / cw);
    const y = Math.floor((e.clientY - r.top - PAD_T) / ch);
    if (!C.inBounds(x, y)) return null;
    return { x, y };
  }

  function viewKind() {
    if (viewOverride) return viewOverride;
    if (!match) return "local";
    if (match.phase === "place" || match.phase === "defend" || match.phase === "lobby") return "local";
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
    let label = localView ? "Tu territorio" : "Territorio enemigo";
    if (match.shield && localView) label += " · camuflaje";
    if (match.phase === "lobby") label = "Esperando al invasor";
    ui.label.textContent = label;
    paintPips(localView);
    const placing = match.phase === "place";
    const combat = match.phase === "attack" || match.phase === "defend" || match.phase === "resolving" || match.phase === "end";
    ui.rotate.classList.toggle("hidden", !placing);
    ui.ready.classList.toggle("hidden", !placing);
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
    ui.rotate.disabled = !hand;
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
    if (opts.terrain === "tierra") return true;
    if (opts.terrain === "mixto") return (x + y) % 2 === 0;
    return false;
  }

  function draw(time) {
    const g = gridGeom();
    const theme = THEME[opts.map] || THEME.nahuel;
    const w = ui.canvas.width;
    const h = ui.canvas.height;
    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, theme.deep);
    bg.addColorStop(1, theme.sea);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const shake = trauma * trauma * 7 * g.dpr;
    const ox = shake ? Math.sin(time / 17) * shake : 0;
    const oy = shake ? Math.cos(time / 23) * shake * 0.45 : 0;
    ctx.save();
    ctx.translate(ox, oy);

    for (let y = 0; y < C.H; y++) {
      for (let x = 0; x < C.W; x++) {
        const p = cellPx(g, x, y);
        const land = isLand(x, y);
        ctx.fillStyle = land ? theme.land : theme.sea;
        ctx.fillRect(p.x, p.y, g.cellW + 0.6, g.cellH + 0.6);
        if (!land) {
          ctx.strokeStyle = theme.foam;
          ctx.globalAlpha = 0.55;
          ctx.lineWidth = Math.max(1, g.dpr);
          ctx.beginPath();
          const yy = p.y + g.cellH * (0.42 + 0.08 * Math.sin(time / 480 + x * 0.7 + y * 0.2));
          ctx.moveTo(p.x + g.cellW * 0.15, yy);
          ctx.quadraticCurveTo(p.x + g.cellW * 0.5, yy - g.cellH * 0.12, p.x + g.cellW * 0.85, yy);
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (opts.map === "glaciares") {
          ctx.strokeStyle = "rgba(255,255,255,.55)";
          ctx.beginPath();
          ctx.moveTo(p.x + 2, p.y + g.cellH * 0.3);
          ctx.lineTo(p.x + g.cellW - 2, p.y + g.cellH * 0.7);
          ctx.stroke();
        } else if ((x * 3 + y * 5) % 7 === 0) {
          ctx.fillStyle = theme.spec;
          ctx.beginPath();
          ctx.moveTo(p.x + g.cellW * 0.5, p.y + g.cellH * 0.25);
          ctx.lineTo(p.x + g.cellW * 0.68, p.y + g.cellH * 0.72);
          ctx.lineTo(p.x + g.cellW * 0.32, p.y + g.cellH * 0.72);
          ctx.fill();
        }
        ctx.strokeStyle = "rgba(2,6,23,.45)";
        ctx.lineWidth = 1;
        ctx.strokeRect(p.x, p.y, g.cellW, g.cellH);
      }
    }

    ctx.fillStyle = "rgba(248,250,252,.92)";
    ctx.font = "700 " + Math.max(9, Math.floor(g.padT * 0.72)) + "px Nunito, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let x = 0; x < C.W; x++) {
      ctx.fillText(String.fromCharCode(65 + x), g.padL + (x + 0.5) * g.cellW, g.padT * 0.48);
    }
    ctx.textAlign = "right";
    ctx.font = "700 " + Math.max(8, Math.floor(Math.min(g.cellH, g.padL) * 0.42)) + "px Nunito, sans-serif";
    for (let y = 0; y < C.H; y++) {
      ctx.fillText(String(y + 1), g.padL - 3 * g.dpr, g.padT + (y + 0.5) * g.cellH);
    }

    if (match) drawPieces(g, time);
    drawFx(g);
    ctx.restore();
    flushHud();
  }

  function drawHull(g, ship, alpha, color) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const fill = color || ship.color;
    for (let i = 0; i < ship.size; i++) {
      const c = ship.horizontal ? { x: ship.x + i, y: ship.y } : { x: ship.x, y: ship.y + i };
      if (!C.inBounds(c.x, c.y)) continue;
      const p = cellPx(g, c.x, c.y);
      const inset = Math.max(2, 2.5 * g.dpr);
      ctx.fillStyle = fill;
      roundRect(p.x + inset, p.y + inset, g.cellW - inset * 2, g.cellH - inset * 2, 4 * g.dpr);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.4)";
      ctx.lineWidth = Math.max(1, g.dpr);
      ctx.stroke();
    }
    if (C.inBounds(ship.x, ship.y)) {
      const bow = cellPx(g, ship.x, ship.y);
      ctx.fillStyle = "rgba(255,255,255,.92)";
      ctx.beginPath();
      ctx.arc(bow.x + g.cellW * 0.5, bow.y + g.cellH * 0.5, Math.min(g.cellW, g.cellH) * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
    const midI = Math.floor(ship.size / 2);
    const mid = ship.horizontal ? { x: ship.x + midI, y: ship.y } : { x: ship.x, y: ship.y + midI };
    if (C.inBounds(mid.x, mid.y)) {
      const mp = cellPx(g, mid.x, mid.y);
      ctx.fillStyle = "rgba(15,23,42,.55)";
      if (opts.terrain === "tierra") {
        ctx.beginPath();
        ctx.arc(mp.x + g.cellW * 0.62, mp.y + g.cellH * 0.38, Math.min(g.cellW, g.cellH) * 0.16, 0, Math.PI * 2);
        ctx.fill();
      } else if (opts.terrain === "agua") {
        ctx.fillRect(mp.x + g.cellW * 0.38, mp.y + g.cellH * 0.28, g.cellW * 0.26, g.cellH * 0.22);
      } else {
        ctx.fillRect(mp.x + g.cellW * 0.28, mp.y + g.cellH * 0.58, g.cellW * 0.44, g.cellH * 0.12);
      }
    }
    ctx.restore();
  }

  function drawPieces(g, time) {
    const local = viewKind() === "local";
    if (local && match.local) {
      match.local.forEach((s) => {
        if (s.lifted) return;
        drawHull(g, s, 1);
        C.cellsOf(s).forEach((c) => {
          if (match.hitsOnLocal.has(C.key(c.x, c.y))) drawMark(g, c.x, c.y, "hit");
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
          color: hand.ship.color
        };
        const ok = C.canPlace(match.local, ghost.x, ghost.y, ghost.size, ghost.horizontal, hand.ship.id);
        drawHull(g, ghost, 0.85, ok ? "#4ade80" : "#f87171");
      }
    } else {
      match.wrecks.forEach((w) => {
        if (!w.cells || !w.cells.length) return;
        const horizontal = w.cells.length < 2 || w.cells[0].y === w.cells[1].y;
        drawHull(g, {
          x: Math.min.apply(null, w.cells.map((c) => c.x)),
          y: Math.min.apply(null, w.cells.map((c) => c.y)),
          size: w.cells.length,
          horizontal,
          color: "#64748b"
        }, 0.95, "#64748b");
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
        drawMark(g, x, y, kind === "sunk" ? "hit" : kind);
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

  function drawMark(g, x, y, kind) {
    const p = cellPx(g, x, y);
    const cx = p.x + g.cellW / 2;
    const cy = p.y + g.cellH / 2;
    const rad = Math.min(g.cellW, g.cellH) * 0.28;
    if (kind === "miss" || kind === "ping") {
      ctx.strokeStyle = kind === "ping" ? "rgba(226,232,240,.75)" : "#f8fafc";
      ctx.lineWidth = Math.max(1.5, 2 * g.dpr * 0.6);
      ctx.beginPath();
      ctx.arc(cx, cy, rad * 0.72, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    ctx.strokeStyle = "#fff1f2";
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
      const p = cellPx(g, r.x, r.y);
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = Math.max(0, r.life);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x + g.cellW / 2, p.y + g.cellH / 2, (1 - r.life) * g.cellW * 1.15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
    parts.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    floats.forEach((f) => {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.4));
      ctx.fillStyle = f.color;
      ctx.font = "800 " + Math.floor(14 * (g.dpr || 1)) + "px Nunito, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    });
  }

  function burst(x, y, color) {
    const g = gridGeom();
    const p = cellPx(g, x, y);
    const cx = p.x + g.cellW / 2;
    const cy = p.y + g.cellH / 2;
    const n = reduceMotion ? 6 : 16;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.2;
      const sp = (70 + Math.random() * 140) * g.dpr;
      parts.push({
        x: cx, y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        r: (2 + Math.random() * 3) * g.dpr,
        life: 1,
        color
      });
    }
    rings.push({ x, y, life: 1, color });
    flashes.push({ x, y, life: 1 });
    floats.push({
      x: cx,
      y: cy,
      vy: -36 * g.dpr,
      life: 1,
      color,
      text: color === "#ef4444" ? "TOCADO" : color === "#facc15" ? "BLOQUEO" : "AGUA"
    });
  }

  function shake(localHit) {
    trauma = Math.min(1, trauma + (localHit ? 0.85 : 0.4));
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
    let harsh = false;
    const j = juke();
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.kind === "hit" || r.kind === "sunk") {
        burst(r.x, r.y, "#ef4444");
        if (r.kind === "sunk" && floats.length) floats[floats.length - 1].text = "HUNDIDO";
        harsh = true;
        if (j) j.sfx.hit();
        if (r.kind === "sunk" && j) j.sfx.sunk();
      } else if (r.kind === "miss") {
        burst(r.x, r.y, "#e0f2fe");
        if (j) j.sfx.miss();
      } else if (r.kind === "shield") {
        burst(r.x, r.y, "#facc15");
        if (j) j.sfx.shield();
      }
      if (i < results.length - 1) await WAIT(incoming ? 200 : 120);
    }
    if (harsh) shake(incoming);
    say(narrate(results, incoming));
    hudDirty = true;
    await WAIT(incoming ? 880 : 520);
    ui.stage.classList.remove("under-fire");
    viewOverride = null;
    hudDirty = true;
  }

  function freshMatch(role) {
    let local;
    try { local = C.placeRandom(opts.terrain, Math.random); }
    catch (e) { local = C.placeRandom(opts.terrain, Math.random); }
    let remote = null;
    if (role === "arg" && opts.mode === "pvc") {
      try { remote = C.placeRandom(opts.terrain, Math.random); }
      catch (e) { remote = C.placeRandom(opts.terrain, Math.random); }
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
    hudDirty = true;
    const nation = C.NATIONS[opts.nation];
    document.getElementById("inv-name").textContent = nation.flag + " " + nation.name.toUpperCase();
  }

  function beginPlace() {
    match.phase = "place";
    hand = null;
    hudDirty = true;
    ui.linkbox.classList.add("hidden");
    say("Flota al azar. Tocá para levantar, arrastrá o tocá otra celda para soltar. Rotar gira. Listo cierra ya.");
    startClock();
    requestAnimationFrame(fit);
  }

  function startClock() {
    stopClock();
    clockLeft = 10;
    ui.clock.textContent = "10";
    ui.clock.classList.remove("hidden", "urgent");
    clockId = setInterval(() => {
      clockLeft--;
      ui.clock.textContent = String(Math.max(0, clockLeft));
      ui.clock.classList.toggle("urgent", clockLeft <= 3);
      if (clockLeft <= 0) finishPlace();
    }, 1000);
  }
  function stopClock() {
    clearInterval(clockId);
    clockId = 0;
    ui.clock.classList.add("hidden");
    ui.clock.classList.remove("urgent");
  }

  function finishPlace() {
    if (!match || match.phase !== "place") return;
    match.phase = "wait";
    settleHand();
    stopClock();
    hudDirty = true;
    if (opts.mode === "pvc") {
      const sc = C.scout(match.remote, Math.random);
      match.intelShip.add(C.key(sc.x, sc.y));
      match.phase = "attack";
      hudDirty = true;
      say(C.MAPS[opts.map].scout + " Tu turno: tocá una celda enemiga.");
      requestAnimationFrame(fit);
      return;
    }
    const sc = C.scout(match.local, Math.random);
    send({ t: "ready", scout: { x: sc.x, y: sc.y } });
    localReady = true;
    say("Flota cerrada. Esperando al rival…");
    maybeStartPvp();
  }

  function maybeStartPvp() {
    if (!localReady || !remoteReady || !match) return;
    match.phase = match.role === "arg" ? "attack" : "defend";
    hudDirty = true;
    say(match.role === "arg"
      ? C.MAPS[opts.map].scout + " Empezás vos. Tocá el territorio enemigo."
      : "Argentina dispara primero. Si te pegan, lo vas a ver en tu parque.");
    requestAnimationFrame(fit);
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

  function settleHand() {
    if (!hand) return;
    if (preview && C.canPlace(match.local, preview.x, preview.y, hand.ship.size, hand.horizontal, hand.ship.id)) {
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
    hudDirty = true;
    say(ship.name + " arriba. La proa es el punto blanco. Arrastrá o tocá dónde soltarla.");
  }

  function tryDrop(cell) {
    if (!hand || !cell) return;
    const ok = C.canPlace(match.local, cell.x, cell.y, hand.ship.size, hand.horizontal, hand.ship.id);
    if (!ok) {
      say("Ahí no entra. Rotá o elegí otra proa.");
      return;
    }
    hand.ship.x = cell.x;
    hand.ship.y = cell.y;
    hand.ship.horizontal = hand.horizontal;
    hand.ship.lifted = false;
    hand = null;
    preview = null;
    hudDirty = true;
    say("Reacomodada. Quedan " + Math.max(0, clockLeft) + "s, o tocá Listo.");
  }

  function onPointerDown(e) {
    if (!match) return;
    const cell = cellFromEvent(e);
    if (match.phase === "place") {
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
      const ship = C.shipAt(match.local, cell.x, cell.y);
      if (!ship) return;
      lift(ship, cell);
      gestureHeld = false;
      dragging = true;
      moved = false;
      return;
    }
    if (match.phase === "defend" || match.phase === "resolving" || match.phase === "wait") {
      say(match.phase === "wait" ? "Esperá a que cierre la otra flota." : "Ahora no: están disparando sobre tu parque.");
      return;
    }
    if (match.phase !== "attack" || busy) return;
    if (!cell) return;
    preview = cell;
    if (armed === "radar") lock(() => doRadar(cell));
    else lock(() => doShot(cell));
  }

  function onPointerMove(e) {
    const cell = cellFromEvent(e);
    if (match && match.phase === "attack") {
      preview = cell;
      return;
    }
    if (!dragging || !hand || !cell) return;
    const origin = { x: cell.x - hand.grabDx, y: cell.y - hand.grabDy };
    if (origin.x !== preview.x || origin.y !== preview.y) moved = true;
    preview = origin;
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
      rememberRemote(res.results);
      await playResults(res.results, false);
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
        if (!match.wrecks.some((w) => w.name === r.ship)) match.wrecks.push({ name: r.ship, cells });
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
    match.phase = "defend";
    ui.stage.classList.add("under-fire");
    hudDirty = true;
    say("El invasor apunta a tu parque…");
    await WAIT(420);
    const shot = C.aiShot(match.local, match.hitsOnLocal, Math.random);
    if (!shot) return finish(true);
    const res = C.resolveShots(match.local, match.hitsOnLocal, [shot], match.shield);
    if (res.shielded) match.shield = false;
    await playResults(res.results, true);
    if (res.lost) return finish(false);
    match.phase = "attack";
    hudDirty = true;
    say("Tu turno. Tocá una celda del enemigo.");
  }

  async function handleFire(msg) {
    if (!match) return;
    match.phase = "defend";
    hudDirty = true;
    const res = C.resolveShots(match.local, match.hitsOnLocal, msg.shots || [], match.shield);
    if (res.shielded) match.shield = false;
    await playResults(res.results, true);
    send({ t: "resolved", results: enrich(res.results), hpLeft: res.hp.left, lost: res.lost });
    if (res.lost) return finish(false);
    match.phase = "attack";
    hudDirty = true;
    say("Tu turno. Tocá el territorio enemigo.");
  }

  async function handleResolved(msg) {
    if (!match) return;
    remoteLeft = typeof msg.hpLeft === "number" ? msg.hpLeft : remoteLeft;
    rememberRemote(msg.results || []);
    await playResults(msg.results || [], false);
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
    ui.endTitle.textContent = win ? "El parque sigue siendo argentino." : "El invasor tomó el territorio.";
    ui.end.classList.remove("hidden");
    say(win ? "No queda nada del invasor." : "Perdiste la flota.");
    ui.stage.classList.remove("under-fire");
    if (win) { const j = juke(); if (j) j.sfx.sunk(); }
  }

  function send(msg) {
    if (conn && conn.open) conn.send(msg);
  }

  function onData(msg) {
    if (!msg || !msg.t) return;
    if (msg.t === "hello") {
      if (C.MAPS[msg.map]) opts.map = msg.map;
      if (C.FLEETS[msg.terrain]) opts.terrain = msg.terrain;
      if (C.NATIONS[msg.nation]) opts.nation = msg.nation;
      applyTheme();
      freshMatch("inv");
      showBattle();
      beginPlace();
      return;
    }
    if (msg.t === "ready") {
      if (match && msg.scout && C.inBounds(msg.scout.x, msg.scout.y)) {
        match.intelShip.add(C.key(msg.scout.x, msg.scout.y));
      }
      remoteReady = true;
      maybeStartPvp();
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

  function hostGame() {
    const id = "parques-" + Math.random().toString(36).slice(2, 8);
    peer = new Peer(id);
    peer.on("open", () => {
      const url = location.origin + location.pathname + "?sala=" + encodeURIComponent(peer.id);
      ui.link.value = url;
      ui.linkbox.classList.remove("hidden");
      say("Sala lista. Copiá el enlace: cuando el invasor entre, acomodás la flota (10s).");
    });
    peer.on("connection", (c) => {
      bindConn(c);
      c.on("open", () => {
        send({ t: "hello", map: opts.map, terrain: opts.terrain, nation: opts.nation });
        if (match && match.phase === "lobby") beginPlace();
      });
    });
    peer.on("error", (err) => {
      const typ = err && err.type;
      if (typ === "unavailable-id") {
        say("Esa sala estaba ocupada. Reintentando…");
        try { peer.destroy(); } catch (e) {}
        hostGame();
        return;
      }
      say("No se pudo abrir la sala. Volvé al menú y probá otra vez.");
    });
  }

  function joinGame(id) {
    if (!window.Peer) {
      say("No se pudo cargar el modo en línea.");
      return;
    }
    showBattle();
    say("Conectando con Argentina…");
    peer = new Peer();
    peer.on("open", () => {
      const c = peer.connect(id, { reliable: true });
      bindConn(c);
      c.on("open", () => say("En línea. Esperando el parque…"));
    });
    peer.on("error", () => {
      say("No se pudo entrar a la sala.");
      showMenu();
    });
  }

  function startGame() {
    const j = juke();
    if (j) j.start();
    blip();
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
      const dt = Math.min(0.05, lastT ? (t - lastT) / 1000 : 0.016);
      lastT = t;
      trauma = Math.max(0, trauma - dt * 1.6);
      parts.forEach((p) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 90 * dt * (ui.canvas.width / 300);
        p.life -= dt * 1.6;
      });
      parts = parts.filter((p) => p.life > 0);
      rings.forEach((r) => { r.life -= dt * 1.8; });
      rings = rings.filter((r) => r.life > 0);
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
    fab.addEventListener("click", () => {
      panel.classList.toggle("hidden");
      const j = juke();
      if (j) j.start();
    });
    document.getElementById("juke-close").addEventListener("click", () => panel.classList.add("hidden"));
    document.getElementById("juke-play").addEventListener("click", () => { const j = juke(); if (j) j.start(); });
    document.getElementById("juke-stop").addEventListener("click", () => { const j = juke(); if (j) j.stop(); });
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
    say((hand.horizontal ? "Horizontal. " : "Vertical. ") + hand.ship.name + ". Soltala en una celda libre.");
    blip();
  });
  ui.ready.addEventListener("click", () => finishPlace());
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
    lifted: !!hand,
    hp: hpOf(match.local, match.hitsOnLocal).left,
    powers: { ...match.powers },
    shield: match.shield
  }) : { phase: "menu" };

  const sala = new URLSearchParams(location.search).get("sala");
  if (sala) {
    opts.mode = "pvp";
    if (window.Peer) joinGame(sala);
    else say("No se pudo cargar el modo en línea.");
  }
})();
