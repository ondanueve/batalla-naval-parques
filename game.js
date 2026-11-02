// Parques en Guerra - game.js
const GRID_W = 10;
const GRID_H = 20;
const UNITS = {
  agua: [
    { name: "Portaaviones", size: 5 },
    { name: "Acorazado", size: 4 },
    { name: "Crucero", size: 3 },
    { name: "Submarino", size: 3 },
    { name: "Destructor", size: 2 }
  ],
  tierra: [
    { name: "Tanque Pesado", size: 5 },
    { name: "Blindado", size: 4 },
    { name: "Artillería", size: 3 },
    { name: "Vehículo", size: 3 },
    { name: "Infantería", size: 2 }
  ],
  mixto: [
    { name: "Unidad Mixta", size: 5 },
    { name: "Anfibio", size: 4 },
    { name: "Patrulla", size: 3 },
    { name: "Explorador", size: 3 },
    { name: "Base", size: 2 }
  ]
};

let state = {
  map: "nahuel",
  terrain: "agua",
  mode: "pvc",
  invader: "chile",
  phase: "menu",
  currentPlayer: "arg",
  boards: { arg: null, inv: null },
  powers: { radar: 2, bomb: 1, camo: 2 },
  selectedUnit: null,
  peer: null,
  conn: null,
  placeTimer: null
};

const ownCanvas = document.getElementById("own-board");
const enemyCanvas = document.getElementById("enemy-board");
const ownCtx = ownCanvas.getContext("2d");
const enemyCtx = enemyCanvas.getContext("2d");

function getUnits() {
  return UNITS[state.terrain] || UNITS.agua;
}

function createBoard() {
  return Array.from({ length: GRID_H }, () =>
    Array.from({ length: GRID_W }, () => ({ unit: null, hit: false, miss: false }))
  );
}

function placeUnitsRandom(board) {
  getUnits().forEach((unit, idx) => {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 200) {
      const horizontal = Math.random() > 0.5;
      const x = Math.floor(Math.random() * (horizontal ? GRID_W - unit.size + 1 : GRID_W));
      const y = Math.floor(Math.random() * (horizontal ? GRID_H : GRID_H - unit.size + 1));
      if (canPlace(board, x, y, unit.size, horizontal, null)) {
        placeUnit(board, x, y, unit.size, horizontal, idx);
        placed = true;
      }
      attempts++;
    }
  });
  return board;
}

function canPlace(board, x, y, size, horizontal, ignoreId = null) {
  for (let i = 0; i < size; i++) {
    const cx = horizontal ? x + i : x;
    const cy = horizontal ? y : y + i;
    if (cx >= GRID_W || cy >= GRID_H || cx < 0 || cy < 0) return false;
    const cell = board[cy][cx];
    if (cell.unit !== null && cell.unit !== ignoreId) return false;
  }
  return true;
}

function placeUnit(board, x, y, size, horizontal, unitId) {
  for (let i = 0; i < size; i++) {
    const cx = horizontal ? x + i : x;
    const cy = horizontal ? y : y + i;
    board[cy][cx].unit = unitId;
  }
}

function removeUnit(board, unitId) {
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (board[y][x].unit === unitId) board[y][x].unit = null;
    }
  }
}

function getUnitCells(board, unitId) {
  const cells = [];
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (board[y][x].unit === unitId) cells.push({ x, y });
    }
  }
  return cells;
}

function isHorizontal(cells) {
  if (cells.length < 2) return true;
  return cells[0].y === cells[1].y;
}

function drawBoard(ctx, board, showUnits = false, map = "nahuel", terrain = "agua", highlight = null) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const cellW = w / GRID_W;
  const cellH = h / GRID_H;
  ctx.clearRect(0, 0, w, h);

  if (terrain === "agua") {
    if (map === "nahuel") ctx.fillStyle = "#38bdf8";
    else if (map === "iguazu") ctx.fillStyle = "#22c55e";
    else ctx.fillStyle = "#bae6fd";
  } else if (terrain === "tierra") {
    if (map === "nahuel") ctx.fillStyle = "#84cc16";
    else if (map === "iguazu") ctx.fillStyle = "#166534";
    else ctx.fillStyle = "#cbd5e1";
  } else {
    ctx.fillStyle = map === "glaciares" ? "#e0f2fe" : "#64748b";
  }
  ctx.fillRect(0, 0, w, h);

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const cellData = board[y][x];
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1;
      ctx.strokeRect(x * cellW, y * cellH, cellW, cellH);

      if (showUnits && cellData.unit !== null) {
        ctx.fillStyle = terrain === "tierra" ? "#78350f" : "#1e3a8a";
        ctx.fillRect(x * cellW + 1, y * cellH + 1, cellW - 2, cellH - 2);
      }
      if (cellData.hit) {
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(x * cellW + cellW / 2, y * cellH + cellH / 2, Math.min(cellW, cellH) * 0.28, 0, Math.PI * 2);
        ctx.fill();
      } else if (cellData.miss) {
        ctx.fillStyle = "#94a3b8";
        ctx.beginPath();
        ctx.arc(x * cellW + cellW / 2, y * cellH + cellH / 2, Math.min(cellW, cellH) * 0.18, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  if (highlight && highlight.cells) {
    ctx.fillStyle = "rgba(250, 204, 21, 0.7)";
    highlight.cells.forEach(c => {
      if (c.x >= 0 && c.x < GRID_W && c.y >= 0 && c.y < GRID_H) {
        ctx.fillRect(c.x * cellW + 1, c.y * cellH + 1, cellW - 2, cellH - 2);
      }
    });
  }
}

function shoot(board, x, y) {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return null;
  const cell = board[y][x];
  if (cell.hit || cell.miss) return null;
  if (cell.unit !== null) {
    cell.hit = true;
    return "hit";
  } else {
    cell.miss = true;
    return "miss";
  }
}

function checkWin(board) {
  return board.every(row => row.every(cell => cell.unit === null || cell.hit));
}

function aiShoot(board) {
  const candidates = [];
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (!board[y][x].hit && !board[y][x].miss) candidates.push([x, y]);
    }
  }
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// Menu
document.querySelectorAll(".map-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".map-btn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    state.map = btn.dataset.map;
  });
});
document.querySelectorAll(".terrain-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".terrain-btn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    state.terrain = btn.dataset.terrain;
  });
});
document.getElementById("mode-pvp").onclick = () => {
  document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("selected"));
  document.getElementById("mode-pvp").classList.add("selected");
  state.mode = "pvp";
};
document.getElementById("mode-pvc").onclick = () => {
  document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("selected"));
  document.getElementById("mode-pvc").classList.add("selected");
  state.mode = "pvc";
};
document.getElementById("start-btn").onclick = startGame;
document.getElementById("back-btn").onclick = () => {
  clearInterval(state.placeTimer);
  document.getElementById("game").classList.add("hidden");
  document.getElementById("menu").classList.remove("hidden");
  if (state.peer) try { state.peer.destroy(); } catch (e) {}
};

document.getElementById("copy-link").onclick = () => {
  const input = document.getElementById("invite-link");
  input.select();
  navigator.clipboard.writeText(input.value).then(() => alert("Enlace copiado"));
};

document.getElementById("rotate-btn").onclick = () => {
  if (!state.selectedUnit) return;
  state.selectedUnit.horizontal = !state.selectedUnit.horizontal;
  updatePlacementMessage();
  drawAll();
};

function startGame() {
  state.invader = document.getElementById("invader").value;
  if (window.ArcadeAudio && window.ArcadeAudio.startJuke) window.ArcadeAudio.startJuke();
  if (state.mode === "pvp") {
    setupPvP();
    return;
  }
  beginPlacement();
}

function setupPvP() {
  state.isHost = true;
  const roomId = Math.random().toString(36).slice(2, 8);
  state.peer = new Peer(roomId);
  state.peer.on("open", id => {
    const link = window.location.origin + window.location.pathname + "?room=" + id;
    document.getElementById("invite-link").value = link;
    document.getElementById("invite-box").classList.remove("hidden");
    document.getElementById("waiting").textContent = "Esperando al rival...";
  });
  state.peer.on("connection", conn => {
    state.conn = conn;
    setupConnection();
    document.getElementById("waiting").textContent = "¡Rival conectado!";
    setTimeout(beginPlacement, 600);
  });
}

function setupConnection() {
  state.conn.on("data", data => {
    if (data.type === "shot") {
      shoot(state.boards.arg, data.x, data.y);
      drawAll();
      if (checkWin(state.boards.arg)) alert("El invasor gana");
    }
  });
}

function beginPlacement() {
  document.getElementById("menu").classList.add("hidden");
  document.getElementById("game").classList.remove("hidden");
  document.getElementById("rotate-btn").classList.remove("hidden");
  document.body.className = `map-${state.map}`;
  state.phase = "place";
  state.selectedUnit = null;
  state.boards.arg = createBoard();
  state.boards.inv = createBoard();
  placeUnitsRandom(state.boards.arg);
  placeUnitsRandom(state.boards.inv);
  showBoards();
  startPlacementTimer();
  updatePlacementMessage();
  drawAll();
}

function showBoards() {
  const ownCont = document.querySelector("#own-board").parentElement;
  const enemyCont = document.querySelector("#enemy-board").parentElement;
  if (state.phase === "place" || state.phase === "defend") {
    ownCont.classList.remove("hidden");
    enemyCont.classList.add("hidden");
  } else {
    ownCont.classList.add("hidden");
    enemyCont.classList.remove("hidden");
  }
}

function startPlacementTimer() {
  let timeLeft = 10;
  document.getElementById("timer").textContent = timeLeft;
  document.getElementById("timer").classList.remove("hidden");
  clearInterval(state.placeTimer);
  state.placeTimer = setInterval(() => {
    timeLeft--;
    document.getElementById("timer").textContent = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(state.placeTimer);
      startBattle();
    }
  }, 1000);
}

function updatePlacementMessage() {
  if (state.selectedUnit) {
    const units = getUnits();
    const u = units[state.selectedUnit.id];
    document.getElementById("message").textContent = `Moviendo ${u.name} (${u.size}) | ${state.selectedUnit.horizontal ? "H" : "V"} | Tocá para soltar`;
  } else {
    document.getElementById("message").textContent = "Tocá una unidad para levantarla y moverla";
  }
}

function startBattle() {
  clearInterval(state.placeTimer);
  document.getElementById("timer").classList.add("hidden");
  document.getElementById("rotate-btn").classList.add("hidden");
  state.phase = "attack";
  state.selectedUnit = null;
  state.currentPlayer = "arg";
  showBoards();
  updateUI();
  drawAll();
  document.getElementById("message").textContent = "¡A batallar! Tocá el tablero enemigo";
}

function drawAll(highlight = null) {
  if (!state.boards.arg) return;
  let hl = highlight;
  if (state.selectedUnit && !hl) {
    hl = { cells: state.selectedUnit.previewCells || [] };
  }
  drawBoard(ownCtx, state.boards.arg, true, state.map, state.terrain, hl);
  drawBoard(enemyCtx, state.boards.inv, false, state.map, state.terrain);
}

function getCellFromEvent(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  const clientX = e.clientX || (e.changedTouches && e.changedTouches[0].clientX);
  const clientY = e.clientY || (e.changedTouches && e.changedTouches[0].clientY);
  const x = Math.floor((clientX - rect.left) / (rect.width / GRID_W));
  const y = Math.floor((clientY - rect.top) / (rect.height / GRID_H));
  return { x, y };
}

function handleOwnBoard(e) {
  if (state.phase !== "place") return;
  const { x, y } = getCellFromEvent(e, ownCanvas);
  if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return;

  if (!state.selectedUnit) {
    const unitId = state.boards.arg[y][x].unit;
    if (unitId === null) return;
    const cells = getUnitCells(state.boards.arg, unitId);
    const horizontal = isHorizontal(cells);
    const units = getUnits();
    state.selectedUnit = {
      id: unitId,
      size: units[unitId].size,
      horizontal,
      previewCells: cells
    };
    removeUnit(state.boards.arg, unitId);
    updatePlacementMessage();
    drawAll({ cells });
  } else {
    const su = state.selectedUnit;
    if (canPlace(state.boards.arg, x, y, su.size, su.horizontal, su.id)) {
      placeUnit(state.boards.arg, x, y, su.size, su.horizontal, su.id);
      state.selectedUnit = null;
      updatePlacementMessage();
      drawAll();
    } else {
      document.getElementById("message").textContent = "No entra ahí. Rotá o probá otro lugar.";
    }
  }
}

let dragging = false;
ownCanvas.addEventListener("mousedown", e => { dragging = true; handleOwnBoard(e); });
ownCanvas.addEventListener("mousemove", e => {
  if (!dragging || state.phase !== "place" || !state.selectedUnit) return;
  const { x, y } = getCellFromEvent(e, ownCanvas);
  if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return;
  const su = state.selectedUnit;
  const cells = [];
  for (let i = 0; i < su.size; i++) {
    const cx = su.horizontal ? x + i : x;
    const cy = su.horizontal ? y : y + i;
    cells.push({ x: cx, y: cy });
  }
  su.previewCells = cells;
  drawAll({ cells });
});
ownCanvas.addEventListener("mouseup", e => {
  if (dragging && state.selectedUnit) handleOwnBoard(e);
  dragging = false;
});
ownCanvas.addEventListener("touchstart", e => {
  e.preventDefault();
  dragging = true;
  handleOwnBoard(e);
});
ownCanvas.addEventListener("touchmove", e => {
  e.preventDefault();
  if (!dragging || !state.selectedUnit) return;
  const { x, y } = getCellFromEvent(e, ownCanvas);
  if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return;
  const su = state.selectedUnit;
  const cells = [];
  for (let i = 0; i < su.size; i++) {
    const cx = su.horizontal ? x + i : x;
    const cy = su.horizontal ? y : y + i;
    cells.push({ x: cx, y: cy });
  }
  su.previewCells = cells;
  drawAll({ cells });
});
ownCanvas.addEventListener("touchend", e => {
  e.preventDefault();
  if (dragging && state.selectedUnit) handleOwnBoard(e);
  dragging = false;
});

function handleShot(x, y) {
  if (state.phase !== "attack" || state.currentPlayer !== "arg") return;
  const result = shoot(state.boards.inv, x, y);
  if (!result) return;
  document.getElementById("message").textContent = result === "hit" ? "¡Impacto!" : "Vacío...";
  if (state.conn) state.conn.send({ type: "shot", x, y });
  if (checkWin(state.boards.inv)) {
    alert("¡Argentina gana!");
    return;
  }
  drawAll();
  if (state.mode === "pvc") {
    state.phase = "defend";
    showBoards();
    state.currentPlayer = "inv";
    updateUI();
    setTimeout(aiTurn, 700);
  }
}

enemyCanvas.addEventListener("click", e => {
  const { x, y } = getCellFromEvent(e, enemyCanvas);
  handleShot(x, y);
});
enemyCanvas.addEventListener("touchend", e => {
  e.preventDefault();
  const { x, y } = getCellFromEvent(e, enemyCanvas);
  handleShot(x, y);
});

function aiTurn() {
  if (state.mode !== "pvc") return;
  const shot = aiShoot(state.boards.arg);
  if (!shot) return;
  const [x, y] = shot;
  const result = shoot(state.boards.arg, x, y);
  document.getElementById("message").textContent = result === "hit" ? "¡Te dieron!" : "El invasor falló";
  if (checkWin(state.boards.arg)) {
    alert("¡El invasor gana!");
    return;
  }
  drawAll();
  state.phase = "attack";
  showBoards();
  state.currentPlayer = "arg";
  updateUI();
}

function updateUI() {
  document.getElementById("turn-indicator").textContent = state.currentPlayer === "arg" ? "Turno 🇦🇷" : "Turno Invasor";
}

// Powers
document.getElementById("power-radar").onclick = () => {
  if (state.powers.radar <= 0) return;
  state.powers.radar--;
  document.getElementById("message").textContent = "Radar activado";
};
document.getElementById("power-bomb").onclick = () => {
  if (state.powers.bomb <= 0) return;
  state.powers.bomb--;
  document.getElementById("message").textContent = "¡Bomba!";
};
document.getElementById("power-camo").onclick = () => {
  if (state.powers.camo <= 0) return;
  state.powers.camo--;
  document.getElementById("message").textContent = "Camuflaje";
};

// Jukebox
document.getElementById("juke-btn").onclick = () => {
  document.getElementById("juke-panel").classList.remove("hidden");
  populateSongs();
  if (window.ArcadeAudio && window.ArcadeAudio.startJuke) window.ArcadeAudio.startJuke();
};
document.getElementById("close-juke").onclick = () => document.getElementById("juke-panel").classList.add("hidden");
document.getElementById("play-juke").onclick = () => {
  const id = document.getElementById("song-select").value;
  if (window.ArcadeAudio && window.ArcadeAudio.jukePlay) window.ArcadeAudio.jukePlay(id);
};
document.getElementById("stop-juke").onclick = () => {
  if (window.ArcadeAudio && window.ArcadeAudio.jukeStop) window.ArcadeAudio.jukeStop();
};
document.getElementById("vol-juke").oninput = (e) => {
  if (window.ArcadeAudio && window.ArcadeAudio.setJukeVolume) window.ArcadeAudio.setJukeVolume(parseFloat(e.target.value));
};

function populateSongs() {
  const sel = document.getElementById("song-select");
  sel.innerHTML = "";
  if (window.ArcadeAudio && window.ArcadeAudio.SONGS) {
    Object.keys(window.ArcadeAudio.SONGS).forEach(id => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = window.ArcadeAudio.SONGS[id].title || id;
      sel.appendChild(opt);
    });
  }
}

// Join via URL
const params = new URLSearchParams(window.location.search);
if (params.has("room")) {
  const room = params.get("room");
  state.mode = "pvp";
  state.isHost = false;
  state.peer = new Peer();
  state.peer.on("open", () => {
    state.conn = state.peer.connect(room);
    state.conn.on("open", () => {
      setupConnection();
      beginPlacement();
    });
  });
}

console.log("Parques en Guerra listo 🇦🇷");
