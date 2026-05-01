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
  MAX_LENGTH: 40,
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
let playerStates: Record<string, {
  id: string;
  pos: { x: number; y: number };
  body: { x: number; y: number }[];
  length: number;
  speed: number;
  direction: string;
  isAlive: boolean;
  isReady: boolean;
  color: string;
}> = {};
let randomApples: {
  id: string;
  pos: { x: number; y: number };
  type: AppleType;
}[] = [];
let gameLoop: NodeJS.Timeout | null = null;
let gameStarted = false;
let matchResultSaved = false;

function getRandomAppleType(): AppleType {
  const roll = Math.random();
  if (roll < 0.05) return "green";
  if (roll < 0.15) return "blue";
  if (roll < 0.3) return "golden";
  return "normal";
}

function spawnApples() {
  const occupiedPoints = Object.values(playerStates).flatMap((p) => p.body);
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

function endGame(winnerId: string | null) {
  if (!gameStarted && matchResultSaved) return;

  io.emit("game_over", { winnerId });

  const playerIds = Object.keys(playerStates);
  if (!matchResultSaved && playerIds.length >= 2) {
    saveMatchResult(playerIds[0], playerIds[1], winnerId);
    matchResultSaved = true;
  }

  if (winnerId) {
    console.log("Winner:", winnerId);
  } else {
    console.log("Draw.");
  }

  if (gameLoop) {
    clearInterval(gameLoop);
    gameLoop = null;
  }
  gameStarted = false;
}

function getOpponentId(playerId: string): string | null {
  return Object.keys(playerStates).find((id) => id !== playerId) || null;
}

function handlePlayerDeath(playerId: string) {
  const playerState = playerStates[playerId];
  if (!playerState) return;

  playerState.isAlive = false;
  playerState.length = 0;

  const opponentId = getOpponentId(playerId);
  const opponent = opponentId ? playerStates[opponentId] : null;
  const winnerId = opponent?.isAlive ? opponent.id : null;
  broadcastGameState();
  endGame(winnerId);
}

function handleMaxLengthReached(playerId: string, length?: number) {
  const playerState = playerStates[playerId];
  if (!playerState) return;

  if (typeof length === "number") {
    playerState.length = length;
  }

  if (playerState.length > SETTINGS.MAX_LENGTH) {
    playerState.isAlive = true;
    broadcastGameState();
    endGame(playerId);
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
  playerStates[socket.id] = {
    id: socket.id,
    pos: newPlayer.pos,
    body: [...newPlayer.body],
    length: newPlayer.length,
    speed: newPlayer.speed,
    direction: newPlayer.direction,
    isAlive: newPlayer.isAlive(),
    isReady: false,
    color: newPlayer.color,
  };

  socket.on("update_snake_state", (data: any) => {
    if (playerStates[socket.id]) {
      playerStates[socket.id] = {
        ...playerStates[socket.id],
        pos: data.pos,
        body: data.body,
        length: data.length,
        speed: data.speed,
        direction: data.direction,
        isAlive: data.isAlive,
      };

      if (data.wonByLength || data.length > SETTINGS.MAX_LENGTH) {
        handleMaxLengthReached(socket.id, data.length);
      } else if (data.isAlive === false) {
        handlePlayerDeath(socket.id);
      }
    }
  });

  socket.on("player_died", () => {
    handlePlayerDeath(socket.id);
  });

  socket.on("max_length_reached", (data: { id?: string; length?: number }) => {
    handleMaxLengthReached(socket.id, data.length);
  });

  socket.on("apple_collected", (data: { id?: string; pos?: { x: number; y: number }; type?: AppleType }) => {
    const appleIndex = randomApples.findIndex((apple) => {
      if (data.id && apple.id === data.id) return true;
      return data.pos && apple.pos.x === data.pos.x && apple.pos.y === data.pos.y;
    });

    if (appleIndex === -1) return;

    const occupied = Object.values(playerStates).flatMap((p) => p.body);
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

    broadcastGameState();
  });

  socket.on("disconnect", () => {
    console.log("user disconnected", socket.id);
    players = players.filter((p) => p.id !== socket.id);
    delete playerStates[socket.id];

    if (gameLoop) {
      clearInterval(gameLoop);
      gameLoop = null;
    }
    gameStarted = false;
    matchResultSaved = false;
    randomApples = [];
    broadcastGameState();
  });

  socket.on("player_ready", (data: { ready: boolean }) => {
    const player = players.find((p) => p.id === socket.id);
    if (!player) return;
    player.isReady = data.ready;
    if (playerStates[socket.id]) {
      playerStates[socket.id].isReady = data.ready;
    }
    broadcastGameState();
    tryStartGame();
  });

  broadcastGameState();
  tryStartGame();
});

function updateLogic() {
  if (!gameStarted) return;
  checkAppleCollisions();
  checkWinner();
  broadcastGameState();
}

function checkAppleCollisions() {
  Object.keys(playerStates).forEach((playerId) => {
    const playerState = playerStates[playerId];
    if (!playerState || !playerState.isAlive) return;

    playerState.body.forEach((pos) => {
      const appleIndex = randomApples.findIndex(
        (a) => a.pos.x === pos.x && a.pos.y === pos.y,
      );

      if (appleIndex === -1) return;

      const occupied = Object.values(playerStates)
        .flatMap((p) => p.body);

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
    });
  });
}

function checkWinner() {
  const alivePlayers = Object.values(playerStates).filter((p) => p.isAlive);
  const lengthWinner = Object.values(playerStates).find((p) => p.length > SETTINGS.MAX_LENGTH);

  if (lengthWinner) {
    endGame(lengthWinner.id);
    return;
  }

  if (Object.keys(playerStates).length >= 2 && alivePlayers.length <= 1) {
    const winnerId = alivePlayers[0]?.id || null;
    endGame(winnerId);
  }
}

function playersReady(): boolean {
  return Object.keys(playerStates).length === 2 && Object.values(playerStates).every((p) => p.isReady);
}

function tryStartGame() {
  if (gameStarted || gameLoop || !playersReady()) return;

  gameStarted = true;
  matchResultSaved = false;
  spawnApples();
  broadcastGameState();
  io.emit("game_started");
  gameLoop = setInterval(updateLogic, 1000 / SETTINGS.TICK_RATE);
}

function broadcastGameState() {
  io.emit(
    "player_moved",
    Object.values(playerStates),
  );
  io.emit("send_apple_data", randomApples);
}

server.listen(3000, () => {
  console.log("server running at http://localhost:3000");
});
