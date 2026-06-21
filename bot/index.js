require('dotenv').config()

const mineflayer = require('mineflayer')
const { pathfinder, Movements } = require('mineflayer-pathfinder')
const { plugin: collectBlock } = require('mineflayer-collectblock')
const { plugin: toolPlugin } = require('mineflayer-tool')
const { WebSocketServer } = require('ws')
const { handleCommand } = require('./command-router')

// Usuario de Minecraft "dueño" de la voz. Los comandos por voz se ejecutan en
// nombre de este jugador (necesario para "ven aqui", "dame...", etc.).
const OWNER = process.env.OWNER_USERNAME || ''
const VOICE_PORT = parseInt(process.env.VOICE_WS_PORT || '8080', 10)

process.on('uncaughtException', (err) => {
  console.log('🔥 Error no capturado (el bot sigue vivo):', err.message)
})

process.on('unhandledRejection', (err) => {
  console.log('🔥 Promesa rechazada sin manejar (el bot sigue vivo):', err.message)
})

const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'AgentBot',
  version: '1.20.1'
})

bot.loadPlugin(pathfinder)
bot.loadPlugin(collectBlock)
bot.loadPlugin(toolPlugin)

// Clientes de voz conectados. Cuando el bot "habla" por chat, reenviamos ese
// texto a estos clientes para que lo lean en voz alta (TTS con ElevenLabs).
const voiceClients = new Set()
let chatEnvuelto = false

// Frases internas que se muestran en el chat pero NO se leen en voz alta.
const NO_HABLAR = ['Pensando en']

function broadcastVoz(mensaje) {
  if (NO_HABLAR.some(p => String(mensaje).startsWith(p))) return
  for (const c of voiceClients) {
    if (c.readyState === 1) {
      try { c.send(String(mensaje)) } catch (e) { /* cliente caído, lo limpia 'close' */ }
    }
  }
}

bot.on('spawn', () => {
  console.log('✅ El bot entró al mundo')

  // Envolver bot.chat AQUÍ (ya existe) para reenviar al TTS. Solo una vez,
  // aunque haya respawns.
  if (!chatEnvuelto && typeof bot.chat === 'function') {
    const _chat = bot.chat.bind(bot)
    bot.chat = (mensaje) => {
      _chat(mensaje)
      broadcastVoz(mensaje)
    }
    chatEnvuelto = true
  }

  bot.chat('Reportándome listo.')

  const movements = new Movements(bot)
  movements.allow1by1towers = false
  movements.scafoldingBlocks = []
  bot.pathfinder.setMovements(movements)

  // collectBlock trae su propio Movements interno por default — lo igualamos al mismo comportamiento
  bot.collectBlock.movements = movements
})

bot.on('error', (err) => {
  console.log('❌ Error:', err)
})

bot.on('kicked', (reason) => {
  console.log('⚠️ Me sacaron del servidor:', reason)
})

// --- Entrada por chat de Minecraft ---
bot.on('chat', (username, message) => {
  if (username === bot.username) return
  handleCommand(bot, message, username)
})

// --- Entrada por voz (WebSocket) ---
// El cliente de voz transcribe el micro y nos manda solo el TEXTO. Lo metemos
// por el mismo router que el chat, en nombre del jugador OWNER.
const wss = new WebSocketServer({ port: VOICE_PORT })

wss.on('connection', (ws) => {
  console.log('🎙️ Cliente de voz conectado')
  voiceClients.add(ws)
  ws.on('message', (data) => {
    const texto = data.toString().trim()
    if (!texto) return
    console.log(`🗣️ Voz: "${texto}"`)
    if (!OWNER) {
      console.log('⚠️ OWNER_USERNAME no está configurado en .env — comandos como "ven aqui" no sabrán a quién buscar.')
    }
    handleCommand(bot, texto, OWNER)
  })
  ws.on('close', () => { voiceClients.delete(ws); console.log('🎙️ Cliente de voz desconectado') })
})

console.log(`🎧 Servidor de voz escuchando en ws://localhost:${VOICE_PORT}`)
