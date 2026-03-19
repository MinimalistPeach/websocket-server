import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { Player } from './player.js';
import { getRandomColor, getRandomPosition } from './utils.js';

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
      const speed = 5;
      switch (data.direction) {
        case 'up':
          player.pos.y -= speed;
          break;
        case 'down':
          player.pos.y += speed;
          break;
        case 'left':
          player.pos.x -= speed;
          break;
        case 'right':
          player.pos.x += speed;
          break;
      }
      player.pos.x = Math.max(0, Math.min(windowWidth, player.pos.x));
      player.pos.y = Math.max(0, Math.min(windowHeight, player.pos.y));
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
    gameLoop = setInterval(() => {
      io.emit('player_moved', players.map(p => ({ id: p.id, pos: p.pos })));
    }, FRAME_TIME);
  }

});

server.listen(3000, () => {
  console.log('server running at http://localhost:3000');
});