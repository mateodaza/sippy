import env from '#start/env'
import { defineConfig } from '@adonisjs/lucid'

const isProduction = env.get('NODE_ENV') === 'production'
const sslConfig = isProduction ? { rejectUnauthorized: false } : false

const dbConfig = defineConfig({
  connection: 'postgres',
  connections: {
    postgres: {
      client: 'pg',
      connection: {
        connectionString: env.get('DATABASE_URL'),
        ssl: sslConfig,
      },
      migrations: {
        naturalSort: true,
        paths: ['database/migrations'],
      },
    },

    // Read-only connection to Ponder indexer database
    // Used by admin dashboard to query on-chain data directly
    indexer: {
      client: 'pg',
      connection: {
        host: env.get('INDEXER_DB_HOST', 'localhost'),
        port: env.get('INDEXER_DB_PORT', 5432),
        user: env.get('INDEXER_DB_USER', ''),
        password: env.get('INDEXER_DB_PASSWORD', ''),
        database: env.get('INDEXER_DB_DATABASE', 'sippy_indexer'),
        ssl: sslConfig,
      },
      searchPath: ['ponder', 'offchain', 'public'],
    },
  },
})

export default dbConfig
