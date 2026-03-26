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

const FPS = 60;
const FRAME_TIME = 1000 / FPS;
let gameLoop: NodeJS.Timeout | null = null;

const APPLE_PICKUP_RADIUS = 25;
const PLAYER_SPEED = 5;

let randomAppleNum = Math.random() * 25;
const randomApples: { id: string, pos: { x: number, y: number } }[] = [];
while (randomAppleNum > 0) {
  randomAppleNum--;
  const randomPos = getRandomPosition(1000, 1000, 200);
  randomApples.push({ id: generateUUID(), pos: { x: randomPos.x, y: randomPos.y } });
}

function getDistance(p1: { x: number, y: number }, p2: { x: number, y: number }) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
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
      const speed = 10;
      let dx = 0, dy = 0;
      switch (data.direction) {
        case 'up':
          dy = -speed;
          break;
        case 'down':
          dy = speed;
          break;
        case 'left':
          dx = -speed;
          break;
        case 'right':
          dx = speed;
          break;
      }
      player.movePlayer(dx, dy);
      player.pos.x = Math.max(0, Math.min(windowWidth || 1000, player.pos.x));
      player.pos.y = Math.max(0, Math.min(windowHeight || 1000, player.pos.y));
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

  socket.on("player_died", (data: { id: string }) => {
    const player = players.find(p => p.id === data.id);
    if (player) {
      player.resetBody();
      io.emit("game_over", { id: player.id });
      clearInterval(gameLoop!);
      gameLoop = null;
    }
  });


  if (players.length === 2 && !gameLoop) {
    io.emit('send_player_data', players);
    io.emit('send_apple_data', randomApples);

    const AVOID_DISTANCE = 120;
    const COLLISION_RADIUS = 15;
    const COLLISION_DAMAGE = 20;

    gameLoop = setInterval(() => {
      // Handle pickups after movement
      players.forEach((player) => {
        const closestApple = findClosestApple(player.pos);
        if (closestApple && getDistance(player.pos, closestApple.pos) <= APPLE_PICKUP_RADIUS) {
          player.grow();
          const index = randomApples.findIndex((a) => a.id === closestApple.id);
          if (index !== -1) {
            randomApples.splice(index, 1);
            const newApplePos = getRandomPosition(windowWidth || 1000, windowHeight || 1000);
            randomApples.push({ id: generateUUID(), pos: { x: newApplePos.x, y: newApplePos.y } });
            io.emit('apple_picked', { playerId: player.id, appleId: closestApple.id });
          }
        }
      });

      // Handle collision detection
      players.forEach((player) => {
        if (!player.isAlive()) return;
        players.forEach((other) => {
          if (other.id === player.id || !other.isAlive()) return;
          for (const segment of other.body) {
            if (getDistance(player.pos, segment) <= COLLISION_RADIUS) {
              const result = player.applyDamage();
              io.emit('player_hit', {
                crashed: player.id,
                crasher: other.id,
                length: player.length,
                died: result === 'died',
              });
              break;
            }
          }
        });
      });

      io.emit('player_moved', players.map((p) => ({ id: p.id, pos: p.pos, body: p.body, length: p.length })));
      io.emit('send_apple_data', randomApples);
    }, FRAME_TIME);
  }

});

server.listen(3000, () => {
  console.log('server running at http://localhost:3000');
});