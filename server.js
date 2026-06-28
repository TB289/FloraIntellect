// FloraIntellect — backend
// Arquitectura: Plant.id (identificación) + JSON verificado OMS/TRAMIL (RAG) + Groq/Claude (redactor)
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// ── Configuración ────────────────────────────────────────────────────────────
const PLANTID_KEY = process.env.PLANTID_KEY;
const LLM_API_KEY = process.env.LLM_API_KEY || process.env.GROQ_API_KEY || process.env.ANTHROPIC_API_KEY;
const LLM_PROVIDER = process.env.LLM_PROVIDER || (process.env.GROQ_API_KEY ? "groq" : (process.env.ANTHROPIC_API_KEY ? "anthropic" : "demo"));
const LLM_MODEL = process.env.LLM_MODEL || (LLM_PROVIDER === "groq" ? "llama-3.3-70b-versatile" : "claude-sonnet-4-20250514");
const PIXABAY_KEY = process.env.PIXABAY_API_KEY;

const DEMO_MODE = !LLM_API_KEY || (LLM_PROVIDER === "anthropic" && !process.env.ANTHROPIC_API_KEY) || LLM_PROVIDER === "demo";
const NO_PLANTID = !PLANTID_KEY || PLANTID_KEY.includes("aqui-va");

if (DEMO_MODE) console.log("[demo mode] chat con respuestas locales.");
if (NO_PLANTID) console.log("[!] PLANTID_KEY no configurada — /identificar devolvera 503.");

// ── Middlewares ──────────────────────────────────────────────────────────────
app.use(cors({ origin: "*", methods: ["GET", "POST"], allowedHeaders: ["Content-Type"] }));
app.use(express.json({ limit: "12mb" })); // imágenes base64 pesan
app.use(express.static(__dirname));

// ── Carga de datos ──────────────────────────────────────────────────────────
function cargarPlantas() {
  const dataDir = join(__dirname, "data");
  const archivos = readdirSync(dataDir).filter(f => /^plantas_\d+\.json$/.test(f));
  let todas = [];
  for (const a of archivos) {
    todas = todas.concat(JSON.parse(readFileSync(join(dataDir, a), "utf-8")));
  }
  return todas;
}
function cargarVerificadas() {
  return JSON.parse(readFileSync(join(__dirname, "data", "plantas_verificadas.json"), "utf-8"));
}
const PLANTAS = cargarPlantas();
const VERIFICADAS = cargarVerificadas();
console.log(`[data] ${PLANTAS.length} plantas en catalogo | ${VERIFICADAS.length} plantas verificadas con fuentes OMS/TRAMIL`);

// ── Normalización y búsqueda semántica básica ───────────────────────────────
function norm(t = "") {
  return t.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const SINONIMOS = {
  "insomnio": ["dormir", "sueño", "desvelo", "no duermo", "conciliar"],
  "gastritis": ["estomago", "panza", "acidez", "ardor", "ulcera", "reflujo"],
  "ansiedad": ["nervios", "estres", "angustia", "nerviosismo", "tension", "preocupacion"],
  "dolor cabeza": ["cefalea", "migrana", "jaqueca"],
  "presion alta": ["hipertension", "tension alta"],
  "gripa": ["resfriado", "catarro", "gripe", "tos", "congestion", "mocos"],
  "inflamacion": ["inflamado", "hinchado", "hinchazon"],
  "digestion": ["digestivo", "pesadez", "gases", "flatulencia", "estrenimiento"],
  "colesterol": ["grasas sangre", "trigliceridos"],
  "diabetes": ["azucar sangre", "glucosa", "insulina"],
  "herida": ["cortada", "raspadura", "quemadura", "llaga"],
  "diarrea": ["cursillo", "suelta"]
};

function expandirQuery(query) {
  const q = norm(query);
  let terminos = new Set([q]);
  for (const [concepto, vars] of Object.entries(SINONIMOS)) {
    const cNorm = norm(concepto);
    if (q.includes(cNorm) || vars.some(v => q.includes(norm(v)))) {
      terminos.add(cNorm);
      vars.forEach(v => terminos.add(norm(v)));
    }
  }
  return [...terminos];
}

function buscarPlantasRelevantes(query, limite = 5) {
  const terminos = expandirQuery(query);
  return PLANTAS
    .map(planta => {
      let score = 0;
      const campos = [
        { texto: planta.nombre_comun, peso: 3 },
        { texto: planta.nombres_regionales?.join(" "), peso: 2 },
        { texto: planta.nombre_cientifico, peso: 2 },
        { texto: Array.isArray(planta.usos_medicinales) ? planta.usos_medicinales.join(" ") : (planta.usos || []).join(" "), peso: 3 },
        { texto: planta.descripcion, peso: 1 },
        { texto: planta.parte_usada, peso: 1 },
        { texto: planta.familia, peso: 1 }
      ];
      for (const t of terminos) {
        if (!t || t.length < 2) continue;
        for (const { texto, peso } of campos) {
          if (texto && norm(texto).includes(t)) score += peso;
        }
      }
      return { planta, score };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite)
    .map(r => r.planta);
}

function buscarVerificadaPorNombre(nombreCientifico) {
  if (!nombreCientifico) return null;
  const q = norm(nombreCientifico);
  // match exacto, luego match por género
  return VERIFICADAS.find(p => norm(p.nombre_cientifico) === q)
    || VERIFICADAS.find(p => norm(p.nombre_cientifico).split(" ")[0] === q.split(" ")[0])
    || null;
}

function formatearContextoPlanta(p) {
  return [
    `Nombre: ${p.nombre_comun} (${p.nombre_cientifico})`,
    `Familia: ${p.familia}`,
    `Descripción: ${p.descripcion}`,
    `Usos medicinales: ${(p.usos_medicinales || []).join(", ")}`,
    `Parte usada: ${p.parte_usada}`,
    `Preparación: ${p.preparacion}`,
    `Dosis: ${p.dosis}`,
    `Contraindicaciones: ${(p.contraindicaciones || []).join("; ")}`,
    `Interacciones: ${(p.interacciones_farmacologicas || []).join("; ")}`,
    `Nivel de evidencia: ${p.nivel_evidencia}`,
    `Fuente: ${p.fuente_principal}`,
    p.fuente_url ? `URL fuente: ${p.fuente_url}` : ""
  ].filter(Boolean).join("\n");
}

function formatearContextoVerificadas(plantas) {
  return plantas.map(formatearContextoPlanta).join("\n\n---\n\n");
}

// ── Cliente LLM (Groq o Anthropic) ──────────────────────────────────────────
async function llamarLLM({ system, messages, maxTokens = 700 }) {
  if (DEMO_MODE) throw new Error("DEMO_MODE activo");
  if (LLM_PROVIDER === "groq") {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${LLM_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        max_tokens: maxTokens,
        temperature: 0.4,
        messages: [{ role: "system", content: system }, ...messages]
      })
    });
    if (!r.ok) throw new Error(`Groq ${r.status}: ${await r.text()}`);
    const j = await r.json();
    return j.choices[0].message.content;
  } else {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": LLM_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model: LLM_MODEL, max_tokens: maxTokens, system, messages })
    });
    if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
    const j = await r.json();
    return j.content[0].text;
  }
}

const SYSTEM_PROMPT = `Eres FloraIntellect, un asistente especializado en plantas medicinales para una feria escolar.
SOLO responde basándote en el contexto de plantas que se te provee. No inventes información.
Si la información no está en el contexto, indica claramente que no tienes datos verificados sobre eso.
SIEMPRE menciona contraindicaciones relevantes cuando estén disponibles.
SIEMPRE cita la fuente (OMS Monographs, TRAMIL, etc.) cuando esté disponible.
NUNCA reemplaces consejo médico profesional.
Responde de forma cálida, clara y concisa en español, máximo 2-3 párrafos.
Bloque de seguridad obligatorio:
- Si preguntan por embarazo, lactancia, niños menores de 12, o condiciones médicas específicas, recomienda consultar profesional y NO des recomendaciones específicas.
- Si preguntan por dosis mayores a las indicadas, advierte y redirige a profesional.
- No diagnostiques enfermedades.
Al final de cada respuesta incluye: "Esta información no reemplaza la consulta con un profesional de salud."`;

// ── Rate limit ──────────────────────────────────────────────────────────────
const chatLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas consultas. Esperá 15 minutos." }
});

const idLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Límite de identificaciones alcanzado. Esperá una hora." }
});

// ── Cache de fotos ──────────────────────────────────────────────────────────
const fotoCache = new Map();
async function fotoPixabay(nombre) {
  if (fotoCache.has(nombre)) return fotoCache.get(nombre);
  if (!PIXABAY_KEY) return null;
  try {
    const r = await fetch(
      `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(nombre + " plant")}&image_type=photo&per_page=3&safesearch=true`
    );
    const j = await r.json();
    const url = j.hits?.[0]?.webformatURL || null;
    if (url) fotoCache.set(nombre, url);
    return url;
  } catch (e) {
    return null;
  }
}

// ── Endpoints ───────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({
  status: "ok",
  service: "FloraIntellect",
  catalogo: PLANTAS.length,
  verificadas: VERIFICADAS.length,
  llm: LLM_PROVIDER,
  llm_configurado: !DEMO_MODE,
  plantid_configurado: !NO_PLANTID,
  pixabay: !!PIXABAY_KEY
}));

app.get("/plantas", (req, res) => {
  const { buscar } = req.query;
  if (buscar) {
    return res.json({ total: buscarPlantasRelevantes(buscar, 24).length, plantas: buscarPlantasRelevantes(buscar, 24) });
  }
  res.json({ total: PLANTAS.length, plantas: PLANTAS });
});

app.get("/plantas/:id", (req, res) => {
  const p = PLANTAS.find(x => String(x.id) === String(req.params.id));
  if (!p) return res.status(404).json({ error: "No encontrada" });
  res.json(p);
});

app.get("/verificadas", (_req, res) => res.json({ total: VERIFICADAS.length, plantas: VERIFICADAS }));

app.get("/verificadas/:id", (req, res) => {
  const p = VERIFICADAS.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "No encontrada" });
  res.json(p);
});

app.get("/foto/:nombre", async (req, res) => {
  const url = await fotoPixabay(req.params.nombre);
  res.json({ url });
});

// ── POST /chat ──────────────────────────────────────────────────────────────
app.post("/chat", chatLimit, async (req, res) => {
  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages requerido" });
    }
    const ultimo = messages[messages.length - 1];
    if (!ultimo || ultimo.role !== "user" || typeof ultimo.content !== "string") {
      return res.status(400).json({ error: "Formato inválido" });
    }
    if (ultimo.content.length > 600) {
      return res.status(400).json({ error: "Mensaje demasiado largo (máx 600 caracteres)" });
    }

    const relevantes = buscarPlantasRelevantes(ultimo.content, 5);
    const verificadasHit = VERIFICADAS.filter(v =>
      relevantes.some(r => norm(r.nombre_comun) === norm(v.nombre_comun))
    );

    let reply, fuentes = [];
    const contexto = verificadasHit.length
      ? formatearContextoVerificadas(verificadasHit)
      : "";

    if (DEMO_MODE) {
      if (verificadasHit.length > 0) {
        const v = verificadasHit[0];
        reply = `**${v.nombre_comun}** (*${v.nombre_cientifico}*)\n\n` +
          (v.usos_medicinales || []).map(u => `• ${u}`).join("\n") +
          `\n\n**Preparación:** ${v.preparacion}\n` +
          `**Dosis:** ${v.dosis}\n` +
          `**Contraindicaciones:** ${(v.contraindicaciones || []).join("; ")}\n\n` +
          `Fuente: ${v.fuente_principal}\n\n` +
          `_Modo demo — sin LLM configurado. La versión con IA real mantiene este formato._\n\n` +
          `Esta información no reemplaza la consulta con un profesional de salud.`;
        fuentes = [{ nombre: v.fuente_principal, url: v.fuente_url, nivel: v.nivel_evidencia }];
      } else {
        reply = `Para "${ultimo.content}" no encontré plantas verificadas con fuentes en la base curada (OMS/TRAMIL).\n\n` +
          `Probá con síntomas como: insomnio, gastritis, ansiedad, dolor de cabeza, gripa, digestión, inflamación, diabetes.\n\n` +
          `Esta información no reemplaza la consulta con un profesional de salud.`;
      }
    } else {
      const system = contexto
        ? `${SYSTEM_PROMPT}\n\nCONTEXTO VERIFICADO DE PLANTAS (úsalo como única fuente, no inventes):\n${contexto}`
        : SYSTEM_PROMPT;
      reply = await llamarLLM({ system, messages, maxTokens: 700 });
      fuentes = verificadasHit.map(v => ({ nombre: v.fuente_principal, url: v.fuente_url, nivel: v.nivel_evidencia }));
    }

    res.json({ reply, fuentes, plantas: relevantes.slice(0, 3), demo: DEMO_MODE });
  } catch (e) {
    console.error("/chat:", e.message);
    res.status(500).json({ error: "Error interno" });
  }
});

// ── POST /identificar (Plant.id) ────────────────────────────────────────────
app.post("/identificar", idLimit, async (req, res) => {
  try {
    const { imagen, tipo } = req.body || {};
    if (!imagen || !tipo) {
      return res.status(400).json({ error: "Falta imagen o tipo MIME" });
    }
    if (NO_PLANTID) {
      return res.status(503).json({
        error: "Plant.id no configurado. Agregá PLANTID_KEY en .env"
      });
    }

    // 1) Plant.id identifica la planta
    const pidResp = await fetch("https://api.plant.id/v3/identification", {
      method: "POST",
      headers: { "Api-Key": PLANTID_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        images: [`data:${tipo};base64,${imagen}`],
        similar_images: false,
        classification_level: "species"
      })
    });
    if (!pidResp.ok) {
      const errTxt = await pidResp.text();
      console.error("Plant.id error:", pidResp.status, errTxt);
      return res.status(502).json({ error: `Plant.id ${pidResp.status}` });
    }
    const pidData = await pidResp.json();
    const sugerencias = pidData?.result?.classification?.suggestions || [];
    const top = sugerencias[0];
    if (!top || (top.probability || 0) < 0.35) {
      return res.json({
        encontrada: false,
        confianza: top ? Math.round(top.probability * 100) : 0,
        mensaje: "No pude identificar la planta con suficiente confianza. Probá con una foto más clara y de cerca."
      });
    }

    const nombreCientifico = top.name;
    const confianza = Math.round((top.probability || 0) * 100);
    const nombresComunes = top.details?.common_names || [];

    // 2) Buscar en JSON verificado
    const verificada = buscarVerificadaPorNombre(nombreCientifico);

    // 3) Foto de referencia
    const fotoRef = await fotoPixabay(nombresComunes[0] || nombreCientifico);

    // 4) Construir respuesta
    let respuesta, datosVerificados, fuente, fuenteUrl, nivel;
    if (verificada) {
      const contexto = formatearContextoPlanta(verificada);
      const system = `${SYSTEM_PROMPT}\n\nVas a describir SOLO los datos del contexto adjunto, sin inventar nada.`;
      if (DEMO_MODE) {
        respuesta = formatearContextoPlanta(verificada);
      } else {
        respuesta = await llamarLLM({
          system,
          messages: [{ role: "user", content: `Contexto verificado:\n${contexto}\n\nRedacta una descripción útil y clara para el usuario sobre esta planta, sus usos, preparación, dosis y contraindicaciones. Mencioná la fuente.` }],
          maxTokens: 600
        });
      }
      datosVerificados = true;
      fuente = verificada.fuente_principal;
      fuenteUrl = verificada.fuente_url;
      nivel = verificada.nivel_evidencia;
    } else {
      const system = `${SYSTEM_PROMPT}\n\nLa planta identificada NO está en la base verificada. Responde con tu conocimiento general pero incluyendo disclaimer explícito de que la información no está verificada con fuentes específicas.`;
      const userMsg = `La planta identificada es "${nombreCientifico}"${nombresComunes.length ? ` (nombres comunes: ${nombresComunes.join(", ")})` : ""}. ¿Tiene usos medicinales conocidos? Mencioná contraindicaciones principales y advierte que esta información no está verificada con fuentes específicas.`;
      if (DEMO_MODE) {
        respuesta = `Identificada como *${nombreCientifico}*${nombresComunes.length ? ` (${nombresComunes.join(", ")})` : ""}.\n\nEsta especie no está en nuestra base verificada con fuentes OMS/TRAMIL. La información que podría generarse proviene del conocimiento general del modelo y debe ser confirmada con fuentes especializadas o un profesional.\n\nEsta información no reemplaza la consulta con un profesional de salud.`;
      } else {
        respuesta = await llamarLLM({ system, messages: [{ role: "user", content: userMsg }], maxTokens: 500 });
      }
      datosVerificados = false;
    }

    res.json({
      encontrada: true,
      nombre_cientifico: nombreCientifico,
      nombres_comunes: nombresComunes,
      confianza,
      familia: top.details?.taxonomy?.family || null,
      respuesta,
      foto_url: fotoRef,
      datos_verificados: datosVerificados,
      fuente,
      fuente_url: fuenteUrl,
      nivel_evidencia: nivel
    });
  } catch (e) {
    console.error("/identificar:", e.message);
    res.status(500).json({ error: "Error procesando la imagen" });
  }
});

// ── GET /quiz — para sección interactiva ────────────────────────────────────
app.get("/quiz", (_req, res) => {
  if (VERIFICADAS.length < 4) return res.status(503).json({ error: "Base verificada insuficiente" });
  const correcta = VERIFICADAS[Math.floor(Math.random() * VERIFICADAS.length)];
  const distractores = VERIFICADAS.filter(v => v.id !== correcta.id)
    .sort(() => Math.random() - 0.5).slice(0, 3);
  const opciones = [correcta, ...distractores].sort(() => Math.random() - 0.5);
  res.json({
    pregunta: `¿Para qué sirve principalmente la planta "${correcta.nombre_comun}"?`,
    opciones: opciones.map(o => ({ id: o.id, texto: o.usos_medicinales[0] })),
    correcta_id: correcta.id,
    planta: { id: correcta.id, nombre: correcta.nombre_comun, cientifico: correcta.nombre_cientifico }
  });
});

// ── Catch-all: SPA ──────────────────────────────────────────────────────────
app.get("*", (_req, res) => res.sendFile(join(__dirname, "index.html")));

const PORT = process.env.PORT || 3030;
app.listen(PORT, () => {
  console.log(`[ok] FloraIntellect en http://localhost:${PORT}`);
  console.log(`   LLM: ${LLM_PROVIDER} (${DEMO_MODE ? "demo" : "activo"})`);
  console.log(`   Plant.id: ${NO_PLANTID ? "no" : "configurado"}`);
  console.log(`   Pixabay: ${PIXABAY_KEY ? "si" : "no"}`);
});
