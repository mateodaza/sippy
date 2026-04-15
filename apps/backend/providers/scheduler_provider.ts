import type { ApplicationService } from '@adonisjs/core/types'
import cron from 'node-cron'
import logger from '@adonisjs/core/services/logger'

export default class SchedulerProvider {
  constructor(protected app: ApplicationService) {}

  async start() {
    // Only run in web server — not during ace commands, tests, or repl
    if (this.app.getEnvironment() !== 'web') return

    const { pollColursMovements } = await import('#jobs/poll_colurs_movements')
    const { pollR2pPayments } = await import('#jobs/poll_r2p_payments')

    // Offramp: poll every 60s — FX takes 1–3 business days
    cron.schedule('* * * * *', async () => {
      try {
        await pollColursMovements()
      } catch (err) {
        logger.error({ err }, 'scheduler: pollColursMovements uncaught error')
      }
    })

    // Onramp: poll every 30s — user is waiting at the payment screen
    cron.schedule('*/30 * * * * *', async () => {
      try {
        await pollR2pPayments()
      } catch (err) {
        logger.error({ err }, 'scheduler: pollR2pPayments uncaught error')
      }
    })

    logger.info('scheduler: started (offramp every 60s, onramp every 30s)')
  }
}
