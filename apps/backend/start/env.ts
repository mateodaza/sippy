import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  // AdonisJS core
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.secret(),
  APP_URL: Env.schema.string({ format: 'url', tld: false }),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),
  SESSION_DRIVER: Env.schema.enum(['cookie', 'database', 'memory'] as const),

  // Database
  DATABASE_URL: Env.schema.string(),

  // WhatsApp
  WHATSAPP_PHONE_NUMBER_ID: Env.schema.string(),
  WHATSAPP_ACCESS_TOKEN: Env.schema.string(),
  WHATSAPP_VERIFY_TOKEN: Env.schema.string(),
  WHATSAPP_APP_SECRET: Env.schema.string(),
  WHATSAPP_API_VERSION: Env.schema.string.optional(),
  WHATSAPP_BUTTONS: Env.schema.string.optional(),
  SIPPY_WHATSAPP_NUMBER: Env.schema.string.optional(),

  // CDP SDK
  CDP_API_KEY_NAME: Env.schema.string.optional(),
  CDP_PRIVATE_KEY: Env.schema.string.optional(),
  CDP_API_KEY_ID: Env.schema.string.optional(),
  CDP_API_KEY_SECRET: Env.schema.string.optional(),
  CDP_WALLET_SECRET: Env.schema.string.optional(),

  // Twilio
  TWILIO_ACCOUNT_SID: Env.schema.string.optional(),
  TWILIO_AUTH_TOKEN: Env.schema.string.optional(),
  TWILIO_FROM_NUMBER: Env.schema.string.optional(),

  // JWT (RS256)
  JWT_PRIVATE_KEY_PEM: Env.schema.string.optional(), // base64-encoded PEM
  JWT_PUBLIC_KEY_PEM: Env.schema.string.optional(),  // base64-encoded PEM
  JWT_KEY_ID: Env.schema.string.optional(),          // default "sippy-1" applied at call site
  JWT_ISSUER: Env.schema.string.optional(),          // default "sippy" applied at call site

  // LLM
  GROQ_API_KEY: Env.schema.string(),
  USE_LLM: Env.schema.string.optional(),
  LLM_TIERING: Env.schema.string.optional(),
  LLM_VALIDATOR: Env.schema.string.optional(),
  PRIMARY_LLM_MODEL: Env.schema.string.optional(),
  FALLBACK_LLM_MODEL: Env.schema.string.optional(),

  // Network / Blockchain
  SIPPY_NETWORK: Env.schema.string.optional(),
  SIPPY_SPENDER_ADDRESS: Env.schema.string.optional(),
  ARBITRUM_RPC_URL: Env.schema.string.optional(),
  BASE_RPC_URL: Env.schema.string.optional(),
  BASE_SEPOLIA_RPC_URL: Env.schema.string.optional(),
  BASE_CHAIN_ID: Env.schema.string.optional(),

  // Gas Refuel
  REFUEL_CONTRACT_ADDRESS: Env.schema.string.optional(),
  REFUEL_ADMIN_PRIVATE_KEY: Env.schema.string.optional(),
  TREASURY_CONTRACT_ADDRESS: Env.schema.string.optional(),
  POLICY_SIGNER_PRIVATE_KEY: Env.schema.string.optional(),

  // URLs
  RECEIPT_BASE_URL: Env.schema.string.optional(),
  FUND_URL: Env.schema.string.optional(),
  FUND_TOKEN_SECRET: Env.schema.string.optional(),
  FRONTEND_URL: Env.schema.string.optional(),

  // Phone
  DEFAULT_COUNTRY_CODE: Env.schema.string.optional(),

  // Security
  EXPORT_AUDIT_SECRET: Env.schema.string.optional(),
  NOTIFY_SECRET: Env.schema.string.optional(),
  EMAIL_ENCRYPTION_KEY: (key, value) => {
    if (value === undefined || value === null || value === '') return undefined
    if (!/^[0-9a-fA-F]{64}$/.test(value)) {
      throw new Error(`${key} must be a 64-character hex string (32 bytes); got length ${String(value).length}`)
    }
    return value
  },

  // Email
  RESEND_API_KEY: Env.schema.string.optional(),

  // Feature flags
  DEMO_SHOW_REFUEL: Env.schema.string.optional(),
  CONFIRM_THRESHOLD: Env.schema.number.optional(),

  // Indexer
  INDEXER_URL: Env.schema.string.optional(),
  INDEXER_API_SECRET: Env.schema.string.optional(),
  INDEXER_DB_HOST: Env.schema.string.optional(),
  INDEXER_DB_PORT: Env.schema.number.optional(),
  INDEXER_DB_USER: Env.schema.string.optional(),
  INDEXER_DB_PASSWORD: Env.schema.string.optional(),
  INDEXER_DB_DATABASE: Env.schema.string.optional(),

  // PostHog
  POSTHOG_API_KEY: Env.schema.string.optional(),
  POSTHOG_HOST: Env.schema.string.optional(),

  // Infrastructure
  TRUST_PROXY: Env.schema.string.optional(),
  RAILWAY_ENVIRONMENT: Env.schema.string.optional(),
})
