// FloraIntellect — frontend logic
// Consume el backend en http://localhost:3030. Sin emojis en la UI.
// Reglas: no inventar nada, mostrar toasts en errores, skeletons mientras carga.

const API = ""; // mismo origen (server.js sirve index.html)

// ───────────────────────────────────────────────────────────────────────────
// State
// ───────────────────────────────────────────────────────────────────────────
const state = {
  current: "hero",         // sección visible
  chat: [],                // [{role, content, fuentes?}]
  chatLoading: false,
  catalogo: [],            // 296 plantas
  catalogoFiltered: [],
  catalogoCategoria: "",   // "", "digestivo", etc.
  catalogoSearch: "",
  catalogoPage: 1,
  catalogoPerPage: 24,
  verificadas: [],         // 15 plantas
  verificadasLoaded: false,
  quiz: null,              // {pregunta, opciones, correcta_id, planta, _state}
  quizScore: 0,
  quizAnswered: 0,
  idState: "initial",      // initial | loading | result | empty
  idData: null,
  idLastBlob: null,
};

// ───────────────────────────────────────────────────────────────────────────
// Constantes
// ───────────────────────────────────────────────────────────────────────────
const HIST_KEY = "floraintellect_chat_v1";
const HIST_MAX = 50;
const CAT_COLORS = ["#1C4A2A", "#2D6E42", "#5A9E6F", "#388E3C", "#1B5E20", "#43A047"];
const CAT_MAP = {
  digestivo:    ["digestivo", "gastritis", "estomago", "panza", "acidez", "ardor", "ulcera", "reflujo", "pesadez", "gases", "flatulencia", "estrenimiento", "diarrea", "colitis"],
  nervioso:     ["nervioso", "ansiedad", "nervios", "estres", "angustia", "nerviosismo", "tension", "preocupacion", "insomnio", "dormir", "sueño", "desvelo", "sedante", "relajante", "ansiolitico"],
  respiratorio: ["respiratorio", "gripa", "resfriado", "catarro", "gripe", "tos", "congestion", "mocos", "bronquial", "antitusivo"],
  piel:         ["piel", "dermatitis", "herida", "cortada", "raspadura", "quemadura", "llaga", "acne", "eczema", "cicatrizante"],
  otros:        [],
};

// ───────────────────────────────────────────────────────────────────────────
// Util: toasts
// ───────────────────────────────────────────────────────────────────────────
function toast(message, opts = {}) {
  const c = document.getElementById("toast-container");
  if (!c) return;
  const el = document.createElement("div");
  el.className = "toast" + (opts.error ? " error" : "");
  el.textContent = message;
  c.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity 200ms ease";
    setTimeout(() => el.remove(), 220);
  }, opts.duration || 4000);
}

async function fetchJson(url, options = {}) {
  const r = await fetch(url, options);
  if (r.status === 429) {
    const err = new Error("rate_limit");
    err.status = 429;
    throw err;
  }
  if (!r.ok) {
    const err = new Error(`HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

function handleApiError(e) {
  if (e.status === 429) {
    toast("Hacés demasiadas consultas seguidas. Esperá unos minutos.", { error: true });
  } else if (e.status >= 500) {
    toast("El servidor tuvo un problema. Intentá de nuevo en un momento.", { error: true });
  } else if (e.message === "Failed to fetch" || e.message === "NetworkError when attempting to fetch resource.") {
    toast("Sin conexión. Revisá tu internet.", { error: true });
  } else {
    toast("No pudimos completar la solicitud.", { error: true });
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Navegación entre secciones
// ───────────────────────────────────────────────────────────────────────────
function showSection(nombre) {
  state.current = nombre;
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  const sec = document.getElementById(`sec-${nombre}`);
  if (sec) sec.classList.add("active");

  document.querySelectorAll(".nav-tab, .nav-mobile button").forEach(b => {
    b.classList.toggle("active", b.dataset.nav === nombre);
  });

  // Lazy load de cada sección
  if (nombre === "chat") {
    renderHistorial();
    setTimeout(() => {
      const inp = document.getElementById("chat-input");
      if (inp) inp.focus();
    }, 50);
  }
  if (nombre === "catalogo")   loadCatalogo();
  if (nombre === "verificadas") loadVerificadas();
  if (nombre === "quiz")        loadQuiz();

  window.scrollTo({ top: 0, behavior: "instant" });
}

function wireNav() {
  document.querySelectorAll("[data-nav]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      showSection(btn.dataset.nav);
    });
  });
}

// ───────────────────────────────────────────────────────────────────────────
// CHAT
// ───────────────────────────────────────────────────────────────────────────
function loadHistorial() {
  try {
    const raw = localStorage.getItem(HIST_KEY);
    if (raw) state.chat = JSON.parse(raw);
  } catch { state.chat = []; }
}
function saveHistorial() {
  try {
    localStorage.setItem(HIST_KEY, JSON.stringify(state.chat.slice(-HIST_MAX)));
  } catch {}
}

function renderHistorial() {
  const cont = document.getElementById("chat-messages");
  if (!cont) return;
  cont.innerHTML = "";

  if (!state.chat.length) {
    // Mensaje de bienvenida inicial: sin badge de disclaimer
    addBotMessage("¡Hola! Soy FloraIntellect, tu asistente de plantas medicinales. Preguntame sobre síntomas como insomnio, gastritis, ansiedad, dolor de cabeza o gripe, y te recomiendo plantas con respaldo de la OMS o TRAMIL cuando estén en la base verificada.", [], false, true);
  } else {
    for (const m of state.chat) {
      if (m.role === "user") addUserMessage(m.content, false);
      else addBotMessage(m.content, m.fuentes || [], false);
    }
  }
  cont.scrollTop = cont.scrollHeight;
}

function addUserMessage(text, animate = true) {
  const cont = document.getElementById("chat-messages");
  if (!cont) return;
  const div = document.createElement("div");
  div.className = "msg user" + (animate ? "" : "");
  div.textContent = text;
  cont.appendChild(div);
  cont.scrollTop = cont.scrollHeight;
  return div;
}

function addBotMessage(text, fuentes = [], animate = true, skipBadge = false) {
  const cont = document.getElementById("chat-messages");
  if (!cont) return;
  const div = document.createElement("div");
  div.className = "msg ia";
  if (!animate) div.style.animation = "none";
  // render texto con saltos de línea preservados
  div.style.whiteSpace = "pre-wrap";
  renderMarkdownInto(div, text);
  cont.appendChild(div);

  if (skipBadge) {
    // mensaje de bienvenida u otros sin badge
  } else if (fuentes && fuentes.length) {
    const badge = document.createElement("div");
    badge.className = "msg-badge fuente";
    const f = fuentes[0];
    const nombre = f.nombre || "Fuente verificada";
    badge.innerHTML = `Fuente: ${escapeHtml(nombre)} ` + (f.url ? `<a href="${escapeAttr(f.url)}" target="_blank" rel="noopener">→</a>` : "");
    div.appendChild(badge);
  } else {
    const badge = document.createElement("div");
    badge.className = "msg-badge disclaimer";
    badge.textContent = "Conocimiento general — sin fuente verificada";
    div.appendChild(badge);
  }
  cont.scrollTop = cont.scrollHeight;
  return div;
}

// Markdown mínimo: **bold** -> <strong>, saltos de línea preservados.
// Escapamos todo primero, luego abrimos <strong> solo donde aparece **.
function renderMarkdownInto(el, text) {
  const safe = escapeHtml(text || "");
  // Convertir **...** a <strong>...</strong>. Soporta multilinea simple.
  const html = safe.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  el.innerHTML = html;
}

function addTyping() {
  const cont = document.getElementById("chat-messages");
  if (!cont) return null;
  const div = document.createElement("div");
  div.className = "msg-typing";
  div.id = "typing";
  div.innerHTML = "<span></span><span></span><span></span>";
  cont.appendChild(div);
  cont.scrollTop = cont.scrollHeight;
  return div;
}

function removeTyping() {
  const t = document.getElementById("typing");
  if (t) t.remove();
}

function setSendLoading(loading) {
  const btn = document.getElementById("chat-send");
  const inp = document.getElementById("chat-input");
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    inp.disabled = true;
    btn.innerHTML = '<div class="spinner"></div>';
  } else {
    btn.disabled = false;
    inp.disabled = false;
    btn.innerHTML = '<svg class="ic-send" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
  }
}

async function sendChatMessage(text) {
  if (state.chatLoading) return;
  text = (text || "").trim();
  if (!text) return;
  if (text.length > 500) {
    toast("El mensaje no puede superar 500 caracteres.");
    return;
  }

  state.chat.push({ role: "user", content: text });
  addUserMessage(text);
  saveHistorial();

  state.chatLoading = true;
  setSendLoading(true);
  addTyping();

  try {
    // Armar messages a enviar (todo el historial o últimos N para no saturar)
    const messages = state.chat.slice(-20).map(m => ({ role: m.role, content: m.content }));
    const data = await fetchJson(API + "/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages })
    });
    removeTyping();
    state.chat.push({ role: "assistant", content: data.reply, fuentes: data.fuentes || [] });
    addBotMessage(data.reply, data.fuentes || []);
    saveHistorial();
  } catch (e) {
    removeTyping();
    handleApiError(e);
    addBotMessage("No pude responder en este momento. Probá de nuevo en unos segundos.");
  } finally {
    state.chatLoading = false;
    setSendLoading(false);
  }
}

function clearChat() {
  state.chat = [];
  localStorage.removeItem(HIST_KEY);
  renderHistorial();
  toast("Conversación reiniciada.");
}

function wireChat() {
  const form = document.getElementById("chat-form");
  const inp  = document.getElementById("chat-input");
  const cnt  = document.getElementById("chat-counter");
  const clr  = document.getElementById("chat-clear");

  if (form) {
    form.addEventListener("submit", e => {
      e.preventDefault();
      sendChatMessage(inp.value);
      inp.value = "";
      cnt.textContent = "0 / 500";
    });
  }
  if (inp) {
    inp.addEventListener("input", () => {
      const len = inp.value.length;
      cnt.textContent = `${len} / 500`;
      cnt.classList.toggle("over", len >= 480);
    });
  }
  if (clr) clr.addEventListener("click", clearChat);

  // Chips de preguntas frecuentes
  document.querySelectorAll("#chip-list .chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const q = chip.dataset.q;
      if (!q) return;
      if (state.current !== "chat") showSection("chat");
      setTimeout(() => {
        inp.value = q;
        cnt.textContent = `${q.length} / 500`;
        sendChatMessage(q);
        inp.value = "";
        cnt.textContent = "0 / 500";
      }, 80);
    });
  });
}

// ───────────────────────────────────────────────────────────────────────────
// IDENTIFICAR
// ───────────────────────────────────────────────────────────────────────────
function setIdState(s) {
  state.idState = s;
  document.getElementById("id-state-initial").style.display = s === "initial" ? "" : "none";
  document.getElementById("id-state-loading").style.display = s === "loading" ? "" : "none";
  document.getElementById("id-state-empty").style.display   = s === "empty"   ? "" : "none";
  document.getElementById("id-state-result").style.display  = s === "result"  ? "" : "none";
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

async function handleImageFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    toast("El archivo tiene que ser una imagen (JPG o PNG).");
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    toast("La imagen es demasiado grande (máx 10MB).");
    return;
  }

  setIdState("loading");
  try {
    const dataUrl = await readFileAsDataURL(file);
    state.idLastBlob = dataUrl;
    document.getElementById("id-loading-img").src = dataUrl;

    // base64 sin el prefijo "data:<mime>;base64,"
    const base64 = dataUrl.split(",")[1];
    const tipo = file.type || "image/jpeg";

    const data = await fetchJson(API + "/identificar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imagen: base64, tipo })
    });

    state.idData = data;
    if (!data.encontrada) {
      setIdState("empty");
    } else {
      renderIdResult(data, dataUrl);
      setIdState("result");
    }
  } catch (e) {
    handleApiError(e);
    setIdState("initial");
  }
}

function renderIdResult(d, imageSrc) {
  const root = document.getElementById("id-state-result");
  const nombre = d.nombres_comunes?.[0] || d.nombre_cientifico || "Planta identificada";
  const cientifico = d.nombre_cientifico || "";
  const familia = d.familia || "";
  const conf = d.confianza ?? 0;

  const evidencia = d.datos_verificados
    ? `<span class="badge-evidencia badge-${nivelClass(d.nivel_evidencia)}">Evidencia ${d.nivel_evidencia || "alta"} · ${escapeHtml(d.fuente || "Fuente verificada")}</span>`
    : `<span class="badge-evidencia" style="background: var(--color-warning-bg); color: var(--color-warning);">Sin fuente verificada</span>`;

  root.innerHTML = `
    <div class="id-result">
      <div class="id-photo">
        <img src="${escapeAttr(imageSrc)}" alt="${escapeAttr(nombre)}" />
        <div class="badge-conf">${conf}% confianza</div>
      </div>
      <div class="id-info">
        <div>
          <h3 class="serif-600 id-nombre">${escapeHtml(nombre)}</h3>
          <div class="id-cientifico">${escapeHtml(cientifico)}${familia ? " · " + escapeHtml(familia) : ""}</div>
        </div>
        <div>${evidencia}</div>
        <div class="id-respuesta"></div>
        ${d.datos_verificados ? `
          <div class="id-accordion" data-acc="preparacion">
            <button class="id-acc-head" type="button">
              <span>Preparación</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="id-acc-body">${escapeHtml(extractField(d.respuesta, "Preparación") || "—")}</div>
          </div>
          <div class="id-accordion" data-acc="contra">
            <button class="id-acc-head" type="button">
              <span>Contraindicaciones</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="id-acc-body">${escapeHtml(extractField(d.respuesta, "Contraindicaciones") || "—")}</div>
          </div>
          <div class="id-accordion" data-acc="inter">
            <button class="id-acc-head" type="button">
              <span>Interacciones farmacológicas</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="id-acc-body">${escapeHtml(extractField(d.respuesta, "Interacciones") || "—")}</div>
          </div>
        ` : ""}
        <button class="btn-secondary" id="id-another" style="align-self:flex-start;">Identificar otra planta</button>
      </div>
    </div>
  `;

  // Acordeones
  root.querySelectorAll(".id-accordion").forEach(acc => {
    acc.querySelector(".id-acc-head").addEventListener("click", () => acc.classList.toggle("open"));
  });
  // render markdown en la respuesta (id-respuesta y cuerpos de acordeón)
  const respuestaEl = root.querySelector(".id-respuesta");
  if (respuestaEl) renderMarkdownInto(respuestaEl, d.respuesta || "");
  root.querySelectorAll(".id-acc-body").forEach((accBody) => {
    // El texto original está como textContent en el HTML; rehacemos desde data-attribute si existe,
    // si no, dejamos el contenido que ya tenía (que viene de extractField con escapeHtml).
  });
  // Botón otra
  const other = document.getElementById("id-another");
  if (other) other.addEventListener("click", () => {
    setIdState("initial");
    document.getElementById("input-archivo").value = "";
    document.getElementById("input-camara").value = "";
  });
}

function extractField(text, field) {
  if (!text) return null;
  const re = new RegExp(`\\*?\\*?${field}:?\\*?\\*?[\\s\\S]*?(?=\\n\\n|\\*\\*|$)`, "i");
  const m = text.match(re);
  if (!m) return null;
  return m[0].replace(new RegExp(`^\\*?\\*?${field}:?\\*?\\*?\\s*`, "i"), "").trim();
}

function nivelClass(n) {
  if (n === "alta") return "alta";
  if (n === "media") return "media";
  return "folk";
}

function wireIdentificar() {
  const cam = document.getElementById("input-camara");
  const fil = document.getElementById("input-archivo");
  document.getElementById("btn-camara").addEventListener("click", () => cam.click());
  document.getElementById("btn-archivo").addEventListener("click", () => fil.click());
  cam.addEventListener("change", e => handleImageFile(e.target.files?.[0]));
  fil.addEventListener("change", e => handleImageFile(e.target.files?.[0]));
  document.getElementById("btn-retry").addEventListener("click", () => setIdState("initial"));

  // Drag & drop
  const drop = document.getElementById("id-drop");
  ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("drag"); }));
  drop.addEventListener("drop", e => {
    const file = e.dataTransfer.files?.[0];
    handleImageFile(file);
  });
}

// ───────────────────────────────────────────────────────────────────────────
// VERIFICADAS
// ───────────────────────────────────────────────────────────────────────────
async function loadVerificadas() {
  const grid = document.getElementById("v-grid");
  if (!grid) return;
  if (state.verificadasLoaded && state.verificadas.length) {
    renderVerificadas();
    return;
  }
  // Skeletons
  grid.innerHTML = Array.from({ length: 6 }).map(() => `
    <div class="v-skel">
      <div class="skeleton v-skel-img"></div>
      <div class="v-skel-body">
        <div class="skeleton v-skel-line" style="width: 70%"></div>
        <div class="skeleton v-skel-line" style="width: 50%"></div>
        <div class="skeleton v-skel-line" style="width: 90%"></div>
      </div>
    </div>
  `).join("");

  try {
    const data = await fetchJson(API + "/verificadas");
    state.verificadas = data.plantas || [];
    state.verificadasLoaded = true;
    renderVerificadas();
  } catch (e) {
    handleApiError(e);
    grid.innerHTML = `<p style="color:var(--color-text-muted);">No se pudieron cargar las plantas verificadas.</p>`;
  }
}

function renderVerificadas() {
  const grid = document.getElementById("v-grid");
  if (!grid) return;
  grid.innerHTML = state.verificadas.map(p => vCard(p)).join("");
  // Lazy load imágenes
  setupLazyImages(grid);
  // Modal
  grid.querySelectorAll(".v-card").forEach(card => {
    card.addEventListener("click", () => openModal(card.dataset.id));
  });
}

function vCard(p) {
  const inicial = (p.nombre_comun || "?").charAt(0).toUpperCase();
  const wikiUrl = getWikiUrl(p.imagen_referencia);
  const img = wikiUrl
    ? `<img data-src="${escapeAttr(wikiUrl)}" alt="${escapeAttr(p.nombre_comun)}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'v-card-img-fallback',textContent:this.alt.charAt(0).toUpperCase()}))" />`
    : `<div class="v-card-img-fallback">${inicial}</div>`;
  const usos = (p.usos_medicinales || []).slice(0, 3).join(" · ");
  const nivel = p.nivel_evidencia || "folk";
  const fuenteCorta = (p.fuente_principal || "").split(",")[0];

  return `
    <article class="v-card" data-id="${escapeAttr(p.id)}">
      <div class="v-card-img">
        ${img}
        <span class="badge-pill-overlay ${nivel}">${capitalize(nivel)}</span>
      </div>
      <div class="v-card-body">
        <div class="v-card-nombre serif-600">${escapeHtml(p.nombre_comun)}</div>
        <div class="v-card-cientifico">${escapeHtml(p.nombre_cientifico || "")}</div>
        <div class="v-card-usos">• ${escapeHtml(usos)}</div>
      </div>
      <div class="v-card-footer">
        <span class="v-card-fuente">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
          ${escapeHtml(fuenteCorta)}
        </span>
        <button class="v-card-ver">Ver ficha →</button>
      </div>
    </article>
  `;
}

function openModal(id) {
  const p = state.verificadas.find(x => x.id === id);
  if (!p) return;
  const inicial = (p.nombre_comun || "?").charAt(0).toUpperCase();
  const wikiUrl = getWikiUrl(p.imagen_referencia);
  const img = wikiUrl
    ? `<img src="${escapeAttr(wikiUrl)}" alt="${escapeAttr(p.nombre_comun)}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'modal-img-fallback',textContent:this.alt.charAt(0).toUpperCase()}))" />`
    : `<div class="modal-img-fallback">${inicial}</div>`;
  const nivel = p.nivel_evidencia || "folk";

  const secciones = [
    ["Usos medicinales", Array.isArray(p.usos_medicinales) ? `<ul>${p.usos_medicinales.map(u => `<li>${escapeHtml(u)}</li>`).join("")}</ul>` : `<p>${escapeHtml(p.usos_medicinales || "—")}</p>`],
    ["Parte usada",       `<p>${escapeHtml(p.parte_usada || "—")}</p>`],
    ["Preparación",       `<p>${escapeHtml(p.preparacion || "—")}</p>`],
    ["Dosis",             `<p>${escapeHtml(p.dosis || "—")}</p>`],
    ["Contraindicaciones",Array.isArray(p.contraindicaciones) ? `<ul>${p.contraindicaciones.map(u => `<li>${escapeHtml(u)}</li>`).join("")}</ul>` : `<p>${escapeHtml(p.contraindicaciones || "—")}</p>`],
    ["Interacciones",     Array.isArray(p.interacciones_farmacologicas) ? `<ul>${p.interacciones_farmacologicas.map(u => `<li>${escapeHtml(u)}</li>`).join("")}</ul>` : `<p>${escapeHtml(p.interacciones_farmacologicas || "—")}</p>`],
  ];

  const html = `
    <button class="modal-close" id="modal-close" aria-label="Cerrar">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
    <div class="modal-img">
      ${img}
      <span class="badge-pill-overlay ${nivel}">${capitalize(nivel)}</span>
    </div>
    <h3 class="modal-nombre serif-600">${escapeHtml(p.nombre_comun)}</h3>
    <div class="modal-cientifico">${escapeHtml(p.nombre_cientifico || "")}</div>
    ${p.familia ? `<div class="modal-familia">Familia: ${escapeHtml(p.familia)}</div>` : ""}
    ${p.descripcion ? `<p style="color:var(--color-text-secondary); margin-top: 12px; line-height: 1.6;">${escapeHtml(p.descripcion)}</p>` : ""}
    ${secciones.map(([t, c]) => `<div class="modal-section"><h4>${escapeHtml(t)}</h4>${c}</div>`).join("")}
    ${p.fuente_principal ? `
      <div class="modal-fuente">
        📚 Fuente: <strong>${escapeHtml(p.fuente_principal)}</strong>
        ${p.fuente_url ? `<br><a href="${escapeAttr(p.fuente_url)}" target="_blank" rel="noopener">${escapeHtml(p.fuente_url)}</a>` : ""}
      </div>
    ` : ""}
  `;
  const modal = document.getElementById("modal-content");
  const overlay = document.getElementById("modal-overlay");
  modal.innerHTML = html;
  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  document.getElementById("modal-close").addEventListener("click", closeModal);
}

function closeModal() {
  const overlay = document.getElementById("modal-overlay");
  overlay.classList.remove("open");
  overlay.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function wireModal() {
  const overlay = document.getElementById("modal-overlay");
  overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
}

// ───────────────────────────────────────────────────────────────────────────
// CATÁLOGO
// ───────────────────────────────────────────────────────────────────────────
let catalogoLoading = false;

async function loadCatalogo() {
  if (catalogoLoading) return;
  if (state.catalogo.length) {
    applyCatalogoFilter();
    return;
  }
  catalogoLoading = true;
  showCatalogoSkeletons();
  try {
    const data = await fetchJson(API + "/plantas");
    state.catalogo = data.plantas || [];
    applyCatalogoFilter();
  } catch (e) {
    handleApiError(e);
    document.getElementById("cat-grid").innerHTML = `<p style="color:var(--color-text-muted);">No se pudo cargar el catálogo.</p>`;
  } finally {
    catalogoLoading = false;
  }
}

function showCatalogoSkeletons() {
  const grid = document.getElementById("cat-grid");
  if (!grid) return;
  grid.innerHTML = Array.from({ length: 12 }).map(() => `
    <div class="cat-skel-card">
      <div class="skeleton cat-skel-box"></div>
      <div class="cat-skel-body">
        <div class="skeleton" style="height: 12px; width: 70%"></div>
        <div class="skeleton" style="height: 10px; width: 50%"></div>
        <div class="skeleton" style="height: 10px; width: 90%"></div>
      </div>
    </div>
  `).join("");
  document.getElementById("cat-pagination").style.display = "none";
}

function applyCatalogoFilter() {
  const cat = state.catalogoCategoria;
  const q = state.catalogoSearch.trim().toLowerCase();

  let list = state.catalogo;

  if (q) {
    list = list.filter(p => {
      const blob = [
        p.nombre_comun,
        p.nombre_cientifico,
        p.familia,
        Array.isArray(p.usos) ? p.usos.join(" ") : "",
        p.preparacion || "",
        p.contraindicaciones || "",
        p.parte_usada || ""
      ].join(" ").toLowerCase();
      return blob.includes(q);
    });
  }

  if (cat) {
    const keys = CAT_MAP[cat] || [];
    if (cat === "otros") {
      // "otros" = no entra en digestivo/nervioso/respiratorio/piel
      const otrosKeys = [].concat(
        CAT_MAP.digestivo, CAT_MAP.nervioso, CAT_MAP.respiratorio, CAT_MAP.piel
      );
      list = list.filter(p => {
        const blob = [
          p.nombre_comun, p.nombre_cientifico, p.familia,
          Array.isArray(p.usos) ? p.usos.join(" ") : "",
          p.preparacion || "", p.contraindicaciones || ""
        ].join(" ").toLowerCase();
        return !otrosKeys.some(k => blob.includes(k));
      });
    } else if (keys.length) {
      list = list.filter(p => {
        const blob = [
          p.nombre_comun, p.nombre_cientifico, p.familia,
          Array.isArray(p.usos) ? p.usos.join(" ") : "",
          p.preparacion || "", p.contraindicaciones || ""
        ].join(" ").toLowerCase();
        return keys.some(k => blob.includes(k));
      });
    }
  }

  state.catalogoFiltered = list;
  state.catalogoPage = 1;
  renderCatalogo();
  const sub = document.getElementById("cat-subtitle");
  if (sub) sub.textContent = `${list.length} plantas en catálogo general`;
}

function renderCatalogo() {
  const grid = document.getElementById("cat-grid");
  if (!grid) return;
  const total = state.catalogoFiltered.length;
  const perPage = state.catalogoPerPage;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (state.catalogoPage > totalPages) state.catalogoPage = totalPages;
  const start = (state.catalogoPage - 1) * perPage;
  const slice = state.catalogoFiltered.slice(start, start + perPage);

  if (!slice.length) {
    grid.innerHTML = `<p style="color:var(--color-text-muted); grid-column: 1/-1; text-align:center; padding: 32px 0;">No se encontraron plantas con esos criterios.</p>`;
  } else {
    grid.innerHTML = slice.map((p, i) => catCard(p, start + i)).join("");
  }

  const pag = document.getElementById("cat-pagination");
  if (total > perPage) {
    pag.style.display = "";
    document.getElementById("cat-page-info").textContent = `Página ${state.catalogoPage} de ${totalPages}`;
    document.getElementById("cat-prev").disabled = state.catalogoPage === 1;
    document.getElementById("cat-next").disabled = state.catalogoPage === totalPages;
  } else {
    pag.style.display = "none";
  }
}

function catCard(p, i) {
  const color = CAT_COLORS[(i || 0) % CAT_COLORS.length];
  const inicial = (p.nombre_comun || "?").charAt(0).toUpperCase();
  const usos = Array.isArray(p.usos) ? p.usos.slice(0, 3).join(" · ") : "";
  return `
    <article class="cat-card">
      <div class="cat-card-box" style="background: ${color}">${inicial}</div>
      <div class="cat-card-body">
        <div class="cat-card-nombre">${escapeHtml(p.nombre_comun || "—")}</div>
        <div class="cat-card-cientifico">${escapeHtml(p.nombre_cientifico || "")}</div>
        ${usos ? `<div class="cat-card-usos">${escapeHtml(usos)}</div>` : ""}
      </div>
      <div class="cat-card-footer">Catálogo general</div>
    </article>
  `;
}

function wireCatalogo() {
  const input = document.getElementById("cat-search");
  let t;
  input.addEventListener("input", e => {
    clearTimeout(t);
    t = setTimeout(() => {
      state.catalogoSearch = e.target.value;
      applyCatalogoFilter();
    }, 200);
  });

  document.querySelectorAll("#cat-filters .cat-filter").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#cat-filters .cat-filter").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.catalogoCategoria = btn.dataset.cat || "";
      applyCatalogoFilter();
    });
  });

  document.getElementById("cat-prev").addEventListener("click", () => {
    if (state.catalogoPage > 1) {
      state.catalogoPage--;
      renderCatalogo();
    }
  });
  document.getElementById("cat-next").addEventListener("click", () => {
    const total = state.catalogoFiltered.length;
    const totalPages = Math.ceil(total / state.catalogoPerPage);
    if (state.catalogoPage < totalPages) {
      state.catalogoPage++;
      renderCatalogo();
    }
  });
}

// ───────────────────────────────────────────────────────────────────────────
// QUIZ
// ───────────────────────────────────────────────────────────────────────────
const QUIZ_TOTAL = 10;

async function loadQuiz() {
  const area = document.getElementById("quiz-area");
  if (!area) return;
  if (state.quiz && state.quizAnswered < QUIZ_TOTAL) {
    renderQuiz();
    return;
  }
  state.quiz = null;
  state.quizScore = 0;
  state.quizAnswered = 0;
  await nextQuizQuestion();
}

async function nextQuizQuestion() {
  const area = document.getElementById("quiz-area");
  if (!area) return;
  if (state.quizAnswered >= QUIZ_TOTAL) {
    renderQuizFinal();
    return;
  }
  area.innerHTML = `
    <div class="quiz-card">
      <div style="display:flex; justify-content:center; padding: 40px 0;">
        <div class="spinner lg"></div>
      </div>
    </div>
  `;
  try {
    const q = await fetchJson(API + "/quiz");
    state.quiz = q;
    state.quiz._state = "playing";
    state.quiz._chosen = null;
    renderQuiz();
  } catch (e) {
    handleApiError(e);
    area.innerHTML = `<p style="color:var(--color-text-muted); text-align:center;">No se pudo cargar la pregunta.</p>`;
  }
}

function renderQuiz() {
  const area = document.getElementById("quiz-area");
  if (!area || !state.quiz) return;
  const q = state.quiz;
  const total = QUIZ_TOTAL;
  const current = state.quizAnswered + 1;
  const pct = ((state.quizAnswered) / total) * 100;

  const inicial = (q.planta?.nombre || "?").charAt(0).toUpperCase();

  const optsHtml = (q.opciones || []).map((o, i) => {
    const letter = ["A", "B", "C", "D"][i] || (i + 1);
    let cls = "quiz-opt";
    if (q._state === "answered") {
      if (o.id === q.correcta_id) cls += " correct";
      else if (o.id === q._chosen) cls += " wrong";
    }
    return `<button class="${cls}" data-id="${escapeAttr(o.id)}" ${q._state !== "playing" ? "disabled" : ""}>
      <span class="opt-mark">${letter}</span>
      <span>${escapeHtml(o.texto)}</span>
    </button>`;
  }).join("");

  area.innerHTML = `
    <div class="quiz-card">
      <div class="quiz-meta">Pregunta ${current} de ${total}</div>
      <div class="quiz-progress"><div class="quiz-progress-fill" style="width: ${pct}%"></div></div>
      <div class="quiz-plant">
        <div class="quiz-plant-img">${inicial}</div>
        <div class="quiz-plant-info">
          <span class="quiz-plant-name">${escapeHtml(q.planta?.nombre || "")}</span>
          <span class="quiz-plant-sci">${escapeHtml(q.planta?.cientifico || "")}</span>
        </div>
      </div>
      <div class="quiz-question">${escapeHtml(q.pregunta)}</div>
      <div class="quiz-options">${optsHtml}</div>
      ${q._state === "answered" ? `
        <div class="quiz-explain">
          ${q._chosen === q.correcta_id
            ? `<strong>¡Correcto!</strong> ${escapeHtml(q.planta?.nombre || "")} se usa principalmente para ${escapeHtml(findOptionText(q, q.correcta_id))}.`
            : `<strong>No del todo.</strong> La respuesta correcta es <em>${escapeHtml(findOptionText(q, q.correcta_id))}</em>.`}
        </div>
        <button class="btn-primary quiz-next" id="quiz-next">Siguiente pregunta →</button>
      ` : ""}
    </div>
  `;

  document.getElementById("quiz-score").textContent =
    `🌿 ${state.quizScore} / ${state.quizAnswered} correctas`;

  if (q._state === "playing") {
    area.querySelectorAll(".quiz-opt").forEach(btn => {
      btn.addEventListener("click", () => answerQuiz(btn.dataset.id));
    });
  } else if (q._state === "answered") {
    document.getElementById("quiz-next").addEventListener("click", () => {
      state.quizAnswered++;
      nextQuizQuestion();
    });
  }
}

function findOptionText(q, id) {
  return q.opciones?.find(o => o.id === id)?.texto || "";
}

function answerQuiz(chosenId) {
  if (!state.quiz || state.quiz._state !== "playing") return;
  state.quiz._chosen = chosenId;
  state.quiz._state = "answered";
  if (chosenId === state.quiz.correcta_id) state.quizScore++;
  // Re-render para que las opciones aparezcan con clases correct/wrong
  // y se muestre la explicación + botón Siguiente
  renderQuiz();
}

function renderQuizFinal() {
  const area = document.getElementById("quiz-area");
  if (!area) return;
  const score = state.quizScore;
  const total = QUIZ_TOTAL;
  let msg = "";
  if (score <= 3) msg = "Buen comienzo. Seguí explorando las plantas verificadas para aprender más.";
  else if (score <= 6) msg = "Vas bien. Hay plantas que aún tenés por descubrir.";
  else if (score <= 8) msg = "Muy bien. Tenés un gran conocimiento de plantas medicinales.";
  else msg = "Excelente. Sos casi un experto en plantas medicinales.";

  area.innerHTML = `
    <div class="quiz-card">
      <div class="quiz-final">
        <div class="quiz-final-score">${score} / ${total}</div>
        <div class="quiz-final-msg">${msg}</div>
        <button class="btn-primary" id="quiz-restart">Jugar de nuevo</button>
      </div>
    </div>
  `;
  document.getElementById("quiz-score").textContent = `🌿 ${score} / ${total} correctas`;
  document.getElementById("quiz-restart").addEventListener("click", () => {
    state.quiz = null;
    state.quizScore = 0;
    state.quizAnswered = 0;
    nextQuizQuestion();
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Lazy loading con IntersectionObserver
// ───────────────────────────────────────────────────────────────────────────
let lazyObserver = null;
function setupLazyImages(container) {
  if (!("IntersectionObserver" in window)) {
    container.querySelectorAll("img[data-src]").forEach(img => {
      img.src = img.dataset.src;
    });
    return;
  }
  if (!lazyObserver) {
    lazyObserver = new IntersectionObserver((entries, obs) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          const img = e.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute("data-src");
          }
          obs.unobserve(img);
        }
      });
    }, { rootMargin: "120px" });
  }
  container.querySelectorAll("img[data-src]").forEach(img => lazyObserver.observe(img));
}

// ───────────────────────────────────────────────────────────────────────────
// Util: escape, capitalize
// ───────────────────────────────────────────────────────────────────────────
function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
// ───────────────────────────────────────────────────────────────────────────
// Util: imágenes
// Wikimedia necesita el hash del archivo (no solo el nombre). Como
// plantas_verificadas.json sólo trae el nombre, preferimos no intentar
// adivinar y devolver null → se muestra el fallback con la inicial.
// ───────────────────────────────────────────────────────────────────────────
function getWikiUrl(name) {
  if (!name || typeof name !== "string") return null;
  // Si ya es una URL completa, devolver tal cual
  if (/^https?:\/\//.test(name)) return name;
  // Si parece nombre de archivo (Contiene extensión o guiones), no podemos
  // construir la URL sin el hash de Wikimedia → fallback a inicial
  return null;
}

function escapeAttr(s) { return escapeHtml(s); }
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// ───────────────────────────────────────────────────────────────────────────
// Init
// ───────────────────────────────────────────────────────────────────────────
function init() {
  wireNav();
  wireChat();
  wireIdentificar();
  wireModal();
  wireCatalogo();
  loadHistorial();
  // mostrar hero
  showSection("hero");
}

document.addEventListener("DOMContentLoaded", init);
