import { BaseSeeder } from '@adonisjs/lucid/seeders'
import AdminUser from '#models/user'

export default class extends BaseSeeder {
  async run() {
    await AdminUser.updateOrCreate(
      { email: 'admin@sippy.lat' },
      {
        fullName: 'Sippy Admin',
        email: 'admin@sippy.lat',
        password: 'sippy2026',
        role: 'admin',
      }
    )

    console.log('Seeded admin user: admin@sippy.lat / sippy2026')
  }
}
