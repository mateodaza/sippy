/**
 * Sentry preload — initialises Sentry once before the HTTP server starts.
 * Runs only in the 'web' environment (see adonisrc.ts).
 */
import sentryService from '#services/sentry_service'

sentryService.init()
