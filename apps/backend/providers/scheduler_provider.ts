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
    const { disperseCopToUsdt } = await import('#jobs/disperse_cop_to_usdt')
    const { pollDispersionMovements } = await import('#jobs/poll_dispersion_movements')

    // Offramp: poll every 60s — FX takes 1–3 business days
    cron.schedule('* * * * *', async () => {
      try {
        await pollColursMovements()
      } catch (err) {
        logger.error({ err }, 'scheduler: pollColursMovements uncaught error')
      }
    })

    // Onramp R2P: poll every 30s — user is waiting at the payment screen
    cron.schedule('*/30 * * * * *', async () => {
      try {
        await pollR2pPayments()
      } catch (err) {
        logger.error({ err }, 'scheduler: pollR2pPayments uncaught error')
      }
    })

    // Onramp dispersion (paid → fx_settling): Quote+Execute back-to-back, every 30s
    cron.schedule('*/30 * * * * *', async () => {
      try {
        await disperseCopToUsdt()
      } catch (err) {
        logger.error({ err }, 'scheduler: disperseCopToUsdt uncaught error')
      }
    })

    // Onramp dispersion settling (fx_settling → usdt_received): every 30s
    cron.schedule('*/30 * * * * *', async () => {
      try {
        await pollDispersionMovements()
      } catch (err) {
        logger.error({ err }, 'scheduler: pollDispersionMovements uncaught error')
      }
    })

    logger.info('scheduler: started (offramp 60s, onramp R2P 30s, dispersion 30s, settling 30s)')
  }
}
