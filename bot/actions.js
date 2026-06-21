const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')
const mcDataLoader = require('minecraft-data')

function conTimeout(promesa, segundos) {
  return Promise.race([
    promesa,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Tardó más de ${segundos}s, abortado`)), segundos * 1000)
    )
  ])
}

async function mineBlock(bot, blockType, quantity) {
  const botPos = bot.entity.position.floored()

  const positions = bot.findBlocks({
    matching: (block) => block.name === blockType,
    maxDistance: 64,
    count: quantity * 4 // pedimos de más, porque vamos a filtrar algunos candidatos
  }).filter(pos => !(pos.x === botPos.x && pos.z === botPos.z && pos.y <= botPos.y))
    .slice(0, quantity)

  if (positions.length === 0) {
    bot.chat(`No encuentro ${blockType} cerca.`)
    return `No se encontró ${blockType}`
  }

  let collected = 0

  for (const pos of positions) {
    try {
      const block = bot.blockAt(pos)
      if (!block || block.name !== blockType) continue

      await bot.tool.equipForBlock(block)
      await conTimeout(bot.collectBlock.collect([block]), 15)
      collected++
    } catch (err) {
      console.log(`⚠️ No pude minar un bloque, sigo con el siguiente: ${err.message}`)
      bot.pathfinder.setGoal(null) // por si se quedó atorado a medio camino, lo liberamos
    }
  }

  bot.chat(`Recolecté ${collected} de ${blockType}.`)
  return `Recolectados ${collected} de ${blockType}`
}

async function flattenArea(bot, width, length) {
  width = Math.min(width, 6)
  length = Math.min(length, 6)

  const origin = bot.entity.position
  const groundY = Math.floor(origin.y) - 1
  const startX = Math.floor(origin.x) - Math.floor(width / 2)
  const startZ = Math.floor(origin.z) - Math.floor(length / 2)

  let bloquesRemovidos = 0

  for (let dx = 0; dx < width; dx++) {
    for (let dz = 0; dz < length; dz++) {
      const x = startX + dx
      const z = startZ + dz

      for (let y = groundY + 5; y >= groundY + 1; y--) {
        const block = bot.blockAt(new Vec3(x, y, z))
        if (block && block.name !== 'air') {
          try {
            await bot.tool.equipForBlock(block)
            await bot.pathfinder.goto(new goals.GoalNear(x, y, z, 2))
            await bot.dig(block)
            bloquesRemovidos++
          } catch (err) {
            console.log(`⚠️ No pude remover bloque en (${x},${y},${z}): ${err.message}`)
          }
        }
      }
    }
  }

  if (bloquesRemovidos === 0) {
    bot.chat('No encontré nada que aplanar ahí — ya estaba plano.')
    return 'Sin cambios, el área ya estaba nivelada'
  }

  bot.chat(`Área aplanada. Quité ${bloquesRemovidos} bloques.`)
  return `Aplanado: ${bloquesRemovidos} bloques removidos`
}

async function giveItem(bot, itemName, quantity, username) {
  const item = bot.inventory.items().find(i => i.name === itemName)

  if (!item) {
    bot.chat(`No tengo ${itemName} en mi inventario.`)
    return `No se encontró ${itemName} en el inventario`
  }

  const target = bot.players[username]?.entity
  if (target) {
    const { x, y, z } = target.position
    await bot.pathfinder.goto(new goals.GoalNear(x, y, z, 2))
  }

  const cantidadReal = Math.min(quantity, item.count)
  await bot.toss(item.type, null, cantidadReal)
  bot.chat(`Ahí tienes ${cantidadReal} de ${itemName}.`)
  return `Entregados ${cantidadReal} de ${itemName}`
}

async function craftMany(bot, itemName, times, craftingTable) {
  const mcData = mcDataLoader(bot.version)
  const item = mcData.itemsByName[itemName]
  if (!item) throw new Error(`Ítem desconocido: ${itemName}`)

  const recipes = bot.recipesFor(item.id, null, 1, craftingTable)
  if (recipes.length === 0) {
    throw new Error(`Sin receta disponible para ${itemName} (¿faltan materiales?)`)
  }

  await bot.craft(recipes[0], times, craftingTable)
}

function findNearbyCraftingTable(bot) {
  return bot.findBlock({
    matching: (b) => b.name === 'crafting_table',
    maxDistance: 5
  })
}

async function placeCraftingTable(bot) {
  const tableItem = bot.inventory.items().find(i => i.name === 'crafting_table')
  if (!tableItem) throw new Error('No tengo mesa de trabajo en inventario para colocar')

  const pos = bot.entity.position.floored()
  const offsets = [
    new Vec3(1, 0, 0),
    new Vec3(-1, 0, 0),
    new Vec3(0, 0, 1),
    new Vec3(0, 0, -1)
  ]

  for (const offset of offsets) {
    const groundBlock = bot.blockAt(pos.offset(offset.x, -1, offset.z))
    const spaceBlock = bot.blockAt(pos.offset(offset.x, 0, offset.z))

    if (groundBlock && groundBlock.name !== 'air' && spaceBlock && spaceBlock.name === 'air') {
      try {
        await bot.equip(tableItem, 'hand')
        await bot.placeBlock(groundBlock, new Vec3(0, 1, 0))
        return findNearbyCraftingTable(bot)
      } catch (err) {
        console.log(`⚠️ No se pudo colocar en ese punto, probando otro lado: ${err.message}`)
      }
    }
  }

  throw new Error('No encontré un espacio válido alrededor para colocar la mesa')
}

async function craftWoodSet(bot) {
  const logros = []

  try {
    await craftMany(bot, 'oak_planks', 4, null)
    logros.push('tablones')
  } catch (err) {
    bot.chat('No tengo troncos de madera. Recolecta madera primero.')
    return 'Falta madera (troncos) en inventario'
  }

  try {
    await craftMany(bot, 'stick', 2, null)
    logros.push('palos')
  } catch (err) {
    console.log('⚠️ No pude craftear palos:', err.message)
  }

  let mesa = findNearbyCraftingTable(bot)

  if (!mesa) {
    try {
      await craftMany(bot, 'crafting_table', 1, null)
      mesa = await placeCraftingTable(bot)
      logros.push('mesa de trabajo')
    } catch (err) {
      bot.chat('No pude colocar una mesa de trabajo.')
      console.log('⚠️ Error con la mesa:', err.message)
      return `Hice: ${logros.join(', ')}, pero no pude continuar sin mesa`
    }
  }

  const herramientas = ['wooden_pickaxe', 'wooden_axe', 'wooden_shovel']
  for (const tool of herramientas) {
    try {
      await craftMany(bot, tool, 1, mesa)
      logros.push(tool)
    } catch (err) {
      console.log(`⚠️ No pude craftear ${tool}:`, err.message)
    }
  }

  bot.chat(`Set de madera listo: ${logros.join(', ')}.`)
  return `Crafteado: ${logros.join(', ')}`
}

module.exports = { mineBlock, flattenArea, giveItem, craftWoodSet }