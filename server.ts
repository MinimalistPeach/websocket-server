import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { Player } from './player.js';
import { getRandomColor } from './utils.js';

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

io.on('connection', (socket) => {
  if (connectedUsers >= 2) {
    console.log('2 users are connected, rejecting new connection', socket.id);
    socket.emit('enough_users');
    socket.disconnect();
    return;
  }

  console.log('a user connected', socket.id);
  connectedUsers++;
  console.log(connectedUsers + '/2 users connected');
  players.push(new Player(socket.id, getRandomColor(), { x: 0, y: 0 }));
  socket.on('disconnect', () => {
    console.log('user disconnected', socket.id);
    players = players.filter(p => p.id !== socket.id);
    connectedUsers--;
  });
  if (players.length === 2) {
    socket.on('move_player', (dx: number, dy: number) => {
      const player = players.find(p => p.id === socket.id);
      if (player) {
        player.movePlayer(dx, dy);
        io.emit('player_moved', { id: player.id, pos: player.pos });
        if (player.getDistanceFromOtherPlayer(players.find(p => p.id !== player.id)!) < 10) {
          io.emit('set_health', { id: player.id, health: player.health - 10 });
        }
      }
    });
  }

});

server.listen(3000, () => {
  console.log('server running at http://localhost:3000');
});