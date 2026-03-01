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
    'admin_auth.show_login': { paramsTuple?: []; params?: {} }
    'admin_auth.login': { paramsTuple?: []; params?: {} }
    'admin_auth.logout': { paramsTuple?: []; params?: {} }
    'dashboard.index': { paramsTuple?: []; params?: {} }
    'admin_users.index': { paramsTuple?: []; params?: {} }
    'admin_users.show': { paramsTuple: [ParamValue]; params: {'phone': ParamValue} }
    'analytics.index': { paramsTuple?: []; params?: {} }
    'roles.index': { paramsTuple?: []; params?: {} }
    'roles.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
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
    'admin_auth.show_login': { paramsTuple?: []; params?: {} }
    'dashboard.index': { paramsTuple?: []; params?: {} }
    'admin_users.index': { paramsTuple?: []; params?: {} }
    'admin_users.show': { paramsTuple: [ParamValue]; params: {'phone': ParamValue} }
    'analytics.index': { paramsTuple?: []; params?: {} }
    'roles.index': { paramsTuple?: []; params?: {} }
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
    'admin_auth.show_login': { paramsTuple?: []; params?: {} }
    'dashboard.index': { paramsTuple?: []; params?: {} }
    'admin_users.index': { paramsTuple?: []; params?: {} }
    'admin_users.show': { paramsTuple: [ParamValue]; params: {'phone': ParamValue} }
    'analytics.index': { paramsTuple?: []; params?: {} }
    'roles.index': { paramsTuple?: []; params?: {} }
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
    'admin_auth.login': { paramsTuple?: []; params?: {} }
    'admin_auth.logout': { paramsTuple?: []; params?: {} }
  }
  PUT: {
    'roles.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}