const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')

const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'AgentBot',
  version: '1.20.1'
})

bot.loadPlugin(pathfinder)

bot.on('spawn', () => {
  console.log('✅ El bot entró al mundo')
  bot.chat('Reportándome listo.')

  const movements = new Movements(bot)
  bot.pathfinder.setMovements(movements)
})

bot.on('error', (err) => {
  console.log('❌ Error:', err)
})

bot.on('kicked', (reason) => {
  console.log('⚠️ Me sacaron del servidor:', reason)
})

bot.on('chat', (username, message) => {
  if (username === bot.username) return // ignora sus propios mensajes

  if (message === 'ven aqui') {
    const target = bot.players[username]?.entity
    if (target) {
      const { x, y, z } = target.position
      bot.pathfinder.setGoal(new goals.GoalNear(x, y, z, 1))
      console.log(`🚶 Moviéndome hacia ${username}`)
    } else {
      console.log(`⚠️ No pude ver a ${username} (¿está muy lejos o no cargó la entidad?)`)
    }
  }
})