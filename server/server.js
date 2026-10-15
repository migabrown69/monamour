const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

// Servir los archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '..')));

// ── Estado en memoria ──────────────────────────────────────────
let cartas  = [];
let dibujos = [];
let rpsScore = { win: 0, lose: 0, tie: 0 };

// Usuarios conectados: { socketId -> who ('el'|'ella') }
const connected = {};

// ── Socket.io ──────────────────────────────────────────────────
io.on('connection', (socket) => {

  // 1. El cliente se identifica al conectar
  socket.on('join', (who) => {
    connected[socket.id] = who;
    // Enviarle el estado actual
    socket.emit('init', { cartas, dibujos, rpsScore });
    // Notificar a todos quién está online
    io.emit('online', Object.values(connected));
  });

  // 2. Nueva carta
  socket.on('carta:send', (texto) => {
    const who = connected[socket.id];
    if (!who || !texto.trim()) return;
    const carta = { de: who, texto: texto.trim(), fecha: new Date().toISOString(), leida: false };
    cartas.push(carta);
    io.emit('carta:new', carta);          // broadcast a todos
  });

  // 3. Marcar cartas leídas
  socket.on('carta:read', (who) => {
    cartas.forEach(c => { if (c.de !== who) c.leida = true; });
    io.emit('carta:updated', cartas);
  });

  // 4. Guardar dibujo
  socket.on('dibujo:save', (dataUrl) => {
    const who = connected[socket.id];
    if (!who) return;
    const d = { de: who, dataUrl, fecha: new Date().toISOString() };
    dibujos.push(d);
    if (dibujos.length > 20) dibujos.shift();
    io.emit('dibujo:new', d);
  });

  // 5. Dibujo en tiempo real (trazo)
  socket.on('dibujo:stroke', (data) => {
    // Reenviar a los demás (no al emisor)
    socket.broadcast.emit('dibujo:stroke', data);
  });

  // 6. Limpiar pizarra
  socket.on('dibujo:clear', () => {
    socket.broadcast.emit('dibujo:clear');
  });

  // 7. RPS score
  socket.on('rps:score', (score) => {
    rpsScore = score;
    io.emit('rps:score', rpsScore);
  });

  // 8. Tres en raya: movimiento
  socket.on('ttt:move', (data) => {
    io.emit('ttt:move', data);           // { index, player }
  });

  socket.on('ttt:reset', () => {
    io.emit('ttt:reset');
  });

  // 9. Desconexión
  socket.on('disconnect', () => {
    delete connected[socket.id];
    io.emit('online', Object.values(connected));
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`MonAmour server corriendo en http://localhost:${PORT}`);
});
