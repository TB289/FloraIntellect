# 🌿 FloraIntellect

> **Inteligencia que florece.** Identificá plantas medicinales por foto o consultá nuestra base curada con fuentes científicas verificadas.

Proyecto para **ExpoKinal 2026**.

---

## El problema

En Latinoamérica, millones de personas usan plantas medicinales todos los días. Google devuelve 50 páginas contradictorias sin fuentes. Las apps de identificación genéricas identifican la especie pero no dicen para qué sirve, cómo se prepara o si tiene contraindicaciones.

**FloraIntellect** ataca ambos problemas a la vez: identifica la planta por foto **y** entrega información médica estructurada con fuentes verificadas.

---

## Cómo funciona

```
        ┌─────────────────┐
        │  Foto o texto   │
        └────────┬────────┘
                 │
         ┌───────▼────────┐
         │   Plant.id API │  ← identificación por imagen (95% accuracy)
         └───────┬────────┘
                 │ nombre_cientifico
         ┌───────▼─────────────┐
         │  Base verificada    │  ← OMS Monographs Vol. 1-3
         │  (15 plantas core)  │     TRAMIL
         └───────┬─────────────┘     Plants of the World Online
                 │ contexto RAG
         ┌───────▼────────┐
         │  LLM (Groq /   │  ← humaniza, no inventa (instrucción explícita)
         │  Claude Sonnet)│
         └───────┬────────┘
                 │
         ┌───────▼────────┐
         │  Respuesta con │
         │  fuente visible│
         └─────────────────┘
```

**Tres capas:**

1. **Identificación** — Plant.id (modelo entrenado con millones de imágenes botánicas)
2. **Datos verificados** — 15 plantas medicinales de uso frecuente en Latinoamérica, con datos de **OMS Monographs** y **TRAMIL**, citables
3. **Conocimiento general** — Si la planta no está en la base verificada, el LLM responde con disclaimer explícito de que la información no está verificada

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | HTML + CSS + JS vanilla (sin frameworks) |
| Backend | Node.js + Express |
| Identificación | [Plant.id API v3](https://plant.id/api) |
| LLM chat | Groq (Llama 3.3 70B) — switchable a Anthropic Claude |
| Fotos | Pixabay API (opcional) |
| Datos | JSON estático curado |

**Por qué este stack:** para un proyecto de feria, dependencias mínimas = deploy simple. Todo corre en un solo proceso Node.

---

## Instalación local

```bash
git clone https://github.com/Iamnotd/FloraIntellect.git
cd FloraIntellect
npm install
cp env.example .env
# editá .env y completá PLANTID_KEY (gratis en https://plant.id/api)
node server.js
```

Abrí **http://localhost:3030**.

### Variables de entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `PLANTID_KEY` | sí (para /identificar) | API key de plant.id |
| `LLM_PROVIDER` | sí (para /chat real) | `groq` o `anthropic` |
| `GROQ_API_KEY` | si LLM_PROVIDER=groq | console.groq.com → gratis |
| `ANTHROPIC_API_KEY` | si LLM_PROVIDER=anthropic | console.anthropic.com |
| `PIXABAY_API_KEY` | no | Para fotos de referencia |
| `PORT` | no | Default 3030 |

Sin API keys, el server arranca en **DEMO_MODE**: chat responde desde la base local, /identificar devuelve error 503.

---

## Estructura

```
FloraIntellect/
├── server.js                      ← Express + endpoints
├── app.js                         ← Frontend logic (vanilla JS)
├── index.html                     ← SPA con 6 secciones
├── limpiar-datos.js               ← Script de deduplicación (ejecutar 1 vez)
├── data/
│   ├── plantas_1.json             ← Catálogo general (296 plantas únicas)
│   ├── plantas_2.json
│   ├── plantas_3.json
│   └── plantas_verificadas.json   ← 15 plantas con fuentes OMS/TRAMIL
├── env.example
├── package.json
└── README.md
```

---

## Endpoints

| Método | Ruta | Rate limit | Descripción |
|--------|------|-----------|-------------|
| GET | `/health` | — | Estado del server + configuración |
| GET | `/plantas` | — | Catálogo completo (296) |
| GET | `/plantas/:id` | — | Planta por ID |
| GET | `/verificadas` | — | 15 plantas con fuentes |
| GET | `/verificadas/:id` | — | Ficha verificada por ID |
| GET | `/foto/:nombre` | — | Foto de Pixabay (cacheada) |
| POST | `/chat` | 25/15min | Chat con RAG |
| POST | `/identificar` | 20/hora | Identificación por foto |
| GET | `/quiz` | — | Pregunta aleatoria para quiz |

---

## Las 15 plantas verificadas con fuentes

Manzanilla · Valeriana · Jengibre · Aloe vera · Menta · Lavanda · Equinácea · Pasiflora · Cúrcuma · Boldo · Llantén · Romero · Caléndula · Canela · Tilo

Cada una con: usos medicinales, parte usada, preparación, dosis, contraindicaciones, interacciones farmacológicas, nivel de evidencia (alta/media/folk), fuente principal + URL.

**Fuentes citadas:**
- [OMS Monographs on Selected Medicinal Plants, Vol. 1-3](https://apps.who.int/iris/handle/10665/41952)
- [TRAMIL](http://www.tramil.net/) — Red de Investigación sobre Plantas Medicinales del Caribe
- [EMA/HMPC Community Herbal Monographs](https://www.ema.europa.eu/en/human-regulatory-overview/herbal-medicinal-products)
- [Plants of the World Online](https://powo.science.kew.org/) — Kew Gardens

---

## ⚕️ Disclaimer médico

La información de FloraIntellect tiene **fines exclusivamente educativos**. Las plantas con datos verificados provienen de fuentes científicas (OMS, TRAMIL), pero esta herramienta **no reemplaza la consulta con un profesional de salud**. Si estás embarazada, lactando, tomando medicación, o tenés alguna condición médica, consultá a un profesional antes de consumir cualquier planta medicinal.

---

## Equipo

Derek González — ExpoKinal 2026

---

## Licencia

MIT
