import type { ApplicationService } from '@adonisjs/core/types'

/**
 * SeasonProvider — starts/stops the Season 1 job timer (#season/job), mirroring
 * InviteProvider's boot() → lazy-import → start → .unref() pattern.
 *
 * The timer is GUARDED inside startSeasonJob() by SEASON1_ENABLED, so when the
 * season is off the job never starts (no ticks, no writes). The #season stack is
 * lazy-imported so it isn't even loaded into a process that hasn't opted in.
 */
export default class SeasonProvider {
  constructor(protected app: ApplicationService) {}

  async boot() {
    const { startSeasonJob } = await import('#season/job')
    startSeasonJob()
  }

  async shutdown() {
    const { stopSeasonJob } = await import('#season/job')
    stopSeasonJob()
  }
}
