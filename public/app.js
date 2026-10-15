// =====================
//  SOCKET
// =====================
const SOCKET_URL = window.location.origin;
let socket = null;

function initSocket(page, onReady) {
  socket = io(SOCKET_URL);
  socket.on('connect', () => {
    const s = getSession();
    if (s) socket.emit('join', { who: s.who, page });
    if (onReady) onReady(socket);
  });
}

// Avisar al server cuando el usuario cambia de pestaña/sección dentro de la misma página
function setPage(page) {
  if (socket) socket.emit('page:change', page);
}

// =====================
//  AUTH
// =====================
const USERS = {
  el:   { avatar: '🐒', name: 'Él'   },
  ella: { avatar: '🌸', name: 'Ella' },
};

function getSession() {
  try { return JSON.parse(sessionStorage.getItem('session')); }
  catch { return null; }
}

function logout() {
  sessionStorage.removeItem('session');
  if (socket) socket.disconnect();
  window.location.href = 'index.html';
}

function requireAuth() {
  const s = getSession();
  if (!s) { window.location.href = 'index.html'; return null; }
  USERS[s.who] = { avatar: s.avatar, name: s.name };
  return s;
}

// =====================
//  PRESENCIA
// =====================
// presence: [{ who, page }, ...]
let _presence = [];

function updatePresence(list) {
  _presence = list;

  // Badge online genérico
  const el = document.getElementById('online-status');
  if (el) {
    const both = list.length >= 2;
    el.innerHTML = both
      ? '<span class="online-dot"></span> Los dos conectados 💕'
      : '<span style="color:var(--brown-light)">⏳ Esperando a tu persona...</span>';
  }
}

// Devuelve true si el otro usuario está en la misma `page`
function otherOnPage(page) {
  const s = getSession();
  if (!s) return false;
  return _presence.some(p => p.who !== s.who && p.page === page);
}

// =====================
//  OVERLAY "ESPERANDO"
// =====================
function showWaitingOverlay(containerSelector, page, onReady) {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  let overlay = document.getElementById('waiting-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'waiting-overlay';
    overlay.style.cssText = `
      position:absolute; inset:0; background:rgba(253,246,240,0.92);
      display:flex; flex-direction:column; align-items:center;
      justify-content:center; border-radius:20px; z-index:10;
      gap:12px; padding:24px; text-align:center;
    `;
    overlay.innerHTML = `
      <div style="font-size:3rem; animation: bounce 1.5s infinite;">⏳</div>
      <p style="font-weight:700; color:var(--brown-dark); font-size:1rem;">
        Esperando a tu persona...
      </p>
      <p style="color:var(--brown-light); font-size:13px;">
        El juego empieza cuando los dos estén aquí 🐒💕
      </p>`;
    container.style.position = 'relative';
    container.appendChild(overlay);
  }

  function check() {
    if (otherOnPage(page)) {
      overlay.remove();
      if (onReady) onReady();
    }
  }

  // Revisar cada vez que cambie la presencia
  window._waitingCheck = check;
  check(); // por si ya está
}

// =====================
//  HELPERS
// =====================
function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
