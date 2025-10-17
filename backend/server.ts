/**
 * SIPPY Backend Server
 *
 * Main webhook server with command handling
 */

import 'dotenv/config';
import express, { Request, Response } from 'express';
import { parseMessage, getHelpText } from './src/utils/messageParser.js';
import { handleStartCommand } from './src/commands/start.command.js';
import { handleBalanceCommand } from './src/commands/balance.command.js';
import { handleSendCommand } from './src/commands/send.command.js';
import {
  sendTextMessage,
  markAsRead,
} from './src/services/whatsapp.service.js';
import {
  getAllWallets,
  ensureWalletsReady,
  getUserWallet,
  createUserWallet,
} from './src/services/cdp-wallet.service.js';
import { ParsedCommand, WebhookPayload } from './src/types/index.js';

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3001;
const VERIFY_TOKEN =
  process.env.WHATSAPP_VERIFY_TOKEN || 'sippy_hackathon_2025';

// Health check endpoint
app.get('/', async (req: Request, res: Response) => {
  try {
    const wallets = await getAllWallets();
    res.json({
      status: 'running',
      message: 'SIPPY Webhook Server',
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

  // CRITICAL: Ensure wallets are loaded before processing any commands
  try {
    await ensureWalletsReady();
  } catch (error) {
    console.error('💥 Wallet service not ready, skipping webhook processing');
    return;
  }

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

    console.log('\n📱 Message Details:');
    console.log(`  From: +${from}`);
    console.log(`  Text: "${text}"`);
    console.log(
      `  Time: ${new Date(parseInt(timestamp) * 1000).toISOString()}`
    );

    // Mark message as read
    await markAsRead(messageId);

    // Parse command
    const command = parseMessage(text);
    console.log(`\n🎯 Command parsed:`, command);

    // Handle commands
    await handleCommand(from, command);
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
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
          `⚠️ History command coming soon!\n\n` +
            `This will show your transaction history once we integrate Blockscout (Day 7)!`
        );
        break;

      case 'unknown':
        await sendTextMessage(
          phoneNumber,
          `❓ I didn't understand that command.\n\n` +
            `Type "help" to see available commands.`
        );
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
    let wallet = await getUserWallet(cleanPhone);

    // If wallet doesn't exist, create it
    if (!wallet) {
      console.log(`  ℹ️  Wallet not found, creating new wallet...`);
      wallet = await createUserWallet(cleanPhone);
      console.log(`  ✅ New wallet created: ${wallet.walletAddress}`);
    } else {
      console.log(`  ✅ Wallet found: ${wallet.walletAddress}`);
    }

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
 * Health check endpoint for CDP wallet service
 */
app.get('/api/health', async (req: Request, res: Response) => {
  try {
    const wallets = await getAllWallets();
    res.json({
      status: 'ok',
      service: 'SIPPY CDP Server Wallet',
      timestamp: new Date().toISOString(),
      wallets: wallets.length,
    });
  } catch (error) {
    res.status(503).json({
      status: 'initializing',
      service: 'SIPPY CDP Server Wallet',
      timestamp: new Date().toISOString(),
      message: 'Wallet service starting up...',
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║   🚀 SIPPY Backend Server Started             ║');
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
