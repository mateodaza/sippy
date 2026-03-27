import env from '#start/env'
import { defineConfig } from '@adonisjs/lucid'

const isProduction = env.get('NODE_ENV') === 'production'
// Railway internal networking uses private IPs with self-signed certs.
// rejectUnauthorized: false is acceptable here because connections stay
// within Railway's private network. If moving to an external DB host,
// provide the CA cert via DATABASE_CA_CERT env var instead.
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
  },
})

export default dbConfig
