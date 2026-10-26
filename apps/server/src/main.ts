import { serve } from '@hono/node-server'
import { createDatabase, migrateToLatest } from '@agendina/db'
import { createApp } from './app.ts'
import { loadConfig } from './config.ts'

const config = loadConfig(process.env)
const database = createDatabase(config.databaseUrl)
await migrateToLatest(database.db)
const app = createApp({ ...config, db: database.db })

const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  console.log(`Agendina ${config.version} listening on http://${info.address}:${info.port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      void database.close().then(() => process.exit(0))
    })
  })
}
