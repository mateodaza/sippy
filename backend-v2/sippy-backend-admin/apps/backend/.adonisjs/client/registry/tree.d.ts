/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  health: {
    index: typeof routes['health.index']
    apiHealth: typeof routes['health.api_health']
  }
  webhook: typeof routes['webhook'] & {
    verify: typeof routes['webhook.verify']
  }
  resolve: {
    byPhone: typeof routes['resolve.by_phone']
    byAddress: typeof routes['resolve.by_address']
  }
  notify: {
    fund: typeof routes['notify.fund']
  }
  debug: {
    wallets: typeof routes['debug.wallets']
    parseStats: typeof routes['debug.parse_stats']
  }
  embeddedWallet: {
    registerWallet: typeof routes['embedded_wallet.register_wallet']
    registerPermission: typeof routes['embedded_wallet.register_permission']
    revokePermission: typeof routes['embedded_wallet.revoke_permission']
    ensureGas: typeof routes['embedded_wallet.ensure_gas']
    walletStatus: typeof routes['embedded_wallet.wallet_status']
    logExportEvent: typeof routes['embedded_wallet.log_export_event']
    resolvePhone: typeof routes['embedded_wallet.resolve_phone']
    logWebSend: typeof routes['embedded_wallet.log_web_send']
  }
  adminAuth: {
    showLogin: typeof routes['admin_auth.show_login']
    login: typeof routes['admin_auth.login']
    logout: typeof routes['admin_auth.logout']
  }
  dashboard: {
    index: typeof routes['dashboard.index']
  }
  adminUsers: {
    index: typeof routes['admin_users.index']
    show: typeof routes['admin_users.show']
  }
  analytics: {
    index: typeof routes['analytics.index']
  }
  roles: {
    index: typeof routes['roles.index']
    update: typeof routes['roles.update']
  }
}
