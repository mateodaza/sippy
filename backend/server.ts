/**
 * Sippy Backend Server
 *
 * Main webhook server with command handling
 */

import 'dotenv/config';
import express, { Request, Response } from 'express';
import {
  parseMessage,
  getHelpText,
  getAboutText,
} from './src/utils/messageParser.js';
import { handleStartCommand } from './src/commands/start.command.js';
import { handleBalanceCommand } from './src/commands/balance.command.js';
import { handleSendCommand } from './src/commands/send.command.js';
import {
  sendTextMessage,
  markAsRead,
} from './src/services/whatsapp.service.js';
import {
  formatFundETHReceivedMessage,
  formatFundPYUSDReceivedMessage,
} from './src/utils/messages.js';
import {
  getAllWallets,
  getUserWallet,
} from './src/services/cdp-wallet.service.js';
import { initDb, query } from './src/services/db.js';
import { checkLLMHealth, isLLMEnabled } from './src/services/llm.service.js';
import { ParsedCommand, WebhookPayload } from './src/types/index.js';

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
    const text = message.text?.body || '';
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

    // Parse command
    const command = await parseMessage(text);
    console.log(`\n🎯 Command parsed:`, command);

    // Log LLM status for observability
    if (command.llmStatus) {
      const statusEmoji =
        {
          success: '✅',
          disabled: '🔒',
          'rate-limited': '⏱️',
          timeout: '⏰',
          error: '❌',
          'low-confidence': '🤔',
          'validation-failed': '⚠️',
        }[command.llmStatus] || 'ℹ️';
      console.log(`${statusEmoji} LLM Status: ${command.llmStatus}`);
    }

    // Handle commands
    await handleCommand(from, command);

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
  command: ParsedCommand
): Promise<void> {
  try {
    switch (command.command) {
      case 'start':
        await handleStartCommand(phoneNumber);
        break;

      case 'help':
        await sendTextMessage(phoneNumber, getHelpText());
        break;

      case 'about':
        await sendTextMessage(phoneNumber, getAboutText());
        break;

      case 'balance':
        await handleBalanceCommand(phoneNumber);
        break;

      case 'send':
        if (command.amount && command.recipient) {
          await handleSendCommand(
            phoneNumber,
            command.amount,
            command.recipient
          );
        } else {
          await sendTextMessage(
            phoneNumber,
            `❌ Invalid send command format.\n\n` +
              `Use: "send 10 to +573001234567"\n\n` +
              `Example: send 5 to +573116613414`
          );
        }
        break;

      case 'history':
        await sendTextMessage(
          phoneNumber,
          `📊 Transaction history\n\n` +
            `View your activity at:\nhttps://www.sippy.lat/profile/+${phoneNumber}`
        );
        break;

      case 'unknown':
        // Check if LLM provided a helpful conversational message
        if (command.helpfulMessage) {
          // LLM included a natural, conversational response
          await sendTextMessage(phoneNumber, command.helpfulMessage);
        } else {
          // Check if rate-limited (user should know why natural language failed)
          const rateLimitNote =
            command.llmStatus === 'rate-limited'
              ? `\n⏱️ Natural language is temporarily limited. Please use exact commands.\n\n`
              : '';

          // Fallback to standard command list
          await sendTextMessage(
            phoneNumber,
            `❓ I didn't understand: "${command.originalText}"\n` +
              rateLimitNote +
              `\nHere are the available commands:\n\n` +
              getHelpText()
          );
        }
        break;

      default:
        console.log(`⚠️  Unhandled command: ${command.command}`);
    }
  } catch (error) {
    console.error(`❌ Error handling command:`, error);
    await sendTextMessage(
      phoneNumber,
      `❌ Error processing your command. Please try again.`
    );
  }
}

/**
 * Resolve phone number to wallet address
 * GET /resolve-phone?phone=+573116613414
 */
app.get('/resolve-phone', async (req: Request, res: Response) => {
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
 * Body: { phone: string, type: 'eth' | 'pyusd', amount: string, txHash: string }
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

    if (type !== 'eth' && type !== 'pyusd') {
      return res.status(400).json({
        error: 'Invalid type',
        message: 'type must be either "eth" or "pyusd"',
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

    // Format message based on type
    const message =
      type === 'eth'
        ? formatFundETHReceivedMessage({ amount, txHash })
        : formatFundPYUSDReceivedMessage({ amount, txHash });

    // Send WhatsApp notification
    await sendTextMessage(cleanPhone, message);

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

    // Check LLM feature flag and availability (non-blocking)
    if (!isLLMEnabled()) {
      console.log('🔒 LLM: DISABLED via USE_LLM flag (regex-only mode)');
    } else {
      const llmStatus = await checkLLMHealth();
      if (llmStatus.available) {
        console.log('✅ LLM: ENABLED & Available (enhanced natural language)');
      } else {
        console.log('⚠️  LLM: ENABLED but Unavailable (using regex fallback)');
        console.log(`   Reason: ${llmStatus.reason}`);
      }
    }

    app.listen(PORT, () => {
      console.log('\n╔════════════════════════════════════════════════╗');
      console.log('║   🚀 Sippy Backend Server Started             ║');
      console.log('╚════════════════════════════════════════════════╝\n');
      console.log(`📡 Server: http://localhost:${PORT}`);
      console.log(`🔐 Verify Token: ${VERIFY_TOKEN}`);
      console.log('\n📋 Endpoints:');
      console.log(`  GET  / - Health check`);
      console.log(`  GET  /debug/wallets - See registered wallets`);
      console.log(`  GET  /resolve-phone - Resolve phone to wallet address`);
      console.log(`  GET  /webhook/whatsapp - Webhook verification`);
      console.log(`  POST /webhook/whatsapp - Webhook events`);
      console.log(`  POST /api/register - Register wallet`);
      console.log('\n🎯 Waiting for webhook events...\n');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
