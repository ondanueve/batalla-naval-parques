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
  const ISSUE_TEXT = {
    borde: "No entra: se sale del mapa. Tiene que quedar entera.",
    solape: "No entra: se pisa con otra unidad.",
    tierra: "Ahí hay tierra. Este es un barco: solo puede ir al agua.",
    agua: "Ahí hay agua. Este es un tanque: solo puede ir a tierra.",
    costa: "No entra: cruza la costa. Toda en el agua o toda en tierra."
  };
  const ISSUE_BANNER = {
    borde: "NO ENTRA · se sale",
    solape: "NO ENTRA · se pisa",
    tierra: "NO ENTRA · solo agua",
    agua: "NO ENTRA · solo tierra",
    costa: "NO ENTRA · cruza la costa"
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
  // textos derechos aunque el tablero esté girado
  ["fillText", "strokeText"].forEach((fn) => {
    const orig = ctx[fn].bind(ctx);
    ctx[fn] = function (t, x, y, mw) {
      if (!rotView || !ctx.__inBoard) return mw === undefined ? orig(t, x, y) : orig(t, x, y, mw);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 2);
      if (mw === undefined) orig(t, 0, 0); else orig(t, 0, 0, mw);
      ctx.restore();
    };
  });

  // terreno único: cada mapa es un mapa real (agua y tierra según el lugar); no hay modos de terreno
  const opts = { map: "nahuel", terrain: "mixto", mode: "pvc", nation: "chile", crop: 0, sectors: null, rules: "clasico" };
  // Reglas: Clásico por defecto. Se recuerda solo durante la sesión (nunca en localStorage).
  const KEY_RULES = "parques.rules";
  // Reloaded queda oculto (el código sigue, detrás de esta bandera) hasta que se rehaga ese modo
  const RELOADED_ON = false;
  try { opts.rules = RELOADED_ON ? C.normMode(sessionStorage.getItem(KEY_RULES)) : "clasico"; } catch (e) { opts.rules = "clasico"; }
  const classic = () => opts.rules === "clasico";
  const RULES_NAME = { clasico: "Clásico", reloaded: "Reloaded" };
  // link discreto al sector real del mapa (Google Maps, vista satelital, pestaña nueva)
  // un solo link por mapa: el centro de la franja que forman los dos tableros, con zoom para verlos a ambos
  function geoNow() {
    const inGame = !!match && !ui.battle.classList.contains("hidden");
    return C.geoView(opts.map, null, inGame ? gameSectors() : null);
  }
  function geoUrl() {
    const v = geoNow();
    if (!v) return "https://www.google.com/maps";
    return "https://www.google.com/maps/@" + v.lat + "," + v.lng + "," + v.z + "z/data=!3m1!1e3";
  }
  function paintGeo() {
    const g = C.MAPS[opts.map] && C.MAPS[opts.map].geo;
    const v = geoNow();
    ["map-geo", "board-geo", "ffa-geo"].forEach((id) => {
      const a = document.getElementById(id);
      if (!a) return;
      a.href = geoUrl();
      if (v) a.title = (g ? g.sector + " · " : "") + v.km[0] + " × " + v.km[1] + " km, centro " + v.lat + ", " + v.lng + " (Google Maps, pestaña nueva)";
    });
    const m = document.getElementById("map-geo");
    if (m && g) m.textContent = "Ver " + g.sector + " en Google Maps ↗";
  }
  function applyRules() {
    document.body.classList.toggle("rules-clasico", classic());
    document.body.classList.toggle("rules-reloaded", !classic());
  }
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
  let aiming = false; // dedo apoyado apuntando (dispara al soltar)
  let lastPlaceTag = "";
  let placeNote = "";
  let placeNoteT = 0;
  let pressT = 0;
  let pressRot = false;
  let clockLeft = 60;
  let clockId = 0;
  let busy = false;
  const inbox = [];
  const netLog = [];
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
  // El tutorial enseña solo Clásico. El de Reloaded queda guardado (RELOADED_TUTO) hasta que se rehaga ese modo.
  const RELOADED_TUTO = false;
  const TUTO_RELOADED = {
    0: ["PREPARACIÓN", "Colocá tu flota unidad por unidad. Tocá «Estoy listo» para empezar."],
    1: ["PASO 1 DE 3 · DISPARAR", "Disparar da daño ahora. Tocá cualquier celda del mapa enemigo: no sabés dónde está nadie."],
    2: ["PASO 2 DE 3 · DESARROLLAR", "Maniobrar no hace daño, pero rinde después. Tocá «Maniobrar» y elegí «Apuntar»: el próximo disparo cae en cruz."],
    3: ["PASO 3 DE 3 · COBRAR", "Tocá «Disparar» y una celda: tu carga cae en cruz. Esa es la inversión pagando."],
    4: ["¡LISTO!", "Disparar gana material. Maniobrar gana posición. Repetir una celda es válido: lo que ves viejo puede haber cambiado.", "Entendido"]
  };
  // [título, texto, botón (null = avanza cuando hacés la acción)]
  const TUTO_CLASSIC = {
    0: ["1 DE 4 · UBICÁ TU FLOTA", "Tocá el mapa donde va cada pieza: en el agua es barco, en tierra es tanque. Arrastrala, ⟳ la gira y ✓ la deja. No puede cruzar la costa.", null],
    1: ["2 DE 4 · A LA GUERRA", "Flota lista. Tocá «Estoy listo».", null],
    2: ["3 DE 4 · DISPARÁ", "Tocá una celda del mapa enemigo. No sabés dónde están: probá.", null],
    3: ["4 DE 4 · RESULTADO", "Agua: no había nada. Fuego: le diste. Hundido: cayó la pieza entera. Después tira el rival.", "Siguiente"],
    4: ["¡LISTO!", "Gana quien hunda primero toda la flota enemiga.", "Entendido"]
  };
  let tutoKind = "clasico";
  function tutoCopy() { return tutoKind === "reloaded" ? TUTO_RELOADED : TUTO_CLASSIC; }

  function tutoSave() { store.set(KEY_TUTO, "1"); }
  function pulseOn(el, on) { if (el) el.classList.toggle("pulse", !!on); }
  function tutoRender() {
    const box = document.getElementById("coach");
    if (!box) return;
    document.body.classList.toggle("tuto-on", !!tuto);
    if (!tuto) {
      box.classList.add("hidden");
      pulseOn(ui.ready, false);
      requestAnimationFrame(fit);
      return;
    }
    const c = tutoCopy()[tuto.step].slice();
    const okBtn = document.getElementById("coach-ok");
    document.getElementById("coach-step").textContent = c[0];
    document.getElementById("coach-text").textContent = c[1];
    okBtn.textContent = c[2] || "Entendido";
    okBtn.classList.toggle("hidden", !c[2]);
    document.getElementById("coach-skip").classList.toggle("hidden", tuto.step === 4);
    box.dataset.step = String(tuto.step);
    box.classList.remove("hidden");
    pulseOn(ui.ready, tutoKind === "clasico" ? tuto.step === 1 : tuto.step === 0);
    requestAnimationFrame(fit);
  }
  function tutoStart() {
    if (opts.mode !== "pvc") return;
    if (!classic() && !RELOADED_TUTO) return;
    if (store.get(KEY_TUTO) && !tutoForce) return;
    tutoForce = false;
    tutoKind = classic() ? "clasico" : "reloaded";
    tuto = { step: 0, pending: 0 };
    if (tutoKind === "clasico") stopClock(); // aprendiendo no hay reloj: nada se completa solo
    tutoRender();
  }
  function tutoEnd() {
    if (!tuto) return;
    tuto = null;
    tutoSave();
    tutoRender();
  }
  function tutoGo(step) { tuto.step = step; tuto.pending = 0; if (step === 4) tutoSave(); tutoRender(); hudDirty = true; }
  function tutoNext() {
    if (!tuto) return;
    if (tuto.step >= 4) { tutoEnd(); return; }
    tutoGo(tuto.step + 1);
  }
  function tutoEvent(name) {
    if (!tuto) return;
    if (tutoKind === "clasico") {
      if (name === "placed" && tuto.step === 0) tutoGo(1);
      else if (name === "unplaced" && tuto.step === 1) tutoGo(0);
      else if (name === "ready" && tuto.step <= 1) tutoGo(2);
      else if (name === "shown" && tuto.step === 2) tutoGo(3);
      return;
    }
    if (name === "ready" && tuto.step === 0) { tuto.step = 1; tutoRender(); }
    else if (name === "shot" && tuto.step === 1) tuto.pending = 2;
    else if (name === "man" && tuto.step === 2) tuto.pending = 3;
    else if (name === "shot" && tuto.step === 3) tuto.pending = 4;
  }
  function tutoTurn() {
    if (tutoKind === "clasico") return;
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
  let sayT = 0;
  function say(text) {
    ui.dialogue.textContent = text;
    if (document.body.classList.contains("in-battle") && text) {
      document.body.classList.add("say-on");
      clearTimeout(sayT);
      sayT = setTimeout(() => document.body.classList.remove("say-on"), tuto ? 9000 : 5200);
    }
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
    const job = inbox.shift();
    Promise.resolve()
      // un paso que se cuelga nunca debe trabar la cola (ni la red): a los 15 s se libera
      .then(() => {
        let done = false;
        const run = Promise.resolve().then(job).finally(() => { done = true; });
        const guard = WAIT(15000).then(() => {
          if (done) return;
          console.warn("parques: paso lento liberado");
          netLog.push("TIMEOUT paso " + (window.__parquesStage || "") + " " + Math.round(performance.now() / 100) / 10);
        });
        return Promise.race([run, guard]);
      })
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

  const AI_HINT = {
    normal: "Juega con lo que ve, como vos. Cada personalidad gana más o menos la mitad de las veces.",
    dificil: "Calcula dónde puede estar cada unidad con lo que sabe y remata en línea. No hace trampa: tampoco ve tu flota."
  };
  function selectGroup(root, attr, key) {
    if (!root) return;
    root.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => {
        opts[key] = b.dataset[attr];
        root.querySelectorAll("button").forEach((el) => el.classList.toggle("selected", el === b));
        if (key === "map") applyTheme();
        if (key === "map") paintGeo();
        if (key === "rules") {
          try { sessionStorage.setItem(KEY_RULES, opts.rules); } catch (e) { /* sin sesión */ }
          paintRulesMenu();
  paintGeo();
        }
        if (key === "mode") paintModeMenu();
        blip();
      });
    });
  }

  function paintModeMenu() {
    document.getElementById("ai-block").classList.toggle("hidden", opts.mode !== "pvc");
    const nb = document.getElementById("nations-block");
    if (nb) nb.classList.toggle("hidden", opts.mode === "ffa");
    document.getElementById("start").textContent = opts.mode === "pvp" ? "Crear enlace" : opts.mode === "ffa" ? "Armar la batalla" : "Entrar al parque";
    const h = document.getElementById("mode-hint");
    if (h) h.textContent = opts.mode === "ffa" ? "De 2 a 8, cada uno en su sector del parque. Personas con un enlace y lugares libres para la máquina." : "";
  }
  function destroyNet() {
    try { ffaConns.forEach((c) => { try { c.close(); } catch (e) {} }); } catch (e) {}
    ffaConns = [];
    clearInterval(ffaBeatId); ffaBeatId = 0;
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
    try {
      clearTimeout(ffaTurnT); clearInterval(ffaClockId); ffaClockId = 0; clearTimeout(ffaGraceT); ffaGraceT = 0;
      lobby = null; lobbyEl.classList.add("hidden");
      document.getElementById("rematch").classList.remove("hidden");
      document.getElementById("ffa-rank").classList.add("hidden");
      document.body.classList.remove("ffa");
      stripEl.classList.add("hidden");
      if (opts.mode === "ffa" && !document.querySelector("#modes [data-mode=ffa].selected")) opts.mode = "pvc";
    } catch (e) { /* antes de armar la UI */ }
    const qb = document.getElementById("quit");
    if (qb) qb.classList.add("hidden");
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
    paintGeo();
    ui.stage.classList.remove("under-fire", "shake");
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function showBattle() {
    try { if (!(history.state && history.state.parques)) history.pushState({ parques: 1 }, ""); } catch (e) { /* sin historial */ }
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
  // Pantallas anchas (escritorio, celular acostado): el tablero se gira 90° y llena toda la pantalla.
  // Todo se dibuja en un lienzo "virtual" vertical; los textos se contra-rotan para leerse derechos.
  const ROT_ASPECT = 1.2;
  let rotView = false;
  function isRot(cw, ch) { return cw / Math.max(1, ch) > ROT_ASPECT; }
  // Franja inferior reservada (en px CSS) para Disparar/Maniobrar: así ningún botón tapa celdas.
  const DOCK = 46;
  // cw/ch: tamaño del lienzo virtual (vertical); unit: px de dispositivo por px CSS; rot: tablero girado.
  function geomCss(cw, ch, unit, rot) {
    const dock = DOCK * (unit || 1);
    if (rot) {
      // girado: el borde de abajo de la pantalla es el izquierdo del lienzo virtual
      const gw = Math.max(10, cw - dock);
      return { ox: dock, oy: 0, cellW: gw / C.W, cellH: ch / C.H };
    }
    const bh = Math.max(20, ch - dock);
    const aspect = cw / bh;
    const gw = aspect <= 0.62 ? cw : Math.min(cw, bh * (C.W / C.H) * 1.6);
    return { ox: (cw - gw) / 2, oy: 0, cellW: gw / C.W, cellH: bh / C.H };
  }

  function gridGeom() {
    const dpr = ui.canvas.width / Math.max(1, ui.canvas.clientWidth || ui.canvas.width);
    rotView = isRot(ui.canvas.width, ui.canvas.height);
    const k = rotView ? geomCss(ui.canvas.height, ui.canvas.width, dpr, true) : geomCss(ui.canvas.width, ui.canvas.height, dpr, false);
    return { dpr, padL: k.ox, padT: k.oy, cellW: k.cellW, cellH: k.cellH };
  }

  function cellFromEvent(e, loose) {
    const r = ui.canvas.getBoundingClientRect();
    const rot = isRot(r.width, r.height);
    const k = rot ? geomCss(r.height, r.width, 1, true) : geomCss(r.width, r.height, 1, false);
    if (k.cellW <= 0 || k.cellH <= 0) return null;
    let px = e.clientX - r.left;
    let py = e.clientY - r.top;
    if (rot) { const vx = r.height - py; py = px; px = vx; }
    let x = Math.floor((px - k.ox) / k.cellW);
    let y = Math.floor((py - k.oy) / k.cellH);
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
    if (match.ffa) {
      if (match.phase === "place" || match.phase === "sealed" || match.phase === "lobby") return "local";
      return match.ffa.view === match.ffa.me ? "local" : "remote";
    }
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
    const list = fleet || C.FLEET.map((f, id) => ({ id, size: f.size, name: "" }));
    list.forEach((s) => {
      const el = document.createElement("span");
      el.className = "pip";
      let dead = false;
      let label = s.name + " " + s.size;
      if (fleet) dead = C.shipStatus(s, match.hitsOnLocal).sunk;
      else {
        // del rival solo se sabe el tamaño; el nombre aparece cuando se hunde
        const w = match.wrecks.find((q) => q.uid === s.id);
        dead = !!w;
        label = w ? w.name + " " + s.size : "■".repeat(s.size);
      }
      if (dead) el.classList.add("dead");
      el.textContent = label;
      ui.pips.appendChild(el);
    });
  }

  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  function paintTurnbar(combat) {
    const sh = match.shared;
    ui.turnbar.classList.toggle("hidden", !(combat && sh) || C.isClassic(sh));
    if (!combat || !sh) return;
    if (C.isClassic(sh)) {
      // Clásico: solo la píldora (de quién es el turno y cuánta flota queda a cada lado)
      const pillC = document.getElementById("hud-pill");
      const mineC = match.phase === "attack";
      pillC.className = "l0 classic" + (mineC ? " mine" : "") + (pillC.classList.contains("hint") ? " hint" : "");
      document.getElementById("pill-turn").textContent = mineC ? "Tu turno" : match.phase === "defend" ? "Turno rival" : "Disparo…";
      document.getElementById("pill-war").textContent = "";
      document.getElementById("pill-next").textContent = "";
      document.getElementById("pill-hp").textContent = hpOf(match.local, match.hitsOnLocal).left + " vs " + foeHp().left;
      return;
    }
    const lvl = C.warLevel(sh);
    const round = C.roundOf(sh);
    ui.warmeter.className = "l" + lvl;
    ui.warName.textContent = C.WAR_NAMES[lvl].toUpperCase();
    const left = C.roundsToNextLevel(sh);
    ui.warSub.textContent = lvl >= 3 ? "Ronda " + round + " · sin maniobras" : "Ronda " + round + " · " + plural(left, "ronda", "rondas") + " para " + C.WAR_NAMES[lvl + 1];
    ui.warmeter.querySelector(".wm i").style.width = Math.min(100, Math.round((Math.min(round, 18) / 18) * 100)) + "%";
    const myTurn = match.phase === "attack";
    const side = match.side;
    const pill = document.getElementById("hud-pill");
    const hinting = pill.classList.contains("hint");
    pill.className = "l" + lvl + (myTurn ? " mine" : "") + (hinting ? " hint" : "") + (lvl < 3 && left <= 1 ? " soon" : "");
    document.getElementById("pill-turn").textContent = myTurn ? "Tu turno" : match.phase === "defend" ? "Turno rival" : "Disparos…";
    document.getElementById("pill-war").textContent = C.WAR_NAMES[lvl];
    // pronóstico de la escalada: cuánto falta para el próximo nivel
    document.getElementById("pill-next").textContent = lvl >= 3 ? "" : "en " + plural(left, "ronda", "rondas") + ": " + C.WAR_NAMES[lvl + 1];
    document.getElementById("pill-hp").textContent = hpOf(match.local, match.hitsOnLocal).left + " vs " + foeHp().left;
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
    const boosted = myTurn && ((side.charge > 0 && sh.turnNo < side.chargeUntil) || lvl >= 2);
    ui.shoot.classList.toggle("boost", !!boosted);
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
    pulseOn(ui.dev, !!tuto && tutoKind === "reloaded" && tuto.step === 2 && !sel.open && myTurn);
    pulseOn(ui.shoot, !!tuto && tutoKind === "reloaded" && (tuto.step === 3 || tuto.step === 1) && myTurn && !sel.open);
    const ap = ui.manu.querySelector('[data-man="apuntar"]');
    pulseOn(ap, !!tuto && tuto.step === 2 && open);
  }

  function flushHud() {
    const fighting = !!match && (match.phase === "attack" || match.phase === "defend" || match.phase === "resolving");
    if (document.body.classList.contains("in-battle") !== fighting) {
      document.body.classList.toggle("in-battle", fighting);
      if (fighting) {
        setOpen(false);
        // primera batalla: la píldora late un rato para que se descubra que se abre
        if (!store.get("parques.pill.v1")) {
          const pl = document.getElementById("hud-pill");
          pl.classList.add("hint");
          setTimeout(() => pl.classList.remove("hint"), 9000);
        }
      }
    }
    document.getElementById("hud-pill").classList.toggle("hidden", !fighting);
    const endedNow = !!match && match.phase === "end";
    if (document.body.classList.contains("ended") !== endedNow) document.body.classList.toggle("ended", endedNow);
    const placingNow = !!match && (match.phase === "place" || match.phase === "sealed");
    if (document.body.classList.contains("placing") !== placingNow) document.body.classList.toggle("placing", placingNow);
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
    ui.rotate.classList.add("hidden");
    ui.ready.classList.toggle("hidden", !((placing && placedAll()) || waitingReady));
    paintPlaceMsg(placing, waitingReady);
    ui.ready.disabled = waitingReady;
    ui.ready.textContent = waitingReady ? "Esperando" : "Estoy listo";
    paintTurnbar(combat);
    ui.rotate.disabled = sealed || !hand;
  }

  function paintPlaceMsg(placing, waitingReady) {
    const box = document.getElementById("place-msg");
    if (!box) return;
    let main = "";
    let sub = "";
    if (placing) {
      const next = match.local.find((u) => u.unplaced);
      const secs = tuto ? "sin apuro" : Math.max(0, clockLeft) + " s";
      const cur = hand ? hand.ship : next;
      const curName = hand ? C.unitName(hand.ship.id, preview && hand.set ? handKind(preview.x, preview.y) : (hand.ship.unplaced ? null : hand.ship.kind)) : (cur ? cur.name : "");
      if (hand && !next) {
        main = "Ajustá tu " + curName.toLowerCase() + ".";
        sub = placeNote || (secs + " · arrastrá · tocá para girar · ✓");
      } else if (next) {
        main = "Posicioná tu " + curName.toLowerCase() + ".";
        sub = placeNote || (secs + " · " + (hand && hand.set ? "arrastrá · tocá para girar · ✓" : "tocá dónde va"));
        
      } else {
        main = "Flota lista.";
        sub = placeNote || (secs + " · tocá una unidad para ajustarla, o Estoy listo");
      }
    } else if (waitingReady) {
      main = "Flota cerrada.";
      sub = "Esperando al rival…";
    }
    if (sub && (placing || waitingReady) && RELOADED_ON) sub = RULES_NAME[opts.rules] + " · " + sub;
    const a = box.firstElementChild, b = box.lastElementChild;
    if (a.textContent !== main) a.textContent = main;
    if (b.textContent !== sub) b.textContent = sub;
    box.classList.toggle("hidden", !main);
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

  // cada jugador juega en su propio sector geográfico (todos pegados, nunca el mismo)
  function gameSectors() { return (match && match.ffa) ? match.ffa.seats.map((q) => q.tile) : opts.sectors; }
  function myBoard() {
    if (match && match.ffa) return match.ffa.seats[match.ffa.me].tile;
    return C.boardKey(opts.sectors || [0, 1], match ? match.role : "arg");
  }
  function foeBoard() {
    if (match && match.ffa) { const t = match.ffa.seats[match.ffa.target]; return t ? t.tile : myBoard(); }
    return C.boardKey(opts.sectors || [0, 1], match ? C.other(match.role) : "inv");
  }
  function viewBoard() { return viewKind() === "local" ? myBoard() : foeBoard(); }
  function isLand(x, y) {
    return C.isLand(opts.terrain, opts.map, viewBoard(), x, y);
  }

  function asset(path) {
    const nodes = document.querySelectorAll("script[src*='game.js']");
    const src = nodes.length ? nodes[nodes.length - 1].getAttribute("src") || "game.js" : "game.js";
    return src.replace(/game\.js(\?.*)?$/, path);
  }

  function parkImage() {
    const id = (opts.map || "nahuel") + "-s" + String(viewBoard()).padStart(2, "0");
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
    if (rotView) { ctx.translate(0, h); ctx.rotate(-Math.PI / 2); }
    ctx.__inBoard = true;
    ctx.translate(ox, oy);
    if (zoom.z > 0.002) {
      ctx.translate(zoom.x, zoom.y);
      ctx.scale(1 + zoom.z, 1 + zoom.z);
      ctx.translate(-zoom.x, -zoom.y);
    }

    const gw = g.cellW * C.W;
    const gh = g.cellH * C.H;
    const img = parkImage();
    if (img && img.complete && img.naturalWidth) drawBackdrop(img, rotView ? h : w, rotView ? w : h);
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
          if (isLand(cx, cy)) return;
          const a = Math.max(0, Math.sin(time / 600 + sp.ph));
          if (a < 0.2) return;
          ctx.globalAlpha = a * 0.55;
          const px = g.padL + (sp.x * C.W) * g.cellW;
          const py = g.padT + (sp.y * C.H) * g.cellH;
          const r = (0.8 + a * 1.6) * g.dpr;
          ctx.fillRect(px - r, py - r * 0.3, r * 2, r * 0.6);
          ctx.fillRect(px - r * 0.3, py - r, r * 0.6, r * 2);
        });
        // sombras de nubes que cruzan el parque despacio
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "multiply";
        for (let k = 0; k < 3; k++) {
          const u = ((time / 70000 + k * 0.41) % 1.5) - 0.25;
          const cx = g.padL + u * gw;
          const cy = g.padT + gh * (0.18 + 0.32 * k) + Math.sin(time / 9000 + k * 2) * gh * 0.04;
          const rr = gw * (0.38 + 0.08 * k);
          const cg = ctx.createRadialGradient(cx, cy, rr * 0.15, cx, cy, rr);
          cg.addColorStop(0, "rgba(40,52,80,.28)");
          cg.addColorStop(1, "rgba(40,52,80,0)");
          ctx.fillStyle = cg;
          ctx.save();
          ctx.translate(cx, cy); ctx.scale(1.5, 0.75); ctx.translate(-cx, -cy);
          ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        ctx.restore();
      }
    } else {
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, theme.deep);
      bg.addColorStop(1, theme.sea);
      ctx.fillStyle = bg;
      ctx.fillRect(g.padL, g.padT, gw, gh);
    }

    {
      for (let y = 0; y < C.H; y++) {
        for (let x = 0; x < C.W; x++) {
          const p = cellPx(g, x, y);
          ctx.fillStyle = isLand(x, y) ? "rgba(250, 204, 21, .15)" : "rgba(56, 189, 248, .09)";
          ctx.fillRect(p.x, p.y, g.cellW, g.cellH);
        }
      }
    }
    drawFrontier(g, gw, gh);
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
    ctx.__inBoard = false;
    if (flashScreen > 0.01) {
      ctx.fillStyle = "rgba(255,236,200," + (flashScreen * 0.42).toFixed(3) + ")";
      ctx.fillRect(0, 0, w, h);
    }
    flushHud();
    positionPlaceCtl();
  }

  function unitDir(ship) {
    if (ship.horizontal) return { x: -1, y: 0 };
    return { x: 0, y: -1 };
  }
  /* ---------- Tropas: siluetas vistas desde arriba (canvas propio, sin assets externos) ----------
     Material realista (verde oliva para blindados, gris naval para barcos) y el color de cada unidad
     como franja de identificación, para que se distingan en el móvil. Con color forzado (fantasma
     verde/rojo o restos) toda la unidad toma ese tono. */
  function hexRgb(h) {
    const m = /^#?([0-9a-f]{6})$/i.exec(h || "");
    if (!m) return [128, 128, 128];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function shade(h, k) {
    // k > 0 aclara hacia blanco, k < 0 oscurece hacia negro
    const c = hexRgb(h).map((v) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)));
    return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")";
  }
  function rr(x, y, w, h, r) { roundRect(x, y, w, h, r); }
  function unitFrame(g, ship) {
    const dir = unitDir(ship);
    const along = ship.horizontal ? g.cellW : g.cellH;
    const across = ship.horizontal ? g.cellH : g.cellW;
    const p0 = cellPx(g, ship.x, ship.y);
    const len = ship.size * along;
    const cx = p0.x + (ship.horizontal ? len / 2 : g.cellW / 2);
    const cy = p0.y + (ship.horizontal ? g.cellH / 2 : len / 2);
    return { cx, cy, ang: Math.atan2(dir.y, dir.x), along, across, len };
  }

  function drawTankCell(g, x, y, dir, base, accent, name, lead) {
    const p = cellPx(g, x, y);
    const bw = Math.min(g.cellW, g.cellH);
    const cx = p.x + g.cellW * 0.5, cy = p.y + g.cellH * 0.5;
    const apc = /blindado/i.test(name || "");
    const heavy = /pesado/i.test(name || "");
    const light = /ligero|jeep/i.test(name || "");
    ctx.save();
    // sombra proyectada (siempre hacia abajo a la derecha de la pantalla)
    ctx.save();
    ctx.translate(cx + bw * 0.05, cy + bw * 0.07);
    ctx.rotate(Math.atan2(dir.y, dir.x));
    ctx.fillStyle = "rgba(0,0,0,.32)";
    rr(-bw * 0.44, -bw * 0.4, bw * 0.88, bw * 0.8, bw * 0.12);
    ctx.fill();
    ctx.restore();
    ctx.translate(cx, cy);
    ctx.rotate(Math.atan2(dir.y, dir.x));
    const lw = Math.max(1, g.dpr * 0.7);
    if (apc) {
      // ruedas (8x8)
      ctx.fillStyle = "#1b1f24";
      for (let i = 0; i < 4; i++) {
        const wx = -bw * 0.33 + i * bw * 0.21;
        rr(wx, -bw * 0.4, bw * 0.13, bw * 0.1, bw * 0.03); ctx.fill();
        rr(wx, bw * 0.3, bw * 0.13, bw * 0.1, bw * 0.03); ctx.fill();
      }
    } else {
      // orugas con eslabones
      [-1, 1].forEach((s) => {
        const ty = s < 0 ? -bw * 0.41 : bw * 0.24;
        ctx.fillStyle = "#1d2126";
        rr(-bw * 0.43, ty, bw * 0.86, bw * 0.17, bw * 0.06); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.14)";
        ctx.lineWidth = lw;
        ctx.beginPath();
        for (let k = -0.38; k <= 0.39; k += 0.085) { ctx.moveTo(bw * k, ty + bw * 0.02); ctx.lineTo(bw * k, ty + bw * 0.15); }
        ctx.stroke();
      });
    }
    // casco con bisel (luz de arriba a la izquierda)
    const hullG = ctx.createLinearGradient(0, -bw * 0.26, 0, bw * 0.26);
    hullG.addColorStop(0, shade(base, 0.28));
    hullG.addColorStop(0.5, base);
    hullG.addColorStop(1, shade(base, -0.35));
    ctx.fillStyle = hullG;
    ctx.beginPath();
    ctx.moveTo(-bw * 0.4, -bw * 0.26);
    ctx.lineTo(bw * 0.3, -bw * 0.26);
    ctx.lineTo(bw * 0.42, -bw * 0.16);
    ctx.lineTo(bw * 0.42, bw * 0.16);
    ctx.lineTo(bw * 0.3, bw * 0.26);
    ctx.lineTo(-bw * 0.4, bw * 0.26);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.55)";
    ctx.lineWidth = lw;
    ctx.stroke();
    // placa frontal inclinada
    ctx.fillStyle = "rgba(255,255,255,.16)";
    ctx.beginPath();
    ctx.moveTo(bw * 0.3, -bw * 0.26); ctx.lineTo(bw * 0.42, -bw * 0.16); ctx.lineTo(bw * 0.42, bw * 0.16); ctx.lineTo(bw * 0.3, bw * 0.26);
    ctx.closePath(); ctx.fill();
    // rejilla del motor (atrás)
    ctx.strokeStyle = "rgba(0,0,0,.35)";
    ctx.beginPath();
    for (let k = 0; k < 4; k++) { const gx = -bw * (0.36 - k * 0.045); ctx.moveTo(gx, -bw * 0.15); ctx.lineTo(gx, bw * 0.15); }
    ctx.stroke();
    // franja de identificación (color de la unidad)
    ctx.fillStyle = accent;
    ctx.fillRect(-bw * 0.21, -bw * 0.26, bw * 0.07, bw * 0.52);
    if (apc) {
      ctx.fillStyle = shade(base, -0.25);
      rr(-bw * 0.06, -bw * 0.1, bw * 0.2, bw * 0.2, bw * 0.04); ctx.fill();
      ctx.strokeStyle = "#11151a"; ctx.lineWidth = Math.max(1.5, bw * 0.05);
      ctx.beginPath(); ctx.moveTo(bw * 0.12, 0); ctx.lineTo(bw * 0.36, 0); ctx.stroke();
      ctx.restore();
      return;
    }
    // cañón (sobresale apenas hacia adelante)
    const tr = bw * (heavy ? 0.2 : light ? 0.145 : 0.17);
    const tx = -bw * 0.02;
    ctx.fillStyle = "#15191d";
    const bl = bw * (heavy ? 0.62 : light ? 0.5 : 0.56);
    const bt = Math.max(1.6, bw * (heavy ? 0.075 : 0.06));
    ctx.fillRect(tx, -bt / 2, bl, bt);
    ctx.fillRect(tx + bl - bw * 0.07, -bt * 0.85, bw * 0.07, bt * 1.7); // freno de boca
    // torreta
    const tg = ctx.createRadialGradient(tx - tr * 0.35, -tr * 0.35, tr * 0.1, tx, 0, tr * 1.1);
    tg.addColorStop(0, shade(base, 0.38));
    tg.addColorStop(1, shade(base, -0.3));
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(tx + tr * 1.05, -tr * 0.55);
    ctx.lineTo(tx + tr * 1.05, tr * 0.55);
    ctx.lineTo(tx + tr * 0.3, tr);
    ctx.lineTo(tx - tr * 0.95, tr * 0.8);
    ctx.lineTo(tx - tr * 1.15, 0);
    ctx.lineTo(tx - tr * 0.95, -tr * 0.8);
    ctx.lineTo(tx + tr * 0.3, -tr);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.6)";
    ctx.lineWidth = lw;
    ctx.stroke();
    // escotilla
    ctx.fillStyle = shade(base, -0.45);
    ctx.beginPath(); ctx.arc(tx - tr * 0.35, -tr * 0.3, tr * 0.28, 0, Math.PI * 2); ctx.fill();
    if (lead) {
      // la punta de la columna lleva un banderín blanco: se lee el sentido de un vistazo
      ctx.fillStyle = "rgba(255,255,255,.95)";
      ctx.beginPath(); ctx.arc(tx - tr * 0.35, tr * 0.38, Math.max(1.5, tr * 0.2), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawShipHull(g, ship, base, accent) {
    const f = unitFrame(g, ship);
    const name = ship.name || "";
    const sub = /submarino/i.test(name);
    const carrier = /portaaviones/i.test(name);
    const boat = /lancha/i.test(name);
    const half = f.len / 2 - f.along * 0.06;
    const B = f.across * (sub ? 0.26 : carrier ? 0.4 : boat ? 0.3 : 0.34); // media manga
    const lw = Math.max(1, g.dpr * 0.8);
    ctx.save();
    ctx.translate(f.cx, f.cy);
    ctx.rotate(f.ang);
    // estela y ola de proa (espuma)
    {
      // estela: espuma que se abre y se apaga detrás de la popa (sin salirse de la celda de al lado)
      const wg = ctx.createLinearGradient(-half, 0, -half - f.along * 0.42, 0);
      wg.addColorStop(0, "rgba(255,255,255,.4)");
      wg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = wg;
      ctx.beginPath();
      ctx.moveTo(-half + f.along * 0.05, -B * 0.55);
      ctx.quadraticCurveTo(-half - f.along * 0.2, -B * 0.7, -half - f.along * 0.42, -B * 1.05);
      ctx.lineTo(-half - f.along * 0.42, B * 1.05);
      ctx.quadraticCurveTo(-half - f.along * 0.2, B * 0.7, -half + f.along * 0.05, B * 0.55);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.35)";
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(half + f.along * 0.04, 0); ctx.quadraticCurveTo(half - f.along * 0.2, -B * 1.25, half - f.along * 0.55, -B * 1.3);
      ctx.moveTo(half + f.along * 0.04, 0); ctx.quadraticCurveTo(half - f.along * 0.2, B * 1.25, half - f.along * 0.55, B * 1.3);
      ctx.stroke();
    }
    // casco
    const hull = () => {
      ctx.beginPath();
      if (sub) {
        ctx.ellipse(0, 0, half, B, 0, 0, Math.PI * 2);
        return;
      }
      ctx.moveTo(half + f.along * 0.04, 0);
      ctx.bezierCurveTo(half - f.along * 0.25, -B * 0.95, half - f.along * 0.6, -B, half - f.along * 0.9, -B);
      ctx.lineTo(-half + f.along * 0.18, -B);
      ctx.quadraticCurveTo(-half, -B, -half, -B * 0.6);
      ctx.lineTo(-half, B * 0.6);
      ctx.quadraticCurveTo(-half, B, -half + f.along * 0.18, B);
      ctx.lineTo(half - f.along * 0.9, B);
      ctx.bezierCurveTo(half - f.along * 0.6, B, half - f.along * 0.25, B * 0.95, half + f.along * 0.04, 0);
      ctx.closePath();
    };
    ctx.save();
    ctx.translate(f.along * 0.05, f.across * 0.08);
    ctx.fillStyle = "rgba(0,0,0,.3)";
    hull(); ctx.fill();
    ctx.restore();
    const hg = ctx.createLinearGradient(0, -B, 0, B);
    hg.addColorStop(0, shade(base, 0.3));
    hg.addColorStop(0.45, base);
    hg.addColorStop(1, shade(base, -0.4));
    ctx.fillStyle = hg;
    hull(); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.6)";
    ctx.lineWidth = lw;
    ctx.stroke();
    // borde de color: identifica la unidad sin perder el material
    ctx.save();
    hull(); ctx.clip();
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(2, B * 0.32);
    hull(); ctx.stroke();
    ctx.restore();
    const deck = shade(base, carrier ? -0.35 : 0.18);
    if (sub) {
      // vela (torreta) y timones
      ctx.fillStyle = shade(base, -0.45);
      rr(half * 0.15, -B * 0.32, f.along * 0.5, B * 0.64, B * 0.3); ctx.fill();
      ctx.fillRect(-half * 0.92, -B * 1.05, f.along * 0.12, B * 2.1);
      ctx.strokeStyle = "rgba(255,255,255,.25)";
      ctx.beginPath(); ctx.moveTo(-half * 0.7, 0); ctx.lineTo(half * 0.8, 0); ctx.stroke();
    } else if (carrier) {
      // cubierta de vuelo: pista, marcas y la isla a estribor
      ctx.fillStyle = deck;
      rr(-half + f.along * 0.1, -B * 0.82, f.len - f.along * 0.55, B * 1.64, B * 0.2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.75)";
      ctx.lineWidth = lw;
      ctx.setLineDash([f.along * 0.18, f.along * 0.12]);
      ctx.beginPath(); ctx.moveTo(-half + f.along * 0.25, 0); ctx.lineTo(half - f.along * 0.5, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-half + f.along * 0.3, B * 0.45); ctx.lineTo(half * 0.35, -B * 0.55); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = shade(base, 0.25);
      rr(-f.along * 0.3, B * 0.42, f.along * 0.9, B * 0.42, B * 0.08); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,.45)";
      ctx.fillRect(f.along * 0.05, B * 0.5, f.along * 0.18, B * 0.26);
      // elevadores de aviones (dos placas laterales)
      ctx.fillStyle = "rgba(255,255,255,.12)";
      ctx.fillRect(-half + f.along * 0.6, -B * 0.8, f.along * 0.35, B * 0.3);
      ctx.fillRect(f.along * 0.2, -B * 0.8, f.along * 0.35, B * 0.3);
    } else {
      // cubierta, superestructura con puente, chimenea y torretas
      ctx.fillStyle = deck;
      ctx.beginPath(); ctx.ellipse(0, 0, half * 0.82, B * 0.62, 0, 0, Math.PI * 2); ctx.fill();
      const bridgeX = boat ? -f.along * 0.1 : f.len * 0.08;
      const bw2 = boat ? f.along * 0.5 : f.along * Math.min(1.1, 0.35 * ship.size);
      const sg = ctx.createLinearGradient(0, -B * 0.5, 0, B * 0.5);
      sg.addColorStop(0, shade(base, boat ? 0.65 : 0.45));
      sg.addColorStop(1, shade(base, boat ? 0.1 : -0.15));
      ctx.fillStyle = sg;
      rr(bridgeX - bw2 / 2, -B * 0.46, bw2, B * 0.92, B * 0.18); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.lineWidth = lw; ctx.stroke();
      // ventanas del puente
      ctx.fillStyle = "rgba(15,23,42,.85)";
      ctx.fillRect(bridgeX + bw2 / 2 - f.along * 0.1, -B * 0.36, f.along * 0.06, B * 0.72);
      if (!boat) {
        ctx.fillStyle = "#2a2f36";
        ctx.beginPath(); ctx.ellipse(bridgeX - bw2 / 2 - f.along * 0.16, 0, f.along * 0.13, B * 0.28, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,.6)";
        ctx.beginPath(); ctx.ellipse(bridgeX - bw2 / 2 - f.along * 0.16, 0, f.along * 0.07, B * 0.15, 0, 0, Math.PI * 2); ctx.fill();
        const turret = (tx, facing) => {
          const r = Math.min(B * 0.42, f.along * 0.22);
          ctx.fillStyle = "#1c2026";
          const bl = r * 2.1;
          ctx.fillRect(tx, -r * 0.32, facing * bl, r * 0.22);
          ctx.fillRect(tx, r * 0.1, facing * bl, r * 0.22);
          const tg = ctx.createRadialGradient(tx - r * 0.3, -r * 0.3, r * 0.1, tx, 0, r);
          tg.addColorStop(0, shade(base, 0.45)); tg.addColorStop(1, shade(base, -0.3));
          ctx.fillStyle = tg;
          ctx.beginPath(); ctx.arc(tx, 0, r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = lw; ctx.stroke();
        };
        turret(half - f.along * 0.75, 1);
        if (ship.size >= 4) turret(half - f.along * 1.35, 1);
        if (ship.size >= 3) turret(-half + f.along * 0.45, -1);
      }
    }
    // proa: punto blanco (orientación de un vistazo)
    ctx.fillStyle = "rgba(255,255,255,.95)";
    ctx.beginPath(); ctx.arc(half - f.along * (sub ? 0.25 : 0.32), 0, Math.max(1.5, Math.min(f.along, f.across) * 0.07), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawHull(g, ship, alpha, color) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const kind = ship.kind || "barco";
    // material realista; el color propio de la unidad queda como franja de identificación
    const base = color || (kind === "tanque" ? "#5f6b3a" : "#7b8794");
    const accent = color ? shade(color, 0.25) : (ship.color || "#e5e7eb");
    if (kind === "tanque") {
      const dir = unitDir(ship);
      for (let i = 0; i < ship.size; i++) {
        const c = ship.horizontal ? { x: ship.x + i, y: ship.y } : { x: ship.x, y: ship.y + i };
        drawTankCell(g, c.x, c.y, dir, base, accent, ship.name, i === 0);
      }
    } else {
      drawShipHull(g, ship, base, accent);
    }
    ctx.restore();
  }

  // frontera: el borde del tablero pegado al otro rectángulo (sutil; el sur es Argentina, el norte el invasor)
  // fronteras: los bordes del sector pegados a otro sector en juego (dorado punteado, sutil)
  function sectorOwner(k) {
    if (match && match.ffa) { const q = match.ffa.seats.find((t) => t.tile === k); return q || null; }
    return null;
  }
  function drawFrontier(g, gw, gh) {
    if (!match) return;
    const here = viewBoard();
    const inPlay = gameSectors() || [];
    const edges = C.tileNeighbors(opts.map, here).filter((nb) => inPlay.includes(nb.k));
    if (!edges.length) return;
    const depth = Math.min(g.cellW, g.cellH) * 0.55;
    const mine = viewKind() === "local";
    edges.forEach((nb, idx) => {
      ctx.save();
      const horiz = nb.dir === "n" || nb.dir === "s";
      const x0 = nb.dir === "e" ? g.padL + gw : g.padL;
      const y0 = nb.dir === "s" ? g.padT + gh : g.padT;
      const inward = nb.dir === "n" || nb.dir === "o" ? 1 : -1;
      const lg = horiz ? ctx.createLinearGradient(0, y0, 0, y0 + inward * depth) : ctx.createLinearGradient(x0, 0, x0 + inward * depth, 0);
      lg.addColorStop(0, "rgba(253, 224, 71, .26)");
      lg.addColorStop(1, "rgba(253, 224, 71, 0)");
      ctx.fillStyle = lg;
      if (horiz) ctx.fillRect(g.padL, inward > 0 ? y0 : y0 - depth, gw, depth);
      else ctx.fillRect(inward > 0 ? x0 : x0 - depth, g.padT, depth, gh);
      ctx.strokeStyle = "rgba(253, 224, 71, .6)";
      ctx.lineWidth = Math.max(1.5, 1.6 * g.dpr);
      ctx.setLineDash([6 * g.dpr, 5 * g.dpr]);
      ctx.beginPath();
      if (horiz) { ctx.moveTo(g.padL, y0 + inward); ctx.lineTo(g.padL + gw, y0 + inward); }
      else { ctx.moveTo(x0 + inward, g.padT); ctx.lineTo(x0 + inward, g.padT + gh); }
      ctx.stroke();
      ctx.setLineDash([]);
      // etiqueta: en todos contra todos, la bandera del vecino; en 1 vs 1, dónde está el otro
      const owner = sectorOwner(nb.k);
      const label = owner ? owner.flag : (mine ? "frontera: allá está el enemigo" : "frontera: allá está tu territorio");
      const fs = Math.max(9, Math.floor(Math.min(g.cellW, g.cellH) * (owner ? 0.42 : 0.24)));
      ctx.font = "800 " + fs + "px Nunito, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = 0.8;
      const lx = horiz ? (owner ? g.padL + gw * (0.5 + 0.18 * (idx % 2 ? 1 : -1) * 0) : g.padL + gw - (owner ? gw / 2 : 0)) : x0 + inward * fs * 0.8;
      const ly = horiz ? y0 + inward * fs * 0.8 : g.padT + gh / 2;
      if (!owner) { ctx.textAlign = horiz ? "right" : "center"; }
      const tx = !owner && horiz ? g.padL + gw - 6 * g.dpr : lx;
      ctx.lineWidth = 3 * g.dpr;
      ctx.strokeStyle = "rgba(2,6,23,.75)";
      let px = tx, py = ly;
      if (!owner && !horiz) { // borde este/oeste: el texto va a lo largo del borde, para que no se corte
        ctx.translate(x0 + inward * fs * 0.8, g.padT + gh / 2);
        ctx.rotate(inward > 0 ? -Math.PI / 2 : Math.PI / 2);
        ctx.textAlign = "center"; px = 0; py = 0;
      }
      if (!owner) ctx.strokeText(label, px, py);
      ctx.fillStyle = "#fde68a";
      ctx.fillText(label, px, py);
      ctx.restore();
    });
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
    // girado: la esquina sup-izq en pantalla es la sup-der del tablero virtual
    const lx = rotView ? b.x + b.w - 3 * g.dpr : b.x + 4 * g.dpr;
    const ly = rotView ? b.y + 4 * g.dpr : b.y + 3 * g.dpr;
    ctx.strokeText(label, lx, ly);
    ctx.fillStyle = mine ? "#a5f3fc" : "#fed7aa";
    ctx.fillText(label, lx, ly);
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
    if (rotView) { ctx.translate(c.x, c.y); ctx.rotate(Math.PI / 2); ctx.translate(-c.x, -c.y); }
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
              if (chosen) drawHull(g, { x: o.x, y: o.y, size: u.size, horizontal: u.horizontal, kind: u.kind, color: u.color, name: u.name }, 0.88, "#4ade80");
            });
            hs.forEach((o) => {
              const chosen = sel.dest && sel.dest.dx === o.dx && sel.dest.dy === o.dy;
              drawChevron(g, o.h, o, time, chosen);
            });
          }
        }
      }
      if (hand && preview) {
        const med = handKind(preview.x, preview.y);
        const ghost = {
          x: preview.x,
          y: preview.y,
          size: hand.ship.size,
          horizontal: hand.horizontal,
          kind: med || "barco",
          name: C.unitName(hand.ship.id, med),
          color: hand.ship.color
        };
        const issue = handIssue(ghost.x, ghost.y);
        drawHull(g, ghost, 0.92, issue ? "#f87171" : "#4ade80");
        if (issue) {
          drawIllegalMarks(g, ghost);
        }
      }
    } else {
      match.wrecks.forEach((w) => {
        if (!w.cells || !w.cells.length) return;
        const horizontal = w.cells.length < 2 || w.cells[0].y === w.cells[1].y;
        const unit = {
          x: Math.min.apply(null, w.cells.map((c) => c.x)),
          y: Math.min.apply(null, w.cells.map((c) => c.y)),
          size: w.cells.length,
          horizontal,
          kind: w.kind || "barco",
          name: w.name,
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
            const big = pat.cells.length > 1;
            const pul = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(time / 140);
            const rgb = pat.level >= 2 || pat.cells.length > 5 ? "248,113,113" : big ? "251,146,60" : "255,255,255";
            ctx.fillStyle = "rgba(" + rgb + "," + (big ? 0.26 + 0.16 * pul : 0.2) + ")";
            ctx.strokeStyle = "rgba(" + rgb + "," + (0.55 + 0.4 * pul) + ")";
            ctx.lineWidth = Math.max(1.5, 2 * g.dpr);
            pat.cells.forEach((c) => {
              if (!C.inBounds(c.x, c.y)) return;
              const p = cellPx(g, c.x, c.y);
              ctx.fillRect(p.x + 1, p.y + 1, g.cellW - 2, g.cellH - 2);
              if (big) ctx.strokeRect(p.x + 2, p.y + 2, g.cellW - 4, g.cellH - 4);
            });
            // mira en el centro
            const cc = cellCenter(g, preview.x, preview.y);
            const rr = Math.min(g.cellW, g.cellH) * (0.3 + 0.05 * pul);
            ctx.strokeStyle = "rgba(255,255,255,.9)";
            ctx.beginPath();
            ctx.arc(cc.x, cc.y, rr, 0, Math.PI * 2);
            ctx.moveTo(cc.x - rr * 1.5, cc.y); ctx.lineTo(cc.x - rr * 0.5, cc.y);
            ctx.moveTo(cc.x + rr * 0.5, cc.y); ctx.lineTo(cc.x + rr * 1.5, cc.y);
            ctx.moveTo(cc.x, cc.y - rr * 1.5); ctx.lineTo(cc.x, cc.y - rr * 0.5);
            ctx.moveTo(cc.x, cc.y + rr * 0.5); ctx.lineTo(cc.x, cc.y + rr * 1.5);
            ctx.stroke();
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
        vx: rotView ? -Math.sin(a) * sp : Math.cos(a) * sp,
        vy: rotView ? Math.cos(a) * sp : Math.sin(a) * sp,
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

  // desplazamiento "hacia arriba en pantalla" en coordenadas del lienzo (sirve con el tablero girado)
  function upOff(g, k) { return rotView ? { x: g.cellW * k, y: 0 } : { x: 0, y: -g.cellH * k }; }

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
    const uo = upOff(g, 0.6);
    floats.push({ x: sx + uo.x, y: sy + uo.y, vy: -26 * g.dpr, life: 1.4, color: incoming ? "#fecaca" : "#fde047", text: incoming ? "PERDIDO" : "HUNDIDO", size: 22 });
    if (!reduceMotion) {
      // explosiones en cadena a lo largo de la unidad y, al final, ondas de agua/polvo donde se hundió
      const jk = juke();
      cells.forEach((c, i) => setTimeout(() => {
        const g2 = gridGeom();
        const p = cellCenter(g2, c.x, c.y);
        addParts(14, { kind: "spark", x: p.x, y: p.y, sp: [120 * g2.dpr, 340 * g2.dpr], r: [1.6 * g2.dpr, 3.8 * g2.dpr], decay: [1.1, 2], g: 200 * g2.dpr, color: ["#fff7ed", "#fde047", "#f97316"] });
        addParts(5, { kind: "smoke", x: p.x, y: p.y, spread: g2.cellW * 0.4, sp: [14 * g2.dpr, 70 * g2.dpr], arc: [-Math.PI * 0.9, -Math.PI * 0.1], r: [g2.cellW * 0.22, g2.cellW * 0.4], grow: g2.cellW * 1.4, decay: [0.3, 0.55], g: 0, color: ["#1f2937", "#334155", "#57534e"] });
        shocks.push({ px: p.x, py: p.y, life: 1, max: g2.cellW * 2.6, color: "rgba(255,210,140,A)" });
        trauma = Math.min(1, trauma + 0.12);
        if (jk && jk.sfx.hit) jk.sfx.hit();
      }, 260 + i * 140));
      const land = isLand(cells[0].x, cells[0].y);
      setTimeout(() => cells.forEach((c, i) => rings.push({ x: c.x, y: c.y, life: 1, color: land ? "#d6d3d1" : "#7dd3fc", size: 3.2, w: 2, delay: i * 0.08 })), 300 + cells.length * 140);
    }
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
    return pat + (incoming ? "El disparo cayó al vacío." : classic() ? "Agua." : "Agua. Si él se movió, tus marcas viejas ya no valen.");
  }

  function fxAgain(x, y, text) {
    const g = gridGeom();
    const c = cellCenter(g, x, y);
    rings.push({ x, y, life: 1, color: "#fde68a", size: 1.6, w: 3 });
    floats.push({ x: c.x, y: c.y, vy: -30 * g.dpr, life: 1, color: "#fde68a", text, size: 12 });
  }

  // racha: disparos seguidos que dan en algo nuevo (las maniobras no la cortan, un agua sí)
  function floatAt(x, y, text, color, size) {
    const g = gridGeom();
    const c = cellCenter(g, x, y);
    floats.push({ x: c.x, y: c.y, vy: -24 * g.dpr, life: 1.3, color, text, size });
  }
  function fxStreak(x, y, n, below) {
    const g = gridGeom();
    const c = cellCenter(g, x, y);
    const hot = n >= 4 ? "#f472b6" : n >= 3 ? "#fb923c" : "#fde047";
    const up = upOff(g, below ? -1.3 : 0.9);
    floats.push({ x: c.x + up.x, y: c.y + up.y, vy: -34 * g.dpr, life: 1.6, color: hot, text: "RACHA ×" + n, size: 14 + Math.min(4, n) * 3 });
    rings.push({ x, y, life: 1, color: hot, size: 1.2 + n * 0.35, w: 2 + n, delay: 0.12 });
    trauma = Math.min(1, trauma + 0.08 * n);
    const j = juke();
    if (j && j.sfx.streak) j.sfx.streak(n);
  }

  // los efectos nunca deben cortar el turno: si algo falla se registra y el juego sigue
  /* crónica de la partida para el resumen final: cada jugada, quién, qué y cuánto rindió */
  function chronLvl() {
    const t = match && match.shared ? Math.max(0, match.shared.turnNo - 1) : 0;
    return { lvl: C.warLevel({ turnNo: t }), rd: Math.floor(t / 2) + 1 };
  }
  function chronShot(results, incoming, pattern) {
    if (!match || !match.chron || match.phase === "end") return;
    let dmg = 0;
    const sunk = [];
    (results || []).forEach((r) => {
      if ((r.kind === "hit" && !r.again) || r.kind === "sunk") dmg++;
      if (r.kind === "sunk" && r.ship) sunk.push((/^Lancha/.test(r.ship) ? "la " : "el ") + r.ship);
    });
    const n = pattern && pattern.cells ? pattern.cells.length : (results || []).length;
    match.chron.push(Object.assign({ me: !incoming, t: "shot", dmg, sunk, n, lv: pattern && typeof pattern.level === "number" ? pattern.level : null, charged: !!(pattern && pattern.charged) }, chronLvl()));
  }
  function chronMan(mine, t, pub) {
    if (!match || !match.chron || match.phase === "end") return;
    match.chron.push(Object.assign({ me: !!mine, t, pick: (pub || []).map((p) => p.type) }, chronLvl()));
  }

  async function playResults(results, incoming, pattern) {
    try { chronShot(results, incoming, pattern); } catch (e) { /* la crónica nunca corta el turno */ }
    try {
      // tope de tiempo: si la animación no termina, el turno sigue igual
      let fin = false;
      await Promise.race([playResultsFx(results, incoming, pattern).finally(() => { fin = true; }), WAIT(5000 + results.length * 450)]);
      if (!fin) {
        netLog.push("FX TIMEOUT " + (window.__parquesStage || ""));
        console.warn("parques: animación cortada por tiempo");
        ui.stage.classList.remove("under-fire");
        viewOverride = null;
        hudDirty = true;
      }
    }
    catch (err) {
      window.__parquesErr = String(err && err.stack || err);
      netLog.push("ERR fx " + String(err && err.message || err).slice(0, 80));
      console.error(err);
      ui.stage.classList.remove("under-fire");
      viewOverride = null;
      hudDirty = true;
    }
  }
  async function playResultsFx(results, incoming, pattern) {
    viewOverride = incoming ? "local" : "remote";
    hudDirty = true;
    if (incoming) ui.stage.classList.add("under-fire");
    window.__parquesStage = "pr:start " + results.length;
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
      window.__parquesStage = "pr:" + i + "/" + results.length + " " + r.kind + " " + Math.round(performance.now() / 100) / 10;
      if (i < results.length - 1) await WAIT(incoming ? 200 : 120);
    }
    if (stt && !incoming) {
      const fresh = results.filter((r) => (r.kind === "hit" && !r.again) || r.kind === "sunk");
      if (fresh.length) {
        stt.streak = (stt.streak || 0) + 1;
        stt.bestStreak = Math.max(stt.bestStreak || 0, stt.streak);
        if (stt.streak >= 2) {
          const sunkNow = fresh.some((r) => r.kind === "sunk");
          const n = stt.streak, fx0 = fresh[0];
          // si además hundió, la racha sale abajo y un rato después para no pisar «HUNDIDO»
          if (sunkNow) setTimeout(() => fxStreak(fx0.x, fx0.y, n, true), 700); else fxStreak(fx0.x, fx0.y, n, false);
        }
      } else if (results.some((r) => r.kind === "miss")) {
        if ((stt.streak || 0) >= 2) floatAt(results[0].x, results[0].y, "RACHA CORTADA", "#cbd5e1", 12);
        stt.streak = 0;
      }
    }
    window.__parquesStage = "pr:narrate";
    say(narrate(results, incoming, pattern));
    hudDirty = true;
    await WAIT((incoming ? 880 : 520) + (sunkAny ? 750 : 0));
    window.__parquesStage = "pr:end";
    ui.stage.classList.remove("under-fire");
    viewOverride = null;
    hudDirty = true;
  }

  function freshMatch(role) {
    const local = C.placeRandom(null, Math.random, opts.map, myBoard());
    let remote = null;
    if (role === "arg" && opts.mode === "pvc") {
      remote = C.placeRandom(null, Math.random, opts.map, foeBoard());
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
      stats: { shots: 0, hits: 0, misses: 0, sunk: 0, taken: 0, lost: 0, turns: 0, man: 0, picks: 0, t0: 0, t1: 0 },
      chron: []
    };
    // Colocación unidad por unidad: nada arranca puesto (las unidades "levantadas" no cuentan en el tablero).
    local.forEach((u) => { u.unplaced = true; u.lifted = true; u.horizontal = true; u.kind = null; u.name = C.unitName(u.id, null); });
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
    paintGeo();
    match.phase = "place";
    sealed = false;
    battleStarted = false;
    hand = null;
    preview = null;
    placeNote = "";
    hudDirty = true;
    ui.linkbox.classList.add("hidden");
    ui.ready.disabled = false;
    ui.ready.textContent = "Estoy listo";
    nextHand();
    say(opts.mode === "pvp"
      ? "60 segundos. Colocá tu flota unidad por unidad; empieza cuando los dos están listos, o al llegar a 0."
      : "60 segundos para colocar tu flota, unidad por unidad. Lo que falte se completa solo.");
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
      if (match && match.phase === "place") hudDirty = true;
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
    autoFill();
    sealed = true;
    localReady = true;
    if (match && (match.phase === "place" || match.phase === "lobby")) match.phase = "sealed";
    hudDirty = true;
  }

  function publishReady(force) {
    if (opts.mode !== "pvp") return;
    if (!published) {
      published = true;
      send({ t: force ? "go" : "ready", force: !!force, rules: opts.rules });
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
    match.shared = C.newShared(seed, opts.terrain, opts.map, opts.sectors, opts.rules);
    match.lastLevel = 0;
    if (opts.mode !== "pvp") {
      const pers = C.PERSONALITIES[Math.floor(Math.random() * C.PERSONALITIES.length)];
      match.aiPers = pers;
      match.hard = opts.ai === "dificil";
      match.aiRng = Math.random;
      match.world = {
        shared: match.shared,
        p: { arg: match.meP, inv: { side: match.foeSide, know: C.newKnow(), pers, consec: 0 } }
      };
      const nation = C.NATIONS[opts.nation];
      document.getElementById("inv-name").textContent = nation.flag + " " + nation.name.toUpperCase() + " · " + (classic() ? "Clásico" : C.PERS_LABEL[pers]) + (match.hard ? " · Difícil" : "");
      match.phase = "attack";
      tutoEvent("ready");
      if (classic()) {
        say("Clásico: tocá una celda del parque enemigo para disparar. Un tiro por turno; gana quien hunda toda la flota.");
        requestAnimationFrame(fit);
        hudDirty = true;
        return;
      }
      say("Invasor " + C.PERS_LABEL[pers].toLowerCase() + (match.hard ? " (difícil)" : "") + ": " + PERS_BLURB[pers] + ". Tu turno: disparás o maniobrás.");
      requestAnimationFrame(fit);
      hudDirty = true;
      return;
    }
    match.phase = match.role === "arg" ? "attack" : "defend";
    if (classic()) say(match.role === "arg" ? "Clásico: empezás vos. Tocá una celda del parque enemigo para disparar." : "Clásico: Argentina dispara primero. Después te toca a vos.");
    else say(match.role === "arg"
      ? "Nadie sabe dónde está nadie. Empezás vos: disparás o maniobrás."
      : "Argentina juega primero. Mirá tu parque: ahí vas a ver qué hace.");
    requestAnimationFrame(fit);
    hudDirty = true;
  }

  function markReady() {
    if (!match || battleStarted || sealed) return;
    if (match.phase !== "place") return;
    sealFleet();
    if (match.ffa) { ffaSealed(); return; }
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
    if (match.ffa) {
      const was = match.phase === "sealed";
      sealFleet();
      if (!was) ffaSealed();
      else if (match.ffa.host) ffaCheckReady();
      return;
    }
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
    hand.ship.lifted = !!hand.ship.unplaced;
    hand = null;
    preview = null;
  }

  // --- colocación secuencial ---
  function nextHand() {
    if (!match || match.phase !== "place" || sealed || hand) return;
    const ship = match.local.find((u) => u.unplaced);
    if (!ship) { hudDirty = true; return; }
    hand = { ship, ox: ship.x, oy: ship.y, oh: true, horizontal: ship.horizontal !== false, grabDx: 0, grabDy: 0, set: false };
    ship.lifted = true;
    preview = null;
    lastPlaceTag = "";
    hudDirty = true;
  }
  function autoFill() {
    if (!match) return;
    if (!match.local.some((u) => u.unplaced)) return;
    if (!C.placeRemaining(match.local, null, Math.random, opts.map, myBoard())) {
      // hueco imposible con lo que puso el jugador: se rearma todo al azar
      const fresh = C.placeRandom(null, Math.random, opts.map, myBoard());
      match.local.forEach((u) => {
        const f = fresh.find((q) => q.id === u.id);
        u.x = f.x; u.y = f.y; u.horizontal = f.horizontal; u.unplaced = false; u.lifted = false; u.kind = f.kind; u.name = f.name;
      });
    }
    hand = null;
    preview = null;
    hudDirty = true;
  }
  function placedAll() { return !!match && match.local.every((u) => !u.unplaced); }
  function flashNote(text) {
    placeNote = text;
    clearTimeout(placeNoteT);
    placeNoteT = setTimeout(() => { placeNote = ""; hudDirty = true; }, tuto ? 6000 : 3800);
    hudDirty = true;
  }
  // la posición válida más cercana (para girar o soltar cerca del borde sin pelearse con la grilla)
  function nudgeHand(x, y) {
    if (!hand) return { x, y };
    if (handIssue(x, y) === "") return { x, y };
    let best = null, bd = 99;
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.abs(dx) + Math.abs(dy);
        if (d >= bd || d > 4) continue;
        if (handIssue(x + dx, y + dy) === "") { best = { x: x + dx, y: y + dy }; bd = d; }
      }
    }
    if (best) return best;
    // nada válido cerca: al menos que quede dentro del mapa
    const w = hand.horizontal ? hand.ship.size : 1, h = hand.horizontal ? 1 : hand.ship.size;
    return { x: Math.max(0, Math.min(C.W - w, x)), y: Math.max(0, Math.min(C.H - h, y)) };
  }
  function rotateHand() {
    if (!hand) return false;
    hand.horizontal = !hand.horizontal;
    hand.grabDx = 0;
    hand.grabDy = 0;
    if (preview && hand.set) {
      // gira sobre la celda del medio y se acomoda solo si no entra
      const half = Math.floor((hand.ship.size - 1) / 2);
      const cx = hand.horizontal ? preview.x : preview.x + half, cy = hand.horizontal ? preview.y + half : preview.y;
      preview = nudgeHand(hand.horizontal ? cx - half : cx, hand.horizontal ? cy : cy - half);
    }
    const issue = preview ? handIssue(preview.x, preview.y) : "";
    if (issue) flashNote(ISSUE_TEXT[issue] || "Ahí no entra.");
    say(issue ? ISSUE_TEXT[issue] : (hand.horizontal ? "Horizontal. " : "Vertical. ") + hand.ship.name + ". Verde entra, rojo no.");
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) { /* sin vibración */ }
    blip();
    hudDirty = true;
    return true;
  }
  function clearPress() { clearTimeout(pressT); pressT = 0; }
  function armPress() {
    clearPress();
    pressT = setTimeout(() => {
      pressT = 0;
      if (dragging && hand && !moved && rotateHand()) pressRot = true;
    }, 460);
  }

  // regla libre: la pieza es barco si queda entera en el agua y tanque si queda entera en tierra
  function handIssue(x, y) {
    if (!hand || !match) return "borde";
    return C.placeIssue(
      match.local, x, y, hand.ship.size, hand.horizontal,
      hand.ship.id, "auto", opts.terrain, opts.map, myBoard()
    );
  }
  function handKind(x, y) {
    if (!hand) return "";
    const cells = C.cellsOf({ x, y, size: hand.ship.size, horizontal: hand.horizontal });
    if (cells.some((c) => !C.inBounds(c.x, c.y))) return "";
    return C.mediumOf(opts.map, myBoard(), cells);
  }
  function setDown(ship) { C.settleKind(ship, opts.map, myBoard()); }

  function settleHand() {
    if (!hand) return;
    if (preview && hand.set && handIssue(preview.x, preview.y) === "") {
      hand.ship.x = preview.x;
      hand.ship.y = preview.y;
      hand.ship.horizontal = hand.horizontal;
      hand.ship.lifted = false;
      hand.ship.unplaced = false;
      setDown(hand.ship);
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
      grabDy: cell.y - ship.y,
      set: true
    };
    ship.lifted = true;
    preview = { x: ship.x, y: ship.y };
    lastPlaceTag = "";
    hudDirty = true;
    say(ship.name + " en tus manos: arrastrá, tocala para girar y ✓ para dejarla.");
  }
  function onGhost(cell) {
    if (!hand || !hand.set || !preview || !cell) return false;
    return C.cellsOf({ x: preview.x, y: preview.y, size: hand.ship.size, horizontal: hand.horizontal }).some((c) => c.x === cell.x && c.y === cell.y);
  }
  function placedShipAt(cell) {
    if (!match || !cell) return null;
    return match.local.find((u) => !u.unplaced && !u.lifted && C.cellsOf(u).some((c) => c.x === cell.x && c.y === cell.y)) || null;
  }
  // ⟳ y ✓ flotando al lado de la unidad pendiente (en coordenadas de pantalla, con el tablero girado o no)
  var ctlKey = ""; // var: el loop puede llamar antes de llegar a esta línea
  function cellToScreen(r, x, y) {
    const rot = isRot(r.width, r.height);
    const k = rot ? geomCss(r.height, r.width, 1, true) : geomCss(r.width, r.height, 1, false);
    const px = k.ox + x * k.cellW, py = k.oy + y * k.cellH;
    return rot ? { x: py, y: r.height - px } : { x: px, y: py };
  }
  function positionPlaceCtl() {
    const placeCtl = document.getElementById("place-ctl");
    if (!placeCtl) return;
    const show = !!(match && match.phase === "place" && !sealed && hand && hand.set && preview && !dragging);
    const ok = show && handIssue(preview.x, preview.y) === "";
    const key = show ? [preview.x, preview.y, hand.horizontal, ok, ui.canvas.clientWidth, ui.canvas.clientHeight].join(",") : "-";
    if (key === ctlKey) return;
    ctlKey = key;
    placeCtl.classList.toggle("hidden", !show);
    if (!show) return;
    const r = ui.canvas.getBoundingClientRect();
    const host = placeCtl.offsetParent ? placeCtl.offsetParent.getBoundingClientRect() : { left: 0, top: 0 };
    const w = hand.horizontal ? hand.ship.size : 1, h = hand.horizontal ? 1 : hand.ship.size;
    const a = cellToScreen(r, preview.x, preview.y), b = cellToScreen(r, preview.x + w, preview.y + h);
    const L = Math.min(a.x, b.x), R = Math.max(a.x, b.x), T = Math.min(a.y, b.y), B = Math.max(a.y, b.y);
    const cw = placeCtl.offsetWidth || 92, ch = placeCtl.offsetHeight || 40, gap = 8;
    let x = (L + R) / 2 - cw / 2;
    let y = B + gap;
    if (y + ch > r.height - 50) y = T - ch - gap; // abajo no hay lugar: arriba
    if (y < 4) { y = (T + B) / 2 - ch / 2; x = R + gap; if (x + cw > r.width - 4) x = L - cw - gap; }
    x = Math.max(4, Math.min(r.width - cw - 4, x));
    y = Math.max(4, Math.min(r.height - ch - 4, y));
    placeCtl.style.left = Math.round(r.left - host.left + x) + "px";
    placeCtl.style.top = Math.round(r.top - host.top + y) + "px";
    document.getElementById("pc-ok").disabled = !ok;
  }
  // deja la unidad pendiente donde está (si entra) o la devuelve a su lugar
  function parkHand() {
    if (!hand) return;
    if (hand.set && preview && handIssue(preview.x, preview.y) === "") { tryDrop(preview, true); return; }
    cancelHand();
  }
  function confirmHand() {
    if (!hand || !match || match.phase !== "place" || sealed) return;
    if (!hand.set || !preview) { flashNote("Primero tocá dónde va."); return; }
    tryDrop(preview);
  }

  function tryDrop(cell, quiet) {
    if (!hand || !cell) return;
    const issue = handIssue(cell.x, cell.y);
    if (issue) {
      say(ISSUE_TEXT[issue] || "Ahí no entra.");
      flashNote(ISSUE_TEXT[issue] || "Ahí no entra.");
      trauma = Math.min(1, trauma + 0.45);
      hudDirty = true;
      return;
    }
    const wasNew = !!hand.ship.unplaced;
    hand.ship.x = cell.x;
    hand.ship.y = cell.y;
    hand.ship.horizontal = hand.horizontal;
    hand.ship.lifted = false;
    hand.ship.unplaced = false;
    setDown(hand.ship);
    hand = null;
    preview = null;
    placeNote = "";
    hudDirty = true;
    blip();
    if (quiet) return;
    nextHand();
    if (placedAll()) { say("Flota completa. Tocá una unidad para ajustarla o Estoy listo."); tutoEvent("placed"); }
    else say(wasNew ? "Lista. Ahora la que sigue." : "Reacomodada.");
  }

  function onPointerDown(e) {
    if (!match) return;
    if (match.phase === "place") {
      if (sealed) return;
      const cell = cellFromEvent(e, !!hand);
      if (!cell) return;
      e.preventDefault();
      if (e.button === 2) { rotateHand(); return; }
      pressRot = false;
      moved = false;
      // 1) sobre la unidad pendiente: arrastrar (o, si no se mueve, girar al soltar)
      if (onGhost(cell)) {
        hand.grabDx = cell.x - preview.x;
        hand.grabDy = cell.y - preview.y;
        gestureHeld = true;
        dragging = true;
        hand.tapRot = true;
        return;
      }
      // 2) sobre una unidad ya puesta: la levanta para ajustarla
      const other = C.inBounds(cell.x, cell.y) ? placedShipAt(cell) : null;
      if (other) {
        parkHand();
        lift(other, cell);
        gestureHeld = true;
        dragging = true;
        hand.tapRot = false;
        return;
      }
      // 3) en un lugar libre: la pendiente salta ahí (y se puede seguir arrastrando)
      if (hand && C.inBounds(cell.x, cell.y)) {
        hand.set = true;
        hand.grabDx = 0;
        hand.grabDy = 0;
        hand.tapRot = false;
        preview = nudgeHand(cell.x, cell.y);
        gestureHeld = true;
        dragging = true;
        lastPlaceTag = "";
        blip();
        hudDirty = true;
      }
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
    // táctil: apoyar el dedo muestra la cruz/el área, arrastrar apunta, soltar dispara
    if (sel.mode === "shoot" && e.pointerType !== "mouse") { aiming = true; e.preventDefault(); return; }
    lock(() => cellAction(cell));
  }

  async function cellAction(cell) {
    if (!match || match.phase !== "attack") return;
    if (sel.mode === "shoot") {
      if (C.isClassic(match.shared) && match.know.marks.has(C.key(cell.x, cell.y))) { say("Ahí ya disparaste. Elegí otra celda."); return; }
      return takeAction({ t: "shot", cell: { x: cell.x, y: cell.y } });
    }
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
      if (e.pointerType === "mouse" || aiming) preview = cell;
      return;
    }
    if (placing && !dragging && cell && e.pointerType === "mouse" && !hand.set) {
      // todavía sin apoyar: con mouse, la silueta sigue al puntero
      preview = { x: cell.x, y: cell.y };
      return;
    }
    if (!dragging || !hand || !cell) return;
    const origin = { x: cell.x - hand.grabDx, y: cell.y - hand.grabDy };
    if (!preview || origin.x !== preview.x || origin.y !== preview.y) { moved = true; hand.tapRot = false; pressRot = false; clearPress(); }
    preview = origin;
    const issue = handIssue(origin.x, origin.y);
    const tag = issue || "ok";
    if (tag !== lastPlaceTag) {
      lastPlaceTag = tag;
      say(issue ? ISSUE_TEXT[issue] : "Verde: entra entera. Soltá para apoyarla.");
    }
  }

  function onPointerUp(e) {
    if (aiming) {
      aiming = false;
      const c = preview;
      if (e && e.type === "pointercancel") { preview = null; return; }
      if (c && C.inBounds(c.x, c.y) && match && match.phase === "attack" && !busy && sel.mode === "shoot") lock(() => cellAction(c));
      preview = null;
      return;
    }
    clearPress();
    if (!dragging) return;
    dragging = false;
    if (!hand) return;
    pressRot = false;
    // tocar la pendiente sin arrastrar la gira; arrastrar la deja pendiente donde quedó
    if (hand.tapRot && !moved) { hand.tapRot = false; rotateHand(); return; }
    if (moved && preview) {
      const fit = nudgeHand(preview.x, preview.y);
      if (Math.abs(fit.x - preview.x) + Math.abs(fit.y - preview.y) <= 1) preview = fit;
    }
    hudDirty = true;
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
    if (C.isClassic(match.shared)) return "Tocá una celda del parque enemigo para disparar.";
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
    if (match.ffa) { if (act.t === "shot") return ffaMyShot(act.cell); return; }
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
      msg = { t: "fire", shots: pat.cells, keep, spot: mySpot(), rules: opts.rules };
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
      msg.rules = opts.rules;
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
    // la respuesta sale antes de la animación: el rival no espera a nuestros efectos
    const wire = res.results.map((r) => (r.blocked ? { x: r.x, y: r.y, kind: "miss" } : r));
    send({ t: "resolved", results: wire, hpLeft: res.hp.left, lost: res.lost, spot: mySpot() });
    await playResults(res.results, true, { cells });
    if (match !== m) return;
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
      tutoEvent("shown");
      return;
    }
    match.stats.man++;
    tutoEvent("man");
    await playManeuver(true, out.t, out.pub || [], act);
  }

  async function playManeuver(mine, t, pub, act) {
    try { chronMan(mine, t, pub); } catch (e) { /* idem */ }
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
      const env = { side: ai.side, shared: sh, who: "inv", pers: ai.pers, consec: ai.consec, know: ai.know, hard: !!m.hard };
      const act = C.aiChoose(env, m.aiRng || Math.random);
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
        const uid = typeof r.uid === "number" ? r.uid : null;
        if (!match.wrecks.some((w) => (uid != null ? w.uid === uid : w.name === r.ship))) match.wrecks.push({ name: String(r.ship || "").slice(0, 30), uid, kind: r.med === "tanque" ? "tanque" : "barco", cells, t0: performance.now() });
      }
    });
    hudDirty = true;
  }


  function parkName() { return (C.MAPS[opts.map] || {}).name || "el parque"; }
  function challengeUrl() {
    const path = location.pathname.endsWith("/") ? location.pathname : location.pathname.replace(/[^/]*$/, "");
    return location.origin + path + "?parque=" + opts.map + "&invasor=" + opts.nation + (classic() ? "" : "&reglas=reloaded");
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
      "st-turns": classic() ? stt.turns : stt.man,
      "st-time": "×" + (stt.bestStreak || 0)
    };
    Object.keys(vals).forEach((id) => { document.getElementById(id).textContent = String(vals[id]); });
    document.getElementById("st-turns").nextElementSibling.textContent = classic() ? "Turnos" : "Maniobras";
    document.getElementById("end-kicker").textContent = win ? "VICTORIA" : "DERROTA";
    ui.end.classList.toggle("win", !!win);
    ui.end.classList.toggle("lose", !win);
    const rv = document.getElementById("rematch");
    rv.disabled = false;
    rv.textContent = "Revancha";
    document.getElementById("end-note").textContent = "";
    try { renderRecap(win); } catch (e) { console.warn("parques: resumen", e); document.getElementById("recap").classList.add("hidden"); }
    window.__parquesEnd = { win: !!win, stats: Object.assign({}, stt), argentinaHolds: !!argentinaHolds };
  }

  /* RESUMEN: la partida como un duelo de barras (arriba vos, abajo el rival), por fases de la guerra */
  const MAN_TXT = { move: "moviste", watch: "vigilaste", repair: "reparaste", aim: "apuntaste" };
  const MAN_TXT_FOE = { move: "movió", watch: "vigiló", repair: "reparó", aim: "apuntó" };
  const PHASE_SHORT = ["Calma", "Tensión", "Guerra", "Bombardeo"];
  function shotName(e) {
    const lv = e.lv != null ? e.lv : e.n > 5 ? 2 : e.n > 1 ? 1 : 0;
    return lv >= 2 ? "disparo 3×3" : lv === 1 ? "disparo en cruz" : "disparo";
  }
  function chronLine(e, mine) {
    if (e.t === "shot") {
      let t = shotName(e) + (e.charged ? " cargado" : "");
      t += e.dmg ? ": " + e.dmg + " de daño" : ": agua";
      if (e.sunk.length) t += (mine ? ", hundiste " : ", hundió ") + e.sunk.join(" y ");
      return t;
    }
    let t = (mine ? MAN_TXT : MAN_TXT_FOE)[e.t] || "maniobró";
    if (e.pick && e.pick.length) t += (mine ? " y cobraste " : " y cobró ") + e.pick.map((k) => (C.PICKUPS[k] || {}).name || k).join(" y ");
    return t;
  }
  function recapData() {
    const ch = (match && match.chron) || [];
    const mine = ch.filter((e) => e.me), foe = ch.filter((e) => !e.me);
    const sum = (l, f) => l.reduce((a, e) => a + f(e), 0);
    const shots = mine.filter((e) => e.t === "shot");
    const d = {
      ch, mine, foe,
      rounds: ch.reduce((a, e) => Math.max(a, e.rd), 0),
      shots: shots.length,
      man: mine.length - shots.length,
      dmg: sum(shots, (e) => e.dmg),
      dmgChg: sum(shots, (e) => (e.charged ? e.dmg : 0)),
      chgShots: shots.filter((e) => e.charged).length,
      picks: sum(mine, (e) => (e.pick ? e.pick.length : 0)),
      foeDmgChg: sum(foe, (e) => (e.t === "shot" && e.charged ? e.dmg : 0)),
      foeMan: foe.filter((e) => e.t !== "shot").length
    };
    let key = null;
    shots.forEach((e) => { const sc = e.dmg * 2 + e.sunk.length * 3; if (sc > 0 && (!key || sc >= key.sc)) key = { e, sc }; });
    d.key = key && key.e;
    return d;
  }
  function renderRecap(win) {
    const box = document.getElementById("recap");
    const d = recapData();
    if (!d.ch.length) { box.classList.add("hidden"); return; }
    const chart = document.getElementById("recap-chart");
    const cap = document.getElementById("recap-cap");
    const foeName = match.role === "inv" ? "Argentina" : "El invasor";
    const R = Math.max(1, d.rounds);
    chart.textContent = "";
    chart.style.setProperty("--cols", String(R));
    chart.classList.toggle("dense", R > 40); // partidas largas (Clásico): sin huecos, para que las barras se vean
    const byRound = [];
    for (let r = 1; r <= R; r++) byRound.push({ r, me: [], foe: [], lvl: 0 });
    d.ch.forEach((e) => { const c = byRound[e.rd - 1]; if (!c) return; (e.me ? c.me : c.foe).push(e); c.lvl = Math.max(c.lvl, e.lvl); });
    const bar = (e, mine) => {
      const b = document.createElement("i");
      if (e.t === "shot") {
        b.className = "b " + (e.charged ? "chg" : "shot") + (e.dmg ? "" : " miss") + (e.sunk.length ? " sunk" : "");
        b.style.setProperty("--h", String(Math.min(1, 0.16 + e.dmg * 0.21)));
      } else {
        b.className = "b man" + (e.pick && e.pick.length ? " pick" : "");
        b.style.setProperty("--h", "0.3");
      }
      return b;
    };
    const lines = (c) => "Ronda " + c.r + (classic() ? "" : " · " + C.WAR_NAMES[c.lvl]) + " — Vos: " + (c.me.map((e) => chronLine(e, true)).join(", luego ") || "—") +
      ". " + foeName + ": " + (c.foe.map((e) => chronLine(e, false)).join(", luego ") || "—") + ".";
    byRound.forEach((c, i) => {
      const col = document.createElement("button");
      col.type = "button";
      col.className = "col " + (classic() ? "lc" : "l" + c.lvl) + (d.key && c.me.indexOf(d.key) >= 0 ? " key" : "");
      col.style.animationDelay = Math.min(1.2, i * 0.025) + "s";
      const up = document.createElement("span"); up.className = "up";
      const dn = document.createElement("span"); dn.className = "dn";
      c.me.forEach((e) => up.appendChild(bar(e, true)));
      c.foe.forEach((e) => dn.appendChild(bar(e, false)));
      col.appendChild(up); col.appendChild(dn);
      col.setAttribute("aria-label", lines(c));
      const show = () => { chart.querySelectorAll(".col.on").forEach((x) => x.classList.remove("on")); col.classList.add("on"); cap.textContent = lines(c); };
      col.addEventListener("pointerenter", show);
      col.addEventListener("focus", show);
      col.addEventListener("click", show);
      chart.appendChild(col);
    });
    // fases: un tramo por fase de la guerra, con su nombre si entra
    const ph = document.getElementById("recap-phases");
    ph.textContent = "";
    const segs = [];
    byRound.forEach((c) => { const sg = segs[segs.length - 1]; if (sg && sg.lvl === c.lvl) sg.n++; else segs.push({ lvl: c.lvl, n: 1 }); });
    segs.forEach((sg) => {
      const s = document.createElement("span");
      s.className = "ph l" + sg.lvl;
      s.style.flex = sg.n + " 1 0";
      // el nombre solo si entra: tramos angostos quedan como franja de color (con título)
      const wpx = (sg.n / R) * (ph.clientWidth || 320);
      if (wpx >= PHASE_SHORT[sg.lvl].length * 6 + 6) s.textContent = PHASE_SHORT[sg.lvl];
      s.title = C.WAR_NAMES[sg.lvl];
      ph.appendChild(s);
    });
    [["tag-me", "vos"], ["tag-foe", match.role === "inv" ? "Argentina" : "invasor"]].forEach(([c, t]) => { const q = document.createElement("span"); q.className = "tag " + c; q.textContent = t; chart.appendChild(q); });
    chart.setAttribute("aria-label", "Arriba tus jugadas, abajo las de " + foeName.toLowerCase() + ", ronda por ronda.");
    const k = d.key;
    const keyTxt = k ? "Momento clave, ronda " + k.rd + ": " + chronLine(k, true) + "." : "Sin impactos esta vez: el rival nunca quedó a tiro.";
    cap.textContent = keyTxt;
    chart.onpointerleave = () => { chart.querySelectorAll(".col.on").forEach((x) => x.classList.remove("on")); cap.textContent = keyTxt; };
    // lectura del dilema: cuánto rindió desarrollarse
    box.classList.toggle("classic", classic());
    if (classic()) {
      // Clásico: un tiro por turno, sin maniobras ni escalada; la lectura es puntería y remate
      ph.textContent = "";
      const hits = d.mine.filter((e) => e.t === "shot" && e.dmg).length;
      const pct = d.shots ? Math.round((hits / d.shots) * 100) : 0;
      let ctip = "Disparaste " + d.shots + " veces y pegaste " + hits + " (" + pct + "%).";
      const foeShots = d.foe.filter((e) => e.t === "shot").length, foeHits = d.foe.filter((e) => e.t === "shot" && e.dmg).length;
      if (foeShots) ctip += " " + foeName + ": " + foeHits + " de " + foeShots + ".";
      ctip += win ? " Ganaste la puntería." : pct < 30 ? " Tras un impacto, rematá alrededor antes de abrir fuego en otro lado." : " Estuvo parejo: buscá el patrón en los barcos que quedan.";
      if (RELOADED_ON) ctip += " En Reloaded se suma maniobrar: apuntar, vigilar, mover o reparar en vez de tirar.";
      document.getElementById("recap-tip").textContent = ctip;
      box.classList.remove("hidden");
      return;
    }
    const turns = d.shots + d.man;
    const ratio = turns ? d.man / turns : 0;
    let tip = "Disparaste " + d.shots + " veces (" + d.dmg + " de daño) y maniobraste " + d.man + ".";
    if (d.chgShots && !d.dmgChg) tip += d.chgShots === 1 ? " Tu disparo cargado no pegó." : " Tus " + d.chgShots + " disparos cargados no pegaron.";
    else if (d.chgShots) tip += " Tus cargas rindieron " + d.dmgChg + " de daño en " + d.chgShots + (d.chgShots === 1 ? " disparo." : " disparos.");
    if (d.picks) tip += " Cobraste " + d.picks + (d.picks === 1 ? " tesoro." : " tesoros.");
    if (!win) {
      if (ratio < 0.15) tip += " Casi no te desarrollaste: apuntar antes de rematar convierte un tiro en una cruz.";
      else if (ratio > 0.5) tip += " Mucho desarrollo y poco daño: cobrá lo invertido antes de que escale la guerra.";
      else if (d.foeDmgChg > d.dmgChg) tip += " " + foeName + " cobró mejor sus cargas (" + d.foeDmgChg + " de daño contra tus " + d.dmgChg + ").";
      else tip += " Estuvo cerca: probá otro momento para cambiar de maniobrar a disparar.";
    } else {
      const hp = hpOf(match.local, match.hitsOnLocal);
      if (d.dmgChg >= Math.max(3, d.dmg * 0.3)) tip += " El desarrollo pagó: buena parte del daño vino cargado.";
      else if (ratio < 0.15) tip += " Ganaste a puro disparo; con una carga a tiempo, en menos turnos.";
      else tip += " Buen equilibrio entre disparar y desarrollarte.";
      tip += " Te quedaron " + hp.left + " de " + hp.total + " de casco.";
    }
    document.getElementById("recap-tip").textContent = tip;
    box.classList.remove("hidden");
  }
  /* tira de emojis para compartir (estilo grilla diaria): una por jugada tuya */
  function recapStrip() {
    const mine = ((match && match.chron) || []).filter((e) => e.me);
    const em = (e) => (e.t !== "shot" ? (e.pick && e.pick.length ? "🟩" : "🟦") : e.sunk.length ? "💥" : !e.dmg ? "⬛" : e.charged ? "🟨" : "🟥");
    const all = mine.map(em);
    const cut = all.length > 30 ? all.slice(0, 29).concat("…") : all;
    const out = [];
    for (let i = 0; i < cut.length; i += 10) out.push(cut.slice(i, i + 10).join(""));
    return out.join("\n");
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
    opts.sectors = C.pickSectors(opts.map, 2);
    opts.seed = Math.floor(Math.random() * 4294967296);
    send({ t: "rematchgo", sectors: opts.sectors, seed: opts.seed, rules: opts.rules });
    startRematch();
  }
  async function onShare() {
    if (!match) return;
    const win = ui.end.classList.contains("win");
    const strip = recapStrip();
    const text = shareText(win) + (strip ? "\n" + strip : "");
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
      await navigator.clipboard.writeText(text + (strip ? "\n" : " ") + url);
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

  // registro corto de red para diagnosticar (window.__parquesNet)
  window.__parquesNet = netLog;
  function netNote(dir, msg) {
    netLog.push(dir + " " + msg.t + " t" + (match && match.shared ? match.shared.turnNo : "-") + " " + (match ? match.phase : "-") + (busy ? " busy" : "") + " q" + inbox.length + " " + Math.round(performance.now() / 100) / 10);
    if (netLog.length > 60) netLog.shift();
  }
  function send(msg) {
    const open = !!(conn && conn.open);
    if (msg.t !== "here" && msg.t !== "hello") netNote(open ? ">" : ">X", msg);
    if (open) conn.send(msg);
  }

  function onData(msg) {
    if (!msg || !msg.t) return;
    if (typeof msg.t === "string" && msg.t.indexOf("f-") === 0) { ffaGuestData(msg); return; }
    if (msg.t !== "here" && msg.t !== "hello") netNote("<", msg);
    if (msg.t === "clash") { showMenu(); noteMenu(typeof msg.why === "string" ? msg.why.slice(0, 160) : "El rival canceló: las reglas no coinciden."); return; }
    if (msg.t === "bye") {
      if (!match || match.phase === "end") return;
      if (match.phase === "lobby" || match.phase === "place") { showMenu(); noteMenu("Tu rival abandonó la partida."); return; }
      finish(true);
      document.getElementById("end-note").textContent = "Tu rival abandonó la partida.";
      document.getElementById("rematch").disabled = true;
      return;
    }
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
      if (C.NATIONS[msg.nation]) opts.nation = msg.nation;
      if (!C.validSectors(opts.map, msg.sectors, 2)) { rulesClash("La sala viene de otra versión del juego. Pedile al rival que recargue la página."); return; }
      opts.sectors = msg.sectors.slice();
      if (typeof msg.seed === "number") opts.seed = msg.seed >>> 0;
      // las reglas las elige quien arma la sala; una sala sin reglas es de otra versión del juego
      if (!C.MODES.includes(msg.rules) || (!RELOADED_ON && msg.rules !== "clasico")) { rulesClash("La sala viene de otra versión del juego. Pedile al rival que recargue la página."); return; }
      opts.rules = msg.rules;
      applyRules();
      paintGeo();
      applyTheme();
      freshMatch("inv");
      showBattle();
      beginPlace();
      say("Reglas de esta sala: " + RULES_NAME[opts.rules] + (classic() ? " (un tiro por turno, nada se mueve)." : " (disparar o maniobrar, tesoros y escalada)."));
      return;
    }
    if (msg.t === "ready" || msg.t === "go") {
      if (msg.rules !== opts.rules) { rulesClash("El rival juega con otras reglas (" + (RULES_NAME[msg.rules] || "otra versión") + "). Recarguen la página y armen la sala de nuevo."); return; }
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
        if (msg.rules !== opts.rules) { rulesClash("La revancha usa otras reglas. Volvé al menú y armen otra sala."); return; }
        if (C.validSectors(opts.map, msg.sectors, 2)) opts.sectors = msg.sectors.slice();
        if (typeof msg.seed === "number") opts.seed = msg.seed >>> 0;
        startRematch();
      }
      return;
    }
    if ((msg.t === "fire" || msg.t === "man") && msg.rules !== opts.rules) { rulesClash("Las reglas no coinciden con las del rival. Partida cancelada."); return; }
    if (msg.t === "fire") lock(() => handleFire(msg));
    if (msg.t === "resolved") lock(() => handleResolved(msg));
    if (msg.t === "man") lock(() => handleMan(msg));
    if (msg.t === "manack") lock(() => handleManAck(msg));
  }

  function bindConn(c) {
    conn = c;
    c.on("data", onData);
    c.on("close", () => {
      if (match && match.ffa) { ffaHostLost(); return; }
      if (lobby && !lobby.host) { showMenu(); noteMenu("El anfitrión cerró la sala."); return; }
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

  let clashed = false;
  function rulesClash(why) {
    if (clashed) return;
    clashed = true;
    send({ t: "clash", why });
    showMenu();
    noteMenu(why);
    clashed = false;
  }

  function sendHello() {
    send({ t: "hello", map: opts.map, nation: opts.nation, sectors: opts.sectors, seed: opts.seed >>> 0, rules: opts.rules });
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

  // el viejo «Desafío del día» ya no existe: se borran sus récords locales
  try { Object.keys(localStorage).filter((k) => k.indexOf("parques.daily.") === 0).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* sin storage */ }

  function startGame() {
    const j = juke();
    if (j) j.start();
    blip();
    opts.sectors = C.pickSectors(opts.map, 2);
    opts.seed = Math.floor(Math.random() * 4294967296);
    applyRules();
    applyTheme();
    paintGeo();
    if (opts.mode === "ffa") { ffaOpenLobby(); return; }
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
        const grav = (p.g === undefined ? 90 * (Math.min(ui.canvas.width, ui.canvas.height) / 300) : p.g) * dt;
        if (rotView) p.vx -= grav; else p.vy += grav;
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
        if (rotView) f.x -= (f.vy || -30) * dt; else f.y += (f.vy || -30) * dt;
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
  selectGroup(document.getElementById("modes"), "mode", "mode");
  selectGroup(document.getElementById("rules"), "rules", "rules");
  function paintRulesMenu() {
    const rb = document.getElementById("rules-block");
    if (rb) rb.classList.toggle("hidden", !RELOADED_ON);
    document.querySelectorAll("#rules button").forEach((b) => b.classList.toggle("selected", b.dataset.rules === opts.rules));
    const h = document.getElementById("rules-hint");
    if (h) h.textContent = classic() ? "La batalla naval de siempre: un tiro por turno, nada se mueve. Gana quien hunda toda la flota."
      : "Disparar o maniobrar: mover, vigilar, reparar, apuntar, tesoros y una guerra que escala.";
    document.querySelectorAll(".steps [data-rules]").forEach((li) => li.classList.toggle("hidden", li.dataset.rules !== opts.rules));
    applyRules();
  }
  paintRulesMenu();
  buildNations();
  document.getElementById("start").addEventListener("click", () => startGame());
  // dificultad de la IA (solo contra la máquina); se recuerda
  opts.ai = store.get("parques.ai") === "dificil" ? "dificil" : "normal";
  document.querySelectorAll("#ailevel button").forEach((b) => {
    b.classList.toggle("selected", b.dataset.ai === opts.ai);
    b.addEventListener("click", () => {
      opts.ai = b.dataset.ai;
      store.set("parques.ai", opts.ai);
      document.querySelectorAll("#ailevel button").forEach((el) => el.classList.toggle("selected", el === b));
      document.getElementById("ai-hint").textContent = AI_HINT[opts.ai];
      blip();
    });
  });
  document.getElementById("ai-hint").textContent = AI_HINT[opts.ai];
  // Menú en plena partida: primero confirmar (nada se destruye sin «Abandonar»)
  const quitBox = document.getElementById("quit");
  let quitPaused = 0;
  function inGame() { return !!match && match.phase !== "end" && ui.battle && !ui.battle.classList.contains("hidden"); }
  function quitOpen() { return !!quitBox && !quitBox.classList.contains("hidden"); }
  function askQuit() {
    if (!inGame()) { showMenu(); return; }
    if (quitOpen()) return;
    const pvp = opts.mode === "pvp";
    const ffa = !!match.ffa;
    document.getElementById("quit-text").textContent = ffa
      ? (match.ffa.host ? (match.ffa.seats.some((q) => q.kind === "human") ? "Sos el anfitrión: la batalla termina para todos." : "Se pierde el progreso.") : "Tu lugar lo toma la máquina.")
      : pvp
        ? "Se pierde el progreso y tu rival gana por abandono."
        : "Se pierde el progreso.";
    // contra la máquina el reloj se congela mientras decidís
    if (!pvp && !ffa && clockId) { clearInterval(clockId); clockId = 0; quitPaused = clockLeft; }
    quitBox.classList.remove("hidden");
    document.getElementById("quit-stay").focus();
    blip();
  }
  function closeQuit() {
    if (!quitOpen()) return;
    quitBox.classList.add("hidden");
    if (quitPaused && match && match.phase !== "end") {
      const left = quitPaused;
      startClock();
      clockLeft = left;
      ui.clock.textContent = String(left);
    }
    quitPaused = 0;
  }
  function leaveGame() {
    quitPaused = 0;
    quitBox.classList.add("hidden");
    if (match && match.ffa) {
      if (match.ffa.host) ffaBroadcast({ t: "f-end", winner: -1, ranks: [], why: "El anfitrión abandonó. Batalla terminada." });
      else send({ t: "f-bye" });
      setTimeout(showMenu, 150);
      return;
    }
    if (opts.mode === "pvp") send({ t: "bye" });
    setTimeout(showMenu, opts.mode === "pvp" ? 120 : 0);
  }
  document.getElementById("back").addEventListener("click", askQuit);
  document.getElementById("place-menu").addEventListener("click", askQuit);
  document.getElementById("quit-stay").addEventListener("click", () => { closeQuit(); blip(); });
  document.getElementById("quit-leave").addEventListener("click", leaveGame);
  quitBox.addEventListener("click", (e) => { if (e.target === quitBox) closeQuit(); });
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (quitOpen()) { e.preventDefault(); closeQuit(); return; }
    if (ui.battle && !ui.battle.classList.contains("hidden")) { e.preventDefault(); askQuit(); }
  });
  // botón «atrás» del navegador o del celular: misma confirmación
  window.addEventListener("popstate", () => {
    if (inGame()) { try { history.pushState({ parques: 1 }, ""); } catch (e) { /* sin historial */ } askQuit(); }
    else if (ui.battle && !ui.battle.classList.contains("hidden")) showMenu();
  });
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
  ui.rotate.addEventListener("click", () => { if (!rotateHand()) say("Primero levantá una unidad tocándola."); });
  window.addEventListener("keydown", (e) => {
    if ((e.key === "r" || e.key === "R") && match && match.phase === "place" && hand) rotateHand();
    if (e.key === "Enter" && match && match.phase === "place" && hand && hand.set) { e.preventDefault(); confirmHand(); }
  });
  ui.ready.addEventListener("click", () => markReady());
  document.getElementById("pc-ok").addEventListener("click", (e) => { e.stopPropagation(); confirmHand(); });
  document.getElementById("pc-rot").addEventListener("click", (e) => { e.stopPropagation(); if (match && match.phase === "place" && !sealed) rotateHand(); });
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
  function setOpen(on) {
    document.body.classList.toggle("hud-open", on);
    const pill = document.getElementById("hud-pill");
    pill.setAttribute("aria-expanded", on ? "true" : "false");
    pill.querySelector(".chev").textContent = on ? "▴" : "▾";
  }
  document.getElementById("hud-pill").addEventListener("click", (e) => {
    setOpen(!document.body.classList.contains("hud-open"));
    e.currentTarget.classList.remove("hint");
    store.set("parques.pill.v1", "1");
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
  document.getElementById("coach-ok").addEventListener("click", () => { tutoNext(); blip(); });
  document.getElementById("how").addEventListener("click", () => {
    const pvc = document.querySelector("#modes [data-mode=pvc]");
    if (pvc) pvc.click();
    // el tutorial enseña Clásico (el de Reloaded está guardado hasta que se rehaga ese modo)
    const cl = document.querySelector("#rules [data-rules=clasico]");
    if (cl && !classic() && !RELOADED_TUTO) cl.click();
    tutoForce = true;
    startGame();
  });

  function applyChallenge() {
    const q = new URLSearchParams(location.search);
    const pk = q.get("parque");
    const inv = q.get("invasor");
    if (q.get("sala") || !(pk || inv)) return;
    const click = (sel) => { const el = document.querySelector(sel); if (el) el.click(); };
    if (C.MAPS[pk]) click("#maps [data-map=" + pk + "]");
    if (C.NATIONS[inv]) click("#nations [data-nation=" + inv + "]");
    if (RELOADED_ON && q.get("reglas") === "reloaded") click("#rules [data-rules=reloaded]");
    const lede = document.querySelector(".lede");
    if (lede) lede.textContent = "Te desafiaron en " + parkName() + ". ¿Aceptás?";
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

  /* =====================================================================
     TODOS CONTRA TODOS (Clásico, 2 a 8): humanos (PeerJS, el anfitrión comparte la sala) y máquinas.
     El anfitrión manda: guarda todas las flotas, resuelve cada tiro y reparte los turnos. Cada jugador
     tiene su propio sector real del mapa (todos pegados, nunca el mismo). Todos ven todos los tiros.
     ===================================================================== */
  const FFA_NATIONS = [
    { id: "chile", name: "Chile", flag: "🇨🇱" }, { id: "uk", name: "Reino Unido", flag: "🇬🇧" },
    { id: "usa", name: "EE.UU.", flag: "🇺🇸" }, { id: "china", name: "China", flag: "🇨🇳" },
    { id: "rusia", name: "Rusia", flag: "🇷🇺" }, { id: "brasil", name: "Brasil", flag: "🇧🇷" },
    { id: "francia", name: "Francia", flag: "🇫🇷" }
  ];
  const FFA_TURN_S = 30;
  const FFA_FAST = /[?&]rapido=1/.test(location.search); // QA: máquinas sin pausa
  const lobbyEl = document.getElementById("lobby");
  let lobby = null; // { host: bool, seats: [...], peer conns } mientras se arma la batalla
  let ffaConns = []; // anfitrión: conexiones de los invitados
  let ffaTurnT = 0;
  let ffaClockId = 0;
  // latido: un invitado que cierra la pestaña a veces no avisa (WebRTC tarda o nunca cierra el canal)
  const BEAT_MS = 2000, BEAT_DEAD = 9000;
  let ffaBeatId = 0, hostSeen = 0;
  function ffaHostBeat() {
    clearInterval(ffaBeatId);
    ffaBeatId = setInterval(() => {
      const now = Date.now();
      ffaConns.slice().forEach((c) => {
        if (now - (c._seen || now) > BEAT_DEAD) { try { c.close(); } catch (e) {} ffaConnLost(c); return; }
        if (c.open) { try { c.send({ t: "f-ping" }); } catch (e) {} }
      });
    }, BEAT_MS);
  }
  function ffaGuestBeat() {
    hostSeen = Date.now();
    if (ffaBeatId) return;
    ffaBeatId = setInterval(() => {
      if (Date.now() - hostSeen <= BEAT_DEAD + 3000) return;
      clearInterval(ffaBeatId); ffaBeatId = 0;
      if (match && match.ffa) ffaHostLost();
      else if (lobby && !lobby.host) { showMenu(); noteMenu("Se cortó la conexión con el anfitrión."); }
    }, BEAT_MS);
  }

  function seatLabel(q, i, me) {
    return q.flag + " " + q.name + (i === me ? " (vos)" : "");
  }
  function nationFor(i) { return i === 0 ? { name: "Argentina", flag: "🇦🇷" } : FFA_NATIONS[(i - 1) % FFA_NATIONS.length]; }

  // ---------- sala (lobby) ----------
  function ffaOpenLobby() {
    lobby = { host: true, me: 0, seats: [{ kind: "me" }, { kind: "bot", ai: "normal" }, { kind: "bot", ai: "normal" }, { kind: "bot", ai: "dificil" }], url: "" };
    ui.menu.classList.add("hidden");
    lobbyEl.classList.remove("hidden");
    paintLobby();
  }
  function lobbyMax() { return Math.max(2, C.maxPlayers(opts.map)); }
  function lobbyPublic() {
    return lobby.seats.map((q, i) => {
      const n = nationFor(i);
      return { name: n.name, flag: n.flag, kind: q.kind === "me" ? "host" : q.kind, ai: q.ai || "", on: q.kind !== "human" || !!q.conn };
    });
  }
  function paintLobby() {
    if (!lobby) return;
    const list = document.getElementById("seats");
    list.replaceChildren();
    const pub = lobby.host ? lobbyPublic() : lobby.pub || [];
    pub.forEach((q, i) => {
      const li = document.createElement("li");
      li.className = "seat " + q.kind + (i === lobby.me ? " you" : "");
      const who = document.createElement("span");
      who.className = "seat-who";
      who.textContent = q.flag + " " + q.name + (i === lobby.me ? " · vos" : "");
      li.appendChild(who);
      if (lobby.host && i > 0) {
        const seg = document.createElement("span");
        seg.className = "seat-kind";
        [["normal", "Máquina"], ["dificil", "Difícil"], ["human", "Persona"]].forEach(([k, t]) => {
          const b = document.createElement("button");
          b.type = "button";
          b.textContent = t;
          b.dataset.kind = k;
          const on = k === "human" ? q.kind === "human" : q.kind === "bot" && q.ai === k;
          b.classList.toggle("selected", on);
          b.addEventListener("click", () => {
            const s = lobby.seats[i];
            if (k === "human") { if (s.kind !== "human") { s.kind = "human"; s.conn = null; } }
            else { if (s.conn) { try { s.conn.send({ t: "f-full", why: "El anfitrión cambió tu lugar por una máquina." }); s.conn.close(); } catch (e) {} } s.kind = "bot"; s.ai = k; s.conn = null; }
            blip();
            lobbyChanged();
          });
          seg.appendChild(b);
        });
        li.appendChild(seg);
        const x = document.createElement("button");
        x.type = "button";
        x.className = "seat-x";
        x.setAttribute("aria-label", "Quitar lugar");
        x.textContent = "✕";
        x.disabled = lobby.seats.length <= 2;
        x.addEventListener("click", () => {
          const s = lobby.seats[i];
          if (s.conn) { try { s.conn.send({ t: "f-full", why: "El anfitrión quitó tu lugar." }); s.conn.close(); } catch (e) {} }
          lobby.seats.splice(i, 1);
          blip();
          lobbyChanged();
        });
        li.appendChild(x);
      } else if (i > 0 || !lobby.host) {
        const st = document.createElement("small");
        st.className = "seat-state";
        st.textContent = q.kind === "human" ? (q.on ? "persona" : "esperando…") : q.kind === "host" ? "anfitrión" : q.ai === "dificil" ? "máquina difícil" : "máquina";
        li.appendChild(st);
      }
      if (q.kind === "human" && lobby.host) {
        const st = document.createElement("small");
        st.className = "seat-state";
        st.textContent = q.on ? "conectado" : "esperando…";
        li.appendChild(st);
      }
      list.appendChild(li);
    });
    const max = lobbyMax();
    const add = document.getElementById("seat-add");
    add.classList.toggle("hidden", !lobby.host);
    add.disabled = !lobby.host || lobby.seats.length >= max;
    document.getElementById("lobby-sub").textContent = parkName() + " · " + pub.length + " jugadores · máximo " + max;
    const wantsLink = lobby.host && lobby.seats.some((s) => s.kind === "human");
    document.getElementById("lobby-link").classList.toggle("hidden", !wantsLink);
    document.getElementById("lobby-url").value = lobby.url || "Abriendo sala…";
    const go = document.getElementById("lobby-go");
    go.classList.toggle("hidden", !lobby.host);
    const waiting = lobby.host ? lobby.seats.filter((s) => s.kind === "human" && !s.conn).length : 0;
    go.textContent = waiting ? "Empezar (faltan " + waiting + ": juega la máquina)" : "Empezar";
    document.getElementById("lobby-note").textContent = lobby.host
      ? (wantsLink ? "Compartí el enlace. Cada persona que entra ocupa un lugar." : "Cada lugar puede ser una máquina o una persona.")
      : (lobby.note || "Esperando que el anfitrión empiece…");
  }
  function lobbyChanged() {
    if (!lobby || !lobby.host) return;
    if (lobby.seats.some((s) => s.kind === "human") && !peer) ffaHostPeer();
    lobbyBroadcast();
    paintLobby();
  }
  function lobbyBroadcast() {
    const pub = lobbyPublic();
    lobby.seats.forEach((s, i) => { if (s.conn && s.conn.open) s.conn.send({ t: "f-lobby", seats: pub, you: i, map: opts.map, v: 1 }); });
  }
  function ffaHostPeer() {
    const id = "parques-" + Math.random().toString(36).slice(2, 8);
    peer = new Peer(id, PEER_CFG);
    peer.on("open", (pid) => { lobby && (lobby.url = inviteUrl(pid)); paintLobby(); });
    ffaHostBeat();
    peer.on("connection", (c) => {
      c._seen = Date.now();
      c.on("data", (msg) => { c._seen = Date.now(); ffaHostData(c, msg); });
      c.on("close", () => ffaConnLost(c));
      c.on("error", () => {});
    });
    peer.on("disconnected", () => { try { if (peer && !peer.destroyed) peer.reconnect(); } catch (e) {} });
    peer.on("error", (err) => {
      const typ = (err && err.type) || "red";
      if (typ === "unavailable-id") { try { peer.destroy(); } catch (e) {} peer = null; ffaHostPeer(); return; }
      if (typ === "disconnected" || typ === "network" || typ === "peer-unavailable") return;
      if (lobby) { lobby.note = "No se pudo abrir la sala (" + typ + ")."; paintLobby(); }
    });
  }
  function seatOfConn(c) { return match && match.ffa ? match.ffa.seats.findIndex((q) => q.conn === c) : lobby ? lobby.seats.findIndex((q) => q.conn === c) : -1; }
  function ffaHostData(c, msg) {
    if (!msg || typeof msg.t !== "string") return;
    if (msg.t === "here") {
      if (seatOfConn(c) >= 0) { if (lobby) lobbyBroadcast(); return; }
      if (!lobby || match) { try { c.send({ t: "f-full", why: "La batalla ya empezó." }); } catch (e) {} return; }
      let i = lobby.seats.findIndex((s) => s.kind === "human" && !s.conn);
      if (i < 0 && lobby.seats.length < lobbyMax()) { lobby.seats.push({ kind: "human" }); i = lobby.seats.length - 1; }
      if (i < 0) { try { c.send({ t: "f-full", why: "La sala está llena." }); } catch (e) {} return; }
      lobby.seats[i].conn = c;
      ffaConns.push(c);
      blip();
      lobbyBroadcast();
      paintLobby();
      return;
    }
    const f = match && match.ffa;
    if (!f) return;
    const i = seatOfConn(c);
    if (i < 0) return;
    if (msg.t === "f-fleet") lock(() => ffaGotFleet(i, msg.units));
    else if (msg.t === "f-shot") lock(() => ffaHostShot(i, msg));
    else if (msg.t === "f-bye") ffaSeatGone(i, true);
  }
  function ffaConnLost(c) {
    ffaConns = ffaConns.filter((q) => q !== c);
    if (lobby && !match) {
      const s = lobby.seats.find((q) => q.conn === c);
      if (s) { s.conn = null; lobbyBroadcast(); paintLobby(); }
      return;
    }
    const i = seatOfConn(c);
    if (i >= 0) ffaSeatGone(i, false);
  }
  // un humano se fue (abandonó o se cortó): lo reemplaza la máquina, la partida nunca se cuelga
  function ffaSeatGone(i, abandoned) {
    const f = match && match.ffa;
    if (!f || !f.host) return;
    const q = f.seats[i];
    if (!q || q.kind !== "human") return;
    try { if (q.conn) q.conn.close(); } catch (e) {}
    q.conn = null;
    q.kind = "bot";
    q.ai = "normal";
    const msg = { t: "f-left", seat: i, why: abandoned ? "abandonó" : "se desconectó" };
    ffaBroadcast(msg);
    lock(() => ffaOnLeft(msg));
    if (match.phase === "place" || match.phase === "sealed") { if (!q.side) ffaGotFleet(i, null); }
    else if (f.turn === i && !f.ended) { clearTimeout(ffaTurnT); ffaTurnT = setTimeout(() => ffaBotTurn(i), 400); }
  }
  async function ffaOnLeft(msg) {
    const f = match && match.ffa;
    if (!f) return;
    const q = f.seats[msg.seat];
    if (!q) return;
    q.kind = "bot";
    say(q.flag + " " + q.name + " " + (msg.why === "abandonó" ? "abandonó" : "se desconectó") + ": juega la máquina por él.");
    paintStrip();
  }
  function ffaBroadcast(msg) {
    const f = match && match.ffa;
    (f ? f.seats : []).forEach((q) => { if (q.conn && q.conn.open) { try { q.conn.send(msg); } catch (e) {} } });
  }

  // ---------- invitado ----------
  function ffaGuestData(msg) {
    if (lobby || (match && match.ffa)) ffaGuestBeat();
    if (msg.t === "f-ping") { send({ t: "f-pong" }); return; }
    if (msg.t === "f-lobby") {
      gotHello = true;
      clearInterval(hereTimer);
      hereTimer = 0;
      if (C.MAPS[msg.map]) opts.map = msg.map;
      opts.mode = "ffa";
      lobby = { host: false, me: msg.you | 0, pub: Array.isArray(msg.seats) ? msg.seats.slice(0, 8) : [] };
      ui.battle.classList.add("hidden");
      ui.menu.classList.add("hidden");
      lobbyEl.classList.remove("hidden");
      applyTheme();
      paintLobby();
      return;
    }
    if (msg.t === "f-full") {
      const why = typeof msg.why === "string" ? msg.why.slice(0, 120) : "La sala está llena.";
      if (match && match.ffa) return;
      showMenu();
      noteMenu(why);
      return;
    }
    if (msg.t === "f-start") { ffaStart(msg); return; }
    if (!match || !match.ffa) return;
    if (msg.t === "f-battle") lock(() => ffaOnBattle(msg));
    else if (msg.t === "f-turn") lock(() => ffaOnTurn(msg));
    else if (msg.t === "f-res") lock(() => ffaOnRes(msg));
    else if (msg.t === "f-left") lock(() => ffaOnLeft(msg));
    else if (msg.t === "f-end") lock(() => ffaOnEnd(msg));
  }

  // ---------- arranque ----------
  function ffaHostStart() {
    if (!lobby || !lobby.host) return;
    const n = lobby.seats.length;
    const sectors = C.pickSectors(opts.map, n);
    if (!sectors) { lobby.note = "En este parque no entran " + n + " jugadores."; paintLobby(); return; }
    // sectores al azar entre los lugares
    for (let i = sectors.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [sectors[i], sectors[j]] = [sectors[j], sectors[i]]; }
    const seats = lobby.seats.map((s, i) => {
      const nat = nationFor(i);
      const human = s.kind === "human" && s.conn && s.conn.open;
      return { name: nat.name, flag: nat.flag, kind: s.kind === "me" ? "me" : human ? "human" : "bot", ai: s.ai || "normal", tile: sectors[i], conn: human ? s.conn : null };
    });
    // los lugares de persona sin nadie juegan como máquina
    lobby.seats.forEach((s) => { if (s.kind === "human" && !(s.conn && s.conn.open) && s.conn) { try { s.conn.close(); } catch (e) {} } });
    const seed = Math.floor(Math.random() * 4294967296);
    const pub = seats.map((q) => ({ name: q.name, flag: q.flag, kind: q.kind === "me" ? "human" : q.kind, ai: q.ai, tile: q.tile }));
    seats.forEach((q, i) => { if (q.conn) q.conn.send({ t: "f-start", v: 1, map: opts.map, seed, seats: pub, you: i, rules: "clasico" }); });
    ffaStart({ map: opts.map, seed, seats: pub, you: 0, host: true, full: seats });
  }
  function ffaStart(msg) {
    const host = !!msg.host;
    if (!host) {
      if (!C.MAPS[msg.map] || !Array.isArray(msg.seats) || msg.seats.length < 2 || msg.seats.length > 8) return;
      opts.map = msg.map;
      if (!C.validSectors(opts.map, msg.seats.map((q) => q && q.tile), msg.seats.length)) { showMenu(); noteMenu("La sala viene de otra versión del juego. Recargá la página."); return; }
    }
    opts.mode = "ffa";
    opts.rules = "clasico";
    const me = msg.you | 0;
    const seats = (host ? msg.full : msg.seats).map((q, i) => ({
      name: String(q.name || "Jugador").slice(0, 24), flag: String(q.flag || "🏳️").slice(0, 8),
      kind: host ? q.kind : (i === me ? "me" : q.kind === "bot" ? "bot" : "human"), ai: q.ai === "dificil" ? "dificil" : "normal",
      tile: q.tile | 0, conn: host ? q.conn || null : null,
      know: C.newKnow(), wrecks: [], left: 17, out: false, rank: 0, side: null, fit: {}
    }));
    const other = seats.find((q, i) => i !== me);
    opts.sectors = [seats[me].tile, other.tile];
    opts.seed = msg.seed >>> 0;
    lobby = null;
    lobbyEl.classList.add("hidden");
    applyRules();
    applyTheme();
    freshMatch("arg");
    match.ffa = { host, me, seats, turn: -1, n: 0, target: -1, view: me, order: seats.map((_, i) => i), ended: false, alive: seats.length, place: seats.length };
    match.remote = null;
    seats[me].side = match.side;
    if (host) {
      seats.forEach((q, i) => {
        if (q.kind === "bot") { const fl = C.placeRandom(null, Math.random, opts.map, q.tile); q.side = C.newSide(fl); q.ready = true; }
      });
    }
    showBattle();
    beginPlace();
    say("Todos contra todos · " + seats.length + " jugadores. 60 segundos para tu flota; empieza cuando todos están listos.");
    paintGeo();
    paintStrip();
  }
  // mi flota quedó cerrada (Estoy listo o reloj en 0)
  function ffaSealed() {
    const f = match.ffa;
    match.phase = "sealed";
    hudDirty = true;
    const units = match.local.map((u) => ({ id: u.id, x: u.x, y: u.y, horizontal: !!u.horizontal }));
    if (f.host) { f.seats[f.me].ready = true; ffaCheckReady(); }
    else send({ t: "f-fleet", units });
    say("Flota lista. Esperando a los demás…");
  }
  // anfitrión: llega la flota de un invitado (se valida con la regla libre; si no vale, va al azar)
  async function ffaGotFleet(i, units) {
    const f = match && match.ffa;
    if (!f || !f.host) return;
    const q = f.seats[i];
    if (!q || q.ready) return;
    let fleet = null;
    if (Array.isArray(units) && units.length === C.FLEET.length) {
      fleet = [];
      let ok = true;
      C.FLEET.forEach((spec, id) => {
        const u = units.find((v) => v && v.id === id);
        if (!u) { ok = false; return; }
        const s = { id, size: spec.size, x: u.x | 0, y: u.y | 0, horizontal: !!u.horizontal, color: C.COLORS[id], lifted: false };
        if (C.placeIssue(fleet, s.x, s.y, s.size, s.horizontal, null, "auto", null, opts.map, q.tile)) ok = false;
        else fleet.push(C.settleKind(s, opts.map, q.tile));
      });
      if (!ok) fleet = null;
    }
    if (!fleet) fleet = C.placeRandom(null, Math.random, opts.map, q.tile);
    q.side = C.newSide(fleet);
    q.ready = true;
    ffaCheckReady();
  }
  let ffaGraceT = 0;
  function ffaCheckReady(force) {
    const f = match && match.ffa;
    if (!f || !f.host || battleStarted) return;
    const me = f.seats[f.me];
    if (!me.ready) return;
    const missing = f.seats.filter((q) => !q.ready);
    if (missing.length && !force) {
      // el reloj de colocación ya llegó a 0 para todos: unos segundos de gracia y después al azar
      if (clockLeft <= 0 && !ffaGraceT) ffaGraceT = setTimeout(() => { ffaGraceT = 0; ffaCheckReady(true); }, 6000);
      return;
    }
    clearTimeout(ffaGraceT);
    ffaGraceT = 0;
    missing.forEach((q) => { q.side = C.newSide(C.placeRandom(null, Math.random, opts.map, q.tile)); q.ready = true; });
    const msg = { t: "f-battle", order: f.order };
    ffaBroadcast(msg);
    lock(() => ffaOnBattle(msg));
    lock(() => ffaAdvance(-1));
  }
  async function ffaOnBattle() {
    const f = match.ffa;
    if (battleStarted) return;
    battleStarted = true;
    match.stats.t0 = Date.now();
    settleHand();
    stopClock();
    match.shared = C.newShared(opts.seed || 1, opts.terrain, opts.map, opts.sectors, "clasico");
    match.phase = "defend";
    f.view = f.me;
    ffaFocus(firstFoe());
    viewOverride = null;
    say("¡A la guerra! Gana la última flota en pie.");
    requestAnimationFrame(fit);
    hudDirty = true;
    paintStrip();
  }
  function firstFoe() {
    const f = match.ffa;
    const alive = f.seats.map((q, i) => i).filter((i) => i !== f.me && !f.seats[i].out);
    if (f.target >= 0 && alive.includes(f.target)) return f.target;
    return alive.length ? alive[0] : -1;
  }
  // el tablero que se ve: el de un rival (match.know/wrecks pasan a ser los de ese sector)
  function ffaFocus(i) {
    const f = match.ffa;
    if (i < 0 || !f.seats[i]) return;
    if (i === f.me) { f.view = f.me; hudDirty = true; paintStrip(); return; }
    f.target = i;
    f.view = i;
    const q = f.seats[i];
    match.know = q.know;
    match.wrecks = q.wrecks;
    remoteLeft = q.left;
    preview = null;
    hudDirty = true;
    paintStrip();
  }

  // ---------- turnos (anfitrión) ----------
  function nextAlive(from) {
    const f = match.ffa;
    const n = f.seats.length;
    for (let k = 1; k <= n; k++) { const i = (from + k + n) % n; if (!f.seats[i].out) return i; }
    return -1;
  }
  async function ffaAdvance(from) {
    const f = match && match.ffa;
    if (!f || !f.host || f.ended) return;
    const alive = f.seats.filter((q) => !q.out);
    if (alive.length <= 1) {
      const msg = { t: "f-end", winner: f.seats.indexOf(alive[0]), ranks: f.seats.map((q) => q.rank || 1) };
      ffaBroadcast(msg);
      await ffaOnEnd(msg);
      return;
    }
    const i = nextAlive(from);
    f.n++;
    const msg = { t: "f-turn", seat: i, n: f.n };
    ffaBroadcast(msg);
    await ffaOnTurn(msg);
    clearTimeout(ffaTurnT);
    const q = f.seats[i];
    if (q.kind === "bot") ffaTurnT = setTimeout(() => ffaBotTurn(i), FFA_FAST ? 40 : 650 + Math.random() * 500);
    else ffaTurnT = setTimeout(() => { if (f.turn === i && !f.ended) ffaBotTurn(i, true); }, FFA_TURN_S * 1000 + 600);
  }
  function ffaBotTurn(i, timeout) {
    const f = match && match.ffa;
    if (!f || f.ended || f.turn !== i) return;
    const q = f.seats[i];
    const foes = f.seats.map((t, k) => ({ k, left: t.left, know: t.know })).filter((t) => t.k !== i && !f.seats[t.k].out);
    let tg = C.ffaPickTarget(foes, q.ai === "dificil" && !timeout, Math.random);
    if (timeout && q.kind !== "bot" && f.seats[i].lastTarget != null && !f.seats[f.seats[i].lastTarget].out && f.seats[i].lastTarget !== i) tg = foes.find((t) => t.k === f.seats[i].lastTarget) || tg;
    if (!tg) return;
    const t = f.seats[tg.k];
    const cell = C.ffaShot({ map: opts.map, myTile: q.tile, foeTile: t.tile, know: t.know, fleet: q.side.fleet, hard: q.ai === "dificil" && !timeout, fitCache: t.fit, turnNo: f.n }, Math.random);
    if (!cell) return;
    lock(() => ffaResolve(i, tg.k, cell, !!timeout));
  }
  async function ffaHostShot(i, msg) {
    const f = match.ffa;
    if (f.ended || f.turn !== i || msg.n !== f.n) return;
    const tg = msg.target | 0;
    if (!f.seats[tg] || tg === i || f.seats[tg].out) return;
    const cell = { x: msg.x | 0, y: msg.y | 0 };
    if (!C.inBounds(cell.x, cell.y) || f.seats[tg].know.marks.has(C.key(cell.x, cell.y))) return;
    await ffaResolve(i, tg, cell, false);
  }
  async function ffaResolve(from, tg, cell, auto) {
    const f = match.ffa;
    if (f.ended || f.turn !== from || f.resolving) return;
    f.resolving = true;
    clearTimeout(ffaTurnT);
    const q = f.seats[tg];
    f.seats[from].lastTarget = tg;
    const res = C.resolveVolley(q.side, [cell]);
    const r = res.results[0];
    const wire = { x: r.x, y: r.y, kind: r.kind === "sunk" || r.kind === "hit" ? r.kind : "miss", ship: r.ship, uid: r.uid, med: r.med, cells: r.cells, left: r.left, size: r.size };
    let out = false;
    if (res.lost && !q.out) { out = true; }
    const msg = { t: "f-res", n: f.n, from, target: tg, r: wire, left: res.hp.left, out, place: out ? f.alive : 0, auto: !!auto };
    ffaBroadcast(msg);
    await ffaOnRes(msg);
    f.resolving = false;
    await WAIT(FFA_FAST ? 20 : 120);
    await ffaAdvance(from);
  }

  // ---------- turnos (todos) ----------
  async function ffaOnTurn(msg) {
    const f = match.ffa;
    if (f.ended) return;
    const i = msg.seat | 0;
    if (!f.seats[i]) return;
    f.turn = i;
    f.n = msg.n | 0;
    const q = f.seats[i];
    ffaTurnClock(q.kind !== "bot");
    if (i === f.me) {
      match.phase = "attack";
      selReset("shoot");
      ffaFocus(firstFoe());
      say("Tu turno. Elegí a quién arriba y tocá una celda de su sector.");
    } else {
      match.phase = f.seats[f.me].out ? "defend" : "defend";
      if (!f.seats[f.me].out && f.view !== f.me && !f.pinned) ffaFocus(f.me);
      if (!FFA_FAST || q.kind !== "bot") say("Turno de " + q.flag + " " + q.name + ".");
    }
    hudDirty = true;
    paintStrip();
  }
  function ffaTurnClock(on) {
    clearInterval(ffaClockId);
    ffaClockId = 0;
    if (!on) { ui.clock.classList.add("hidden"); return; }
    clockLeft = FFA_TURN_S;
    ui.clock.textContent = String(clockLeft);
    ui.clock.classList.remove("hidden", "urgent");
    ffaClockId = setInterval(() => {
      clockLeft = Math.max(0, clockLeft - 1);
      ui.clock.textContent = String(clockLeft);
      ui.clock.classList.toggle("urgent", clockLeft <= 10);
      if (clockLeft <= 0) { clearInterval(ffaClockId); ffaClockId = 0; }
    }, 1000);
  }
  // disparo propio: el anfitrión lo resuelve; el invitado se lo manda
  async function ffaMyShot(cell) {
    const f = match.ffa;
    if (match.phase !== "attack" || f.turn !== f.me) return;
    const tg = f.target;
    if (tg < 0 || f.seats[tg].out) { say("Elegí un rival arriba."); return; }
    if (f.seats[tg].know.marks.has(C.key(cell.x, cell.y))) { say("Ahí ya dispararon. Elegí otra celda."); return; }
    match.phase = "resolving";
    match.stats.turns++;
    hudDirty = true;
    if (f.host) { lock(() => ffaResolve(f.me, tg, cell, false)); return; }
    send({ t: "f-shot", target: tg, x: cell.x, y: cell.y, n: f.n });
    say("Disparo en camino…");
  }
  async function ffaOnRes(msg) {
    const f = match.ffa;
    const from = msg.from | 0, tg = msg.target | 0;
    const shooter = f.seats[from], q = f.seats[tg];
    if (!shooter || !q || !msg.r) return;
    const r0 = msg.r;
    const r = { x: r0.x | 0, y: r0.y | 0, kind: r0.kind === "sunk" ? "sunk" : r0.kind === "hit" ? "hit" : "miss", ship: String(r0.ship || "").slice(0, 30), uid: typeof r0.uid === "number" ? r0.uid : null, med: r0.med === "tanque" ? "tanque" : "barco", left: r0.left | 0, size: r0.size | 0 };
    if (r.kind === "sunk") r.cells = (Array.isArray(r0.cells) ? r0.cells : []).slice(0, 5).map((c) => ({ x: c.x | 0, y: c.y | 0 }));
    if (!C.inBounds(r.x, r.y)) return;
    C.noteResults(q.know, [r], f.n);
    q.left = typeof msg.left === "number" ? msg.left : q.left;
    if (r.kind === "sunk" && !q.wrecks.some((w) => w.uid === r.uid)) q.wrecks.push({ name: r.ship, uid: r.uid, kind: r.med, cells: r.cells, t0: performance.now() });
    if (f.target === tg) remoteLeft = q.left;
    const who = shooter.flag + " " + shooter.name;
    const vs = q.flag + " " + q.name;
    if (tg === f.me) {
      // a mí: el invitado lo aplica sobre su propia flota (el anfitrión ya lo hizo al resolver)
      if (!f.host) C.resolveVolley(match.side, [{ x: r.x, y: r.y }]);
      const keep = f.view;
      if (!f.seats[f.me].out) {
        await playResults([r], true, null);
        if (r.kind !== "miss") say(who + ": " + narrate([r], true, null));
        else say(who + " tiró a tu sector: agua.");
      }
      if (keep !== f.me && f.pinned) ffaFocus(keep);
    } else if (from === f.me) {
      ffaFocus(tg);
      rememberRemote([r]);
      await playResults([r], false, null);
    } else {
      // entre otros: se ve si estás mirando ese sector (o ya quedaste afuera y mirás la acción)
      if (f.seats[f.me].out && !f.pinned) ffaFocus(tg);
      if (f.view === tg) ffaFxThird(r);
      const txt = who + " → " + vs + ": " + (r.kind === "sunk" ? "hundió " + (r.med === "tanque" ? "un " : "un ") + r.ship.toLowerCase() : r.kind === "hit" ? "¡tocado!" : "agua") + ".";
      if (!FFA_FAST || r.kind === "sunk") say(txt);
      await WAIT(FFA_FAST ? 10 : f.view === tg ? 650 : 260);
    }
    if (msg.out && !q.out) {
      q.out = true;
      q.rank = msg.place || f.alive;
      f.alive = Math.max(1, f.alive - 1);
      if (tg === f.me) {
        showBanner("FLOTA HUNDIDA", "Quedaste afuera (puesto " + q.rank + "). Seguís mirando.", "bad");
        match.phase = "defend";
        say("Te hundieron toda la flota. Seguís mirando la batalla.");
        ffaFocus(firstFoe());
      } else {
        showBanner(vs.toUpperCase() + " AFUERA", "Lo hundió " + who + ".", from === f.me ? "good" : "bad");
        say(vs + " quedó afuera. Lo hundió " + who + ".");
        if (f.target === tg) { const nf = firstFoe(); if (nf >= 0) ffaFocus(nf); }
      }
      await WAIT(FFA_FAST ? 30 : 900);
    }
    hudDirty = true;
    paintStrip();
  }
  function ffaFxThird(r) {
    const j = juke();
    if (r.kind === "hit" || r.kind === "sunk") { fxHit(r.x, r.y, false); if (r.kind === "sunk") fxSunk(r, false); if (j) j.sfx.hit(); }
    else { fxMiss(r.x, r.y); if (j) j.sfx.miss(); }
  }
  async function ffaOnEnd(msg) {
    const f = match && match.ffa;
    if (!f || f.ended) return;
    f.ended = true;
    clearTimeout(ffaTurnT);
    clearInterval(ffaClockId);
    ffaClockId = 0;
    const w = msg.winner | 0;
    if (Array.isArray(msg.ranks)) msg.ranks.forEach((rk, i) => { if (f.seats[i] && typeof rk === "number") f.seats[i].rank = rk; });
    if (f.seats[w]) f.seats[w].rank = 1;
    ffaFinish(w, typeof msg.why === "string" ? msg.why.slice(0, 120) : "");
  }
  function ffaFinish(w, why) {
    const f = match.ffa;
    const win = w === f.me;
    match.phase = "end";
    stopClock();
    if (tuto) tutoEnd();
    match.stats.t1 = Date.now();
    renderEnd(win, win);
    const wq = f.seats[w];
    ui.endTitle.textContent = why || (win ? "¡Tu flota es la última en pie!" : wq ? "Ganó " + wq.flag + " " + wq.name + "." : "Fin de la batalla.");
    document.getElementById("st-sunk").textContent = String(match.stats.sunk);
    document.getElementById("recap").classList.add("hidden");
    const rank = document.getElementById("ffa-rank");
    rank.replaceChildren();
    f.seats.map((q, i) => ({ q, i })).sort((a, b) => (a.q.rank || 99) - (b.q.rank || 99)).forEach(({ q, i }) => {
      const li = document.createElement("li");
      li.className = i === f.me ? "you" : "";
      li.textContent = (q.rank ? q.rank + "º " : "") + q.flag + " " + q.name + (i === f.me ? " · vos" : "") + (q.left > 0 && q.rank !== 1 ? "" : "");
      rank.appendChild(li);
    });
    rank.classList.remove("hidden");
    document.getElementById("rematch").classList.add("hidden");
    document.getElementById("end-kicker").textContent = win ? "VICTORIA" : "PUESTO " + (f.seats[f.me].rank || "—");
    ui.end.classList.remove("hidden");
    hudDirty = true;
    say(ui.endTitle.textContent);
    if (win) { const j = juke(); if (j) j.sfx.sunk(); }
    window.__parquesEnd = Object.assign(window.__parquesEnd || {}, { ffa: true, winner: w, ranks: f.seats.map((q) => q.rank) });
  }
  // invitado: se cayó el anfitrión → la partida termina con aviso (nunca se queda colgada)
  function ffaHostLost() {
    const f = match && match.ffa;
    if (!f || f.host || f.ended) return;
    f.ended = true;
    clearInterval(ffaClockId);
    const alive = f.seats.map((q, i) => i).filter((i) => !f.seats[i].out);
    ffaFinish(alive.includes(f.me) && alive.length === 1 ? f.me : -1, "Se cortó la conexión con el anfitrión. Batalla terminada.");
  }

  // ---------- franja de rivales ----------
  const stripEl = document.getElementById("ffa-strip");
  let stripOpen = false;
  function piecesLeft(q, i) {
    const f = match.ffa;
    if (i === f.me) return match.local.filter((u) => !C.shipStatus(u, match.hitsOnLocal).sunk).length;
    return C.FLEET.length - q.wrecks.length;
  }
  function paintStrip() {
    if (!stripEl) return;
    const f = match && match.ffa;
    document.body.classList.toggle("ffa", !!f);
    if (!f) { stripEl.classList.add("hidden"); return; }
    const showIt = battleStarted || match.phase === "place" || match.phase === "sealed";
    stripEl.classList.toggle("hidden", !showIt);
    stripEl.classList.toggle("open", stripOpen);
    if (stripOpen) paintGeo();
    const row = document.getElementById("ffa-chips");
    row.replaceChildren();
    const order = [f.me].concat(f.seats.map((_, i) => i).filter((i) => i !== f.me));
    order.forEach((i) => {
      const q = f.seats[i];
      const b = document.createElement("button");
      b.type = "button";
      b.className = "fchip" + (i === f.view ? " on" : "") + (q.out ? " out" : "") + (i === f.turn && battleStarted ? " turn" : "") + (i === f.me ? " me" : "");
      b.dataset.seat = String(i);
      const n = piecesLeft(q, i);
      const name = i === f.me ? "Vos" : q.name;
      b.innerHTML = "";
      const fl = document.createElement("span"); fl.className = "ff"; fl.textContent = q.flag; b.appendChild(fl);
      const nm = document.createElement("span"); nm.className = "fn"; nm.textContent = name; b.appendChild(nm);
      const ct = document.createElement("b"); ct.className = "fc"; ct.textContent = q.out ? "✕" : String(n); b.appendChild(ct);
      b.title = name + " · " + (q.out ? "afuera" : n + " piezas") ;
      b.setAttribute("aria-label", name + ", " + (q.out ? "afuera" : n + " piezas en pie"));
      b.addEventListener("click", () => {
        blip();
        if (!battleStarted) return;
        if (i === f.me) { f.pinned = false; ffaFocus(f.me); viewOverride = null; return; }
        if (q.out && match.phase === "attack") { say(q.flag + " " + q.name + " ya quedó afuera."); }
        f.pinned = match.phase !== "attack";
        ffaFocus(i);
        if (match.phase === "attack" && !q.out) say("Apuntás a " + q.flag + " " + q.name + ". Tocá una celda de su sector.");
      });
      row.appendChild(b);
    });
    const tl = document.getElementById("ffa-turn");
    const tq = f.seats[f.turn];
    tl.textContent = !battleStarted ? "Colocación" : f.ended ? "Fin" : f.turn === f.me ? "Tu turno" : tq ? "Turno " + tq.flag : "";
    tl.classList.toggle("mine", battleStarted && f.turn === f.me && !f.ended);
  }
  document.getElementById("ffa-more").addEventListener("click", () => { stripOpen = !stripOpen; blip(); paintStrip(); });

  document.getElementById("seat-add").addEventListener("click", () => {
    if (!lobby || !lobby.host || lobby.seats.length >= lobbyMax()) return;
    lobby.seats.push({ kind: "bot", ai: "normal" });
    blip();
    lobbyChanged();
  });
  document.getElementById("lobby-go").addEventListener("click", () => { blip(); ffaHostStart(); });
  document.getElementById("lobby-back").addEventListener("click", () => {
    blip();
    if (lobby && !lobby.host) { try { send({ t: "f-bye" }); } catch (e) {} }
    lobby = null;
    lobbyEl.classList.add("hidden");
    showMenu();
  });
  document.getElementById("lobby-copy").addEventListener("click", async () => {
    const v = document.getElementById("lobby-url").value;
    try { await navigator.clipboard.writeText(v); document.getElementById("lobby-note").textContent = "Enlace copiado."; } catch (e) { document.getElementById("lobby-url").select(); }
  });

  window.__parquesInject = (msg) => onData(msg); // QA: simular un mensaje del rival
  window.__parquesState = () => match ? ({
    rules: match.shared ? match.shared.mode : opts.rules,
    phase: match.phase,
    view: viewKind(),
    hudOpen: document.body.classList.contains("hud-open"),
    place: { unplaced: match.local.filter((s) => s.unplaced).length, next: (match.local.find((s) => s.unplaced) || {}).name || null, handH: hand ? hand.horizontal : null, hasHand: !!hand, pending: hand && hand.set && preview ? { x: preview.x, y: preview.y, h: hand.horizontal, ok: handIssue(preview.x, preview.y) === "", name: hand.ship.name } : null, msg: (document.getElementById("place-msg") || {}).textContent || "" },
    ships: match.local.map((s) => s.name + (s.lifted ? "*" : "")).join(","),
    units: match.local.map((s) => ({ name: s.name, kind: s.kind, x: s.x, y: s.y, size: s.size, horizontal: s.horizontal, lifted: !!s.lifted })),
    lifted: !!hand,
    terrain: opts.terrain,
    crop: opts.crop,
    board: myBoard(),
    land: (() => { const o = []; for (let y = 0; y < C.H; y++) for (let x = 0; x < C.W; x++) if (C.isLand(null, opts.map, myBoard(), x, y)) o.push([x, y]); return o; })(),
    sectors: gameSectors(),
    // QA: ¿las flotas de la máquina respetan la regla libre? (toda la pieza en agua = barco, en tierra = tanque)
    botsOk: (() => {
      const good = (fl, k) => !fl || fl.every((u) => C.mediumOf(opts.map, k, C.cellsOf(u)) === u.kind && u.name === C.unitName(u.id, u.kind));
      if (match.ffa) return match.ffa.host ? match.ffa.seats.every((q) => q.kind === "me" || !q.side || good(q.side.fleet, q.tile)) : null;
      return match.remote ? good(match.remote, foeBoard()) : null;
    })(),
    foeKinds: match.remote ? match.remote.map((u) => u.kind) : match.ffa && match.ffa.host ? match.ffa.seats.flatMap((q) => (q.side && q.kind !== "me" ? q.side.fleet.map((u) => u.kind) : [])) : [],
    lobby: lobby ? { host: lobby.host, me: lobby.me, url: lobby.url || "", seats: lobby.seats.map((q) => ({ kind: q.kind, ai: q.ai || "", on: q.kind !== "human" || !!q.conn || !!q.on })) } : null,
    ffa: match && match.ffa ? {
      me: match.ffa.me, turn: match.ffa.turn, view: match.ffa.view, alive: match.ffa.alive, ended: !!match.ffa.ended, host: !!match.ffa.host,
      seats: match.ffa.seats.map((q) => ({ name: q.name, flag: q.flag, kind: q.kind, out: !!q.out, rank: q.rank || 0, sector: q.tile, left: q.left != null ? q.left : null, marks: q.know ? q.know.marks.size : 0 })),
      chips: document.querySelectorAll('#ffa-chips .fchip').length, open: stripOpen,
    } : null,
    quit: !document.getElementById("quit").classList.contains("hidden"),
    map: opts.map,
    hp: hpOf(match.local, match.hitsOnLocal).left,
    turnNo: match.shared ? match.shared.turnNo : 0,
    level: match.shared ? C.warLevel(match.shared) : 0,
    sel: { mode: sel.mode, unit: sel.unit, open: sel.open, initOn: sel.initOn },
    charge: match.side.charge,
    init: match.side.init,
    armor: match.local.reduce((a, u) => a + (u.armor || 0), 0),
    know: { marks: match.know.marks.size, live: match.know.live.size, ghosts: match.know.ghosts.size, keys: [...match.know.marks.keys()] },
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
    chron: (match.chron || []).length,
    tuto: tuto ? tuto.step : null
  }) : lobby ? { phase: "lobby", lobby: { host: lobby.host, me: lobby.me, url: lobby.url || "", seats: lobby.seats.map((q) => ({ kind: q.kind, ai: q.ai || "", on: q.kind !== "human" || !!q.conn || !!q.on })) } } : { phase: "menu" };

  const sala = new URLSearchParams(location.search).get("sala");
  if (sala) {
    opts.mode = "pvp";
    if (window.Peer) joinGame(sala);
    else say("No se pudo cargar el modo en línea.");
  }
})();
