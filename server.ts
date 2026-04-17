import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { Player } from './player.js';
import { generateUUID, getRandomColor, getRandomPosition } from './utils.js';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

let players: Player[] = [];

let connectedUsers = 0;

let windowWidth = 0;
let windowHeight = 0;

const TICK_RATE = 20;
const FRAME_TIME = 1000 / TICK_RATE;
let gameLoop: NodeJS.Timeout | null = null;

const opposites: Record<string, string> = { up: 'down', down: 'up', left: 'right', right: 'left' };

const APPLE_PICKUP_RADIUS = 25;

const APPLE_COUNT = 10;
const randomApples: { id: string, pos: { x: number, y: number } }[] = [];
for (let i = 0; i < APPLE_COUNT; i++) {
  const randomPos = getRandomPosition(800, 800, 40);
  randomApples.push({ id: generateUUID(), pos: { x: randomPos.x, y: randomPos.y } });
}

function getDistance(p1: { x: number, y: number }, p2: { x: number, y: number }) {
  const maxX = windowWidth || 1000;
  const maxY = windowHeight || 1000;
  let dx = Math.abs(p1.x - p2.x);
  let dy = Math.abs(p1.y - p2.y);
  if (dx > maxX / 2) dx = maxX - dx;
  if (dy > maxY / 2) dy = maxY - dy;
  return Math.sqrt(dx * dx + dy * dy);
}

function findClosestApple(pos: { x: number, y: number }) {
  let nearest = null as { id: string, pos: { x: number, y: number } } | null;
  let bestDist = Infinity;
  for (const apple of randomApples) {
    const d = getDistance(pos, apple.pos);
    if (d < bestDist) {
      bestDist = d;
      nearest = apple;
    }
  }
  return nearest;
}


io.on('connection', (socket) => {
  if (connectedUsers >= 2) {
    console.log('2 users are connected, rejecting new connection', socket.id);
    socket.emit('enough_users');
    socket.disconnect();
    return;
  }

  socket.on('window_details', (data: { width: number, height: number }) => {
    windowWidth = data.width;
    windowHeight = data.height;
    console.log(`Received window details from ${socket.id}: width=${windowWidth}, height=${windowHeight}`);
  });

  console.log('a user connected', socket.id);
  connectedUsers++;
  console.log(connectedUsers + '/2 users connected');
  const newPlayer = new Player(socket.id, getRandomColor(), getRandomPosition(windowWidth, windowHeight));
  players.push(newPlayer);

  socket.on('move_player', (data: { direction: string }) => {
    const player = players.find(p => p.id === socket.id);
    if (player) {
      if (player.direction === opposites[data.direction]) return;
      player.direction = data.direction;
    }
  });

  socket.on('disconnect', () => {
    console.log('user disconnected', socket.id);
    players = players.filter(p => p.id !== socket.id);
    connectedUsers--;
    if (gameLoop) {
      clearInterval(gameLoop);
      gameLoop = null;
    }
  });

  if (players.length === 2 && !gameLoop) {
    io.emit('send_player_data', players);
    io.emit('send_apple_data', randomApples);

    const COLLISION_RADIUS = 15;

    const SPEED = 10;
    gameLoop = setInterval(() => {
      players.forEach((player) => {
        if (!player.direction) return;
        let dx = 0, dy = 0;
        switch (player.direction) {
          case 'up': dy = -SPEED; break;
          case 'down': dy = SPEED; break;
          case 'left': dx = -SPEED; break;
          case 'right': dx = SPEED; break;
        }
        const maxX = windowWidth || 1000;
        const maxY = windowHeight || 1000;
        player.movePlayer(dx, dy);
        player.pos.x = ((player.pos.x % maxX) + maxX) % maxX;
        player.pos.y = ((player.pos.y % maxY) + maxY) % maxY;
      });

      players.forEach((player) => {
        const closestApple = findClosestApple(player.pos);
        if (closestApple && getDistance(player.pos, closestApple.pos) <= APPLE_PICKUP_RADIUS) {
          player.grow();
          const index = randomApples.findIndex((a) => a.id === closestApple.id);
          if (index !== -1) {
            randomApples.splice(index, 1);
            const newApplePos = getRandomPosition(windowWidth || 1000, windowHeight || 1000);
            randomApples.push({ id: generateUUID(), pos: { x: newApplePos.x, y: newApplePos.y } });
          }
        }
      });

      players.forEach((player) => {
        if (!player.isAlive()) return;
      });

      io.emit('player_moved', players.map((p) => ({ id: p.id, pos: p.pos, body: p.body, length: p.length })));
      io.emit('send_apple_data', randomApples);
    }, FRAME_TIME);
  }

});

server.listen(3000, () => {
  console.log('server running at http://localhost:3000');
});