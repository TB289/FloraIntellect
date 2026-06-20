const API = "";
let todasLasPlantas = [];
let plantasFiltradas = [];
let paginaActual = 1;
const POR_PAGINA = 24;
let historial = [];
let cargando = false;
const fotoCache = {};

// ── Carga foto de una planta ──────────────────────────────────────────────────
async function cargarFoto(id) {
  if (fotoCache[id]) return fotoCache[id];
  try {
    const res = await fetch(`/foto-planta/${id}`);
    const data = await res.json();
    if (data.foto_url) {
      fotoCache[id] = data.foto_url;
      return data.foto_url;
    }
  } catch (e) {}
  return null;
}

// ── Aplica fotos a todas las tarjetas visibles ────────────────────────────────
async function aplicarFotos() {
  const tarjetas = document.querySelectorAll('.plant-card[data-id]');
  for (const tarjeta of tarjetas) {
    const id = parseInt(tarjeta.getAttribute('data-id'));
    const imgContainer = tarjeta.querySelector('.plant-img-container');
    if (!imgContainer) continue;

    const url = await cargarFoto(id);
    if (url) {
      imgContainer.innerHTML = `<img src="${url}" alt="planta"
        style="width:100%;height:100%;object-fit:cover;"
        onerror="this.parentElement.innerHTML='<div style=display:flex;align-items:center;justify-content:center;height:100%;font-size:48px>🌿</div>'">`;
    } else {
      imgContainer.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:48px">🌿</div>';
    }
  }
}

function imgHTML(planta, height = '180px') {
  return `<div class="plant-img-container" style="height:${height};overflow:hidden;background:var(--pergamino);display:flex;align-items:center;justify-content:center;">
    <span style="font-size:32px">🌿</span>
  </div>`;
}

async function init() {
  try {
    const res = await fetch(`${API}/plantas`);
    const data = await res.json();
    todasLasPlantas = data.plantas || [];
    plantasFiltradas = [...todasLasPlantas];
    const stat = document.getElementById('stat-plantas');
    if (stat) stat.textContent = todasLasPlantas.length;
    renderCatalogo();
  } catch (e) {
    console.error('No se pudo conectar al servidor:', e);
  }
  initChat();
}

function showSection(nombre, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`section-${nombre}`).classList.add('active');
  btn.classList.add('active');
  if (nombre === 'catalogo') renderCatalogo();
}

function filtrarPor(uso, btn) {
  document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  paginaActual = 1;
  plantasFiltradas = !uso ? [...todasLasPlantas] : todasLasPlantas.filter(p =>
    (p.usos || []).some(u => u.toLowerCase().includes(uso))
  );
  renderCatalogo();
}

function renderCatalogo() {
  const grid = document.getElementById('catalogo-grid');
  if (!grid) return;
  const inicio = (paginaActual - 1) * POR_PAGINA;
  const pagina = plantasFiltradas.slice(inicio, inicio + POR_PAGINA);

  if (pagina.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="icon">🌾</div><h3>Sin resultados</h3>
      <p>No encontramos plantas con ese filtro</p></div>`;
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  grid.innerHTML = pagina.map((p, i) => `
    <div class="plant-card" data-id="${p.id}" style="animation-delay:${i * 0.04}s" onclick="abrirModal(${p.id})">
      ${imgHTML(p, '180px')}
      <div class="plant-body">
        <div class="plant-familia">${p.familia || ''}</div>
        <div class="plant-name">${p.nombre_comun}</div>
        <div class="plant-scientific">${p.nombre_cientifico}</div>
        <div class="plant-usos">
          ${(p.usos || []).slice(0, 3).map(u => `<span class="uso-tag">${u}</span>`).join('')}
        </div>
        <button class="plant-btn">Ver detalles →</button>
      </div>
    </div>`).join('');

  renderPaginacion();
  aplicarFotos();
}

function renderPaginacion() {
  const total = Math.ceil(plantasFiltradas.length / POR_PAGINA);
  const pag = document.getElementById('pagination');
  if (!pag) return;
  if (total <= 1) { pag.innerHTML = ''; return; }
  pag.innerHTML = Array.from({length: total}, (_, i) =>
    `<button class="page-btn ${i+1 === paginaActual ? 'active' : ''}" onclick="irPagina(${i+1})">${i+1}</button>`
  ).join('');
}

function irPagina(n) {
  paginaActual = n;
  renderCatalogo();
  document.getElementById('section-catalogo').scrollIntoView({ behavior: 'smooth' });
}

function abrirModal(id) {
  const p = todasLasPlantas.find(x => x.id === id);
  if (!p) return;

  document.getElementById('modal').innerHTML = `
    <div id="modal-foto" style="height:240px;background:var(--pergamino);display:flex;align-items:center;justify-content:center;font-size:64px;border-radius:24px 24px 0 0;">🌿</div>
    <div class="modal-body">
      <div class="modal-familia">${p.familia}</div>
      <div class="modal-name">${p.nombre_comun}</div>
      <div class="modal-scientific">${p.nombre_cientifico}</div>
      <div class="modal-section">
        <h4>🌱 Usos medicinales</h4>
        <div class="modal-usos">${(p.usos||[]).map(u=>`<span class="modal-tag">${u}</span>`).join('')}</div>
      </div>
      <div class="modal-section"><h4>🫖 Preparación</h4><p>${p.preparacion}</p></div>
      <div class="modal-section"><h4>🌿 Parte usada</h4><p>${p.parte_usada}</p></div>
      <div class="modal-section">
        <div class="warning-box">⚠️ <span><strong>Contraindicaciones:</strong> ${p.contraindicaciones}</span></div>
      </div>
      <div class="modal-actions">
        <button class="btn-primary" onclick="preguntarSobrePlanta('${p.nombre_comun}')">💬 Preguntar a la IA</button>
        <button class="btn-secondary" onclick="cerrarModalDirecto()">Cerrar</button>
      </div>
    </div>`;

  document.getElementById('modal-overlay').classList.add('open');

  cargarFoto(id).then(url => {
    const div = document.getElementById('modal-foto');
    if (div && url) {
      div.innerHTML = `<img src="${url}" alt="${p.nombre_comun}"
        style="width:100%;height:100%;object-fit:cover;border-radius:24px 24px 0 0;"
        onerror="this.parentElement.innerHTML='🌿'">`;
    }
  });
}

function cerrarModal(e) {
  if (e.target === document.getElementById('modal-overlay')) cerrarModalDirecto();
}
function cerrarModalDirecto() {
  document.getElementById('modal-overlay').classList.remove('open');
}
function preguntarSobrePlanta(nombre) {
  cerrarModalDirecto();
  showSection('chat', document.querySelector('.nav-btn'));
  document.querySelector('.nav-btn').classList.add('active');
  setTimeout(() => sendMessage(`Cuéntame todo sobre ${nombre}: sus usos, cómo prepararla y sus contraindicaciones`), 300);
}

async function buscar() {
  const q = document.getElementById('search-input').value.trim();
  const results = document.getElementById('search-results');
  if (!q) return;

  results.innerHTML = `<div class="loading-grid">${Array(6).fill(`
    <div class="skeleton"><div class="skeleton-img"></div>
    <div class="skeleton-body">
      <div class="skeleton-line" style="width:60%"></div>
      <div class="skeleton-line" style="width:80%"></div>
    </div></div>`).join('')}</div>`;

  try {
    const res = await fetch(`${API}/plantas?buscar=${encodeURIComponent(q)}`);
    const data = await res.json();
    const plantas = data.plantas || [];
    if (plantas.length === 0) {
      results.innerHTML = `<div class="empty-state"><div class="icon">🔍</div>
        <h3>Sin resultados para "${q}"</h3>
        <p>Intenta con otro término o pregúntale a la IA</p></div>`;
      return;
    }
    results.innerHTML = `
      <p style="margin-bottom:20px;color:var(--musgo)">
        <strong>${plantas.length}</strong> plantas encontradas para "<em>${q}</em>"
      </p>
      <div class="plants-grid">
        ${plantas.map((p, i) => `
          <div class="plant-card" data-id="${p.id}" style="animation-delay:${i*0.05}s" onclick="abrirModal(${p.id})">
            ${imgHTML(p, '180px')}
            <div class="plant-body">
              <div class="plant-familia">${p.familia||''}</div>
              <div class="plant-name">${p.nombre_comun}</div>
              <div class="plant-scientific">${p.nombre_cientifico}</div>
              <div class="plant-usos">${(p.usos||[]).slice(0,3).map(u=>`<span class="uso-tag">${u}</span>`).join('')}</div>
              <button class="plant-btn">Ver detalles →</button>
            </div>
          </div>`).join('')}
      </div>`;
    aplicarFotos();
  } catch (e) {
    results.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>
      <h3>Error de conexión</h3><p>Verifica que el servidor esté corriendo</p></div>`;
  }
}

function initChat() {
  addBotMessage(`¡Hola! Soy **FloraIntellect** 🌿 — tu guía en el mundo de las plantas medicinales.\n\nPuedo ayudarte con propiedades, preparaciones, contraindicaciones y mucho más. ¿Qué planta deseas conocer hoy?`);
}

function addBotMessage(text, fotos = []) {
  const msgs = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'msg bot';
  const formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  let fotosHTML = '';
  if (fotos && fotos.length > 0) {
    fotosHTML = fotos.slice(0, 2).map(f => `
      <div class="plant-photo">
        <img src="${f.url}" alt="${f.nombre}" onerror="this.parentElement.style.display='none'">
        <div class="plant-photo-label">🌿 ${f.nombre}</div>
      </div>`).join('');
  }
  div.innerHTML = `
    <div class="msg-avatar">🌿</div>
    <div><div class="bubble">${formatted}</div>${fotosHTML}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function addUserMessage(text) {
  const msgs = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'msg user';
  div.innerHTML = `<div class="bubble">${text}</div><div class="msg-avatar">👤</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function addTyping() {
  const msgs = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'msg bot';
  div.id = 'typing';
  div.innerHTML = `<div class="msg-avatar">🌿</div>
    <div class="typing"><span></span><span></span><span></span></div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function removeTyping() { document.getElementById('typing')?.remove(); }

async function sendMessage(texto) {
  const input = document.getElementById('chat-input');
  const text = texto || input.value.trim();
  if (!text || cargando) return;
  input.value = '';
  input.style.height = 'auto';
  document.getElementById('send-btn').disabled = true;
  cargando = true;
  addUserMessage(text);
  historial.push({ role: 'user', content: text });
  addTyping();
  try {
    const res = await fetch(`${API}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: historial })
    });
    const data = await res.json();
    removeTyping();
    addBotMessage(data.reply, data.fotos);
    historial.push({ role: 'assistant', content: data.reply });
  } catch (e) {
    removeTyping();
    addBotMessage('🌿 Parece que hay un problema de conexión. Verifica que el servidor esté corriendo.');
  } finally {
    cargando = false;
  }
}

function sendSuggestion(text) { sendMessage(text); }

document.addEventListener('DOMContentLoaded', () => {
  init();
  document.getElementById('search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') buscar();
  });
  document.getElementById('chat-input').addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    document.getElementById('send-btn').disabled = !this.value.trim() || cargando;
  });
  document.getElementById('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  document.getElementById('send-btn').addEventListener('click', () => sendMessage());
});