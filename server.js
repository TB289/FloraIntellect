import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const PIXABAY_KEY = process.env.PIXABAY_API_KEY;
const __dirname = dirname(fileURLToPath(import.meta.url));

app.use(cors({ origin: "*", methods: ["GET", "POST"], allowedHeaders: ["Content-Type"] }));
app.use(express.json());
app.use(express.static(__dirname));

// ── Cargar plantas ────────────────────────────────────────────────────────────
function cargarPlantas() {
  const dataDir = join(__dirname, "data");
  let todas = [];
  try {
    const archivos = readdirSync(dataDir).filter(f => f.endsWith(".json"));
    for (const archivo of archivos) {
      const contenido = JSON.parse(readFileSync(join(dataDir, archivo), "utf-8"));
      todas = todas.concat(contenido);
    }
    console.log(`🌿 ${todas.length} plantas cargadas correctamente.`);
  } catch (error) {
    console.error("Error al cargar plantas:", error.message);
  }
  return todas;
}

const PLANTAS = cargarPlantas();

// ── Cache de fotos ────────────────────────────────────────────────────────────
const fotoCache = new Map();

// ── Buscar foto en Pixabay ────────────────────────────────────────────────────
async function buscarFotoPixabay(nombreComun) {
  if (fotoCache.has(nombreComun)) return fotoCache.get(nombreComun);

  try {
    const query = encodeURIComponent(`${nombreComun} plant herb medicinal`);
    const url = `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${query}&image_type=photo&category=nature&per_page=3&safesearch=true`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.hits && data.hits.length > 0) {
      const foto = data.hits[0].webformatURL;
      fotoCache.set(nombreComun, foto);
      return foto;
    }
  } catch (e) {
    console.error("Pixabay error:", e.message);
  }

  return null;
}

// ── GET /foto-planta/:id ──────────────────────────────────────────────────────
app.get("/foto-planta/:id", async (req, res) => {
  const planta = PLANTAS.find(p => p.id === parseInt(req.params.id));
  if (!planta) return res.status(404).json({ error: "No encontrada" });

  const foto = await buscarFotoPixabay(planta.nombre_comun);
  res.json({ foto_url: foto || null });
});

// ── Buscar plantas ────────────────────────────────────────────────────────────
function buscarPlantasRelevantes(pregunta, limite = 5) {
  const texto = pregunta.toLowerCase();
  return PLANTAS.filter(p => {
    const nc = p.nombre_comun?.toLowerCase() || "";
    const usos = (p.usos || []).join(" ").toLowerCase();
    return nc.includes(texto) || usos.includes(texto) || texto.includes(nc) ||
      texto.split(" ").some(w => w.length > 3 && (nc.includes(w) || usos.includes(w)));
  }).slice(0, limite);
}

function formatearContexto(plantas) {
  return plantas.map(p => `📌 ${p.nombre_comun} (${p.nombre_cientifico})
Usos: ${(p.usos||[]).join(", ")}
Preparación: ${p.preparacion}
Contraindicaciones: ${p.contraindicaciones}
Parte usada: ${p.parte_usada}`).join("\n---\n");
}

const SYSTEM_BASE = `Eres FloraIntellect, experto en plantas medicinales. Hablas con calidez, usas nombres científicos, mezclas sabiduría ancestral con ciencia moderna y siempre adviertes sobre contraindicaciones. No diagnostiques enfermedades. Máximo 3-4 párrafos por respuesta. Usa emojis de plantas con moderación 🌿🌸🍃.`;

// ── POST /chat ────────────────────────────────────────────────────────────────
app.post("/chat", async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0)
    return res.status(400).json({ error: "messages es obligatorio." });

  const ultimo = messages[messages.length - 1]?.content || "";
  const relevantes = buscarPlantasRelevantes(ultimo);
  const contexto = formatearContexto(relevantes);

  const system = contexto
    ? `${SYSTEM_BASE}\n\nINFORMACIÓN DE LA BASE DE DATOS:\n${contexto}`
    : SYSTEM_BASE;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system,
      messages,
    });

    const reply = response.content[0].text;

    // Buscar fotos en Pixabay para plantas relevantes
    const fotosPromises = relevantes.slice(0, 2).map(async p => {
      const url = await buscarFotoPixabay(p.nombre_comun);
      return url ? { nombre: p.nombre_comun, url } : null;
    });
    const fotos = (await Promise.all(fotosPromises)).filter(Boolean);

    res.json({ reply, fotos });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: "Error interno." });
  }
});

// ── GET /plantas ──────────────────────────────────────────────────────────────
app.get("/plantas", (req, res) => {
  const { buscar } = req.query;
  if (buscar) {
    const resultado = buscarPlantasRelevantes(buscar, 20);
    return res.json({ total: resultado.length, plantas: resultado });
  }
  res.json({ total: PLANTAS.length, plantas: PLANTAS });
});

app.get("/plantas/:id", (req, res) => {
  const p = PLANTAS.find(p => p.id === parseInt(req.params.id));
  if (!p) return res.status(404).json({ error: "No encontrada." });
  res.json(p);
});

app.get("/health", (_req, res) => res.json({
  status: "ok",
  service: "FloraIntellect",
  plantas_cargadas: PLANTAS.length,
  pixabay: PIXABAY_KEY ? "configurado" : "no configurado"
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌿 FloraIntellect corriendo en http://localhost:${PORT}`);
  console.log(`🖼️  Pixabay: ${PIXABAY_KEY ? "✅ configurado" : "❌ no configurado"}`);
});