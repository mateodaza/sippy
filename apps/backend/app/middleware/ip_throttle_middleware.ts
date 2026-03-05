import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import app from '@adonisjs/core/services/app'
import '#types/container'

export default class IpThrottleMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const rateLimitService = await app.container.make('rateLimitService')
    const ip = ctx.request.ip()

    const result = rateLimitService.checkIpResolveThrottle(ip)

    if (!result.allowed) {
      ctx.response.header('Retry-After', String(result.retryAfter))
      return ctx.response.tooManyRequests({
        error: 'Too many requests. Try again later.',
      })
    }

    return next()
  }
}
