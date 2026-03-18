import { BaseSeeder } from '@adonisjs/lucid/seeders'
import AdminUser from '#models/user'

export default class extends BaseSeeder {
  async run() {
    if (process.env.NODE_ENV === 'production') {
      console.log('Skipping admin seeder in production')
      return
    }

    const password = process.env.ADMIN_PASSWORD
    if (!password) {
      throw new Error('ADMIN_PASSWORD env var is required to seed admin user')
    }

    await AdminUser.updateOrCreate(
      { email: 'admin@sippy.lat' },
      {
        fullName: 'Sippy Admin',
        email: 'admin@sippy.lat',
        password,
        role: 'admin',
      }
    )

    console.log('Seeded admin user: admin@sippy.lat')
  }
}
