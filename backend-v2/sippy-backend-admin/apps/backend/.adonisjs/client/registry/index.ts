/* eslint-disable prettier/prettier */
import type { AdonisEndpoint } from '@tuyau/core/types'
import type { Registry } from './schema.d.ts'
import type { ApiDefinition } from './tree.d.ts'

const placeholder: any = {}

const routes = {
  'health.index': {
    methods: ["GET","HEAD"],
    pattern: '/',
    tokens: [{"old":"/","type":0,"val":"/","end":""}],
    types: placeholder as Registry['health.index']['types'],
  },
  'health.api_health': {
    methods: ["GET","HEAD"],
    pattern: '/api/health',
    tokens: [{"old":"/api/health","type":0,"val":"api","end":""},{"old":"/api/health","type":0,"val":"health","end":""}],
    types: placeholder as Registry['health.api_health']['types'],
  },
  'webhook.verify': {
    methods: ["GET","HEAD"],
    pattern: '/webhook/whatsapp',
    tokens: [{"old":"/webhook/whatsapp","type":0,"val":"webhook","end":""},{"old":"/webhook/whatsapp","type":0,"val":"whatsapp","end":""}],
    types: placeholder as Registry['webhook.verify']['types'],
  },
  'webhook': {
    methods: ["POST"],
    pattern: '/webhook/whatsapp',
    tokens: [{"old":"/webhook/whatsapp","type":0,"val":"webhook","end":""},{"old":"/webhook/whatsapp","type":0,"val":"whatsapp","end":""}],
    types: placeholder as Registry['webhook']['types'],
  },
  'resolve.by_phone': {
    methods: ["GET","HEAD"],
    pattern: '/resolve-phone',
    tokens: [{"old":"/resolve-phone","type":0,"val":"resolve-phone","end":""}],
    types: placeholder as Registry['resolve.by_phone']['types'],
  },
  'resolve.by_address': {
    methods: ["GET","HEAD"],
    pattern: '/resolve-address',
    tokens: [{"old":"/resolve-address","type":0,"val":"resolve-address","end":""}],
    types: placeholder as Registry['resolve.by_address']['types'],
  },
  'notify.fund': {
    methods: ["POST"],
    pattern: '/notify-fund',
    tokens: [{"old":"/notify-fund","type":0,"val":"notify-fund","end":""}],
    types: placeholder as Registry['notify.fund']['types'],
  },
  'debug.wallets': {
    methods: ["GET","HEAD"],
    pattern: '/debug/wallets',
    tokens: [{"old":"/debug/wallets","type":0,"val":"debug","end":""},{"old":"/debug/wallets","type":0,"val":"wallets","end":""}],
    types: placeholder as Registry['debug.wallets']['types'],
  },
  'debug.parse_stats': {
    methods: ["GET","HEAD"],
    pattern: '/debug/parse-stats',
    tokens: [{"old":"/debug/parse-stats","type":0,"val":"debug","end":""},{"old":"/debug/parse-stats","type":0,"val":"parse-stats","end":""}],
    types: placeholder as Registry['debug.parse_stats']['types'],
  },
  'embedded_wallet.register_wallet': {
    methods: ["POST"],
    pattern: '/api/register-wallet',
    tokens: [{"old":"/api/register-wallet","type":0,"val":"api","end":""},{"old":"/api/register-wallet","type":0,"val":"register-wallet","end":""}],
    types: placeholder as Registry['embedded_wallet.register_wallet']['types'],
  },
  'embedded_wallet.register_permission': {
    methods: ["POST"],
    pattern: '/api/register-permission',
    tokens: [{"old":"/api/register-permission","type":0,"val":"api","end":""},{"old":"/api/register-permission","type":0,"val":"register-permission","end":""}],
    types: placeholder as Registry['embedded_wallet.register_permission']['types'],
  },
  'embedded_wallet.revoke_permission': {
    methods: ["POST"],
    pattern: '/api/revoke-permission',
    tokens: [{"old":"/api/revoke-permission","type":0,"val":"api","end":""},{"old":"/api/revoke-permission","type":0,"val":"revoke-permission","end":""}],
    types: placeholder as Registry['embedded_wallet.revoke_permission']['types'],
  },
  'embedded_wallet.ensure_gas': {
    methods: ["POST"],
    pattern: '/api/ensure-gas',
    tokens: [{"old":"/api/ensure-gas","type":0,"val":"api","end":""},{"old":"/api/ensure-gas","type":0,"val":"ensure-gas","end":""}],
    types: placeholder as Registry['embedded_wallet.ensure_gas']['types'],
  },
  'embedded_wallet.wallet_status': {
    methods: ["GET","HEAD"],
    pattern: '/api/wallet-status',
    tokens: [{"old":"/api/wallet-status","type":0,"val":"api","end":""},{"old":"/api/wallet-status","type":0,"val":"wallet-status","end":""}],
    types: placeholder as Registry['embedded_wallet.wallet_status']['types'],
  },
  'embedded_wallet.log_export_event': {
    methods: ["POST"],
    pattern: '/api/log-export-event',
    tokens: [{"old":"/api/log-export-event","type":0,"val":"api","end":""},{"old":"/api/log-export-event","type":0,"val":"log-export-event","end":""}],
    types: placeholder as Registry['embedded_wallet.log_export_event']['types'],
  },
  'embedded_wallet.resolve_phone': {
    methods: ["POST"],
    pattern: '/api/resolve-phone',
    tokens: [{"old":"/api/resolve-phone","type":0,"val":"api","end":""},{"old":"/api/resolve-phone","type":0,"val":"resolve-phone","end":""}],
    types: placeholder as Registry['embedded_wallet.resolve_phone']['types'],
  },
  'embedded_wallet.log_web_send': {
    methods: ["POST"],
    pattern: '/api/log-web-send',
    tokens: [{"old":"/api/log-web-send","type":0,"val":"api","end":""},{"old":"/api/log-web-send","type":0,"val":"log-web-send","end":""}],
    types: placeholder as Registry['embedded_wallet.log_web_send']['types'],
  },
} as const satisfies Record<string, AdonisEndpoint>

export { routes }

export const registry = {
  routes,
  $tree: {} as ApiDefinition,
}

declare module '@tuyau/core/types' {
  export interface UserRegistry {
    routes: typeof routes
    $tree: ApiDefinition
  }
}
