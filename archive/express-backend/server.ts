/**
 * Sippy Backend Server
 *
 * Main webhook server with command handling
 */

import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { parseMessage } from './src/utils/messageParser.js';
import { handleStartCommand } from './src/commands/start.command.js';
import { handleBalanceCommand } from './src/commands/balance.command.js';
import { handleSendCommand } from './src/commands/send.command.js';
import {
  sendTextMessage,
  markAsRead,
} from './src/services/whatsapp.service.js';
import {
  type Lang,
  formatFundETHReceivedMessage,
  formatFundUSDReceivedMessage,
  formatHelpMessage,
  formatAboutMessage,
  formatInvalidSendFormat,
  formatHistoryMessage,
  formatSettingsMessage,
  formatRateLimitedMessage,
  formatUnknownCommandMessage,
  formatLanguageSetMessage,
  formatCommandErrorMessage,
  formatGreetingMessage,
  formatSocialReplyMessage,
  formatTextOnlyMessage,
} from './src/utils/messages.js';
import {
  getAllWallets,
  getUserWallet,
} from './src/services/cdp-wallet.service.js';
import { initDb, query, getUserLanguage, setUserLanguage } from './src/services/db.js';
import { checkLLMHealth, isLLMEnabled, getRateLimitStats, getModelConfig_public } from './src/services/llm.service.js';
import { ParsedCommand, WebhookPayload } from './src/types/index.js';
import embeddedWalletRoutes from './src/routes/embedded-wallet.routes.js';
import { initSpenderWallet } from './src/services/embedded-wallet.service.js';
import { detectLanguage, PERSIST_THRESHOLD } from './src/utils/language.js';

const app = express();

// Middleware
app.use(cors()); // Enable CORS for frontend requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Trust proxy when behind Railway or other reverse proxy
// Guarded by env to avoid trusting spoofed X-Forwarded-For in local/direct deployments
if (process.env.TRUST_PROXY === '1' || process.env.RAILWAY_ENVIRONMENT) {
  app.set('trust proxy', 1);
}

// API Routes for embedded wallets
app.use('/api', embeddedWalletRoutes);

const PORT = process.env.PORT || 3001;
const VERIFY_TOKEN =
  process.env.WHATSAPP_VERIFY_TOKEN || 'sippy_hackathon_2025';

// Message deduplication cache (message.id -> timestamp)
const processedMessages = new Map<string, number>();
const MESSAGE_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

// Spam protection: Track message frequency per user
const userMessageCount = new Map<
  string,
  { count: number; resetTime: number }
>();
const SPAM_WINDOW = 60 * 1000; // 1 minute window
const SPAM_THRESHOLD = 10; // Max messages per minute

// Cleanup old message IDs and spam counters periodically
setInterval(() => {
  const now = Date.now();

  // Clean processed messages
  for (const [id, timestamp] of processedMessages.entries()) {
    if (now - timestamp > MESSAGE_CACHE_TTL) {
      processedMessages.delete(id);
    }
  }

  // Clean spam counters
  for (const [phone, data] of userMessageCount.entries()) {
    if (now > data.resetTime) {
      userMessageCount.delete(phone);
    }
  }
}, 60 * 1000); // Clean every minute

// Health check endpoint
app.get('/', async (req: Request, res: Response) => {
  try {
    const wallets = await getAllWallets();
    res.json({
      status: 'running',
      message: 'Sippy Webhook Server',
      timestamp: new Date().toISOString(),
      registeredWallets: wallets.length,
    });
  } catch (error) {
    res.status(503).json({
      status: 'initializing',
      message: 'Wallet service starting up...',
      timestamp: new Date().toISOString(),
    });
  }
});

// Debug endpoint to see registered wallets
app.get('/debug/wallets', async (req: Request, res: Response) => {
  try {
    const wallets = await getAllWallets();
    res.json({
      wallets: wallets,
      totalWallets: wallets.length,
    });
  } catch (error) {
    res.status(503).json({
      error: 'Wallet service not ready',
      message: 'Please wait for wallet initialization to complete',
    });
  }
});

/**
 * Webhook Verification (GET)
 */
app.get('/webhook/whatsapp', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('\n🔍 Webhook Verification Request:');
  console.log('  Mode:', mode);
  console.log('  Token:', token);
  console.log('  Challenge:', challenge);

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verified successfully by Meta!');
    console.log(`📤 Responding with challenge: ${challenge}\n`);
    res.status(200).send(challenge);
  } else {
    console.log('❌ Webhook verification failed!');
    console.log(`   Expected token: ${VERIFY_TOKEN}`);
    console.log(`   Received token: ${token}\n`);
    res.sendStatus(403);
  }
});

/**
 * Webhook Events (POST)
 */
app.post('/webhook/whatsapp', async (req: Request, res: Response) => {
  console.log('\n📨 Webhook Event Received!');

  // Always respond 200 immediately
  res.sendStatus(200);

  try {
    const payload: WebhookPayload = req.body;
    const entry = payload.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) {
      console.log('⚠️  No messages in webhook payload');
      return;
    }

    const message = messages[0];
    const from = message.from;
    const messageId = message.id;

    // Extract text from either regular text message or interactive button/list reply
    let text = '';
    if (message.text?.body) {
      text = message.text.body;
    } else if (message.interactive?.button_reply?.title) {
      // User clicked a button - use the button title as the command
      text = message.interactive.button_reply.title;
      console.log(`🔘 Button clicked: "${text}" (id: ${message.interactive.button_reply.id})`);
    } else if (message.interactive?.list_reply?.title) {
      // User selected from a list - use the list item title as the command
      text = message.interactive.list_reply.title;
      console.log(`📋 List item selected: "${text}" (id: ${message.interactive.list_reply.id})`);
    }

    const timestamp = message.timestamp;

    // Idempotency: check if we've already processed this message
    if (processedMessages.has(messageId)) {
      console.log(`⚠️  Duplicate message ${messageId}, skipping`);
      return;
    }

    // Spam protection: Check message frequency
    const now = Date.now();
    const userData = userMessageCount.get(from);

    if (userData) {
      if (now < userData.resetTime) {
        // Within spam window
        userData.count++;
        if (userData.count > SPAM_THRESHOLD) {
          console.log(
            `🚫 Spam detected from +${from} (${userData.count} msgs/min)`
          );
          // Don't respond to spammer, just ignore
          processedMessages.set(messageId, now);
          return;
        }
      } else {
        // Window expired, reset
        userData.count = 1;
        userData.resetTime = now + SPAM_WINDOW;
      }
    } else {
      // First message in window
      userMessageCount.set(from, {
        count: 1,
        resetTime: now + SPAM_WINDOW,
      });
    }

    console.log('\n📱 Message Details:');
    console.log(`  From: +${from}`);
    console.log(`  Text: "${text}"`);
    console.log(
      `  Time: ${new Date(parseInt(timestamp) * 1000).toISOString()}`
    );

    // Mark message as read
    await markAsRead(messageId);

    // Handle non-text messages (images, audio, stickers, video, location, etc.)
    if (!text && message.type && message.type !== 'text' && message.type !== 'interactive') {
      console.log(`📎 Non-text message (${message.type}) from +${from}`);
      const mediaLang = await getUserLanguage(from) || 'en';
      await sendTextMessage(from, formatTextOnlyMessage(mediaLang), mediaLang);
      processedMessages.set(messageId, Date.now());
      return;
    }

    // Parse command (with context for observability logging)
    const command = await parseMessage(text, { messageId, phoneNumber: from });
    console.log(`\n🎯 Command parsed:`, command);

    // Log LLM status for observability
    if (command.llmStatus) {
      const statusEmojiMap: Record<string, string> = {
          success: '✅',
          skipped: '⚡',
          'format-hint': '📝',
          disabled: '🔒',
          'rate-limited': '⏱️',
          timeout: '⏰',
          error: '❌',
          'low-confidence': '🤔',
          'validation-failed': '⚠️',
        };
      const statusEmoji = statusEmojiMap[command.llmStatus] || 'ℹ️';
      console.log(`${statusEmoji} LLM Status: ${command.llmStatus}`);
    }

    // Language detection + persistence
    // Language follows the user: if they switch languages, we update.
    let userLang = await getUserLanguage(from);

    // Explicit language command always wins
    if (command.command === 'language' && command.detectedLanguage) {
      const lang = command.detectedLanguage as 'en' | 'es' | 'pt';
      await setUserLanguage(from, lang);
      userLang = lang;
    } else {
      // Auto-detect from message text (regex-based)
      const detection = detectLanguage(text);

      // LLM detection (higher quality for natural language)
      const llmLang = command.detectedLanguage && command.detectedLanguage !== 'ambiguous'
        ? command.detectedLanguage as 'en' | 'es' | 'pt'
        : null;

      // Best signal: LLM (when available) > regex (when high confidence)
      const detectedLang = llmLang
        || (detection && detection.confidence >= PERSIST_THRESHOLD ? detection.lang : null);

      if (detectedLang) {
        // Update persisted preference if different — language follows the user
        if (detectedLang !== userLang) {
          await setUserLanguage(from, detectedLang);
        }
        userLang = detectedLang;
      } else if (!userLang && detection) {
        // Low confidence, no persisted preference — use for this message only
        userLang = detection.lang;
      }
    }

    // Handle commands with resolved language
    const lang: Lang = userLang || 'en';
    await handleCommand(from, command, lang);

    // Only mark as processed if we successfully handled the command
    processedMessages.set(messageId, Date.now());
    console.log(`✅ Message ${messageId} processed successfully`);
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    // Don't mark as processed - allow Meta to retry
  }
});

/**
 * Handle parsed commands
 */
async function handleCommand(
  phoneNumber: string,
  command: ParsedCommand,
  lang: Lang
): Promise<void> {
  try {
    switch (command.command) {
      case 'start':
        await handleStartCommand(phoneNumber, lang);
        break;

      case 'help':
        await sendTextMessage(phoneNumber, formatHelpMessage(lang), lang);
        break;

      case 'about':
        await sendTextMessage(phoneNumber, formatAboutMessage(lang), lang);
        break;

      case 'balance':
        await handleBalanceCommand(phoneNumber, lang);
        break;

      case 'send':
        if (command.amount && command.recipient) {
          await handleSendCommand(phoneNumber, command.amount, command.recipient, lang);
        } else {
          await sendTextMessage(phoneNumber, formatInvalidSendFormat(lang), lang);
        }
        break;

      case 'history':
        await sendTextMessage(phoneNumber, formatHistoryMessage(phoneNumber, lang), lang);
        break;

      case 'settings':
        await sendTextMessage(phoneNumber, formatSettingsMessage(phoneNumber, lang), lang);
        break;

      case 'greeting':
        await sendTextMessage(phoneNumber, formatGreetingMessage(lang), lang);
        break;

      case 'social':
        await sendTextMessage(phoneNumber, formatSocialReplyMessage(lang), lang);
        break;

      case 'language': {
        const langNames: Record<string, string> = {
          en: 'English', es: 'Español', pt: 'Português',
        };
        const langName = langNames[command.detectedLanguage || ''] || command.detectedLanguage || '';
        await sendTextMessage(phoneNumber, formatLanguageSetMessage(langName, lang), lang);
        break;
      }

      case 'unknown':
        if (command.helpfulMessage) {
          await sendTextMessage(phoneNumber, command.helpfulMessage, lang);
        } else {
          const rateLimitNote =
            command.llmStatus === 'rate-limited'
              ? `\n${formatRateLimitedMessage(lang)}\n\n`
              : '';
          await sendTextMessage(
            phoneNumber,
            formatUnknownCommandMessage(command.originalText || '', lang) +
              (rateLimitNote ? `\n${rateLimitNote}` : ''),
            lang
          );
        }
        break;

      default:
        console.log(`⚠️  Unhandled command: ${command.command}`);
    }
  } catch (error) {
    console.error(`❌ Error handling command:`, error);
    await sendTextMessage(phoneNumber, formatCommandErrorMessage(lang), lang);
  }
}

// ============================================================================
// IP rate limiter for public phone resolution
// ============================================================================
const ipResolveThrottle = new Map<string, { count: number; resetAt: number }>();
const IP_RESOLVE_LIMIT = 10; // 10 requests per minute per IP
const IP_RESOLVE_WINDOW = 60 * 1000; // 1 minute

// Cleanup stale IP entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of ipResolveThrottle) {
    if (entry.resetAt < now) ipResolveThrottle.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Resolve phone number to wallet address
 * GET /resolve-phone?phone=+573001234567
 */
app.get('/resolve-phone', async (req: Request, res: Response) => {
  // IP rate limiting
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const ipEntry = ipResolveThrottle.get(ip);
  if (!ipEntry || ipEntry.resetAt < now) {
    ipResolveThrottle.set(ip, { count: 1, resetAt: now + IP_RESOLVE_WINDOW });
  } else if (ipEntry.count >= IP_RESOLVE_LIMIT) {
    const retryAfter = Math.ceil((ipEntry.resetAt - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  } else {
    ipEntry.count++;
  }

  try {
    const phone = req.query.phone as string;

    if (!phone) {
      return res.status(400).json({
        error: 'Phone number is required',
      });
    }

    // Remove '+' prefix if present for consistency
    const cleanPhone = phone.replace(/^\+/, '');

    console.log(`\n📞 Resolving phone number: +${cleanPhone}`);

    // Try to get existing wallet
    const wallet = await getUserWallet(cleanPhone);

    // If wallet doesn't exist, return error - user must start via WhatsApp first
    if (!wallet) {
      console.log(`  ℹ️  Wallet not found for +${cleanPhone}`);

      // Get Sippy WhatsApp number from env
      const sippyWhatsAppNumber = process.env.SIPPY_WHATSAPP_NUMBER;
      const whatsappLink = sippyWhatsAppNumber
        ? `https://wa.me/${sippyWhatsAppNumber}?text=start`
        : undefined;

      return res.status(404).json({
        error: 'Wallet not found',
        message: `This phone number hasn't started using Sippy yet. They need to send "start" to Sippy on WhatsApp first.`,
        phone: `+${cleanPhone}`,
        ...(whatsappLink && { whatsappLink }),
      });
    }

    console.log(`  ✅ Wallet found: ${wallet.walletAddress}`);

    res.json({
      address: wallet.walletAddress,
      phone: `+${cleanPhone}`,
      isNew: !wallet.lastActivity || wallet.lastActivity === wallet.createdAt,
    });
  } catch (error) {
    console.error('❌ Error resolving phone:', error);
    res.status(500).json({
      error: 'Failed to resolve phone number',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Reverse lookup: wallet address to phone number
 * GET /resolve-address?address=0x5Aa5B05d77C45E00C023ff90a7dB2c9FBD9bcde4
 */
app.get('/resolve-address', async (req: Request, res: Response) => {
  try {
    const address = req.query.address as string;

    if (!address) {
      return res.status(400).json({
        error: 'Wallet address is required',
      });
    }

    console.log(`\n🔍 Reverse lookup for address: ${address}`);

    // Query database for phone number by wallet address
    const result = await query<{
      phone_number: string;
      wallet_address: string;
    }>(
      'SELECT phone_number, wallet_address FROM phone_registry WHERE LOWER(wallet_address) = LOWER($1)',
      [address]
    );

    if (result.rows.length === 0) {
      console.log(`  ℹ️  No phone number found for address: ${address}`);
      return res.json({
        address,
        phone: null,
      });
    }

    const phone = `+${result.rows[0].phone_number}`;
    console.log(`  ✅ Found phone: ${phone}`);

    res.json({
      address,
      phone,
    });
  } catch (error) {
    console.error('❌ Error resolving address:', error);
    res.status(500).json({
      error: 'Failed to resolve address',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Notify user about received funds from Fund flow
 * POST /notify-fund
 * Body: { phone: string, type: 'eth' | 'usdc', amount: string, txHash: string }
 */
app.post('/notify-fund', async (req: Request, res: Response) => {
  try {
    const { phone, type, amount, txHash } = req.body;

    if (!phone || !type || !amount || !txHash) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'phone, type, amount, and txHash are required',
      });
    }

    if (type !== 'eth' && type !== 'usdc' && type !== 'pyusd') {
      return res.status(400).json({
        error: 'Invalid type',
        message: 'type must be either "eth" or "usdc"',
      });
    }

    // Clean phone number (remove + and spaces)
    const cleanPhone = phone.replace(/[^\d]/g, '');

    console.log(
      `\n📲 Sending Fund notification to +${cleanPhone}: ${amount} ${type.toUpperCase()}`
    );

    // Verify wallet exists (user must have started via WhatsApp first)
    const wallet = await getUserWallet(cleanPhone);
    if (!wallet) {
      return res.status(404).json({
        error: 'Wallet not found',
        message: `Phone number +${cleanPhone} hasn't started using Sippy yet.`,
      });
    }

    // Format message in recipient's language
    const fundLang = await getUserLanguage(cleanPhone) || 'en';
    const message =
      type === 'eth'
        ? formatFundETHReceivedMessage({ amount, txHash }, fundLang)
        : formatFundUSDReceivedMessage({ amount, txHash }, fundLang);

    // Send WhatsApp notification
    await sendTextMessage(cleanPhone, message, fundLang);

    console.log(`  ✅ Notification sent to +${cleanPhone}`);

    res.json({
      success: true,
      phone: `+${cleanPhone}`,
      type,
      amount,
    });
  } catch (error) {
    console.error('❌ Error sending Fund notification:', error);
    res.status(500).json({
      error: 'Failed to send notification',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Debug: Parse stats (last 24h)
 */
app.get('/debug/parse-stats', async (req: Request, res: Response) => {
  try {
    const result = await query(`
      SELECT
        parse_source,
        status,
        model,
        COUNT(*) as count,
        AVG(latency_ms)::int as avg_latency_ms,
        SUM(prompt_tokens) as total_prompt_tokens,
        SUM(completion_tokens) as total_completion_tokens
      FROM parse_log
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY parse_source, status, model
      ORDER BY count DESC
    `);
    res.json({
      stats: result.rows,
      models: getModelConfig_public(),
      rateLimits: getRateLimitStats(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to query parse stats' });
  }
});

/**
 * Health check endpoint for CDP wallet service
 */
app.get('/api/health', async (req: Request, res: Response) => {
  try {
    const wallets = await getAllWallets();
    res.json({
      status: 'ok',
      service: 'Sippy CDP Server Wallet',
      timestamp: new Date().toISOString(),
      wallets: wallets.length,
    });
  } catch (error) {
    res.status(503).json({
      status: 'initializing',
      service: 'Sippy CDP Server Wallet',
      timestamp: new Date().toISOString(),
      message: 'Wallet service starting up...',
    });
  }
});

// Start server with database initialization
async function startServer() {
  try {
    // Initialize database schema
    await initDb();

    // Initialize spender wallet for embedded wallets
    try {
      await initSpenderWallet();
    } catch (err) {
      console.warn('Spender wallet init failed (may need CDP API keys):', err);
    }

    // Check LLM feature flag and availability (non-blocking)
    const modelCfg = getModelConfig_public();
    if (!isLLMEnabled()) {
      console.log('LLM: DISABLED via USE_LLM flag (regex-only mode)');
    } else {
      const llmStatus = await checkLLMHealth();
      if (llmStatus.available) {
        console.log(`LLM: ENABLED — Primary: ${modelCfg.primary}`);
        if (modelCfg.tieringEnabled) {
          console.log(`     Tiering: ON — Fallback: ${modelCfg.fallback}`);
        } else {
          console.log('     Tiering: OFF (single model)');
        }
      } else {
        console.log('LLM: ENABLED but Unavailable (regex fallback)');
        console.log(`     Reason: ${llmStatus.reason}`);
      }
    }

    app.listen(PORT, () => {
      console.log('\n╔════════════════════════════════════════════════╗');
      console.log('║   Sippy Backend Server Started                ║');
      console.log('╚════════════════════════════════════════════════╝\n');
      console.log(`Server: http://localhost:${PORT}`);
      console.log(`Verify Token: ${VERIFY_TOKEN}`);
      console.log('\nEndpoints:');
      console.log(`  GET  / - Health check`);
      console.log(`  GET  /debug/wallets - See registered wallets`);
      console.log(`  GET  /debug/parse-stats - Parse pipeline stats`);
      console.log(`  GET  /resolve-phone - Resolve phone to wallet address`);
      console.log(`  GET  /webhook/whatsapp - Webhook verification`);
      console.log(`  POST /webhook/whatsapp - Webhook events`);
      console.log(`  POST /api/register - Register wallet`);
      console.log('\nWaiting for webhook events...\n');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
