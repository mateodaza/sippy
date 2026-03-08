function env(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (val === undefined) throw new Error(`Missing env var: ${key}`);
  return val;
}

function envInt(key: string, fallback: number): number {
  const val = process.env[key];
  return val ? parseInt(val, 10) : fallback;
}

function envBool(key: string, fallback: boolean): boolean {
  const val = process.env[key];
  if (!val) return fallback;
  return val === 'true' || val === '1';
}

export const config = {
  // X/Twitter API
  x: {
    apiKey: () => env('X_API_KEY'),
    apiSecret: () => env('X_API_SECRET'),
    accessToken: () => env('X_ACCESS_TOKEN'),
    accessTokenSecret: () => env('X_ACCESS_TOKEN_SECRET'),
  },

  // LLM
  openrouterApiKey: () => env('OPENROUTER_API_KEY'),

  // Database
  databaseUrl: () => env('DATABASE_URL'),

  // Server
  port: envInt('PORT', 3002),
  apiKey: () => env('X_AGENT_API_KEY'),

  // Safety
  dryRun: envBool('DRY_RUN', true),

  // Telegram notifications
  telegramBotToken: () => process.env.TELEGRAM_BOT_TOKEN ?? '',
  telegramChatId: () => process.env.TELEGRAM_CHAT_ID ?? '',

  // Config
  tweetsPerDay: envInt('TWEETS_PER_DAY', 2),
  critiqueThreshold: envInt('CRITIQUE_THRESHOLD', 7),
  maxPostingRetries: envInt('MAX_POSTING_RETRIES', 3),
} as const;
