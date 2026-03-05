import { defineConfig } from '@adonisjs/cors'
import env from '#start/env'

/**
 * Configuration options to tweak the CORS policy. The following
 * options are documented on the official documentation website.
 *
 * https://docs.adonisjs.com/guides/security/cors
 */
const corsConfig = defineConfig({
  enabled: true,

  /**
   * Restrict origins to known frontends. Falls back to localhost for dev.
   */
  origin: (origin) => {
    const allowed = [
      env.get('FRONTEND_URL', 'http://localhost:3000'),
      env.get('APP_URL', 'http://localhost:3333'),
    ].filter(Boolean)
    return allowed.includes(origin)
  },

  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  headers: true,
  exposeHeaders: [],
  credentials: true,
  maxAge: 90,
})

export default corsConfig
