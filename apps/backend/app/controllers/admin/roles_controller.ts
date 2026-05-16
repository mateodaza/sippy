import AdminUser from '#models/user'
import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'

const updateRoleValidator = vine.compile(
  vine.object({
    // 'operator' = event-floor send role. Admin promotes a viewer to operator
    // here, then assigns them to an event via /admin/events/:slug/operator.
    role: vine.enum(['admin', 'viewer', 'operator']),
  })
)

export default class RolesController {
  async index({ inertia }: HttpContext) {
    const admins = await AdminUser.query().orderBy('created_at', 'desc')
    return inertia.render('admin/roles/index', {
      admins: admins.map((a) => a.serialize()),
    })
  }

  async update({ params, request, response, session, auth }: HttpContext) {
    const admin = await AdminUser.findOrFail(params.id)

    if (admin.id === auth.user!.id) {
      session.flash('error', 'Cannot modify your own role')
      return response.redirect().back()
    }

    const { role } = await request.validateUsing(updateRoleValidator)
    admin.role = role
    await admin.save()
    session.flash('success', `Role updated for ${admin.email}`)
    return response.redirect().back()
  }
}
