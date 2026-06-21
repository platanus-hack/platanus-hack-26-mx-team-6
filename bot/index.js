require('dotenv').config()

const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { plugin: collectBlock } = require('mineflayer-collectblock')
const { plugin: toolPlugin } = require('mineflayer-tool')
const { mineBlock, flattenArea, giveItem, craftWoodSet } = require('./actions')
const { runAgent } = require('./agent')

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

let modo = 'manual'

bot.on('spawn', () => {
  console.log('✅ El bot entró al mundo')
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

bot.on('chat', (username, message) => {
  if (username === bot.username) return

  const player = bot.players[username]
  const target = player?.entity

  switch (message) {
    case 'ven aqui': {
      if (!target) { console.log(`⚠️ No veo a ${username}`); return }
      const { x, y, z } = target.position
      bot.pathfinder.setGoal(new goals.GoalNear(x, y, z, 1))
      console.log(`🚶 Moviéndome hacia ${username}`)
      return
    }

    case 'sigueme': {
      if (!target) { console.log(`⚠️ No veo a ${username}`); return }
      bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true)
      console.log(`🚶 Siguiendo a ${username}`)
      return
    }

    case 'detente': {
      bot.pathfinder.setGoal(null)
      console.log('🛑 Detenido')
      return
    }

    case 'salta': {
      bot.setControlState('jump', true)
      setTimeout(() => bot.setControlState('jump', false), 250)
      console.log('⬆️ Saltando')
      return
    }

    case 'toma el control': {
      modo = 'automatico'
      bot.chat('Modo automático activado.')
      console.log('🤖 Cambié a modo automático')
      return
    }

    case 'ya lo tengo yo': {
      modo = 'manual'
      bot.pathfinder.setGoal(null)
      bot.chat('Modo manual. Tú tienes el control.')
      console.log('🎮 Cambié a modo manual')
      return
    }

    case 'craftea set de madera': {
      craftWoodSet(bot)
      return
    }
  }

  // Comando "dame X item" — usa patrón porque cantidad e ítem son variables, no texto fijo
  const giveMatch = message.match(/^dame (\d+) (\S+)$/i)
  if (giveMatch) {
    const quantity = parseInt(giveMatch[1], 10)
    const itemName = giveMatch[2]
    giveItem(bot, itemName, quantity, username)
    return
  }

  // Si llegamos aquí, el mensaje no coincidió con ningún comando fijo de arriba
  if (modo === 'automatico') {
    bot.chat(`Pensando en: "${message}"...`)
    runAgent(bot, message, username)
  }
})