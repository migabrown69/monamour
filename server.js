const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── MongoDB ────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI;
let db;

async function connectDB() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db('monamour');
  console.log('MongoDB conectado');
}

// Helpers colecciones
const col = (name) => db.collection(name);

async function getCartas()   { return col('cartas').find().sort({ fecha: 1 }).toArray(); }
async function getDibujos()  { return col('dibujos').find().sort({ fecha: 1 }).toArray(); }
async function getRpsScore() {
  const doc = await col('config').findOne({ _id: 'rpsScore' });
  return doc?.value || { win: 0, lose: 0, tie: 0 };
}

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
  const day = Math.floor(Date.now() / 86400000);
  return RETOS[day % RETOS.length];
}

app.get('/api/reto', (req, res) => res.json({ reto: getRetoDia() }));

// ── Auth ───────────────────────────────────────────────────────
function hashPassword(p) { return crypto.createHash('sha256').update(p).digest('hex'); }

app.get('/api/status', async (req, res) => {
  const el   = await col('users').findOne({ _id: 'el' });
  const ella = await col('users').findOne({ _id: 'ella' });
  res.json({ el: !!el, ella: !!ella });
});

app.post('/api/register', async (req, res) => {
  const { who, password, name } = req.body;
  if (!['el','ella'].includes(who)) return res.status(400).json({ error: 'Rol inválido' });
  const exists = await col('users').findOne({ _id: who });
  if (exists) return res.status(409).json({ error: 'Ya registrado' });
  if (!password || password.length < 3) return res.status(400).json({ error: 'Contraseña muy corta' });
  await col('users').insertOne({
    _id: who,
    name: name?.trim() || (who === 'el' ? 'Él' : 'Ella'),
    avatar: who === 'el' ? '🐒' : '🌸',
    hash: hashPassword(password),
  });
  res.json({ ok: true });
});

app.post('/api/login', async (req, res) => {
  const { who, password } = req.body;
  const user = await col('users').findOne({ _id: who });
  if (!user) return res.status(404).json({ error: 'No registrado' });
  if (user.hash !== hashPassword(password)) return res.status(401).json({ error: 'Contraseña incorrecta' });
  res.json({ ok: true, who, name: user.name, avatar: user.avatar });
});

// ── Socket.io ──────────────────────────────────────────────────
const connected = {};

function broadcastPresence() {
  io.emit('presence', Object.values(connected));
}

io.on('connection', (socket) => {

  socket.on('join', async ({ who, page }) => {
    connected[socket.id] = { who, page: page || 'home' };
    const [cartas, dibujos, rpsScore] = await Promise.all([getCartas(), getDibujos(), getRpsScore()]);
    socket.emit('init', { cartas, dibujos, rpsScore });
    broadcastPresence();
  });

  socket.on('page:change', (page) => {
    if (connected[socket.id]) { connected[socket.id].page = page; broadcastPresence(); }
  });

  socket.on('carta:send', async (texto) => {
    const who = connected[socket.id]?.who;
    if (!who || !texto.trim()) return;
    const carta = { de: who, texto: texto.trim(), fecha: new Date().toISOString(), leida: false };
    await col('cartas').insertOne(carta);
    const cartas = await getCartas();
    io.emit('carta:updated', cartas);
  });

  socket.on('carta:read', async (who) => {
    await col('cartas').updateMany({ de: { $ne: who } }, { $set: { leida: true } });
    const cartas = await getCartas();
    io.emit('carta:updated', cartas);
  });

  socket.on('dibujo:save', async ({ dataUrl, modo }) => {
    const who = connected[socket.id]?.who;
    if (!who) return;
    const d = { de: who, dataUrl, modo: modo || 'libre', fecha: new Date().toISOString() };
    await col('dibujos').insertOne(d);
    // Mantener máximo 40 dibujos
    const total = await col('dibujos').countDocuments();
    if (total > 40) {
      const oldest = await col('dibujos').find().sort({ fecha: 1 }).limit(total - 40).toArray();
      await col('dibujos').deleteMany({ _id: { $in: oldest.map(o => o._id) } });
    }
    io.emit('dibujo:new', d);
  });

  socket.on('dibujo:stroke', (data) => socket.broadcast.emit('dibujo:stroke', data));
  socket.on('dibujo:clear',  ()     => socket.broadcast.emit('dibujo:clear'));

  socket.on('rps:score', async (score) => {
    await col('config').updateOne({ _id: 'rpsScore' }, { $set: { value: score } }, { upsert: true });
    io.emit('rps:score', score);
  });

  socket.on('ttt:move',  (data) => io.emit('ttt:move', data));
  socket.on('ttt:reset', ()     => io.emit('ttt:reset'));

  socket.on('disconnect', () => {
    delete connected[socket.id];
    broadcastPresence();
  });
});

// ── Arrancar ───────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
connectDB().then(() => {
  httpServer.listen(PORT, () => console.log(`MonAmour corriendo en puerto ${PORT}`));
}).catch(err => {
  console.error('Error conectando MongoDB:', err);
  process.exit(1);
});
