const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

// Servir los archivos estáticos del frontend (mismo directorio)
app.use(express.static(path.join(__dirname, 'public')));

// ── Estado en memoria ──────────────────────────────────────────
let cartas   = [];
let dibujos  = [];
let rpsScore = { win: 0, lose: 0, tie: 0 };
const connected = {}; // socketId -> who

io.on('connection', (socket) => {

  socket.on('join', (who) => {
    connected[socket.id] = who;
    socket.emit('init', { cartas, dibujos, rpsScore });
    io.emit('online', Object.values(connected));
  });

  socket.on('carta:send', (texto) => {
    const who = connected[socket.id];
    if (!who || !texto.trim()) return;
    const carta = { de: who, texto: texto.trim(), fecha: new Date().toISOString(), leida: false };
    cartas.push(carta);
    io.emit('carta:updated', cartas);
  });

  socket.on('carta:read', (who) => {
    cartas.forEach(c => { if (c.de !== who) c.leida = true; });
    io.emit('carta:updated', cartas);
  });

  socket.on('dibujo:save', (dataUrl) => {
    const who = connected[socket.id];
    if (!who) return;
    const d = { de: who, dataUrl, fecha: new Date().toISOString() };
    dibujos.push(d);
    if (dibujos.length > 20) dibujos.shift();
    io.emit('dibujo:new', d);
  });

  socket.on('dibujo:stroke', (data) => {
    socket.broadcast.emit('dibujo:stroke', data);
  });

  socket.on('dibujo:clear', () => {
    socket.broadcast.emit('dibujo:clear');
  });

  socket.on('rps:score', (score) => {
    rpsScore = score;
    io.emit('rps:score', rpsScore);
  });

  socket.on('ttt:move', (data) => {
    io.emit('ttt:move', data);
  });

  socket.on('ttt:reset', () => {
    io.emit('ttt:reset');
  });

  socket.on('disconnect', () => {
    delete connected[socket.id];
    io.emit('online', Object.values(connected));
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`MonAmour corriendo en puerto ${PORT}`);
});
