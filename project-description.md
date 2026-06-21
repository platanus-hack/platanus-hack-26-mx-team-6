# Minecraft Companion — Interfaz conversacional que revoluciona cómo juegas

**Track:** New Interfaces
**Equipo:** team-6 (CDMX)

---

## El problema

Minecraft es hermoso pero solitario. Millones de jugadores en single-player sacrifican compañía por privacidad, o abandonan el juego porque jugar solo no es suficiente. La interfaz tradicional (clics, menús, comandos de texto) es una barrera: queremos revolucionar la experiencia de juego.

No existe una forma natural de interactuar con Minecraft que sea conversacional, inteligente y acompañante.

---

## La solución

Un **companion IA que entiende tu idioma** y se convierte en tu aliado estratégico en el juego. No ejecuta comandos rígidos: **conversa, entiende contexto, propone estrategias y actúa contigo en tiempo real**.

Hablas como si tuvieras un amigo al lado. El companion escucha, entiende, y actúa. Nunca vuelves a jugar solo.

---

## Arquitectura

```
[Hablas al micrófono]
         ↓
[Cliente Python: VAD + Whisper local]
         ↓
[WebSocket: envía SOLO el texto transcrito]
         ↓
[Bot Node.js: command-router.js analiza]
         ├─→ Comando fijo? ("ven aquí", "salta") → ejecuta directo
         └─→ Frase libre? → Claude entiende intención → ejecuta
         ↓
[Acciones en Minecraft: pathfinding, items, construcción]
         ↓
[Bot responde por chat/voz] → [Cliente TTS lee en voz alta]
```

---

## Lo que hace ahora

- **Escucha en español natural** sin GPU (Whisper local, privado)
- **Comandos fijos inteligentes:** "ven aquí" (pathfinding), "salta", "dame 10 diamantes", "craftea madera"
- **Modo conversacional:** frases libres se envían a Claude para razonamiento estratégico
- **Comunicación en tiempo real:** WebSocket de baja latencia
- **Sin sacrificios:** juega solo pero con presencia de compañero
- **Accesibilidad real:** personas con discapacidades motoras pueden jugar fluidamente

---

## Stack

- **Bot:** Node.js + mineflayer (Minecraft API)
- **Voz:** Python + OpenAI Whisper (transcripción local)
- **IA:** Claude API (razonamiento estratégico)
- **Comunicación:** WebSocket (cliente ↔ bot)
- **Interfaz:** Voz natural en español (sin menús)

---

## Instalación

```bash
# 1. Bot (Node.js)
cd bot
npm install
# edita .env con tu usuario de Minecraft

# 2. Cliente de voz (Python)
cd voice
python -m venv .venv
.venv/Scripts/activate
pip install -r requirements.txt

# 3. Arranca el bot
node index.js

# 4. Arranca el cliente de voz
python voice_client.py

# 5. Habla en español
```

---

## Equipo

- Ubaldi Mancilla ([@ubaldimancilla-lgtm](https://github.com/ubaldimancilla-lgtm))
- Alejandro Mancilla López ([@alexmancilla](https://github.com/alexmancilla))
- Aaron Yeshua Gracia Lopez ([@AstroYeshu](https://github.com/AstroYeshu))
