# 🌿 FloraIntellect — API

Backend de la IA para el chatbot de plantas medicinales.

---

## Instalación y arranque

```bash
npm install
cp .env.example .env        # Edita .env y pon tu API key de Anthropic
npm run dev                 # Modo desarrollo (se recarga solo)
npm start                   # Producción
```

La API queda en: `http://localhost:3000`

---

## Endpoint para el frontend

### `POST /chat`

Manda toda la conversación en cada request. El frontend es quien la guarda.

**Request:**
```json
{
  "messages": [
    { "role": "user", "content": "¿Para qué sirve la manzanilla?" }
  ]
}
```

**Response:**
```json
{
  "reply": "La manzanilla (Matricaria chamomilla) es una de las plantas más versátiles... 🌼"
}
```

**Conversación multi-turno** (el frontend acumula el historial):
```json
{
  "messages": [
    { "role": "user",      "content": "¿Para qué sirve la manzanilla?" },
    { "role": "assistant", "content": "La manzanilla sirve para..." },
    { "role": "user",      "content": "¿Y cómo la preparo?" }
  ]
}
```

---

### `GET /health`

Verifica que el servidor esté vivo.

```json
{ "status": "ok", "service": "BotánicaIA" }
```

---

## Código de integración para el frontend (JS vanilla)

```javascript
// Historial que el frontend mantiene en memoria
const history = [];

async function enviarMensaje(textoUsuario) {
  history.push({ role: "user", content: textoUsuario });

  const res = await fetch("http://localhost:3000/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: history })
  });

  const data = await res.json();
  history.push({ role: "assistant", content: data.reply });
  return data.reply;
}
```

---

## Deploy en producción

| Plataforma | Pasos |
|---|---|
| **Railway** | Conecta el repo → agrega `ANTHROPIC_API_KEY` en variables de entorno |
| **Render** | Nuevo Web Service → Build: `npm install` → Start: `npm start` |
| **Fly.io** | `fly launch` → `fly secrets set ANTHROPIC_API_KEY=sk-ant-...` |

Una vez desplegado, tus amigos solo cambian `http://localhost:3000` por la URL del servidor.
