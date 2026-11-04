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
    turnbar: document.getElementById("turnbar"),
    warmeter: document.getElementById("warmeter"),
    warName: document.getElementById("war-name"),
    warSub: document.getElementById("war-sub"),
    chips: document.getElementById("chips"),
    shoot: document.getElementById("act-shoot"),
    dev: document.getElementById("act-dev"),
    manu: document.getElementById("manu"),
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
  const sel = { mode: "shoot", unit: null, dest: null, initOn: false, open: false };
  const PK_COLOR = { torre: "#22d3ee", artilleria: "#fb923c", blindaje: "#4ade80", iniciativa: "#fde047" };
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

  // --- intro + tutorial (remembered in localStorage) ---
  const KEY_INTRO = "parques.intro.v1";
  const KEY_TUTO = "parques.tuto.v1";
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };
  let rematch = { me: false, them: false };
  let tuto = null; // { step, pending } while the guided tutorial is on
  let tutoForce = false;
  const TUTO_COPY = {
    0: ["PREPARACIÓN", "Tu flota ya está puesta (podés arrastrarla). Tocá «Estoy listo» para empezar."],
    1: ["PASO 1 DE 3 · DISPARAR", "Disparar da daño ahora. Tocá cualquier celda del mapa enemigo: no sabés dónde está nadie."],
    2: ["PASO 2 DE 3 · DESARROLLAR", "Maniobrar no hace daño, pero rinde después. Tocá «Maniobrar» y elegí «Apuntar»: el próximo disparo cae en cruz."],
    3: ["PASO 3 DE 3 · COBRAR", "Tocá «Disparar» y una celda: tu carga cae en cruz. Esa es la inversión pagando."],
    4: ["¡LISTO!", "Disparar gana material. Maniobrar gana posición. Repetir una celda es válido: lo que ves viejo puede haber cambiado."]
  };

  function tutoSave() { store.set(KEY_TUTO, "1"); }
  function pulseOn(el, on) { if (el) el.classList.toggle("pulse", !!on); }
  function tutoRender() {
    const box = document.getElementById("coach");
    if (!box) return;
    if (!tuto) {
      box.classList.add("hidden");
      pulseOn(ui.ready, false);
      requestAnimationFrame(fit);
      return;
    }
    const c = TUTO_COPY[tuto.step];
    document.getElementById("coach-step").textContent = c[0];
    document.getElementById("coach-text").textContent = c[1];
    document.getElementById("coach-ok").classList.toggle("hidden", tuto.step !== 4);
    document.getElementById("coach-skip").classList.toggle("hidden", tuto.step === 4);
    box.classList.remove("hidden");
    pulseOn(ui.ready, tuto.step === 0);
    requestAnimationFrame(fit);
  }
  function tutoStart() {
    if (opts.mode !== "pvc") return;
    if (store.get(KEY_TUTO) && !tutoForce) return;
    tutoForce = false;
    tuto = { step: 0, pending: 0 };
    tutoRender();
  }
  function tutoEnd() {
    if (!tuto) return;
    tuto = null;
    tutoSave();
    tutoRender();
  }
  function tutoEvent(name) {
    if (!tuto) return;
    if (name === "ready" && tuto.step === 0) { tuto.step = 1; tutoRender(); }
    else if (name === "shot" && tuto.step === 1) tuto.pending = 2;
    else if (name === "man" && tuto.step === 2) tuto.pending = 3;
    else if (name === "shot" && tuto.step === 3) tuto.pending = 4;
  }
  function tutoTurn() {
    if (tuto && tuto.pending) {
      tuto.step = tuto.pending;
      tuto.pending = 0;
      if (tuto.step === 4) tutoSave();
      tutoRender();
      hudDirty = true;
    }
  }

  const logList = document.getElementById("log-list");
  let lastSay = "";
  function say(text) {
    ui.dialogue.textContent = text;
    if (logList && text && text !== lastSay && !/^(Tu turno\.|El invasor apunta|El invasor piensa|Disparo en camino|Disparar da|Esperando|Bombardeo:)/.test(text)) {
      lastSay = text;
      const li = document.createElement("li");
      li.textContent = text;
      logList.appendChild(li);
      while (logList.children.length > 60) logList.removeChild(logList.firstChild);
      logList.parentNode.scrollTop = logList.parentNode.scrollHeight;
    }
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
      b.dataset.nation = id;
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

  function resetFx() {
    parts = [];
    rings = [];
    floats = [];
    shocks = [];
    flashes = [];
    zoom.z = 0;
    hitstop = 0;
    slow = 0;
    flashScreen = 0;
    trauma = 0;
    hideBanner();
    ui.stage.classList.remove("under-fire", "shake");
  }

  function showMenu() {
    stopClock();
    destroyNet();
    match = null;
    hand = null;
    viewOverride = null;
    resetFx();
    tuto = null;
    tutoRender();
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
    if (logList) { logList.textContent = ""; lastSay = ""; }
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
    const w = Math.max(80, Math.floor(stage.clientWidth));
    const h = Math.max(80, Math.floor(stage.clientHeight));
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

  // La grilla ocupa toda la pantalla. Si la pantalla es casi tan angosta como 1:2 se estira a lo ancho
  // (celdas apenas más altas); si es más ancha (escritorio) se centra a toda la altura y el parque se
  // extiende de fondo.
  function geomCss(cw, ch) {
    const aspect = cw / Math.max(1, ch);
    let gw;
    if (aspect <= 0.62) gw = cw;
    else gw = Math.min(cw, ch * (C.W / C.H) * 1.6);
    return { ox: (cw - gw) / 2, oy: 0, cellW: gw / C.W, cellH: ch / C.H };
  }

  function gridGeom() {
    const dpr = ui.canvas.width / Math.max(1, ui.canvas.clientWidth || ui.canvas.width);
    const k = geomCss(ui.canvas.width, ui.canvas.height);
    return { dpr, padL: k.ox, padT: k.oy, cellW: k.cellW, cellH: k.cellH };
  }

  function cellFromEvent(e, loose) {
    const r = ui.canvas.getBoundingClientRect();
    const k = geomCss(r.width, r.height);
    if (k.cellW <= 0 || k.cellH <= 0) return null;
    let x = Math.floor((e.clientX - r.left - k.ox) / k.cellW);
    let y = Math.floor((e.clientY - r.top - k.oy) / k.cellH);
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
    if (match.phase === "attack" && (sel.mode === "move" || sel.mode === "repair")) return "local";
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

  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  function paintTurnbar(combat) {
    const sh = match.shared;
    ui.turnbar.classList.toggle("hidden", !(combat && sh));
    if (!combat || !sh) return;
    const lvl = C.warLevel(sh);
    const round = C.roundOf(sh);
    ui.warmeter.className = "l" + lvl;
    ui.warName.textContent = C.WAR_NAMES[lvl].toUpperCase();
    const left = C.roundsToNextLevel(sh);
    ui.warSub.textContent = lvl >= 3 ? "Ronda " + round + " · sin maniobras" : "Ronda " + round + " · " + plural(left, "ronda", "rondas") + " para " + C.WAR_NAMES[lvl + 1];
    ui.warmeter.querySelector(".wm i").style.width = Math.min(100, Math.round((Math.min(round, 18) / 18) * 100)) + "%";
    const myTurn = match.phase === "attack";
    const side = match.side;
    // pagos pendientes
    const chips = [];
    const add = (cls, text, extra) => chips.push({ cls, text, extra });
    if (side.charge > 0 && sh.turnNo < side.chargeUntil) {
      const r = Math.max(1, Math.ceil((side.chargeUntil - sh.turnNo) / 2));
      add("aim", "⊕ Carga " + (side.charge >= 2 ? "área 3×3" : "en cruz") + " · caduca en " + plural(r, "ronda", "rondas"));
    }
    if (side.init > 0 && sh.turnNo < side.initUntil) add("init", sel.initOn ? "⚡ Iniciativa ACTIVA: jugás dos veces" : "⚡ Iniciativa: tocá para usarla", true);
    const armor = match.local.reduce((a, s) => a + (s.armor > 0 ? s.armor : 0), 0);
    if (armor > 0) add("armor", "◆ Blindaje ×" + armor);
    C.zonesOf(sh, myWho()).forEach((z) => {
      if (z.tower) return;
      add("watch", "◎ Vigilancia · " + plural(Math.max(1, Math.ceil((z.until - sh.turnNo) / 2)), "ronda", "rondas"));
    });
    const towers = sh.pickups.filter((p) => p.type === "torre" && p.owner === myWho()).length;
    if (towers) add("tower", "▲ Torre ×" + towers);
    const foeZ = C.zonesOf(sh, foeWho());
    if (foeZ.length && C.spottedCells(side, foeZ).length) add("seen", "Te están viendo");
    let old = 0;
    match.know.marks.forEach((m) => { if (m.kind !== "sunk" && C.isStale(sh, myWho(), m)) old++; });
    if (old) add("old", "? " + plural(old, "marca vieja", "marcas viejas"));
    if (!chips.length) add("none", "Sin inversiones pendientes");
    ui.chips.replaceChildren();
    chips.forEach((c) => {
      const el = document.createElement(c.extra ? "button" : "span");
      el.className = "chip " + c.cls;
      el.textContent = c.text;
      if (c.extra) {
        el.type = "button";
        el.id = "chip-init";
        el.setAttribute("aria-pressed", sel.initOn ? "true" : "false");
      }
      ui.chips.appendChild(el);
    });
    // elección del turno
    const kinds = ["mover", "reconocer", "reparar", "apuntar"];
    const states = {};
    kinds.forEach((k) => { states[k] = manState(k); });
    const anyOk = kinds.some((k) => states[k].ok);
    ui.shoot.disabled = !myTurn;
    ui.dev.disabled = !myTurn || !anyOk;
    ui.shoot.setAttribute("aria-pressed", myTurn && sel.mode === "shoot" ? "true" : "false");
    ui.dev.setAttribute("aria-pressed", myTurn && sel.open ? "true" : "false");
    ui.dev.querySelector("small").textContent = anyOk ? "Rinde después" : (lvl >= 3 ? "Ya no hay" : "Tope seguido");
    ui.shoot.querySelector("small").textContent = side.charge > 0 && sh.turnNo < side.chargeUntil ? (side.charge >= 2 ? "Área 3×3" : "En cruz") : lvl >= 3 ? "Área 3×3" : lvl >= 2 ? "En cruz" : "Daño ahora";
    const open = myTurn && sel.open && lvl < 3;
    const picking = myTurn && (sel.mode === "move" || sel.mode === "repair" || sel.mode === "watch");
    document.getElementById("hud-bottom").classList.toggle("slim", picking);
    document.getElementById("man-cancel").classList.toggle("hidden", !picking);
    ui.manu.classList.toggle("hidden", !open);
    ui.manu.querySelectorAll("button").forEach((b) => {
      const k = b.dataset.man;
      if (k === "cancel") return;
      b.setAttribute("aria-disabled", states[k].ok ? "false" : "true");
      b.setAttribute("aria-pressed", (sel.mode === "move" && k === "mover") || (sel.mode === "watch" && k === "reconocer") || (sel.mode === "repair" && k === "reparar") ? "true" : "false");
      b.title = states[k].ok ? "" : states[k].why;
    });
    pulseOn(ui.dev, !!tuto && tuto.step === 2 && !sel.open && myTurn);
    pulseOn(ui.shoot, !!tuto && (tuto.step === 3 || tuto.step === 1) && myTurn && !sel.open);
    const ap = ui.manu.querySelector('[data-man="apuntar"]');
    pulseOn(ap, !!tuto && tuto.step === 2 && open);
  }

  function flushHud() {
    const fighting = !!match && (match.phase === "attack" || match.phase === "defend" || match.phase === "resolving");
    if (document.body.classList.contains("in-battle") !== fighting) document.body.classList.toggle("in-battle", fighting);
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
    paintTurnbar(combat);
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

  let bdCache = null;
  function drawBackdrop(img, w, h) {
    if (!bdCache || bdCache.img !== img || bdCache.w !== w || bdCache.h !== h) {
      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      const c2 = cv.getContext("2d");
      c2.fillStyle = "#0b2a3f";
      c2.fillRect(0, 0, w, h);
      const sc = Math.max(w / img.naturalWidth, h / img.naturalHeight) * 1.15;
      const dw = img.naturalWidth * sc;
      const dh = img.naturalHeight * sc;
      if ("filter" in c2) c2.filter = "blur(" + Math.round(10 * (w / 800 + 1)) + "px) saturate(1.35) brightness(1.2)";
      c2.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      c2.filter = "none";
      c2.fillStyle = "rgba(4,10,24,.28)";
      c2.fillRect(0, 0, w, h);
      bdCache = { img, w, h, canvas: cv };
    }
    ctx.drawImage(bdCache.canvas, 0, 0);
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
    if (img && img.complete && img.naturalWidth && (g.padL > 1 || g.padT > 1)) drawBackdrop(img, w, h);
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

  /* ---------- capas de visión ---------- */
  // Visión en tiempo real: zonas vigiladas y torres (celeste, vivo).
  // Mapa explorado: marcas y fantasmas de lo último que se supo (atenuado, con "?" si pudo cambiar).
  function zoneBox(g, z) {
    const x0 = Math.max(0, z.x - z.r);
    const y0 = Math.max(0, z.y - z.r);
    const x1 = Math.min(C.W - 1, z.x + z.r);
    const y1 = Math.min(C.H - 1, z.y + z.r);
    const p = cellPx(g, x0, y0);
    return { x: p.x, y: p.y, w: (x1 - x0 + 1) * g.cellW, h: (y1 - y0 + 1) * g.cellH };
  }

  function inAnyZone(zones, x, y) { return zones.some((z) => C.inZone(z, x, y)); }

  function drawZone(g, z, mine, time) {
    const b = zoneBox(g, z);
    const col = mine ? "34,211,238" : "251,113,60";
    const left = z.tower ? 99 : Math.max(0, Math.ceil((z.until - match.shared.turnNo) / 2));
    const life = z.tower ? 1 : Math.max(0.25, Math.min(1, (z.until - match.shared.turnNo) / 6));
    ctx.save();
    ctx.fillStyle = "rgba(" + col + "," + (mine ? 0.13 : 0.08) + ")";
    ctx.fillRect(b.x, b.y, b.w, b.h);
    if (mine && !reduceMotion) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(b.x, b.y, b.w, b.h);
      ctx.clip();
      const ph = (time / 1800 + z.x * 0.13) % 1;
      const sy = b.y + ph * b.h;
      const lg = ctx.createLinearGradient(0, sy - b.h * 0.3, 0, sy);
      lg.addColorStop(0, "rgba(" + col + ",0)");
      lg.addColorStop(1, "rgba(" + col + ",.32)");
      ctx.fillStyle = lg;
      ctx.fillRect(b.x, sy - b.h * 0.3, b.w, b.h * 0.3);
      ctx.restore();
    }
    ctx.lineWidth = Math.max(1.5, 2 * g.dpr);
    ctx.strokeStyle = "rgba(" + col + "," + (0.5 + 0.4 * life) + ")";
    if (!mine) ctx.setLineDash([6 * g.dpr, 4 * g.dpr]);
    ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    ctx.setLineDash([]);
    const L = Math.min(g.cellW, g.cellH) * 0.42;
    ctx.lineWidth = Math.max(2.5, 3.2 * g.dpr);
    ctx.strokeStyle = "rgba(" + col + ",1)";
    [[b.x, b.y, 1, 1], [b.x + b.w, b.y, -1, 1], [b.x, b.y + b.h, 1, -1], [b.x + b.w, b.y + b.h, -1, -1]].forEach((q) => {
      ctx.beginPath();
      ctx.moveTo(q[0] + q[2] * L, q[1]);
      ctx.lineTo(q[0], q[1]);
      ctx.lineTo(q[0], q[1] + q[3] * L);
      ctx.stroke();
    });
    const label = z.tower ? (mine ? "TORRE" : "TORRE ENEMIGA") : (mine ? "EN VIVO · " + left : "TE VEN · " + left);
    ctx.font = "800 " + Math.floor(Math.max(9, g.cellW * 0.26)) + "px Nunito, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.lineWidth = 3 * g.dpr;
    ctx.strokeStyle = "rgba(2,6,23,.85)";
    ctx.strokeText(label, b.x + 4 * g.dpr, b.y + 3 * g.dpr);
    ctx.fillStyle = mine ? "#a5f3fc" : "#fed7aa";
    ctx.fillText(label, b.x + 4 * g.dpr, b.y + 3 * g.dpr);
    ctx.restore();
  }

  function pickupIcon(type, cx, cy, s, col) {
    ctx.save();
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(1.5, s * 0.16);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (type === "torre") {
      ctx.beginPath();
      ctx.moveTo(cx - 0.42 * s, cy + 0.62 * s);
      ctx.lineTo(cx - 0.26 * s, cy - 0.12 * s);
      ctx.lineTo(cx + 0.26 * s, cy - 0.12 * s);
      ctx.lineTo(cx + 0.42 * s, cy + 0.62 * s);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(cx - 0.4 * s, cy - 0.5 * s, 0.8 * s, 0.32 * s);
      ctx.beginPath();
      ctx.arc(cx, cy - 0.34 * s, 0.78 * s, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else if (type === "artilleria") {
      ctx.beginPath();
      ctx.arc(cx, cy, 0.52 * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 0.78 * s, cy); ctx.lineTo(cx - 0.24 * s, cy);
      ctx.moveTo(cx + 0.78 * s, cy); ctx.lineTo(cx + 0.24 * s, cy);
      ctx.moveTo(cx, cy - 0.78 * s); ctx.lineTo(cx, cy - 0.24 * s);
      ctx.moveTo(cx, cy + 0.78 * s); ctx.lineTo(cx, cy + 0.24 * s);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 0.1 * s, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === "blindaje") {
      ctx.beginPath();
      ctx.moveTo(cx, cy - 0.7 * s);
      ctx.lineTo(cx + 0.56 * s, cy - 0.46 * s);
      ctx.quadraticCurveTo(cx + 0.58 * s, cy + 0.36 * s, cx, cy + 0.74 * s);
      ctx.quadraticCurveTo(cx - 0.58 * s, cy + 0.36 * s, cx - 0.56 * s, cy - 0.46 * s);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(6,40,20,.8)";
      ctx.lineWidth = Math.max(1, s * 0.1);
      ctx.beginPath();
      ctx.moveTo(cx, cy - 0.46 * s); ctx.lineTo(cx, cy + 0.5 * s);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(cx + 0.14 * s, cy - 0.78 * s);
      ctx.lineTo(cx - 0.4 * s, cy + 0.1 * s);
      ctx.lineTo(cx - 0.04 * s, cy + 0.1 * s);
      ctx.lineTo(cx - 0.16 * s, cy + 0.78 * s);
      ctx.lineTo(cx + 0.4 * s, cy - 0.12 * s);
      ctx.lineTo(cx + 0.04 * s, cy - 0.12 * s);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPickup(g, p, time) {
    const c = cellCenter(g, p.x, p.y);
    const r = Math.min(g.cellW, g.cellH) * 0.4;
    const col = PK_COLOR[p.type] || "#fff";
    const pul = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(time / 420 + p.id);
    ctx.save();
    const gr = ctx.createRadialGradient(c.x, c.y, r * 0.3, c.x, c.y, r * (1.9 + pul * 0.5));
    gr.addColorStop(0, col + "aa");
    gr.addColorStop(1, col + "00");
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r * (1.9 + pul * 0.5), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = "rgba(8,14,30,.86)";
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(2, 2.4 * g.dpr);
    ctx.stroke();
    if (p.type === "torre" && p.owner) {
      ctx.strokeStyle = p.owner === match.role ? "#22d3ee" : "#fb923c";
      ctx.lineWidth = Math.max(2.5, 3 * g.dpr);
      ctx.beginPath();
      ctx.arc(c.x, c.y, r + 3 * g.dpr, 0, Math.PI * 2);
      ctx.stroke();
    }
    pickupIcon(p.type, c.x, c.y, r * 0.72, col);
    ctx.restore();
  }

  function drawContact(g, x, y, kind, live, time, stale) {
    const c = cellCenter(g, x, y);
    const r = Math.min(g.cellW, g.cellH) * 0.34;
    ctx.save();
    if (live) {
      const pul = reduceMotion ? 0.6 : 0.5 + 0.5 * Math.sin(time / 260 + x * 1.7 + y);
      const gr = ctx.createRadialGradient(c.x, c.y, r * 0.2, c.x, c.y, r * 2.1);
      gr.addColorStop(0, "rgba(125,240,255,.75)");
      gr.addColorStop(1, "rgba(34,211,238,0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r * (1.7 + pul * 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(8,47,73,.78)";
      ctx.strokeStyle = "#a5f3fc";
      ctx.lineWidth = Math.max(2, 2.4 * g.dpr);
    } else {
      ctx.fillStyle = "rgba(30,41,59,.28)";
      ctx.strokeStyle = "rgba(253,230,138,.7)";
      ctx.lineWidth = Math.max(1.5, 1.8 * g.dpr);
      ctx.setLineDash([4 * g.dpr, 3 * g.dpr]);
    }
    ctx.beginPath();
    if (kind === "tanque") ctx.rect(c.x - r, c.y - r * 0.8, r * 2, r * 1.6);
    else { ctx.moveTo(c.x, c.y - r); ctx.lineTo(c.x + r, c.y); ctx.lineTo(c.x, c.y + r); ctx.lineTo(c.x - r, c.y); ctx.closePath(); }
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    if (!live) {
      ctx.font = "800 " + Math.floor(Math.max(10, g.cellW * 0.34)) + "px Nunito, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(253,230,138,.95)";
      ctx.fillText("?", c.x, c.y + 1);
    }
    ctx.restore();
  }

  // Marca del mapa explorado. Si ya pudo cambiar (el rival movió o reparó) se ve vieja: sin llamas y con "?".
  function drawOldMark(g, x, y, kind) {
    const p = cellPx(g, x, y);
    const cx = p.x + g.cellW / 2;
    const cy = p.y + g.cellH / 2;
    const rad = Math.min(g.cellW, g.cellH) * 0.26;
    ctx.save();
    ctx.setLineDash([5 * g.dpr, 3 * g.dpr]);
    ctx.lineWidth = Math.max(1.5, 1.6 * g.dpr);
    if (kind === "hit") {
      ctx.fillStyle = "rgba(120,53,15,.28)";
      ctx.fillRect(p.x + 2, p.y + 2, g.cellW - 4, g.cellH - 4);
      ctx.strokeStyle = "rgba(251,191,36,.85)";
      ctx.strokeRect(p.x + 2, p.y + 2, g.cellW - 4, g.cellH - 4);
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(255,241,242,.55)";
      ctx.beginPath();
      ctx.moveTo(cx - rad, cy - rad); ctx.lineTo(cx + rad, cy + rad);
      ctx.moveTo(cx + rad, cy - rad); ctx.lineTo(cx - rad, cy + rad);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "rgba(226,232,240,.45)";
      ctx.beginPath();
      ctx.arc(cx, cy, rad * 0.8, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.font = "800 " + Math.floor(Math.max(9, g.cellW * 0.3)) + "px Nunito, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(253,230,138,.95)";
    ctx.fillText("?", p.x + g.cellW - 3 * g.dpr, p.y + 2 * g.dpr);
    ctx.restore();
  }

  function dirHandle(u, o) {
    const sz = u.size;
    if (u.horizontal) {
      if (o.dx) return { x: o.dx > 0 ? o.x + sz - 1 : o.x, y: o.y };
      return { x: o.x + Math.floor(sz / 2), y: o.y };
    }
    if (o.dy) return { x: o.x, y: o.dy > 0 ? o.y + sz - 1 : o.y };
    return { x: o.x, y: o.y + Math.floor(sz / 2) };
  }

  function moveHandles() {
    if (!match || sel.unit == null) return [];
    const u = match.local.find((s) => s.id === sel.unit);
    if (!u) return [];
    return C.moveOptions(match.side, match.shared, u, myWho()).map((o) => Object.assign({ h: dirHandle(u, o) }, o));
  }

  function drawChevron(g, h, o, time, chosen) {
    const c = cellCenter(g, h.x, h.y);
    const r = Math.min(g.cellW, g.cellH) * 0.36;
    const gold = o.collect.length > 0;
    const col = gold ? "#fde047" : "#86efac";
    const pul = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(time / 300 + h.x + h.y);
    ctx.save();
    ctx.fillStyle = chosen ? "rgba(34,197,94,.9)" : "rgba(8,14,30,.72)";
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(2, 2.6 * g.dpr) * (chosen ? 1.3 : 1);
    ctx.beginPath();
    ctx.arc(c.x, c.y, r * (1 + pul * 0.08), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const a = Math.atan2(o.dy, o.dx);
    ctx.translate(c.x, c.y);
    ctx.rotate(a);
    ctx.fillStyle = chosen ? "#052e16" : col;
    ctx.beginPath();
    ctx.moveTo(r * 0.5, 0);
    ctx.lineTo(-r * 0.2, -r * 0.42);
    ctx.lineTo(-r * 0.2, r * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (Math.abs(o.dx) + Math.abs(o.dy) > 1) {
      ctx.save();
      ctx.font = "800 " + Math.floor(Math.max(9, g.cellW * 0.24)) + "px Nunito, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = col;
      ctx.fillText("2", c.x, c.y + r * 0.9);
      ctx.restore();
    }
  }

  function drawPieces(g, time) {
    const local = viewKind() === "local";
    const sh = match.shared;
    const combat = !!sh && (match.phase === "attack" || match.phase === "defend" || match.phase === "resolving" || match.phase === "end");
    if (local && match.local) {
      const foeZones = combat ? C.zonesOf(sh, foeWho()) : [];
      match.local.forEach((s) => {
        if (s.lifted) return;
        const sunk = C.shipStatus(s, match.hitsOnLocal).sunk;
        drawHull(g, s, 1, sunk ? "#6b7280" : undefined);
        if (!sunk && s.armor > 0) {
          const mid = C.cellsOf(s)[Math.floor(s.size / 2)];
          const c = cellCenter(g, mid.x, mid.y);
          const rr = Math.min(g.cellW, g.cellH) * 0.22;
          ctx.save();
          ctx.strokeStyle = "#4ade80";
          ctx.fillStyle = "rgba(6,78,59,.7)";
          ctx.lineWidth = Math.max(1.5, 2 * g.dpr);
          ctx.beginPath();
          ctx.arc(c.x, c.y, rr, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.font = "800 " + Math.floor(rr * 1.3) + "px Nunito, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "#bbf7d0";
          ctx.fillText(String(s.armor), c.x, c.y + 1);
          ctx.restore();
        }
        C.cellsOf(s).forEach((c) => {
          if (match.hitsOnLocal.has(C.key(c.x, c.y))) drawMark(g, c.x, c.y, sunk ? "sunk" : "hit");
          if (!sunk && foeZones.length && inAnyZone(foeZones, c.x, c.y)) {
            const p = cellPx(g, c.x, c.y);
            const pul = reduceMotion ? 0.6 : 0.5 + 0.5 * Math.sin(time / 320);
            ctx.strokeStyle = "rgba(251,113,60," + (0.55 + 0.4 * pul).toFixed(2) + ")";
            ctx.lineWidth = Math.max(2, 2.4 * g.dpr);
            ctx.strokeRect(p.x + 2, p.y + 2, g.cellW - 4, g.cellH - 4);
          }
        });
      });
      match.side.misses.forEach((k) => {
        const [x, y] = k.split(",").map(Number);
        if (!C.shipAt(match.local, x, y)) drawMark(g, x, y, "miss");
      });
      if (combat) {
        foeZones.forEach((z) => drawZone(g, z, false, time));
        sh.pickups.forEach((p) => drawPickup(g, p, time));
      }
      if (combat && match.phase === "attack" && (sel.mode === "move" || sel.mode === "repair")) {
        const t = time / 1000;
        if (sel.mode === "repair") {
          C.repairable(match.side).forEach((s) => {
            const mid = C.cellsOf(s)[0];
            const c = cellCenter(g, mid.x, mid.y);
            const r = Math.min(g.cellW, g.cellH) * (0.46 + 0.06 * Math.sin(t * 5));
            ctx.save();
            ctx.strokeStyle = "#4ade80";
            ctx.lineWidth = Math.max(2.5, 3 * g.dpr);
            ctx.beginPath();
            ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = "#4ade80";
            ctx.fillRect(c.x - r * 0.18, c.y - r * 0.5, r * 0.36, r);
            ctx.fillRect(c.x - r * 0.5, c.y - r * 0.18, r, r * 0.36);
            ctx.restore();
          });
        } else if (sel.unit == null) {
          match.local.forEach((s) => {
            if (!C.moveOptions(match.side, sh, s, myWho()).length) return;
            const cs = C.cellsOf(s);
            const p0 = cellPx(g, s.x, s.y);
            const w = (s.horizontal ? s.size : 1) * g.cellW;
            const h = (s.horizontal ? 1 : s.size) * g.cellH;
            ctx.save();
            ctx.strokeStyle = "rgba(134,239,172," + (0.6 + 0.3 * Math.sin(t * 5)).toFixed(2) + ")";
            ctx.lineWidth = Math.max(2, 2.6 * g.dpr);
            ctx.strokeRect(p0.x + 1, p0.y + 1, w - 2, h - 2);
            ctx.restore();
            if (!cs.length) return;
          });
        } else {
          const u = match.local.find((s) => s.id === sel.unit);
          if (u) {
            const p0 = cellPx(g, u.x, u.y);
            ctx.save();
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = Math.max(2.5, 3 * g.dpr);
            ctx.strokeRect(p0.x + 1, p0.y + 1, (u.horizontal ? u.size : 1) * g.cellW - 2, (u.horizontal ? 1 : u.size) * g.cellH - 2);
            ctx.restore();
            const hs = moveHandles();
            hs.forEach((o) => {
              const chosen = sel.dest && sel.dest.dx === o.dx && sel.dest.dy === o.dy;
              if (chosen) drawHull(g, { x: o.x, y: o.y, size: u.size, horizontal: u.horizontal, kind: u.kind, color: u.color }, 0.88, "#4ade80");
            });
            hs.forEach((o) => {
              const chosen = sel.dest && sel.dest.dx === o.dx && sel.dest.dy === o.dy;
              drawChevron(g, o.h, o, time, chosen);
            });
          }
        }
      }
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
      if (combat) {
        const know = match.know;
        const mine = C.zonesOf(sh, myWho());
        // mapa explorado: lo último que supe, atenuado
        know.marks.forEach((m, k) => {
          const [x, y] = k.split(",").map(Number);
          if (m.kind === "sunk") { drawMark(g, x, y, "sunk"); return; }
          const inLive = inAnyZone(mine, x, y);
          const stale = C.isStale(sh, myWho(), m) || (m.kind === "hit" && inLive && !know.live.has(k));
          if (stale) drawOldMark(g, x, y, m.kind);
          else drawMark(g, x, y, m.kind);
        });
        know.ghosts.forEach((gh, k) => {
          const [x, y] = k.split(",").map(Number);
          if (inAnyZone(mine, x, y)) return;
          drawContact(g, x, y, gh.kind, false, time, true);
        });
        // visión en tiempo real
        mine.forEach((z) => drawZone(g, z, true, time));
        sh.pickups.forEach((p) => drawPickup(g, p, time));
        know.live.forEach((kind, k) => {
          const [x, y] = k.split(",").map(Number);
          drawContact(g, x, y, kind, true, time, false);
        });
        if (match.phase === "attack" && preview && C.inBounds(preview.x, preview.y)) {
          if (sel.mode === "watch") {
            const z = { x: preview.x, y: preview.y, r: 1 };
            const b = zoneBox(g, z);
            ctx.fillStyle = "rgba(34,211,238,.28)";
            ctx.fillRect(b.x, b.y, b.w, b.h);
            ctx.strokeStyle = "#22d3ee";
            ctx.lineWidth = Math.max(2, 2.4 * g.dpr);
            ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
          } else if (sel.mode === "shoot") {
            const pat = C.shotCells(match.side, sh, preview);
            ctx.fillStyle = pat.level >= 2 ? "rgba(248,113,113,.42)" : pat.level === 1 ? "rgba(251,146,60,.4)" : "rgba(255,255,255,.2)";
            pat.cells.forEach((c) => {
              if (!C.inBounds(c.x, c.y)) return;
              const p = cellPx(g, c.x, c.y);
              ctx.fillRect(p.x + 1, p.y + 1, g.cellW - 2, g.cellH - 2);
            });
          }
        }
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

  function narrate(results, incoming, pattern) {
    if (!results.length) return "Nada que disparar.";
    const multi = results.length > 1;
    const sunk = results.filter((r) => r.kind === "sunk");
    const fresh = results.filter((r) => r.kind === "hit" && !r.again);
    const again = results.filter((r) => r.kind === "hit" && r.again);
    const blocked = results.some((r) => r.blocked);
    const wreck = results.filter((r) => r.kind === "wreck");
    const area = pattern && (pattern.level >= 2 || (pattern.level == null && pattern.cells && pattern.cells.length > 5));
    const pat = multi ? (area ? "Área 3×3: " : "Cruz: ") : "";
    if (sunk.length) return pat + (incoming ? "Te destruyeron " : "Destruiste ") + sunk[0].ship + (fresh.length ? " y hubo más impactos." : ".");
    if (fresh.length) {
      const h = fresh[0];
      const n = fresh.length;
      if (n > 1) return pat + n + " impactos" + (incoming ? " en tu flota." : " confirmados.");
      return pat + (incoming ? "Impacto en tu " : "Impacto en ") + h.ship + ". Quedan " + h.left + ".";
    }
    if (again.length) {
      return incoming
        ? "Otro golpe a un segmento ya dañado de tu " + again[0].ship + "."
        : "Ahí sigue " + again[0].ship + ": ese segmento ya estaba tocado.";
    }
    if (blocked && incoming) return "Tu blindaje absorbió el impacto.";
    if (wreck.length && !incoming) return "Ahí solo queda un naufragio.";
    return pat + (incoming ? "El disparo cayó al vacío." : "Agua. Si él se movió, tus marcas viejas ya no valen.");
  }

  function fxAgain(x, y, text) {
    const g = gridGeom();
    const c = cellCenter(g, x, y);
    rings.push({ x, y, life: 1, color: "#fde68a", size: 1.6, w: 3 });
    floats.push({ x: c.x, y: c.y, vy: -30 * g.dpr, life: 1, color: "#fde68a", text, size: 12 });
  }

  async function playResults(results, incoming, pattern) {
    viewOverride = incoming ? "local" : "remote";
    hudDirty = true;
    if (incoming) ui.stage.classList.add("under-fire");
    let sunkAny = false;
    const j = juke();
    const stt = match && match.stats;
    if (stt && !incoming) stt.shots++;
    if (pattern && pattern.cells && pattern.cells.length > 1) {
      const col = (pattern.level >= 2 || pattern.cells.length > 5) ? "#f87171" : "#fb923c";
      const mx = pattern.cells.reduce((a, c) => a + c.x, 0) / pattern.cells.length;
      const my = pattern.cells.reduce((a, c) => a + c.y, 0) / pattern.cells.length;
      burst(Math.round(mx), Math.round(my), col);
    }
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (stt) {
        if (incoming) {
          if ((r.kind === "hit" && !r.again) || r.kind === "sunk") stt.taken++;
          if (r.kind === "sunk") stt.lost++;
        } else {
          if (r.kind === "hit" || r.kind === "sunk") { stt.cells = (stt.cells || 0) + 1; if (!r.again) stt.hits++; }
          else if (r.kind === "miss") { stt.cells = (stt.cells || 0) + 1; stt.misses++; }
          if (r.kind === "sunk") stt.sunk++;
        }
      }
      if (r.kind === "hit" && r.again) {
        fxAgain(r.x, r.y, incoming ? "OTRA VEZ" : "SIGUE AHÍ");
        if (j) j.sfx.hit();
      } else if (r.kind === "hit" || r.kind === "sunk") {
        fxHit(r.x, r.y, incoming);
        if (j) j.sfx.hit();
        if (r.kind === "sunk") {
          sunkAny = true;
          fxSunk(r, incoming);
          if (j) j.sfx.sunk();
        }
      } else if (r.kind === "wreck") {
        fxAgain(r.x, r.y, "NAUFRAGIO");
      } else if (r.kind === "miss" && r.blocked && incoming) {
        burst(r.x, r.y, "#facc15");
        if (j) j.sfx.shield();
      } else if (r.kind === "miss") {
        fxMiss(r.x, r.y);
        if (j) j.sfx.miss();
      }
      if (i < results.length - 1) await WAIT(incoming ? 200 : 120);
    }
    say(narrate(results, incoming, pattern));
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
      hitsOnLocal: null,
      hitsOnRemote: new Set(),
      wrecks: [],
      side: null,
      foeSide: null,
      know: C.newKnow(),
      meP: null,
      shared: null,
      world: null,
      lastLevel: 0,
      keepNext: false,
      shotT: 0,
      pattern: null,
      stats: { shots: 0, hits: 0, misses: 0, sunk: 0, taken: 0, lost: 0, turns: 0, man: 0, picks: 0, t0: 0, t1: 0 }
    };
    match.side = C.newSide(local);
    match.hitsOnLocal = match.side.hits;
    match.meP = { side: match.side, know: match.know, pers: null, consec: 0 };
    if (remote) {
      match.foeSide = C.newSide(remote);
      match.hitsOnRemote = match.foeSide.hits;
    }
    sel.initOn = false;
    selReset("shoot");
    rematch = { me: false, them: false };
    remoteLeft = 17;
    hand = null;
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
      send({ t: force ? "go" : "ready", force: !!force });
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
    match.stats.t0 = Date.now();
    settleHand();
    stopClock();
    hudDirty = true;
    const seed = opts.mode === "pvp" ? ((opts.seed >>> 0) || 1) : Math.floor(Math.random() * 4294967296);
    match.shared = C.newShared(seed, opts.terrain, opts.map, opts.crop);
    match.lastLevel = 0;
    if (opts.mode !== "pvp") {
      const pers = C.PERSONALITIES[Math.floor(Math.random() * C.PERSONALITIES.length)];
      match.aiPers = pers;
      match.world = {
        shared: match.shared,
        p: { arg: match.meP, inv: { side: match.foeSide, know: C.newKnow(), pers, consec: 0 } }
      };
      const nation = C.NATIONS[opts.nation];
      document.getElementById("inv-name").textContent = nation.flag + " " + nation.name.toUpperCase() + " · " + C.PERS_LABEL[pers];
      match.phase = "attack";
      tutoEvent("ready");
      say("Invasor " + C.PERS_LABEL[pers].toLowerCase() + ": " + PERS_BLURB[pers] + ". Tu turno: disparás o maniobrás.");
      requestAnimationFrame(fit);
      hudDirty = true;
      return;
    }
    match.phase = match.role === "arg" ? "attack" : "defend";
    say(match.role === "arg"
      ? "Nadie sabe dónde está nadie. Empezás vos: disparás o maniobrás."
      : "Argentina juega primero. Mirá tu parque: ahí vas a ver qué hace.");
    requestAnimationFrame(fit);
    hudDirty = true;
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
    if (!C.inBounds(cell.x, cell.y)) return;
    preview = cell;
    lock(() => cellAction(cell));
  }

  async function cellAction(cell) {
    if (!match || match.phase !== "attack") return;
    if (sel.mode === "shoot") return takeAction({ t: "shot", cell: { x: cell.x, y: cell.y } });
    if (sel.mode === "watch") return takeAction({ t: "watch", x: cell.x, y: cell.y });
    if (sel.mode === "menu") { say("Elegí una maniobra: Mover, Vigilar, Reparar o Apuntar."); return; }
    if (sel.mode === "repair") {
      const u = C.shipAt(match.local, cell.x, cell.y);
      if (u && C.repairable(match.side).includes(u)) return takeAction({ t: "repair", unit: u.id });
      say("Tocá una unidad tuya con daño (marcada en verde).");
      return;
    }
    if (sel.mode === "move") {
      if (sel.unit != null) {
        const o = moveHandles().find((q) => q.h.x === cell.x && q.h.y === cell.y);
        if (o) {
          if (sel.dest && sel.dest.dx === o.dx && sel.dest.dy === o.dy) return takeAction({ t: "move", unit: sel.unit, dx: o.dx, dy: o.dy });
          sel.dest = { dx: o.dx, dy: o.dy };
          hudDirty = true;
          say(o.collect.length ? "Ahí hay un tesoro. Tocá la flecha otra vez para confirmar el movimiento." : "Tocá la misma flecha otra vez para confirmar el movimiento.");
          return;
        }
      }
      const u = C.shipAt(match.local, cell.x, cell.y);
      if (u && C.moveOptions(match.side, match.shared, u, myWho()).length) {
        sel.unit = u.id;
        sel.dest = null;
        hudDirty = true;
        say("Elegí hacia dónde: las flechas doradas llevan a un tesoro. Tocá una para ver el destino y otra vez para confirmar.");
      } else if (u) say("Esa unidad no tiene lugar para moverse.");
      else say("Tocá una unidad tuya para moverla.");
    }
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

  /* ================= DISPARAR O DESARROLLAR ================= */
  // Cada turno: o disparás (daño ahora) o hacés UNA maniobra (sin daño, rinde después).
  const LEVEL_RULE = [
    "Hay tiempo de desarrollarse: hasta dos maniobras seguidas.",
    "Una sola maniobra seguida. Las vigilancias duran menos.",
    "Solo se puede mover. Todos los disparos caen en cruz.",
    "Ya no hay maniobras. Todos los disparos caen en área 3×3."
  ];
  const PERS_BLURB = {
    agresivo: "casi siempre dispara",
    cauto: "se desarrolla y repara antes de arriesgar",
    oportunista: "caza tesoros y espera su momento"
  };

  function selReset(mode) {
    sel.mode = mode || "shoot";
    sel.unit = null;
    sel.dest = null;
    sel.open = sel.mode !== "shoot";
    hudDirty = true;
  }
  function myWho() { return match.role; }
  function foeWho() { return C.other(match.role); }

  function manState(kind) {
    const me = match.meP;
    const sh = match.shared;
    const gate = C.maneuverAllowed(kind, sh, me.consec);
    if (!gate.ok) return gate;
    if (kind === "mover" && !match.local.some((s) => C.moveOptions(match.side, sh, s, myWho()).length)) {
      return { ok: false, why: "Ninguna unidad tiene lugar para moverse." };
    }
    if (kind === "reparar" && !C.repairable(match.side).length) return { ok: false, why: "No tenés unidades dañadas para reparar." };
    if (kind === "apuntar" && match.side.charge >= 2) return { ok: false, why: "La carga ya está al máximo (área 3×3)." };
    return { ok: true, why: "" };
  }

  function turnHint() {
    const lvl = C.warLevel(match.shared);
    if (lvl >= 3) return "Bombardeo: solo disparos, en área 3×3.";
    return "Disparar da daño ahora. Maniobrar no hace daño, pero rinde después.";
  }

  function mySpot() { return C.spottedCells(match.side, C.zonesOf(match.shared, foeWho())); }

  function myTurnStart(prefix) {
    if (!match) return;
    match.phase = "attack";
    C.expireSide(match.side, match.shared);
    selReset("shoot");
    const lvl = C.warLevel(match.shared);
    if (lvl !== match.lastLevel) {
      match.lastLevel = lvl;
      if (lvl > 0) showBanner(C.WAR_NAMES[lvl].toUpperCase(), LEVEL_RULE[lvl], lvl >= 2 ? "bad" : "good");
    }
    say((prefix ? prefix + " " : "") + turnHint());
    hudDirty = true;
  }

  async function takeAction(act) {
    if (!match || match.phase !== "attack") return;
    const m = match;
    const me = match.meP;
    const sh = match.shared;
    const who = myWho();
    C.expireSide(match.side, sh);
    const keep = sel.initOn && match.side.init > 0 && sh.turnNo < match.side.initUntil;
    if (keep) match.side.init = 0;
    sel.initOn = false;
    selReset("shoot");
    match.phase = "resolving";
    hudDirty = true;
    match.stats.turns++;
    if (opts.mode === "pvc") {
      const out = C.execAction(match.world, who, act);
      await presentMine(out, act);
      if (match !== m) return;
      if (out.lost) return finish(true);
      if (keep) { myTurnStart("Iniciativa: seguís de turno."); return; }
      await enemyTurn();
      return;
    }
    // PvP: cada cliente aplica lo suyo y le avisa al otro lo que es público.
    let msg;
    let pub = [];
    const unit = act.unit != null ? match.side.fleet.find((s) => s.id === act.unit) : null;
    if (act.t === "shot") {
      const pat = C.shotCells(match.side, sh, act.cell);
      if (pat.charged) match.side.charge = 0;
      match.shotT = sh.turnNo;
      me.consec = 0;
      C.advance(sh, who, "shot");
      msg = { t: "fire", shots: pat.cells, keep, spot: mySpot() };
      match.pattern = pat;
    } else {
      if (act.t === "move") {
        C.translateUnit(match.side, unit, act.dx, act.dy);
        pub = C.collectUnder(match.side, sh, who, unit);
        C.advance(sh, who, "move");
        msg = { t: "man", k: "move", collect: pub, keep };
      } else if (act.t === "repair") {
        C.applyRepair(match.side, unit);
        C.advance(sh, who, "repair");
        msg = { t: "man", k: "repair", keep };
      } else if (act.t === "aim") {
        C.applyAim(match.side, sh);
        C.advance(sh, who, "aim");
        msg = { t: "man", k: "aim", keep };
      } else {
        C.addWatch(sh, who, act.x, act.y);
        C.advance(sh, who, "watch");
        msg = { t: "man", k: "watch", x: act.x, y: act.y, keep };
      }
      me.consec++;
      msg.spot = mySpot();
    }
    match.keepNext = keep;
    send(msg);
    if (act.t === "shot") {
      say("Disparo en camino…");
      return;
    }
    match.stats.man++;
    tutoEvent("man");
    await playManeuver(true, act.t, pub, act);
    if (match !== m) return;
    hudDirty = true;
  }

  async function handleManAck(msg) {
    if (!match || match.phase !== "resolving") return;
    C.noteSpot(match.know, sanitizeSpot(msg.spot), match.shared.turnNo);
    if (match.keepNext) myTurnStart("Iniciativa: seguís de turno.");
    else { match.phase = "defend"; hudDirty = true; say("Esperando la jugada del rival…"); }
  }

  function sanitizeSpot(list) {
    return (Array.isArray(list) ? list : []).filter((c) => c && C.inBounds(c.x | 0, c.y | 0)).slice(0, 40)
      .map((c) => ({ x: c.x | 0, y: c.y | 0, kind: c.kind === "tanque" ? "tanque" : "barco" }));
  }

  async function handleFire(msg) {
    if (!match || !match.shared) return;
    const m = match;
    const sh = match.shared;
    match.phase = "defend";
    hudDirty = true;
    const cells = (Array.isArray(msg.shots) ? msg.shots : []).filter((c) => c && C.inBounds(c.x | 0, c.y | 0)).slice(0, 9).map((c) => ({ x: c.x | 0, y: c.y | 0 }));
    const res = C.resolveVolley(match.side, cells);
    C.advance(sh, foeWho(), "shot");
    C.noteSpot(match.know, sanitizeSpot(msg.spot), sh.turnNo);
    await playResults(res.results, true, { cells });
    if (match !== m) return;
    const wire = res.results.map((r) => (r.blocked ? { x: r.x, y: r.y, kind: "miss" } : r));
    send({ t: "resolved", results: wire, hpLeft: res.hp.left, lost: res.lost, spot: mySpot() });
    if (res.lost) return finish(false);
    if (msg.keep) { match.phase = "defend"; hudDirty = true; say("El rival tiene Iniciativa: juega de nuevo."); return; }
    myTurnStart("Tu turno.");
  }

  async function handleResolved(msg) {
    if (!match || !match.shared) return;
    const m = match;
    const sh = match.shared;
    const results = Array.isArray(msg.results) ? msg.results : [];
    remoteLeft = typeof msg.hpLeft === "number" ? msg.hpLeft : remoteLeft;
    C.noteResults(match.know, results, typeof match.shotT === "number" ? match.shotT : sh.turnNo);
    C.noteSpot(match.know, sanitizeSpot(msg.spot), sh.turnNo);
    rememberRemote(results);
    tutoEvent("shot");
    await playResults(results, false, match.pattern);
    if (match !== m) return;
    if (msg.lost) return finish(true);
    if (match.keepNext) { myTurnStart("Iniciativa: seguís de turno."); return; }
    match.phase = "defend";
    hudDirty = true;
    say("Disparo resuelto. Esperando al rival…");
  }

  async function handleMan(msg) {
    if (!match || !match.shared) return;
    const m = match;
    const sh = match.shared;
    const k = msg.k;
    if (k !== "move" && k !== "repair" && k !== "aim" && k !== "watch") return;
    match.phase = "defend";
    hudDirty = true;
    const foe = foeWho();
    let pub = [];
    let wx = 0;
    let wy = 0;
    if (k === "move") {
      pub = (Array.isArray(msg.collect) ? msg.collect : []).filter((p) => p && C.PICKUPS[p.type] && C.inBounds(p.x | 0, p.y | 0)).map((p) => ({ type: p.type, x: p.x | 0, y: p.y | 0 }));
      C.applyPublicCollect(sh, foe, pub);
      pub.forEach((p) => match.know.ghosts.set(C.key(p.x, p.y), { kind: "barco", t: sh.turnNo }));
    } else if (k === "watch") {
      wx = Math.max(0, Math.min(C.W - 1, msg.x | 0));
      wy = Math.max(0, Math.min(C.H - 1, msg.y | 0));
      C.addWatch(sh, foe, wx, wy);
    } else if (k === "repair") {
      remoteLeft = Math.min(17, remoteLeft + 1);
    }
    C.advance(sh, foe, k);
    C.noteSpot(match.know, sanitizeSpot(msg.spot), sh.turnNo);
    send({ t: "manack", spot: mySpot() });
    await playManeuver(false, k, pub, { x: wx, y: wy });
    if (match !== m) return;
    if (msg.keep) { match.phase = "defend"; hudDirty = true; say("El rival tiene Iniciativa: juega de nuevo."); return; }
    myTurnStart("Tu turno.");
  }

  function pickupText(list, mine) {
    const names = list.map((p) => C.PICKUPS[p.type].name);
    return (mine ? "Recogiste " : "El invasor recogió ") + names.join(" y ") + ".";
  }

  async function presentMine(out, act) {
    if (out.t === "shot") {
      rememberRemote(out.results);
      tutoEvent("shot");
      await playResults(out.results, false, out.pattern);
      return;
    }
    match.stats.man++;
    tutoEvent("man");
    await playManeuver(true, out.t, out.pub || [], act);
  }

  async function playManeuver(mine, t, pub, act) {
    const j = juke();
    const g = gridGeom();
    let text = "";
    let title = "";
    let sub = "";
    if (t === "move") {
      viewOverride = mine ? "local" : "remote";
      hudDirty = true;
      if (mine) {
        const u = match.local.find((s) => s.id === act.unit);
        if (u) C.cellsOf(u).forEach((c, i) => rings.push({ x: c.x, y: c.y, life: 1, color: "#86efac", size: 1.9, w: 3, delay: i * 0.05 }));
        text = "Moviste una unidad. Tus marcas viejas en el rival no cambian, pero él pudo perder tu rastro.";
      } else {
        text = "El invasor movió una unidad. Lo que sabés de él puede estar viejo.";
      }
      pub.forEach((p) => {
        const col = PK_COLOR[p.type];
        burst(p.x, p.y, col);
        const info = C.PICKUPS[p.type];
        title = (mine ? "RECOGISTE " : "EL INVASOR TOMÓ ") + info.name.toUpperCase();
        sub = info.short;
        if (j) j.sfx.shield();
      });
      if (pub.length) text = pickupText(pub, mine) + " " + C.PICKUPS[pub[0].type].short;
      if (title) showBanner(title, sub, mine ? "good" : "bad");
    } else if (t === "repair") {
      viewOverride = mine ? "local" : "remote";
      hudDirty = true;
      text = mine
        ? "Reparaste un segmento. El rival ve tus marcas viejas: ya no son de fiar."
        : "El invasor reparó una unidad. Tus marcas de impacto pueden estar viejas.";
      if (mine && act && act.unit != null) {
        const u = match.local.find((s) => s.id === act.unit);
        if (u) C.cellsOf(u).forEach((c) => burst(c.x, c.y, "#4ade80"));
      }
      if (j) j.sfx.shield();
    } else if (t === "aim") {
      viewOverride = "remote";
      hudDirty = true;
      text = mine
        ? "Cargaste el próximo disparo. Pagá la inversión antes de que caduque."
        : "El invasor está cargando el disparo: el próximo puede caer en cruz o área.";
      if (j) j.sfx.shield();
    } else if (t === "watch") {
      viewOverride = mine ? "remote" : "local";
      hudDirty = true;
      text = mine
        ? "Zona vigilada: ves en vivo ahí unos turnos. El rival sabe qué zona."
        : "El invasor vigila una zona de tu parque: ahí te ve en vivo.";
      burst(act.x, act.y, mine ? "#22d3ee" : "#fb923c");
      if (j) j.sfx.shield();
    }
    say(text);
    await WAIT(pub.length ? 1500 : 950);
    viewOverride = null;
    hudDirty = true;
  }

  async function enemyTurn() {
    const m = match;
    if (!m) return;
    const world = m.world;
    const sh = m.shared;
    match.phase = "defend";
    hudDirty = true;
    say("El invasor piensa su jugada…");
    await WAIT(520);
    for (let n = 0; n < 2; n++) {
      if (match !== m) return;
      const ai = world.p.inv;
      C.expireSide(ai.side, sh);
      const env = { side: ai.side, shared: sh, who: "inv", pers: ai.pers, consec: ai.consec, know: ai.know };
      const act = C.aiChoose(env, Math.random);
      const out = C.execAction(world, "inv", act);
      if (out.t === "shot") await playResults(out.results, true, out.pattern);
      else await playManeuver(false, out.t, out.pub || [], act);
      if (match !== m) return;
      if (out.lost) return finish(false);
      if (n === 0 && ai.side.init > 0 && sh.turnNo < ai.side.initUntil) {
        ai.side.init = 0;
        say("El invasor usa Iniciativa: juega otra vez.");
        await WAIT(500);
        continue;
      }
      break;
    }
    if (match !== m) return;
    myTurnStart("Tu turno.");
    tutoTurn();
  }

  function rememberRemote(results) {
    results.forEach((r) => {
      if (r.kind === "sunk") {
        const cells = r.cells && r.cells.length ? r.cells : [{ x: r.x, y: r.y }];
        if (!match.wrecks.some((w) => w.name === r.ship)) match.wrecks.push({ name: r.ship, cells, t0: performance.now() });
      }
    });
    hudDirty = true;
  }


  function parkName() { return (C.MAPS[opts.map] || {}).name || "el parque"; }
  function challengeUrl() {
    const path = location.pathname.endsWith("/") ? location.pathname : location.pathname.replace(/[^/]*$/, "");
    return location.origin + path + "?parque=" + opts.map + "&terreno=" + opts.terrain + "&invasor=" + opts.nation;
  }
  function accuracyOf(stt) { return stt.cells ? Math.round((stt.hits / stt.cells) * 100) : 0; }
  function fmtTime(ms) {
    const sec = Math.max(0, Math.round(ms / 1000));
    return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
  }
  function shareText(win) {
    const stt = match.stats;
    const acc = accuracyOf(stt);
    const role = match.role;
    if (win) return (role === "arg" ? "Defendí " : "Tomé ") + parkName() + " en " + stt.turns + " turnos con " + acc + "% de precisión en Parques en Guerra. ¿Podés vos?";
    return "Caí en " + parkName() + " tras " + stt.turns + " turnos (" + acc + "% de precisión) en Parques en Guerra. ¿Me ganás la revancha?";
  }
  function renderEnd(win, argentinaHolds) {
    const stt = match.stats;
    const fleet = match.local.length;
    const vals = {
      "st-shots": stt.shots,
      "st-acc": accuracyOf(stt) + "%",
      "st-sunk": stt.sunk + "/" + (match.remote ? match.remote.length : fleet),
      "st-taken": stt.taken + "/17",
      "st-turns": stt.man,
      "st-time": fmtTime((stt.t1 || Date.now()) - (stt.t0 || Date.now()))
    };
    Object.keys(vals).forEach((id) => { document.getElementById(id).textContent = String(vals[id]); });
    document.getElementById("end-kicker").textContent = win ? "VICTORIA" : "DERROTA";
    ui.end.classList.toggle("win", !!win);
    ui.end.classList.toggle("lose", !win);
    const rv = document.getElementById("rematch");
    rv.disabled = false;
    rv.textContent = "Revancha";
    document.getElementById("end-note").textContent = "";
    window.__parquesEnd = { win: !!win, stats: Object.assign({}, stt), argentinaHolds: !!argentinaHolds };
  }

  function startRematch() {
    const role = match ? match.role : "arg";
    stopClock();
    resetFx();
    ui.end.classList.add("hidden");
    freshMatch(role);
    showBattle();
    beginPlace();
  }
  function onRematchClick() {
    if (!match || match.phase !== "end") return;
    if (opts.mode !== "pvp") {
      resetFx();
      startGame();
      return;
    }
    const note = document.getElementById("end-note");
    if (!conn || !conn.open) {
      note.textContent = "El rival ya no está conectado. Volvé al menú y armá otra sala.";
      document.getElementById("rematch").disabled = true;
      return;
    }
    rematch.me = true;
    send({ t: "rematch" });
    document.getElementById("rematch").disabled = true;
    note.textContent = rematch.them ? "Arrancando la revancha…" : "Esperando que el rival acepte la revancha…";
    if (match.role === "arg" && rematch.them) hostRematchGo();
  }
  function hostRematchGo() {
    opts.crop = Math.floor(Math.random() * 5);
    opts.seed = Math.floor(Math.random() * 4294967296);
    send({ t: "rematchgo", crop: opts.crop, seed: opts.seed });
    startRematch();
  }
  async function onShare() {
    if (!match) return;
    const win = ui.end.classList.contains("win");
    const text = shareText(win);
    const url = challengeUrl();
    const note = document.getElementById("end-note");
    try {
      if (navigator.share) {
        await navigator.share({ title: "Parques en Guerra", text, url });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(text + " " + url);
      note.textContent = "Enlace de desafío copiado. Pegalo donde quieras.";
    } catch (e) {
      note.textContent = url;
    }
  }

  function finish(win) {
    if (!match || match.phase === "end") return;
    match.phase = "end";
    stopClock();
    hudDirty = true;
    if (tuto) tutoEnd();
    // "win" is from the local player's side; the joiner plays the invader (role "inv"),
    // so the Argentine-flavored headline must be flipped for them.
    const argentinaHolds = match.role === "inv" ? !win : win;
    ui.endTitle.textContent = argentinaHolds ? "El parque sigue siendo argentino." : "El invasor tomó el territorio.";
    match.stats.t1 = Date.now();
    renderEnd(win, argentinaHolds);
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
      if (typeof msg.seed === "number") opts.seed = msg.seed >>> 0;
      applyTheme();
      freshMatch("inv");
      showBattle();
      beginPlace();
      return;
    }
    if (msg.t === "ready" || msg.t === "go") {
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
    if (msg.t === "rematch") {
      rematch.them = true;
      if (match && match.phase === "end") {
        document.getElementById("end-note").textContent = rematch.me ? "Arrancando la revancha…" : "El rival pide revancha. Tocá Revancha para aceptar.";
        if (match.role === "arg" && rematch.me) hostRematchGo();
      }
      return;
    }
    if (msg.t === "rematchgo") {
      if (match && match.phase === "end" && rematch.me && match.role === "inv") {
        if (typeof msg.crop === "number") opts.crop = ((msg.crop % 5) + 5) % 5;
        if (typeof msg.seed === "number") opts.seed = msg.seed >>> 0;
        startRematch();
      }
      return;
    }
    if (msg.t === "fire") lock(() => handleFire(msg));
    if (msg.t === "resolved") lock(() => handleResolved(msg));
    if (msg.t === "man") lock(() => handleMan(msg));
    if (msg.t === "manack") lock(() => handleManAck(msg));
  }

  function bindConn(c) {
    conn = c;
    c.on("data", onData);
    c.on("close", () => {
      if (match && match.phase !== "end") say("Se cortó la conexión.");
      if (match && match.phase === "end") {
        document.getElementById("end-note").textContent = "El rival salió de la sala.";
        document.getElementById("rematch").disabled = true;
      }
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
    send({ t: "hello", map: opts.map, terrain: opts.terrain, nation: opts.nation, crop: opts.crop || 0, seed: opts.seed >>> 0 });
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
    opts.seed = Math.floor(Math.random() * 4294967296);
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
    tutoStart();
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
  document.getElementById("rematch").addEventListener("click", onRematchClick);
  document.getElementById("share").addEventListener("click", onShare);
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
  ui.shoot.addEventListener("click", () => {
    if (!match || match.phase !== "attack") return;
    selReset("shoot");
    say("Disparar: tocá una celda del territorio enemigo.");
    blip();
  });
  ui.dev.addEventListener("click", () => {
    if (!match || match.phase !== "attack") return;
    if (sel.open) selReset("shoot");
    else { selReset("menu"); say("Maniobrar no hace daño, pero rinde después. Elegí una."); }
    blip();
  });
  ui.manu.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-man]");
    if (!b || !match || match.phase !== "attack") return;
    const k = b.dataset.man;
    if (k === "cancel") { selReset("shoot"); say("Disparar: tocá una celda del territorio enemigo."); blip(); return; }
    const st = manState(k);
    if (!st.ok) { say(st.why); return; }
    blip();
    if (k === "apuntar") { lock(() => takeAction({ t: "aim" })); return; }
    const mode = k === "mover" ? "move" : k === "reconocer" ? "watch" : "repair";
    if (sel.mode === mode) { selReset("menu"); return; }
    selReset(mode);
    say(mode === "move" ? "Mover: tocá una unidad tuya." : mode === "watch" ? "Vigilar: tocá el centro de la zona 3×3 que querés ver en vivo." : "Reparar: tocá una unidad tuya dañada.");
  });
  ui.chips.addEventListener("click", (e) => {
    if (!e.target.closest("#chip-init") || !match || match.phase !== "attack") return;
    sel.initOn = !sel.initOn;
    hudDirty = true;
    say(sel.initOn ? "Iniciativa lista: tu próxima jugada no gasta el turno." : "Iniciativa guardada.");
  });

  const hudBtn = document.getElementById("hud-toggle");
  hudBtn.addEventListener("click", () => {
    const off = document.body.classList.toggle("hud-off");
    hudBtn.setAttribute("aria-pressed", off ? "false" : "true");
    blip();
  });
  const foldBtn = document.getElementById("hud-fold");
  function setFold(on) {
    document.body.classList.toggle("hud-fold", on);
    foldBtn.setAttribute("aria-pressed", on ? "true" : "false");
    foldBtn.textContent = on ? "▴" : "▾";
    foldBtn.title = on ? "Mostrar el panel de turno" : "Plegar el panel de turno";
    try { localStorage.setItem("parques.fold", on ? "1" : "0"); } catch (e) { /* sin almacenamiento */ }
  }
  try { if (localStorage.getItem("parques.fold") === "1") setFold(true); } catch (e) { /* sin almacenamiento */ }
  foldBtn.addEventListener("click", () => { setFold(!document.body.classList.contains("hud-fold")); blip(); });
  document.getElementById("log-toggle").addEventListener("click", () => {
    document.body.classList.toggle("log-on");
    blip();
  });

  ui.canvas.addEventListener("pointerdown", onPointerDown);
  ui.canvas.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  ui.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("resize", () => {
    if (ui.battle && !ui.battle.classList.contains("hidden")) fit();
  });

  document.getElementById("coach-skip").addEventListener("click", () => { tutoEnd(); say("Tutorial salteado. Podés repetirlo desde el menú."); });
  document.getElementById("coach-ok").addEventListener("click", () => tutoEnd());
  document.getElementById("how").addEventListener("click", () => {
    const pvc = document.querySelector("#modes [data-mode=pvc]");
    if (pvc) pvc.click();
    tutoForce = true;
    startGame();
  });

  function applyChallenge() {
    const q = new URLSearchParams(location.search);
    const pk = q.get("parque");
    const tr = q.get("terreno");
    const inv = q.get("invasor");
    if (q.get("sala") || !(pk || tr || inv)) return;
    const click = (sel) => { const el = document.querySelector(sel); if (el) el.click(); };
    if (C.MAPS[pk]) click("#maps [data-map=" + pk + "]");
    if (C.FLEETS[tr]) click("#terrains [data-terrain=" + tr + "]");
    if (C.NATIONS[inv]) click("#nations [data-nation=" + inv + "]");
    const lede = document.querySelector(".lede");
    if (lede) lede.textContent = "Te desafiaron en " + parkName() + " (" + opts.terrain + "). ¿Aceptás?";
  }
  applyChallenge();

  function setupIntro() {
    const el = document.getElementById("intro");
    if (!el) return;
    const params = new URLSearchParams(location.search);
    if (params.get("tutorial") === "1") tutoForce = true;
    if (store.get(KEY_INTRO) || params.get("sala")) {
      el.classList.add("hidden");
      return;
    }
    el.classList.remove("hidden");
    const close = () => {
      store.set(KEY_INTRO, "1");
      el.classList.add("hidden");
      blip();
    };
    document.getElementById("intro-skip").addEventListener("click", close);
    document.getElementById("intro-go").addEventListener("click", close);
    el.addEventListener("click", (ev) => {
      if (ev.target.closest("button")) return;
      el.classList.add("fast"); // tap: show every line right away
    });
  }
  setupIntro();

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
    turnNo: match.shared ? match.shared.turnNo : 0,
    level: match.shared ? C.warLevel(match.shared) : 0,
    sel: { mode: sel.mode, unit: sel.unit, open: sel.open, initOn: sel.initOn },
    charge: match.side.charge,
    init: match.side.init,
    armor: match.local.reduce((a, u) => a + (u.armor || 0), 0),
    know: { marks: match.know.marks.size, live: match.know.live.size, ghosts: match.know.ghosts.size },
    pickups: match.shared ? match.shared.pickups.map((p) => ({ type: p.type, x: p.x, y: p.y, owner: p.owner || null })) : [],
    zones: match.shared ? C.zonesOf(match.shared, match.role).length : 0,
    foeZones: match.shared ? C.zonesOf(match.shared, C.other(match.role)).length : 0,
    pers: match.aiPers || null,
    movable: match.shared ? match.local.filter((u) => C.moveOptions(match.side, match.shared, u, match.role).length).map((u) => ({ id: u.id, cells: C.cellsOf(u) })) : [],
    handles: moveHandles().map((o) => ({ x: o.h.x, y: o.h.y, dx: o.dx, dy: o.dy, collect: o.collect })),
    repairable: match.shared ? C.repairable(match.side).map((u) => C.cellsOf(u)[0]) : [],
    foeHp: foeHp().left,
    clock: clockLeft,
    sealed,
    localReady,
    remoteReady,
    battleStarted,
    stats: { ...match.stats },
    tuto: tuto ? tuto.step : null
  }) : { phase: "menu" };

  const sala = new URLSearchParams(location.search).get("sala");
  if (sala) {
    opts.mode = "pvp";
    if (window.Peer) joinGame(sala);
    else say("No se pudo cargar el modo en línea.");
  }
})();
