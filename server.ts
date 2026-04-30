import express from "express";
import sqlite3 from "sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { Player } from "./player.js";
import {
  generateUUID,
  getRandomColor,
  getRandomPosition,
  getSafeApplePosition,
} from "./utils.js";

type AppleType = "normal" | "golden" | "blue" | "green";

const SETTINGS = {
  BOARD_WIDTH: 800,
  BOARD_HEIGHT: 800,
  CELL_SIZE: 40,
  APPLE_COUNT: 10,
  INITIAL_LENGTH: 5,
  TICK_RATE: 10,
};

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "matches.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Failed to connect to database:", err);
  } else {
    db.run(
      `CREATE TABLE IF NOT EXISTS matches (
        ID INTEGER PRIMARY KEY AUTOINCREMENT,
        Player_1_ID TEXT NOT NULL,
        Player_2_ID TEXT NOT NULL,
        Winner_Player_ID TEXT
      )`
    );
  }
});

function saveMatchResult(player1Id: string, player2Id: string, winnerId: string | null) {
  db.run(
    `INSERT INTO matches (Player_1_ID, Player_2_ID, Winner_Player_ID) VALUES (?, ?, ?)`,
    [player1Id, player2Id, winnerId],
    (err) => {
      if (err) {
        console.error("Failed to save match result:", err);
      }
    }
  );
}

app.get("/matches", (_req, res) => {
  db.all(
    "SELECT ID, Player_1_ID, Player_2_ID, Winner_Player_ID FROM matches ORDER BY ID DESC",
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: "Failed to fetch matches" });
      } else {
        res.json(rows);
      }
    }
  );
});

let players: Player[] = [];
let randomApples: {
  id: string;
  pos: { x: number; y: number };
  type: AppleType;
}[] = [];
let gameLoop: NodeJS.Timeout | null = null;
let gameStarted = false;
const opposites: Record<string, string> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

function getRandomAppleType(): AppleType {
  const roll = Math.random();
  if (roll < 0.05) return "green";
  if (roll < 0.15) return "blue";
  if (roll < 0.3) return "golden";
  return "normal";
}

function spawnApples() {
  const occupiedPoints = players.flatMap((p) => p.body);
  randomApples = [];
  for (let i = 0; i < SETTINGS.APPLE_COUNT; i++) {
    randomApples.push({
      id: generateUUID(),
      pos: getSafeApplePosition(
        SETTINGS.BOARD_WIDTH,
        SETTINGS.BOARD_HEIGHT,
        SETTINGS.CELL_SIZE,
        occupiedPoints,
      ),
      type: getRandomAppleType(),
    });
  }
}

io.on("connection", (socket) => {
  if (players.length >= 2) {
    console.log("2 users are connected, rejecting new connection", socket.id);
    socket.emit("enough_users");
    socket.disconnect();
    return;
  }

  console.log("a user connected", socket.id);
  const newPlayer = new Player(
    socket.id,
    getRandomColor(players.map((p) => p.color)),
    getRandomPosition(SETTINGS.BOARD_WIDTH, SETTINGS.BOARD_HEIGHT),
    SETTINGS.INITIAL_LENGTH,
  );
  players.push(newPlayer);

  socket.on("move_player", (data: { direction: string }) => {
    const player = players.find((p) => p.id === socket.id);
    if (player && player.direction !== opposites[data.direction]) {
      player.direction = data.direction;
    }
  });

  socket.on("disconnect", () => {
    console.log("user disconnected", socket.id);
    players = players.filter((p) => p.id !== socket.id);

    if (gameLoop) {
      clearInterval(gameLoop);
      gameLoop = null;
    }
    gameStarted = false;
    randomApples = [];
    gameState();
  });

  socket.on("player_ready", (data: { ready: boolean }) => {
    const player = players.find((p) => p.id === socket.id);
    if (!player) return;
    player.isReady = data.ready;
    gameState();
    tryStartGame();
  });

  gameState();
  tryStartGame();
});

function updateLogic() {
  if (!gameStarted) return;
  movePlayers();
  checkCollisions();
  checkWinner();
  gameState();
}

function wouldCollideWithDirection(
  player: typeof players[0],
  direction: string,
  margin: number = 20
): boolean {
  let dx = 0,
    dy = 0;
  switch (direction) {
    case "up":
      dy = -SETTINGS.CELL_SIZE;
      break;
    case "down":
      dy = SETTINGS.CELL_SIZE;
      break;
    case "left":
      dx = -SETTINGS.CELL_SIZE;
      break;
    case "right":
      dx = SETTINGS.CELL_SIZE;
      break;
  }

  const nextX = player.pos.x + dx;
  const nextY = player.pos.y + dy;

  // Check wall collision
  if (
    nextX < margin ||
    nextX > SETTINGS.BOARD_WIDTH - margin ||
    nextY < margin ||
    nextY > SETTINGS.BOARD_HEIGHT - margin
  ) {
    return true;
  }

  // Check self collision (skip head)
  if (player.body.slice(1).some((s) => s.x === nextX && s.y === nextY)) {
    return true;
  }

  // Check other snake collision
  if (
    players.some(
      (other) =>
        player.id !== other.id &&
        other.body.some((s) => s.x === nextX && s.y === nextY)
    )
  ) {
    return true;
  }

  return false;
}

function movePlayers() {
  players.forEach((p) => {
    if (!p.isAlive() || !p.direction) return;

    let directionToUse = p.direction;

    // If current direction would cause collision, find a safe direction
    if (wouldCollideWithDirection(p, directionToUse)) {
      const safeDirections: string[] = [];
      const possibleDirs = ["up", "down", "left", "right"];

      // Find all safe directions (simple collision check, no BFS needed here)
      for (const dir of possibleDirs) {
        if (dir !== opposites[directionToUse] && !wouldCollideWithDirection(p, dir)) {
          safeDirections.push(dir);
        }
      }

      // Pick a safe direction - prefer the one moving toward closest apple
      if (safeDirections.length > 0) {
        if (randomApples.length > 0) {
          // Simple greedy: pick safe direction closest to nearest apple
          let closestApple = randomApples[0];
          let bestDist = Infinity;
          randomApples.forEach((a) => {
            const d = Math.abs(p.pos.x - a.pos.x) + Math.abs(p.pos.y - a.pos.y);
            if (d < bestDist) {
              bestDist = d;
              closestApple = a;
            }
          });

          // Pick safe direction that moves closer to apple
          let bestSafeDir = safeDirections[0];
          let bestScore = Infinity;
          safeDirections.forEach((dir) => {
            let nextX = p.pos.x,
              nextY = p.pos.y;
            if (dir === "up") nextY -= SETTINGS.CELL_SIZE;
            else if (dir === "down") nextY += SETTINGS.CELL_SIZE;
            else if (dir === "left") nextX -= SETTINGS.CELL_SIZE;
            else if (dir === "right") nextX += SETTINGS.CELL_SIZE;

            const dist = Math.abs(nextX - closestApple.pos.x) + Math.abs(nextY - closestApple.pos.y);
            if (dist < bestScore) {
              bestScore = dist;
              bestSafeDir = dir;
            }
          });
          directionToUse = bestSafeDir;
        } else {
          directionToUse = safeDirections[0];
        }
      }
    }

    let dx = 0,
      dy = 0;
    switch (directionToUse) {
      case "up":
        dy = -SETTINGS.CELL_SIZE;
        break;
      case "down":
        dy = SETTINGS.CELL_SIZE;
        break;
      case "left":
        dx = -SETTINGS.CELL_SIZE;
        break;
      case "right":
        dx = SETTINGS.CELL_SIZE;
        break;
    }

    const visitedPositions = p.movePlayer(
      dx,
      dy,
      SETTINGS.BOARD_WIDTH,
      SETTINGS.BOARD_HEIGHT,
    );

    if (visitedPositions.length > 0) {
      handleAppleEating(p, visitedPositions);
    }
  });
}

function checkCollisions() {
  players.forEach((p) => {
    if (!p.isAlive()) return;

    const hitSelf = p.body
      .slice(1)
      .some((s) => s.x === p.pos.x && s.y === p.pos.y);
    const hitOther = players.some(
      (other) =>
        p.id !== other.id &&
        other.body.some((s) => s.x === p.pos.x && s.y === p.pos.y),
    );

    if (hitSelf || hitOther) {
      p.applyDamage();
    }
  });
}

function checkWinner() {
  const alivePlayers = players.filter((p) => p.isAlive());

  if (players.length >= 2 && alivePlayers.length <= 1) {
    const winnerId = alivePlayers[0]?.id || null;
    io.emit("game_over", { winnerId });
    if (players[0] && players[1]) {
      saveMatchResult(players[0].id, players[1].id, winnerId);
    }
    if (winnerId) {
      console.log("Winner:", winnerId);
    } else {
      console.log("Draw: both snakes are too short.");
    }
    if (gameLoop) {
      clearInterval(gameLoop);
      gameLoop = null;
    }
    gameStarted = false;
  }
}

function handleAppleEating(
  player: Player,
  positions: { x: number; y: number }[],
) {
  positions.forEach((pos) => {
    const appleIndex = randomApples.findIndex(
      (a) => a.pos.x === pos.x && a.pos.y === pos.y,
    );

    if (appleIndex === -1) return;

    const apple = randomApples[appleIndex];
    const occupied = players.flatMap((player) => player.body);

    switch (apple.type) {
      case "golden":
        player.grow(3);
        break;
      case "blue":
        player.increaseSpeed();
        break;
      case "green":
        player.applyDamage();
        break;
      default:
        player.grow(1);
    }

    randomApples[appleIndex] = {
      id: generateUUID(),
      pos: getSafeApplePosition(
        SETTINGS.BOARD_WIDTH,
        SETTINGS.BOARD_HEIGHT,
        SETTINGS.CELL_SIZE,
        occupied,
      ),
      type: getRandomAppleType(),
    };
    io.emit("send_apple_data", randomApples);
  });
}

function playersReady(): boolean {
  return players.length === 2 && players.every((player) => player.isReady);
}

function tryStartGame() {
  if (gameStarted || gameLoop || !playersReady()) return;

  gameStarted = true;
  spawnApples();
  io.emit("send_apple_data", randomApples);
  io.emit("game_started");
  gameState();
  gameLoop = setInterval(updateLogic, 1000 / SETTINGS.TICK_RATE);
}

function gameState() {
  io.emit(
    "player_moved",
    players.map((p) => ({
      id: p.id,
      color: p.color,
      pos: p.pos,
      body: p.body,
      length: p.length,
      speed: p.speed,
      direction: p.direction,
      isAlive: p.isAlive(),
      isReady: p.isReady,
    })),
  );
}

server.listen(3000, () => {
  console.log("server running at http://localhost:3000");
});
