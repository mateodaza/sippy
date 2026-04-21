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
  JWT_PUBLIC_KEY_PEM: Env.schema.string.optional(), // base64-encoded PEM
  JWT_KEY_ID: Env.schema.string.optional(), // default "sippy-1" applied at call site
  JWT_ISSUER: Env.schema.string.optional(), // default "sippy" applied at call site

  // LLM
  GROQ_API_KEY: Env.schema.string(),
  OPENAI_API_KEY: Env.schema.string.optional(),
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
      throw new Error(
        `${key} must be a 64-character hex string (32 bytes); got length ${String(value).length}`
      )
    }
    return value
  },

  // Email
  RESEND_API_KEY: Env.schema.string.optional(),

  // Feature flags
  DEMO_SHOW_REFUEL: Env.schema.string.optional(),
  CONFIRM_THRESHOLD: Env.schema.number.optional(),

  // Alchemy Webhooks
  ALCHEMY_WEBHOOK_ID: Env.schema.string.optional(),
  ALCHEMY_AUTH_TOKEN: Env.schema.string.optional(),
  ALCHEMY_SIGNING_KEY: Env.schema.string.optional(),
  ALCHEMY_CUTOVER_BLOCK: Env.schema.number.optional(),

  // PostHog
  POSTHOG_API_KEY: Env.schema.string.optional(),
  POSTHOG_HOST: Env.schema.string.optional(),

  // Zoho Desk
  ZOHO_DESK_CLIENT_ID: Env.schema.string.optional(),
  ZOHO_DESK_CLIENT_SECRET: Env.schema.string.optional(),
  ZOHO_DESK_REFRESH_TOKEN: Env.schema.string.optional(),
  ZOHO_DESK_ORG_ID: Env.schema.string.optional(),
  ZOHO_DESK_DEPARTMENT_ID: Env.schema.string.optional(),

  // Infrastructure
  TRUST_PROXY: Env.schema.string.optional(),
  RAILWAY_ENVIRONMENT: Env.schema.string.optional(),

  // Colurs — fiat rails (onramp + offramp)
  // sandbox: https://sandbox.colurs.com  |  production: https://api.colurs.com
  // Confirmed from api-colurs.json OpenAPI spec (servers section).
  // off_market=false by default → operates Mon–Fri market hours only.
  // To enable 24/7 (off_market=true) Colurs must enable it on the account first.
  COLURS_BASE_URL: Env.schema.string.optional(),
  COLURS_API_KEY: Env.schema.string.optional(),
  COLURS_USERNAME: Env.schema.string.optional(),
  COLURS_PASSWORD: Env.schema.string.optional(),
  COLURS_USER_PASSWORD_SECRET: Env.schema.string.optional(), // HMAC secret for deriving per-user Colurs passwords
  COLURS_UPLOAD_HASH_KEY: Env.schema.string.optional(), // Shared HMAC-SHA1 key used by POST /base/upload_file/ sign field

  // Sippy ETH mainnet hot wallet (Colurs sends USDT here for onramp bridge)
  SIPPY_ETH_DEPOSIT_ADDRESS: Env.schema.string.optional(),
  SIPPY_ETH_DEPOSIT_PRIVATE_KEY: Env.schema.string.optional(),
  ETH_MAINNET_RPC_URL: Env.schema.string.optional(), // Ethereum mainnet RPC for LiFi bridge signer

  // Onramp bridge flag: true = Colurs sends USDC directly (no LiFi); false = USDT→LiFi→USDC
  COLURS_DIRECT_USDC: Env.schema.string.optional(),

  // KYC passthrough: when "true", treat profile.document_status === "APPROVED" as
  // sufficient to unlock onramp (level bumped to 5 in getColursKycLevel). Colurs dev
  // confirmed this mapping in sandbox. Keep unset / "false" in production so the
  // full level>=5 + kyc_approved gate still applies.
  COLURS_KYC_PASSTHROUGH_ALLOWED: Env.schema.string.optional(),
})
