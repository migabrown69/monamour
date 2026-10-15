// =====================
//  SOCKET
// =====================
const SOCKET_URL = window.location.origin;   // mismo host que sirve los archivos
let socket = null;

function initSocket(onReady) {
  // socket.io se carga desde el CDN en cada HTML
  socket = io(SOCKET_URL);
  socket.on('connect', () => {
    const s = getSession();
    if (s) socket.emit('join', s.who);
    if (onReady) onReady(socket);
  });
}

// =====================
//  AUTH
// =====================
const USERS = {
  el:   { name: 'Él',   avatar: '🐒', password: 'mono1' },
  ella: { name: 'Ella', avatar: '🌸', password: 'mono2' },
};

function getSession() {
  try { return JSON.parse(sessionStorage.getItem('session')); }
  catch { return null; }
}

function login(who, password) {
  if (!USERS[who] || USERS[who].password !== password) return false;
  sessionStorage.setItem('session', JSON.stringify({ who, ...USERS[who] }));
  return true;
}

function logout() {
  sessionStorage.removeItem('session');
  if (socket) socket.disconnect();
  window.location.href = 'index.html';
}

function requireAuth() {
  const s = getSession();
  if (!s) { window.location.href = 'index.html'; return null; }
  return s;
}

// =====================
//  HELPERS
// =====================
function otherUser(who) {
  return who === 'el' ? 'ella' : 'el';
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// =====================
//  ONLINE BADGE
// =====================
function updateOnlineBadge(onlineList) {
  const el = document.getElementById('online-status');
  if (!el) return;
  const both = onlineList.length >= 2;
  el.innerHTML = both
    ? '<span class="online-dot"></span> Los dos conectados 💕'
    : '<span style="color:var(--brown-light)">⏳ Esperando a tu persona...</span>';
}
