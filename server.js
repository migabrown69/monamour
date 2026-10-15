const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Persistencia ───────────────────────────────────────────────
const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return { users: {}, cartas: [], dibujos: [], rpsScore: { win: 0, lose: 0, tie: 0 } };
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { users: {}, cartas: [], dibujos: [], rpsScore: { win: 0, lose: 0, tie: 0 } }; }
}

function saveData() { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }

let db = loadData();

function hashPassword(p) { return crypto.createHash('sha256').update(p).digest('hex'); }

// ── Reto del día ───────────────────────────────────────────────
const RETOS = [
  'Dibuja tu estado de ánimo de hoy 🎭',
  'Dibuja una fruta que no te gusta comer 🍉',
  'Dibuja tu animal favorito 🐒',
  'Dibuja el lugar donde más quieres estar 🏡',
  'Dibuja tu comida favorita 🍕',
  'Dibuja cómo ves el día de hoy ☁️',
  'Dibuja algo que te da miedo 👻',
  'Dibuja un sueño que hayas tenido 🌙',
  'Dibuja tu personaje favorito 🦸',
  'Dibuja algo que te haga reír 😂',
  'Dibuja el mejor regalo que podrías recibir 🎁',
  'Dibuja un lugar que quieres visitar juntos ✈️',
  'Dibuja cómo sería tu día perfecto ☀️',
  'Dibuja algo que extrañas 💭',
  'Dibuja un monstruo bonito 🌸',
  'Dibuja tu película favorita en una escena 🎬',
  'Dibuja algo que aprendiste esta semana 📚',
  'Dibuja qué harías si fueran invisibles por un día 👀',
  'Dibuja tu superhéroe inventado 🦸',
  'Dibuja el clima de tu corazón hoy 🌈',
  'Dibuja algo pequeño que te hizo feliz hoy ✨',
  'Dibuja un animal que mezcle dos animales 🐯🦋',
  'Dibuja tu snack favorito de noche 🍫',
  'Dibuja una canción que escuchaste hoy 🎵',
  'Dibuja cómo te imaginas dentro de 10 años 🔮',
  'Dibuja tu objeto más preciado 💎',
  'Dibuja algo que quieres hacer con la otra persona 💕',
  'Dibuja tu color favorito hecho personaje 🎨',
  'Dibuja una memoria bonita 📸',
  'Dibuja algo que quieres decirle sin palabras 💌',
];

function getRetoDia() {
  const day = Math.floor(Date.now() / 86400000); // días desde epoch
  return RETOS[day % RETOS.length];
}

app.get('/api/reto', (req, res) => {
  res.json({ reto: getRetoDia() });
});

// ── REST auth ──────────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  res.json({ el: !!db.users.el, ella: !!db.users.ella });
});

app.post('/api/register', (req, res) => {
  const { who, password, name } = req.body;
  if (!['el','ella'].includes(who)) return res.status(400).json({ error: 'Rol inválido' });
  if (db.users[who]) return res.status(409).json({ error: 'Ya registrado' });
  if (!password || password.length < 3) return res.status(400).json({ error: 'Contraseña muy corta' });
  db.users[who] = { name: name?.trim() || (who === 'el' ? 'Él' : 'Ella'), avatar: who === 'el' ? '🐒' : '🌸', hash: hashPassword(password) };
  saveData();
  res.json({ ok: true });
});

app.post('/api/login', (req, res) => {
  const { who, password } = req.body;
  const user = db.users[who];
  if (!user) return res.status(404).json({ error: 'No registrado' });
  if (user.hash !== hashPassword(password)) return res.status(401).json({ error: 'Contraseña incorrecta' });
  res.json({ ok: true, who, name: user.name, avatar: user.avatar });
});

// ── Socket.io ──────────────────────────────────────────────────
// connected: { socketId -> { who, page } }
const connected = {};

function broadcastPresence() {
  // Emite a todos la lista de { who, page }
  io.emit('presence', Object.values(connected));
}

io.on('connection', (socket) => {

  socket.on('join', ({ who, page }) => {
    connected[socket.id] = { who, page: page || 'home' };
    socket.emit('init', { cartas: db.cartas, dibujos: db.dibujos, rpsScore: db.rpsScore });
    broadcastPresence();
  });

  // El cliente avisa cuando cambia de sección
  socket.on('page:change', (page) => {
    if (connected[socket.id]) {
      connected[socket.id].page = page;
      broadcastPresence();
    }
  });

  socket.on('carta:send', (texto) => {
    const who = connected[socket.id]?.who;
    if (!who || !texto.trim()) return;
    const carta = { de: who, texto: texto.trim(), fecha: new Date().toISOString(), leida: false };
    db.cartas.push(carta);
    saveData();
    io.emit('carta:updated', db.cartas);
  });

  socket.on('carta:read', (who) => {
    db.cartas.forEach(c => { if (c.de !== who) c.leida = true; });
    saveData();
    io.emit('carta:updated', db.cartas);
  });

  socket.on('dibujo:save', ({ dataUrl, modo }) => {
    const who = connected[socket.id]?.who;
    if (!who) return;
    const d = { de: who, dataUrl, modo: modo || 'libre', fecha: new Date().toISOString() };
    db.dibujos.push(d);
    if (db.dibujos.length > 40) db.dibujos.shift();
    saveData();
    io.emit('dibujo:new', d);
  });

  socket.on('dibujo:stroke', (data) => socket.broadcast.emit('dibujo:stroke', data));
  socket.on('dibujo:clear',  ()     => socket.broadcast.emit('dibujo:clear'));

  socket.on('rps:score', (score) => {
    db.rpsScore = score;
    saveData();
    io.emit('rps:score', db.rpsScore);
  });

  socket.on('ttt:move',  (data) => io.emit('ttt:move', data));
  socket.on('ttt:reset', ()     => io.emit('ttt:reset'));

  socket.on('disconnect', () => {
    delete connected[socket.id];
    broadcastPresence();
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`MonAmour corriendo en puerto ${PORT}`));
