/* eslint-disable prettier/prettier */
/// <reference path="../manifest.d.ts" />

import type { ExtractBody, ExtractQuery, ExtractQueryForGet, ExtractResponse } from '@tuyau/core/types'
import type { InferInput } from '@vinejs/vine/types'

export type ParamValue = string | number | bigint | boolean

export interface Registry {
  'health.index': {
    methods: ["GET","HEAD"]
    pattern: '/'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/health_controller').default['index']>>>
    }
  }
  'health.api_health': {
    methods: ["GET","HEAD"]
    pattern: '/api/health'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/health_controller').default['apiHealth']>>>
    }
  }
  'webhook.verify': {
    methods: ["GET","HEAD"]
    pattern: '/webhook/whatsapp'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/webhook_controller').default['verify']>>>
    }
  }
  'webhook': {
    methods: ["POST"]
    pattern: '/webhook/whatsapp'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/webhook_controller').default['handle']>>>
    }
  }
  'resolve.by_phone': {
    methods: ["GET","HEAD"]
    pattern: '/resolve-phone'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/resolve_controller').default['byPhone']>>>
    }
  }
  'resolve.by_address': {
    methods: ["GET","HEAD"]
    pattern: '/resolve-address'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/resolve_controller').default['byAddress']>>>
    }
  }
  'notify.fund': {
    methods: ["POST"]
    pattern: '/notify-fund'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/notify_controller').default['fund']>>>
    }
  }
  'debug.wallets': {
    methods: ["GET","HEAD"]
    pattern: '/debug/wallets'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/debug_controller').default['wallets']>>>
    }
  }
  'debug.parse_stats': {
    methods: ["GET","HEAD"]
    pattern: '/debug/parse-stats'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/debug_controller').default['parseStats']>>>
    }
  }
  'embedded_wallet.register_wallet': {
    methods: ["POST"]
    pattern: '/api/register-wallet'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/embedded_wallet_controller').default['registerWallet']>>>
    }
  }
  'embedded_wallet.register_permission': {
    methods: ["POST"]
    pattern: '/api/register-permission'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/embedded_wallet_controller').default['registerPermission']>>>
    }
  }
  'embedded_wallet.revoke_permission': {
    methods: ["POST"]
    pattern: '/api/revoke-permission'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/embedded_wallet_controller').default['revokePermission']>>>
    }
  }
  'embedded_wallet.ensure_gas': {
    methods: ["POST"]
    pattern: '/api/ensure-gas'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/embedded_wallet_controller').default['ensureGas']>>>
    }
  }
  'embedded_wallet.wallet_status': {
    methods: ["GET","HEAD"]
    pattern: '/api/wallet-status'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/embedded_wallet_controller').default['walletStatus']>>>
    }
  }
  'embedded_wallet.log_export_event': {
    methods: ["POST"]
    pattern: '/api/log-export-event'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/embedded_wallet_controller').default['logExportEvent']>>>
    }
  }
  'embedded_wallet.resolve_phone': {
    methods: ["POST"]
    pattern: '/api/resolve-phone'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/embedded_wallet_controller').default['resolvePhone']>>>
    }
  }
  'embedded_wallet.log_web_send': {
    methods: ["POST"]
    pattern: '/api/log-web-send'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/embedded_wallet_controller').default['logWebSend']>>>
    }
  }
}
