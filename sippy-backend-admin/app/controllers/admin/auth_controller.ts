import AdminUser from '#models/user'
import { loginValidator } from '#validators/user'
import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import '#types/container'

export default class AuthController {
  async showLogin({ inertia }: HttpContext) {
    return inertia.render('auth/login', {})
  }

  async login({ request, auth, response, session }: HttpContext) {
    const rateLimitService = await app.container.make('rateLimitService')
    const ip = request.ip()
    const result = rateLimitService.checkLoginThrottle(ip)

    if (!result.allowed) {
      response.header('Retry-After', String(result.retryAfter))
      session.flash('error', 'Too many login attempts. Try again later.')
      return response.redirect().back()
    }

    const { email, password } = await request.validateUsing(loginValidator)

    try {
      const user = await AdminUser.verifyCredentials(email, password)
      rateLimitService.resetLoginThrottle(ip)
      await auth.use('web').login(user)
      session.flash('success', 'Welcome back!')
      return response.redirect().toPath('/admin')
    } catch {
      rateLimitService.recordLoginFailure(ip)
      session.flash('error', 'Invalid email or password.')
      return response.redirect().back()
    }
  }

  async logout({ auth, response }: HttpContext) {
    await auth.use('web').logout()
    return response.redirect().toPath('/admin/login')
  }
}
