// FloraIntellect — frontend logic
// Diseño minimalista, sin emojis.

const API = "";

// ── State ──────────────────────────────────────────────────────────────────
let todasLasPlantas = [];
let plantasFiltradas = [];
let catalogoPorUso = "";
let catalogoPaginaActual = 1;
const catalogoPorPagina = 24;
let fotoCache = {};
let chatHistorial = cargarHistorial();
let quizState = null;

// ── Historial ──────────────────────────────────────────────────────────────
const HIST_KEY = "floraintellect_chat_v1";
const HIST_MAX = 50;

function cargarHistorial() {
  try { return JSON.parse(localStorage.getItem(HIST_KEY) || "[]"); }
  catch { return []; }
}
function guardarHistorial(h) {
  try { localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(-HIST_MAX))); } catch {}
}
function limpiarHistorial() {
  chatHistorial = [];
  localStorage.removeItem(HIST_KEY);
  const cont = document.getElementById("messages");
  if (cont) cont.innerHTML = "";
  addBotMessage("Historial borrado. ¿En qué planta puedo ayudarte?");
}

// ── Navegación ─────────────────────────────────────────────────────────────
function showSection(nombre, btn) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  const sec = document.getElementById(`section-${nombre}`);
  if (sec) sec.classList.add("active");
  if (btn) btn.classList.add("active");
  if (nombre === "catalogo") renderCatalogo();
  if (nombre === "chat") renderHistorial();
  if (nombre === "verificadas") renderVerificadas();
  if (nombre === "buscador") {
    const inp = document.getElementById("buscador-input");
    if (inp && !inp.value) inp.focus();
  }
  window.scrollTo({ top: 0, behavior: "instant" });
}

// ── Util ───────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function badgeEvidencia(nivel) {
  if (nivel === "alta") return '<span class="badge ev-alta">Evidencia alta</span>';
  if (nivel === "media") return '<span class="badge ev-media">Evidencia media</span>';
  if (nivel === "folk") return '<span class="badge ev-folk">Uso tradicional</span>';
  return '<span class="badge ev-folk">Sin clasificar</span>';
}

// ── Init ──────────────────────────────────────────────────────────────────
async function init() {
  try {
    const r = await fetch(`${API}/plantas`);
    const d = await r.json();
    todasLasPlantas = d.plantas || [];
    plantasFiltradas = [...todasLasPlantas];
    document.getElementById("stat-plantas").textContent = todasLasPlantas.length;
  } catch (e) { console.error("init plantas:", e); }

  try {
    const r = await fetch(`${API}/verificadas`);
    const d = await r.json();
    document.getElementById("stat-verificadas").textContent = d.total || 0;
  } catch (e) {
    document.getElementById("stat-verificadas").textContent = "—";
  }

  try {
    const r = await fetch(`${API}/health`);
    const d = await r.json();
    const el = document.getElementById("stat-plantid");
    if (d.plantid_configurado) {
      el.textContent = "activa";
      el.style.fontSize = "32px";
    } else {
      el.textContent = "no";
      el.style.fontSize = "36px";
    }
  } catch (e) {
    document.getElementById("stat-plantid").textContent = "—";
  }

  initChat();
}

// ── Catálogo ───────────────────────────────────────────────────────────────
function imgHTML(planta) {
  return `<div class="plant-img-container" data-nombre="${esc(planta.nombre_comun)}"></div>`;
}

async function cargarFotoEnContainer(container, nombre) {
  if (!container) return;
  if (fotoCache[nombre]) {
    container.innerHTML = `<img src="${fotoCache[nombre]}" alt="${esc(nombre)}" loading="lazy">`;
    return;
  }
  try {
    const r = await fetch(`${API}/foto/${encodeURIComponent(nombre)}`);
    const d = await r.json();
    if (d.url) {
      fotoCache[nombre] = d.url;
      container.innerHTML = `<img src="${d.url}" alt="${esc(nombre)}" loading="lazy">`;
    } else {
      container.innerHTML = "";
    }
  } catch (e) { container.innerHTML = ""; }
}

function filtrarPor(uso, btn) {
  document.querySelectorAll(".filter-chip").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  catalogoPorUso = uso;
  catalogoPaginaActual = 1;
  if (!uso) {
    plantasFiltradas = [...todasLasPlantas];
  } else {
    plantasFiltradas = todasLasPlantas.filter(p => {
      const u = (p.usos || []).join(" ").toLowerCase();
      const um = Array.isArray(p.usos_medicinales) ? p.usos_medicinales.join(" ").toLowerCase() : "";
      return u.includes(uso) || um.includes(uso);
    });
  }
  renderCatalogo();
}

function renderCatalogo() {
  const grid = document.getElementById("catalogo-grid");
  if (!grid) return;
  const inicio = (catalogoPaginaActual - 1) * catalogoPorPagina;
  const pagina = plantasFiltradas.slice(inicio, inicio + catalogoPorPagina);

  if (pagina.length === 0) {
    grid.innerHTML = `<div class="empty-state"><h3>Sin resultados</h3><p>Probá con otro filtro</p></div>`;
    document.getElementById("pagination").innerHTML = "";
    return;
  }

  grid.innerHTML = pagina.map((p, i) => `
    <div class="plant-card" data-id="${p.id}">
      ${imgHTML(p)}
      <div class="plant-body">
        <div class="plant-familia">${esc(p.familia || "")}</div>
        <h3>${esc(p.nombre_comun)}</h3>
        <p class="plant-cientifico">${esc(p.nombre_cientifico || "")}</p>
        <div class="plant-usos">${(p.usos || p.usos_medicinales || []).slice(0, 3).map(u => `<span class="uso-tag">${esc(u)}</span>`).join("")}</div>
      </div>
    </div>
  `).join("");

  grid.querySelectorAll(".plant-card").forEach(card => {
    card.addEventListener("click", () => abrirModal(card.dataset.id));
  });
  grid.querySelectorAll(".plant-img-container[data-nombre]").forEach(c => {
    cargarFotoEnContainer(c, c.dataset.nombre);
  });

  renderPaginacion();
}

function renderPaginacion() {
  const totalPag = Math.ceil(plantasFiltradas.length / catalogoPorPagina);
  const cont = document.getElementById("pagination");
  if (!cont || totalPag <= 1) { if (cont) cont.innerHTML = ""; return; }
  let html = "";
  for (let i = 1; i <= totalPag; i++) {
    html += `<button class="page-btn ${i === catalogoPaginaActual ? "active" : ""}" data-page="${i}">${i}</button>`;
  }
  cont.innerHTML = html;
  cont.querySelectorAll(".page-btn").forEach(b => {
    b.addEventListener("click", () => {
      catalogoPaginaActual = parseInt(b.dataset.page);
      renderCatalogo();
      document.getElementById("catalogo-grid").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

// ── Buscador ──────────────────────────────────────────────────────────────
async function buscarSintomas(q) {
  const grid = document.getElementById("buscador-grid");
  if (!grid) return;
  q = (q || "").trim();
  if (q.length < 3) {
    grid.innerHTML = "";
    return;
  }
  try {
    const r = await fetch(`${API}/plantas?buscar=${encodeURIComponent(q)}`);
    const d = await r.json();
    if (d.plantas.length === 0) {
      grid.innerHTML = `<div class="empty-state"><h3>Sin resultados</h3><p>Probá con otro término</p></div>`;
      return;
    }
    grid.innerHTML = d.plantas.slice(0, 24).map(p => `
      <div class="plant-card" data-id="${p.id}">
        ${imgHTML(p)}
        <div class="plant-body">
          <div class="plant-familia">${esc(p.familia || "")}</div>
          <h3>${esc(p.nombre_comun)}</h3>
          <p class="plant-cientifico">${esc(p.nombre_cientifico || "")}</p>
          <div class="plant-usos">${(p.usos || p.usos_medicinales || []).slice(0, 3).map(u => `<span class="uso-tag">${esc(u)}</span>`).join("")}</div>
        </div>
      </div>
    `).join("");
    grid.querySelectorAll(".plant-card").forEach(card => {
      card.addEventListener("click", () => abrirModal(card.dataset.id));
    });
    grid.querySelectorAll(".plant-img-container[data-nombre]").forEach(c => {
      cargarFotoEnContainer(c, c.dataset.nombre);
    });
  } catch (e) { console.error(e); }
}

// ── Modal ─────────────────────────────────────────────────────────────────
async function abrirModal(id) {
  const p = todasLasPlantas.find(x => String(x.id) === String(id));
  if (!p) return;
  const modal = document.getElementById("modal");
  const cont = document.getElementById("modal-content");
  cont.innerHTML = `
    <button class="modal-close" onclick="cerrarModal()">×</button>
    <div class="modal-foto" id="modal-foto"></div>
    <h2>${esc(p.nombre_comun)}</h2>
    <p class="modal-cientifico"><em>${esc(p.nombre_cientifico || "")}</em> · ${esc(p.familia || "")}</p>
    <h3>Usos</h3>
    <ul>${(p.usos || p.usos_medicinales || []).map(u => `<li>${esc(u)}</li>`).join("")}</ul>
    ${p.preparacion ? `<h3>Preparación</h3><p>${esc(p.preparacion)}</p>` : ""}
    ${p.parte_usada ? `<h3>Parte usada</h3><p>${esc(p.parte_usada)}</p>` : ""}
    ${p.contraindicaciones ? `<h3>Contraindicaciones</h3><p>${esc(p.contraindicaciones)}</p>` : ""}
  `;
  modal.classList.add("active");
  cargarFotoEnContainer(document.getElementById("modal-foto"), p.nombre_comun);
}
function cerrarModal() { document.getElementById("modal").classList.remove("active"); }
function cerrarModalDirecto(e) { if (e.target.id === "modal") cerrarModal(); }

// ── Chat ──────────────────────────────────────────────────────────────────
function initChat() {
  renderHistorial();
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("send-btn");
  if (input) {
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
  }
  if (sendBtn) sendBtn.addEventListener("click", sendMessage);
}

function renderHistorial() {
  const cont = document.getElementById("messages");
  if (!cont) return;
  cont.innerHTML = "";
  if (chatHistorial.length === 0) {
    addBotMessage("Hola. Soy FloraIntellect, asistente especializada en plantas medicinales. Preguntame sobre usos, preparación o contraindicaciones. También podés identificar una planta por foto desde la sección <strong>Identificar</strong>.");
    return;
  }
  chatHistorial.forEach(m => {
    if (m.role === "user") addUserMessage(m.content, false);
    else addBotMessage(m.content, false);
  });
}

function addUserMessage(text, push = true) {
  const cont = document.getElementById("messages");
  if (!cont) return;
  const div = document.createElement("div");
  div.className = "msg user";
  div.innerHTML = `<div class="msg-avatar">Tú</div><div class="msg-bubble">${esc(text)}</div>`;
  cont.appendChild(div);
  cont.scrollTop = cont.scrollHeight;
  if (push) {
    chatHistorial.push({ role: "user", content: text });
    guardarHistorial(chatHistorial);
  }
}
function addBotMessage(html, push = true) {
  const cont = document.getElementById("messages");
  if (!cont) return;
  const div = document.createElement("div");
  div.className = "msg bot";
  div.innerHTML = `<div class="msg-avatar serif">F</div><div class="msg-bubble">${html}</div>`;
  cont.appendChild(div);
  cont.scrollTop = cont.scrollHeight;
  if (push) {
    chatHistorial.push({ role: "assistant", content: html });
    guardarHistorial(chatHistorial);
  }
}
function addTyping() {
  const cont = document.getElementById("messages");
  const div = document.createElement("div");
  div.className = "msg bot typing";
  div.id = "typing-msg";
  div.innerHTML = `<div class="msg-avatar serif">F</div><div class="msg-bubble"><span class="dots"><span></span><span></span><span></span></span></div>`;
  cont.appendChild(div);
  cont.scrollTop = cont.scrollHeight;
}
function removeTyping() { const t = document.getElementById("typing-msg"); if (t) t.remove(); }

async function sendMessage() {
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  addUserMessage(text);
  addTyping();
  try {
    const r = await fetch(`${API}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: text }] })
    });
    const d = await r.json();
    removeTyping();
    let html = formatReply(d.reply || "");
    if (d.fuentes && d.fuentes.length) {
      html += `<div class="fuentes">Fuentes: ${d.fuentes.map(f => f.url ? `<a href="${esc(f.url)}" target="_blank">${esc(f.nombre)}</a>` : esc(f.nombre)).join(" · ")}</div>`;
    }
    if (d.demo) html += `<div class="badge ev-folk" style="margin-top:8px;display:inline-block">Modo demo</div>`;
    addBotMessage(html);
  } catch (e) {
    removeTyping();
    addBotMessage("Error de conexión. Reintentá.");
  }
}

function formatReply(text) {
  return esc(text)
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

function sendSuggestion(text) {
  document.getElementById("chat-input").value = text;
  sendMessage();
}

// ── Identificar por foto (Plant.id) ───────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("id-foto");
  if (input) input.addEventListener("change", e => identificarPlanta(e.target));
});

async function identificarPlanta(input) {
  const archivo = input.files[0];
  if (!archivo) return;
  if (archivo.size > 10 * 1024 * 1024) {
    document.getElementById("id-resultado").innerHTML = `<p class="error">Imagen demasiado grande (máximo 10 MB).</p>`;
    return;
  }
  const preview = document.getElementById("id-preview");
  const resultado = document.getElementById("id-resultado");
  const reader = new FileReader();
  reader.onload = (ev) => { preview.innerHTML = `<img src="${ev.target.result}" alt="preview">`; };
  reader.readAsDataURL(archivo);

  const base64 = await new Promise(resolve => {
    const r = new FileReader();
    r.onload = ev => resolve(ev.target.result.split(",")[1]);
    r.readAsDataURL(archivo);
  });

  resultado.innerHTML = `<div class="loading"><div class="spinner"></div><p>Identificando planta con Plant.id...</p></div>`;

  try {
    const r = await fetch(`${API}/identificar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imagen: base64, tipo: archivo.type })
    });
    const d = await r.json();

    if (!d.encontrada) {
      resultado.innerHTML = `
        <div class="id-placeholder">
          <p><strong>${esc(d.mensaje || "No pude identificar la planta.")}</strong></p>
          <p style="margin-top: 12px; font-size: 13px;">Confianza: ${d.confianza || 0}% (mínimo 35%)</p>
        </div>`;
      return;
    }

    const nombreMostrar = d.nombres_comunes?.[0] || d.nombre_cientifico;
    resultado.innerHTML = `
      <div class="resultado-card">
        <h2>${esc(nombreMostrar)}</h2>
        <p class="cientifico"><em>${esc(d.nombre_cientifico)}</em>${d.familia ? ` · ${esc(d.familia)}` : ""}</p>
        <span class="confianza">Confianza de identificación: ${d.confianza}%</span>
        ${d.foto_url ? `<img src="${esc(d.foto_url)}" alt="${esc(nombreMostrar)}" class="resultado-foto">` : ""}
        <div class="respuesta-ia">${formatReply(d.respuesta)}</div>
        ${d.datos_verificados
          ? `<div class="fuente-verificada">${badgeEvidencia(d.nivel_evidencia)} · Fuente: ${d.fuente_url ? `<a href="${esc(d.fuente_url)}" target="_blank">${esc(d.fuente)}</a>` : esc(d.fuente)}</div>`
          : `<div class="disclaimer">Esta especie no está en nuestra base verificada con fuentes OMS/TRAMIL. La información proviene del conocimiento general del modelo. Confirmá con fuentes especializadas o un profesional antes de cualquier uso.</div>`}
      </div>
    `;
  } catch (e) {
    resultado.innerHTML = `<p class="error">Error procesando la imagen. Verificá que PLANTID_KEY esté configurada en el servidor.</p>`;
  }
}

// ── Verificadas ───────────────────────────────────────────────────────────
async function renderVerificadas() {
  const cont = document.getElementById("verificadas-grid");
  if (!cont) return;
  try {
    const r = await fetch(`${API}/verificadas`);
    const d = await r.json();
    cont.innerHTML = d.plantas.map(p => `
      <div class="plant-card" data-id-verif="${p.id}">
        <div class="plant-img-container" data-nombre="${esc(p.nombre_comun)}"></div>
        <div class="plant-body">
          ${badgeEvidencia(p.nivel_evidencia)}
          <h3>${esc(p.nombre_comun)}</h3>
          <p class="plant-cientifico">${esc(p.nombre_cientifico)}</p>
          <p class="fuente-mini">${esc(p.fuente_principal)}</p>
        </div>
      </div>
    `).join("");
    cont.querySelectorAll(".plant-card").forEach(card => {
      card.addEventListener("click", () => abrirVerificada(card.dataset.idVerif));
    });
    cont.querySelectorAll(".plant-img-container[data-nombre]").forEach(c => {
      cargarFotoEnContainer(c, c.dataset.nombre);
    });
  } catch (e) { cont.innerHTML = "<p>Error cargando plantas verificadas.</p>"; }
}

async function abrirVerificada(id) {
  try {
    const r = await fetch(`${API}/verificadas/${id}`);
    const p = await r.json();
    const modal = document.getElementById("modal");
    const cont = document.getElementById("modal-content");
    cont.innerHTML = `
      <button class="modal-close" onclick="cerrarModal()">×</button>
      ${badgeEvidencia(p.nivel_evidencia)}
      <h2 style="margin-top:8px">${esc(p.nombre_comun)}</h2>
      <p class="modal-cientifico"><em>${esc(p.nombre_cientifico)}</em> · ${esc(p.familia)}</p>
      <div class="modal-fuente">Fuente: ${p.fuente_url ? `<a href="${esc(p.fuente_url)}" target="_blank">${esc(p.fuente_principal)}</a>` : esc(p.fuente_principal)}</div>
      <h3>Descripción</h3><p>${esc(p.descripcion)}</p>
      <h3>Usos medicinales</h3><ul>${(p.usos_medicinales || []).map(u => `<li>${esc(u)}</li>`).join("")}</ul>
      <h3>Parte usada</h3><p>${esc(p.parte_usada)}</p>
      <h3>Preparación</h3><p>${esc(p.preparacion)}</p>
      <h3>Dosis</h3><p>${esc(p.dosis)}</p>
      <h3>Contraindicaciones</h3><ul>${(p.contraindicaciones || []).map(c => `<li>${esc(c)}</li>`).join("")}</ul>
      ${p.interacciones_farmacologicas?.length ? `<h3>Interacciones farmacológicas</h3><ul>${p.interacciones_farmacologicas.map(i => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}
      <p class="disclaimer-medico">Esta información no reemplaza la consulta con un profesional de salud.</p>
    `;
    modal.classList.add("active");
  } catch (e) { console.error(e); }
}

// ── Quiz ──────────────────────────────────────────────────────────────────
async function nuevoQuiz() {
  const cont = document.getElementById("quiz-content");
  cont.innerHTML = `<div class="quiz-card"><div class="loading"><div class="spinner"></div></div></div>`;
  try {
    const r = await fetch(`${API}/quiz`);
    const d = await r.json();
    quizState = d;
    cont.innerHTML = `
      <div class="quiz-card">
        <p class="quiz-pregunta">${esc(d.pregunta)}</p>
        <div class="quiz-opciones">
          ${d.opciones.map(o => `<button class="quiz-opcion" data-id="${o.id}">${esc(o.texto)}</button>`).join("")}
        </div>
      </div>
    `;
    cont.querySelectorAll(".quiz-opcion").forEach(b => {
      b.addEventListener("click", () => responderQuiz(b.dataset.id, b));
    });
  } catch (e) { cont.innerHTML = "<p>Error cargando quiz.</p>"; }
}
function responderQuiz(id, btn) {
  if (!quizState) return;
  const ok = id === quizState.correcta_id;
  const allBtns = document.querySelectorAll(".quiz-opcion");
  allBtns.forEach(b => {
    b.disabled = true;
    if (b.dataset.id === quizState.correcta_id) b.classList.add("correcta");
    if (b === btn && !ok) b.classList.add("incorrecta");
  });
  const puntos = parseInt(localStorage.getItem("flora_quiz_puntos") || "0");
  if (ok) localStorage.setItem("flora_quiz_puntos", puntos + 1);
  const total = parseInt(localStorage.getItem("flora_quiz_total") || "0") + 1;
  localStorage.setItem("flora_quiz_total", total);
  document.getElementById("quiz-score").textContent = `${parseInt(localStorage.getItem("flora_quiz_puntos") || "0")} / ${total}`;
  const fb = document.createElement("div");
  fb.className = `quiz-feedback ${ok ? "ok" : "no"}`;
  fb.innerHTML = ok
    ? `Correcto. <button class="btn-mini" data-verif="${quizState.correcta_id}">Ver ficha</button>`
    : `Incorrecto. La respuesta correcta está resaltada. <button class="btn-mini" data-verif="${quizState.correcta_id}">Ver ficha</button>`;
  document.getElementById("quiz-content").appendChild(fb);
  fb.querySelector(".btn-mini").addEventListener("click", e => abrirVerificada(e.target.dataset.verif));
}

// Init
init();
