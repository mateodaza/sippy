import AdminUser from '#models/user'
import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'

const updateRoleValidator = vine.compile(
  vine.object({
    role: vine.enum(['admin', 'viewer']),
  })
)

export default class RolesController {
  async index({ inertia }: HttpContext) {
    const admins = await AdminUser.query().orderBy('created_at', 'desc')
    return inertia.render('admin/roles/index', {
      admins: admins.map((a) => a.serialize()),
    })
  }

  async update({ params, request, response, session }: HttpContext) {
    const admin = await AdminUser.findOrFail(params.id)
    const { role } = await request.validateUsing(updateRoleValidator)
    admin.role = role
    await admin.save()
    session.flash('success', `Role updated for ${admin.email}`)
    return response.redirect().back()
  }
}
