// Batalla Naval Parques - game.js
const GRID = 10;
const SHIPS = [
  { name: "Portaaviones", size: 5 },
  { name: "Acorazado", size: 4 },
  { name: "Crucero", size: 3 },
  { name: "Submarino", size: 3 },
  { name: "Destructor", size: 2 }
];

let state = {
  map: "nahuel",
  mode: "pvc",
  invader: "chile",
  phase: "menu", // menu, place, battle
  currentPlayer: "arg", // arg or inv
  boards: { arg: null, inv: null },
  powers: { radar: 2, bomb: 1, camo: 2 },
  placing: { shipIndex: 0, horizontal: true }
};

const ownCanvas = document.getElementById("own-board");
const enemyCanvas = document.getElementById("enemy-board");
const ownCtx = ownCanvas.getContext("2d");
const enemyCtx = enemyCanvas.getContext("2d");

function createBoard() {
  const board = Array.from({ length: GRID }, () => Array(GRID).fill({ ship: null, hit: false, miss: false }));
  return board;
}

function placeShipsRandom(board) {
  SHIPS.forEach((ship, idx) => {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 100) {
      const horizontal = Math.random() > 0.5;
      const x = Math.floor(Math.random() * (horizontal ? GRID - ship.size + 1 : GRID));
      const y = Math.floor(Math.random() * (horizontal ? GRID : GRID - ship.size + 1));
      if (canPlace(board, x, y, ship.size, horizontal)) {
        placeShip(board, x, y, ship.size, horizontal, idx);
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
    if (cx >= GRID || cy >= GRID || board[cy][cx].ship !== null) return false;
  }
  return true;
}

function placeShip(board, x, y, size, horizontal, shipId) {
  for (let i = 0; i < size; i++) {
    const cx = horizontal ? x + i : x;
    const cy = horizontal ? y : y + i;
    board[cy][cx].ship = shipId;
  }
}

function drawBoard(ctx, board, showShips = false, map = "nahuel") {
  const cell = 40;
  ctx.clearRect(0, 0, 400, 400);
  // Background themed
  if (map === "nahuel") ctx.fillStyle = "#38bdf8";
  else if (map === "iguazu") ctx.fillStyle = "#22c55e";
  else ctx.fillStyle = "#bae6fd";
  ctx.fillRect(0, 0, 400, 400);

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const cellData = board[y][x];
      ctx.strokeStyle = "#0f172a";
      ctx.strokeRect(x * cell, y * cell, cell, cell);
      if (showShips && cellData.ship !== null) {
        ctx.fillStyle = "#1e3a8a";
        ctx.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
      }
      if (cellData.hit) {
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(x * cell + 20, y * cell + 20, 12, 0, Math.PI * 2);
        ctx.fill();
      } else if (cellData.miss) {
        ctx.fillStyle = "#94a3b8";
        ctx.beginPath();
        ctx.arc(x * cell + 20, y * cell + 20, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function shoot(board, x, y) {
  if (board[y][x].hit || board[y][x].miss) return null;
  if (board[y][x].ship !== null) {
    board[y][x].hit = true;
    return "hit";
  } else {
    board[y][x].miss = true;
    return "miss";
  }
}

function checkWin(board) {
  return board.every(row => row.every(cell => cell.ship === null || cell.hit));
}

function aiShoot(board) {
  // Simple AI: random, prefer near hits
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

// Menu handlers
document.querySelectorAll(".map-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".map-btn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    state.map = btn.dataset.map;
  });
});
document.getElementById("mode-pvp").onclick = () => { state.mode = "pvp"; };
document.getElementById("mode-pvc").onclick = () => { state.mode = "pvc"; };
document.getElementById("start-btn").onclick = startGame;
document.getElementById("back-btn").onclick = () => {
  document.getElementById("game").classList.add("hidden");
  document.getElementById("menu").classList.remove("hidden");
};

function startGame() {
  document.getElementById("menu").classList.add("hidden");
  document.getElementById("game").classList.remove("hidden");
  document.body.className = `map-${state.map}`;
  state.phase = "place";
  state.boards.arg = createBoard();
  state.boards.inv = createBoard();
  placeShipsRandom(state.boards.inv); // AI or opponent places
  if (state.mode === "pvc") placeShipsRandom(state.boards.arg); // auto for demo
  state.placing.shipIndex = 0;
  updateUI();
  drawAll();
  document.getElementById("message").textContent = state.mode === "pvp" ? "Argentina: colocá tus barcos (clic en tablero propio)" : "Barcos colocados. ¡A batallar!";
  if (state.mode === "pvc") {
    state.phase = "battle";
    nextTurn();
  }
}

function drawAll() {
  drawBoard(ownCtx, state.boards.arg, true, state.map);
  drawBoard(enemyCtx, state.boards.inv, false, state.map);
}

enemyCanvas.addEventListener("click", (e) => {
  if (state.phase !== "battle" || state.currentPlayer !== "arg") return;
  const rect = enemyCanvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / 40);
  const y = Math.floor((e.clientY - rect.top) / 40);
  if (x < 0 || x >= GRID || y < 0 || y >= GRID) return;
  const result = shoot(state.boards.inv, x, y);
  if (!result) return;
  document.getElementById("message").textContent = result === "hit" ? "¡Impacto!" : "Agua...";
  if (checkWin(state.boards.inv)) {
    alert("¡Argentina gana!");
    return;
  }
  drawAll();
  state.currentPlayer = "inv";
  setTimeout(() => aiTurn(), 800);
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

function nextTurn() {
  updateUI();
  drawAll();
}

function updateUI() {
  document.getElementById("turn-indicator").textContent = state.currentPlayer === "arg" ? "Turno de Argentina 🇦🇷" : "Turno del Invasor";
  document.getElementById("arg-hp").textContent = "100"; // TODO: calculate from hits
  document.getElementById("inv-hp").textContent = "100";
}

// Powers stubs
document.getElementById("power-radar").onclick = () => {
  if (state.powers.radar <= 0) return;
  state.powers.radar--;
  document.getElementById("message").textContent = "Radar activado: revelando área...";
  // TODO: reveal 2x2
};
document.getElementById("power-bomb").onclick = () => {
  if (state.powers.bomb <= 0) return;
  state.powers.bomb--;
  document.getElementById("message").textContent = "¡Bomba! Disparo de área";
};
document.getElementById("power-camo").onclick = () => {
  if (state.powers.camo <= 0) return;
  state.powers.camo--;
  document.getElementById("message").textContent = "Camuflaje activado";
};

// Jukebox integration
document.getElementById("juke-btn").onclick = () => {
  document.getElementById("juke-panel").classList.remove("hidden");
  populateSongs();
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

// Init
document.querySelector(".map-btn").classList.add("selected");
console.log("Batalla Naval Parques listo 🇦🇷");
