// Parques en Guerra - game.js
const GRID = 10;
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
  peer: null,
  conn: null,
  isHost: false
};

const ownCanvas = document.getElementById("own-board");
const enemyCanvas = document.getElementById("enemy-board");
const ownCtx = ownCanvas.getContext("2d");
const enemyCtx = enemyCanvas.getContext("2d");

function getUnits() {
  return UNITS[state.terrain] || UNITS.agua;
}

function createBoard() {
  return Array.from({ length: GRID }, () => Array(GRID).fill({ unit: null, hit: false, miss: false }));
}

function placeUnitsRandom(board) {
  getUnits().forEach((unit, idx) => {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 100) {
      const horizontal = Math.random() > 0.5;
      const x = Math.floor(Math.random() * (horizontal ? GRID - unit.size + 1 : GRID));
      const y = Math.floor(Math.random() * (horizontal ? GRID : GRID - unit.size + 1));
      if (canPlace(board, x, y, unit.size, horizontal)) {
        placeUnit(board, x, y, unit.size, horizontal, idx);
        placed = true;
      }
      attempts++;
    }
  });
  return board;
}

function canPlace(board, x, y, size, horizontal) {
  for (let i = 0; i < size; i++) {
    const cx = horizontal ? x + i : x;
    const cy = horizontal ? y : y + i;
    if (cx >= GRID || cy >= GRID || board[cy][cx].unit !== null) return false;
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

function drawBoard(ctx, board, showUnits = false, map = "nahuel", terrain = "agua") {
  const size = ctx.canvas.width;
  const cell = size / GRID;
  ctx.clearRect(0, 0, size, size);
  if (terrain === "agua") {
    if (map === "nahuel") ctx.fillStyle = "#38bdf8";
    else if (map === "iguazu") ctx.fillStyle = "#22c55e";
    else ctx.fillStyle = "#bae6fd";
  } else if (terrain === "tierra") {
    if (map === "nahuel") ctx.fillStyle = "#a3e635";
    else if (map === "iguazu") ctx.fillStyle = "#166534";
    else ctx.fillStyle = "#cbd5e1";
  } else {
    ctx.fillStyle = "#64748b";
  }
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const cellData = board[y][x];
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1;
      ctx.strokeRect(x * cell, y * cell, cell, cell);
      if (showUnits && cellData.unit !== null) {
        ctx.fillStyle = terrain === "tierra" ? "#78350f" : "#1e3a8a";
        ctx.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
      }
      if (cellData.hit) {
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(x * cell + cell/2, y * cell + cell/2, cell * 0.3, 0, Math.PI * 2);
        ctx.fill();
      } else if (cellData.miss) {
        ctx.fillStyle = "#94a3b8";
        ctx.beginPath();
        ctx.arc(x * cell + cell/2, y * cell + cell/2, cell * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function shoot(board, x, y) {
  if (x < 0 || y < 0 || x >= GRID || y >= GRID) return null;
  if (board[y][x].hit || board[y][x].miss) return null;
  if (board[y][x].unit !== null) {
    board[y][x].hit = true;
    return "hit";
  } else {
    board[y][x].miss = true;
    return "miss";
  }
}

function checkWin(board) {
  return board.every(row => row.every(cell => cell.unit === null || cell.hit));
}

function aiShoot(board) {
  const candidates = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (!board[y][x].hit && !board[y][x].miss) candidates.push([x, y]);
    }
  }
  if (!candidates.length) return null;
  const [x, y] = candidates[Math.floor(Math.random() * candidates.length)];
  return { x, y };
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
  document.getElementById("game").classList.add("hidden");
  document.getElementById("menu").classList.remove("hidden");
  if (state.peer) try { state.peer.destroy(); } catch(e){}
};

document.getElementById("copy-link").onclick = () => {
  const input = document.getElementById("invite-link");
  input.select();
  navigator.clipboard.writeText(input.value).then(() => alert("Enlace copiado"));
};

function startGame() {
  state.invader = document.getElementById("invader").value;
  if (window.ArcadeAudio && window.ArcadeAudio.startJuke) window.ArcadeAudio.startJuke();
  if (state.mode === "pvp") {
    setupPvP();
    return;
  }
  beginLocalGame();
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
    setTimeout(beginLocalGame, 600);
  });
  state.peer.on("error", err => {
    console.error(err);
    document.getElementById("waiting").textContent = "Error de conexión. Probá de nuevo.";
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

function beginLocalGame() {
  document.getElementById("menu").classList.add("hidden");
  document.getElementById("game").classList.remove("hidden");
  document.body.className = `map-${state.map}`;
  state.phase = "battle";
  state.currentPlayer = "arg";
  state.boards.arg = createBoard();
  state.boards.inv = createBoard();
  placeUnitsRandom(state.boards.inv);
  if (state.mode === "pvc") placeUnitsRandom(state.boards.arg);
  updateUI();
  drawAll();
  document.getElementById("message").textContent = "¡A batallar! Tocá el tablero enemigo";
}

function drawAll() {
  drawBoard(ownCtx, state.boards.arg, true, state.map, state.terrain);
  drawBoard(enemyCtx, state.boards.inv, false, state.map, state.terrain);
}

function getCellFromEvent(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  const clientX = e.clientX || (e.changedTouches && e.changedTouches[0].clientX);
  const clientY = e.clientY || (e.changedTouches && e.changedTouches[0].clientY);
  const x = Math.floor((clientX - rect.left) / (rect.width / GRID));
  const y = Math.floor((clientY - rect.top) / (rect.height / GRID));
  return { x, y };
}

function handleShot(x, y) {
  if (state.phase !== "battle" || state.currentPlayer !== "arg") return;
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
  const result = shoot(state.boards.arg, shot.x, shot.y);
  document.getElementById("message").textContent = result === "hit" ? "¡Te dieron!" : "El invasor falló";
  if (checkWin(state.boards.arg)) {
    alert("¡El invasor gana!");
    return;
  }
  drawAll();
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

// Jukebox panel
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
      beginLocalGame();
    });
    state.conn.on("error", () => alert("No se pudo conectar al host"));
  });
}

console.log("Parques en Guerra listo 🇦🇷");
