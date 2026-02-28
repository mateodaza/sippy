import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'health.index': { paramsTuple?: []; params?: {} }
    'health.api_health': { paramsTuple?: []; params?: {} }
    'webhook.verify': { paramsTuple?: []; params?: {} }
    'webhook': { paramsTuple?: []; params?: {} }
    'resolve.by_phone': { paramsTuple?: []; params?: {} }
    'resolve.by_address': { paramsTuple?: []; params?: {} }
    'notify.fund': { paramsTuple?: []; params?: {} }
    'debug.wallets': { paramsTuple?: []; params?: {} }
    'debug.parse_stats': { paramsTuple?: []; params?: {} }
    'embedded_wallet.register_wallet': { paramsTuple?: []; params?: {} }
    'embedded_wallet.register_permission': { paramsTuple?: []; params?: {} }
    'embedded_wallet.revoke_permission': { paramsTuple?: []; params?: {} }
    'embedded_wallet.ensure_gas': { paramsTuple?: []; params?: {} }
    'embedded_wallet.wallet_status': { paramsTuple?: []; params?: {} }
    'embedded_wallet.log_export_event': { paramsTuple?: []; params?: {} }
    'embedded_wallet.resolve_phone': { paramsTuple?: []; params?: {} }
    'embedded_wallet.log_web_send': { paramsTuple?: []; params?: {} }
  }
  GET: {
    'health.index': { paramsTuple?: []; params?: {} }
    'health.api_health': { paramsTuple?: []; params?: {} }
    'webhook.verify': { paramsTuple?: []; params?: {} }
    'resolve.by_phone': { paramsTuple?: []; params?: {} }
    'resolve.by_address': { paramsTuple?: []; params?: {} }
    'debug.wallets': { paramsTuple?: []; params?: {} }
    'debug.parse_stats': { paramsTuple?: []; params?: {} }
    'embedded_wallet.wallet_status': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'health.index': { paramsTuple?: []; params?: {} }
    'health.api_health': { paramsTuple?: []; params?: {} }
    'webhook.verify': { paramsTuple?: []; params?: {} }
    'resolve.by_phone': { paramsTuple?: []; params?: {} }
    'resolve.by_address': { paramsTuple?: []; params?: {} }
    'debug.wallets': { paramsTuple?: []; params?: {} }
    'debug.parse_stats': { paramsTuple?: []; params?: {} }
    'embedded_wallet.wallet_status': { paramsTuple?: []; params?: {} }
  }
  POST: {
    'webhook': { paramsTuple?: []; params?: {} }
    'notify.fund': { paramsTuple?: []; params?: {} }
    'embedded_wallet.register_wallet': { paramsTuple?: []; params?: {} }
    'embedded_wallet.register_permission': { paramsTuple?: []; params?: {} }
    'embedded_wallet.revoke_permission': { paramsTuple?: []; params?: {} }
    'embedded_wallet.ensure_gas': { paramsTuple?: []; params?: {} }
    'embedded_wallet.log_export_event': { paramsTuple?: []; params?: {} }
    'embedded_wallet.resolve_phone': { paramsTuple?: []; params?: {} }
    'embedded_wallet.log_web_send': { paramsTuple?: []; params?: {} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}