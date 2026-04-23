import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { Player } from './player.js';
import { generateUUID, getRandomColor, getRandomPosition, getSafeApplePosition } from './utils.js';

const SETTINGS = {
    BOARD_WIDTH: 800,
    BOARD_HEIGHT: 800,
    CELL_SIZE: 40,
    APPLE_COUNT: 10,
    INITIAL_LENGTH: 3,
    TICK_RATE: 10,
};

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

let players: Player[] = [];
let randomApples: { id: string, pos: { x: number, y: number } }[] = [];
let gameLoop: NodeJS.Timeout | null = null;
const opposites: Record<string, string> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const occupiedPoints = players.flatMap(p => p.body);

function spawnApples() {
    randomApples = [];
    for (let i = 0; i < SETTINGS.APPLE_COUNT; i++) {
        randomApples.push({ 
            id: generateUUID(), 
            pos: getSafeApplePosition(SETTINGS.BOARD_WIDTH, SETTINGS.BOARD_HEIGHT, SETTINGS.CELL_SIZE, occupiedPoints)
        });
    }
}

io.on('connection', (socket) => {
  if (players.length >= 2) {
    console.log('2 users are connected, rejecting new connection', socket.id);
    socket.emit('enough_users');
    socket.disconnect();
    return;
  }

  console.log('a user connected', socket.id);
  const newPlayer = new Player(socket.id, getRandomColor(), getRandomPosition(SETTINGS.BOARD_WIDTH, SETTINGS.BOARD_HEIGHT));
  players.push(newPlayer);

  socket.on('move_player', (data: { direction: string }) => {
    const player = players.find(p => p.id === socket.id);
    if (player && player.direction !== opposites[data.direction]) {
      player.direction = data.direction;
    }
  });

  socket.on('disconnect', () => {
    console.log('user disconnected', socket.id);
    players = players.filter(p => p.id !== socket.id);

    if (gameLoop && players.length < 2) {
      clearInterval(gameLoop);
      gameLoop = null;
    }
    randomApples = [];
  });

  if (players.length === 2 && !gameLoop) {
    spawnApples();
    socket.emit('send_apple_data', randomApples);

    gameLoop = setInterval(updateLogic, 1000 / SETTINGS.TICK_RATE);
  }
});

function updateLogic() {
  movePlayers();
  checkCollisions();
  checkWinner();
  handleAppleEating();
  gameState();
}

function movePlayers() {
  players.forEach(p => {
    if (!p.isAlive || !p.direction) return;

    let dx = 0, dy = 0;
    switch (p.direction) {
      case 'up': dy = -SETTINGS.CELL_SIZE; break;
      case 'down': dy = SETTINGS.CELL_SIZE; break;
      case 'left': dx = -SETTINGS.CELL_SIZE; break;
      case 'right': dx = SETTINGS.CELL_SIZE; break;
    }
    p.movePlayer(dx, dy);
  });
}

function checkCollisions() {
  players.forEach(p => {
    if (!p.isAlive) return;

    const hitSelf = p.body.slice(1).some(s => s.x === p.pos.x && s.y === p.pos.y);  
    const hitOther = players.some(other => 
      p.id !== other.id && other.body.some(s => s.x === p.pos.x && s.y === p.pos.y)
    );

    if (hitSelf || hitOther) {
      p.applyDamage();
    }
  });
}

function checkWinner() {
  const alivePlayers = players.filter(p => p.isAlive());

  if (players.length >= 2 && alivePlayers.length === 1) {
    const winner = alivePlayers[0];
    io.emit('game_over', { winnerId: winner.id });
    console.log("Győztes:", winner.id);
  }
}

function handleAppleEating() {
  players.forEach(p => {
    if (!p.isAlive) return;
    
    const appleIndex = randomApples.findIndex(a => a.pos.x === p.pos.x && a.pos.y === p.pos.y);

    if (appleIndex !== -1) {
      p.grow();
      const occupied = players.flatMap(player => player.body);
      
      randomApples[appleIndex] = {
        id: generateUUID(),
        pos: getSafeApplePosition(SETTINGS.BOARD_WIDTH, SETTINGS.BOARD_HEIGHT, SETTINGS.CELL_SIZE, occupied)
      };
      io.emit('send_apple_data', randomApples);
    }
  });
}

function gameState() {
  io.emit('player_moved', players.map(p => ({
    id: p.id,
    color: p.color,
    pos: p.pos,
    body: p.body,
    length: p.length,
    direction: p.direction,
    isAlive: p.isAlive
  })));
}

server.listen(3000, () => {
  console.log('server running at http://localhost:3000');
});