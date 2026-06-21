const Anthropic = require('@anthropic-ai/sdk')
const { mineBlock, flattenArea, giveItem } = require('./actions')

const anthropic = new Anthropic()

const tools = [
  {
    name: 'mine_block',
    description: 'Camina hacia un tipo de bloque y mina cierta cantidad, recolectando lo que cae.',
    input_schema: {
      type: 'object',
      properties: {
        block_type: { type: 'string', description: 'Nombre interno del bloque en inglés, snake_case. Ej: oak_log, stone, dirt' },
        quantity: { type: 'integer', description: 'Cuántos bloques minar' }
      },
      required: ['block_type', 'quantity']
    }
  },
  {
    name: 'flatten_area',
    description: 'Aplana un área alrededor de la posición actual del bot, quitando desniveles y árboles.',
    input_schema: {
      type: 'object',
      properties: {
        width: { type: 'integer', description: 'Ancho del área en bloques, máximo 6' },
        length: { type: 'integer', description: 'Largo del área en bloques, máximo 6' }
      },
      required: ['width', 'length']
    }
  },
  {
    name: 'give_item',
    description: 'Camina hacia el jugador que dio la instrucción y le entrega cierta cantidad de un ítem que el bot ya tiene en su inventario. Úsala cuando te pidan "dame", "entrégame", "necesito X" de algo que ya hayas recolectado antes — NO uses esta herramienta para conseguir algo nuevo, para eso usa mine_block primero.',
    input_schema: {
      type: 'object',
      properties: {
        item_name: { type: 'string', description: 'Nombre interno del ítem en inglés, snake_case. Ej: oak_log, stone' },
        quantity: { type: 'integer', description: 'Cantidad a entregar' }
      },
      required: ['item_name', 'quantity']
    }
  }
]

async function executeTool(bot, toolName, input, username) {
  switch (toolName) {
    case 'mine_block':
      return await mineBlock(bot, input.block_type, input.quantity)
    case 'flatten_area':
      return await flattenArea(bot, input.width, input.length)
    case 'give_item':
      return await giveItem(bot, input.item_name, input.quantity, username)
    default:
      return `Herramienta desconocida: ${toolName}`
  }
}

async function runAgent(bot, instruccion, username) {
  let messages = [{ role: 'user', content: instruccion }]
  const MAX_STEPS = 8

  for (let step = 0; step < MAX_STEPS; step++) {
    let response

    try {
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        tools,
        messages
      })
    } catch (err) {
      console.log('🔥 Error llamando al LLM:', err.message)
      bot.chat('Tuve un problema pensando, intenta de nuevo.')
      return
    }

    messages.push({ role: 'assistant', content: response.content })

    const toolUses = response.content.filter(block => block.type === 'tool_use')

    if (toolUses.length === 0) {
      const textBlock = response.content.find(block => block.type === 'text')
      if (textBlock) bot.chat(textBlock.text)
      console.log(`✅ Agente terminó en el paso ${step + 1}`)
      return
    }

    const toolResults = []
    for (const toolUse of toolUses) {
      console.log(`🔧 Ejecutando: ${toolUse.name}`, toolUse.input)
      let result
      try {
        result = await executeTool(bot, toolUse.name, toolUse.input, username)
      } catch (err) {
        result = `Error ejecutando ${toolUse.name}: ${err.message}`
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: String(result)
      })
    }

    messages.push({ role: 'user', content: toolResults })
  }

  bot.chat('Me tardé demasiado en esa tarea, mejor paro aquí.')
  console.log('⚠️ Se alcanzó el límite de pasos del agente')
}

module.exports = { runAgent }