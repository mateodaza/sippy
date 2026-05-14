import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Event from '#models/event'

/**
 * Pizza Day Bogotá 2026 — first event row.
 *
 * Idempotent on slug. POAP claim URL is read from PIZZA_DAY_POAP_URL env so we
 * can seed shells in any environment and fill the URL in later (or per-env)
 * without editing this file.
 *
 * Re-run safely: `node ace db:seed --files=./database/seeders/pizza_day_seeder.ts`
 */
export default class extends BaseSeeder {
  async run() {
    const slug = 'pizza-day-bog-2026'

    await Event.updateOrCreate(
      { slug },
      {
        slug,
        name: 'Pizza Day Bogotá 2026',
        description: 'Pizza Day Bogotá 2026 — onboard with Sippy at the event.',
        poapClaimUrl: process.env.PIZZA_DAY_POAP_URL || null,
        active: true,
      }
    )

    console.log(`Seeded event: ${slug}`)
  }
}
