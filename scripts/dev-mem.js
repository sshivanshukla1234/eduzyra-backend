import 'dotenv/config'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { connectDB } from '../src/config/db.js'
import app from '../src/app.js'
import { seedDatabase } from '../src/data/seedRunner.js'
import fs from 'node:fs'

const LOG_PATH = new URL('../_backend_startup.log', import.meta.url).pathname.replace(/^\/([A-Z]:\/)/, '$1')
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(msg)
  try { fs.appendFileSync(LOG_PATH, line + '\n') } catch {}
}

async function start() {
  log('Step 1: starting MongoMemoryReplSet...')
  process.on('uncaughtException', (e) => log(`UNCAUGHT: ${e.stack || e}`))
  process.on('unhandledRejection', (e) => log(`UNHANDLED: ${e?.stack || e}`))

  try {
    const mongod = await MongoMemoryReplSet.create({
      replSet: { count: 1, dbName: 'eduzyra' },
    })
    const inMemoryUri = mongod.getUri('eduzyra')
    log(`Step 2: In-memory Mongo started at: ${inMemoryUri}`)

    process.env.MONGO_URI = inMemoryUri
    await connectDB()
    log('Step 3: Mongoose connected.')

    log('Step 4: Seeding comprehensive catalog, users, lessons, orders, and certificates...')
    await seedDatabase()
    log('Seed complete.')

    const PORT = process.env.PORT || 5000
    app.listen(PORT, () => {
      log(`Step 5: Backend LIVE at: http://localhost:${PORT}`)
    })
  } catch (err) {
    log(`FATAL: ${err.stack || err}`)
    process.exit(1)
  }
}

start()
