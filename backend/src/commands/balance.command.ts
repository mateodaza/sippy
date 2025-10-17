/**
 * BALANCE Command
 *
 * Shows user's PYUSD balance and wallet info
 */

import {
  getUserWallet,
  getUserBalance,
  isSessionValid,
  updateLastActivity,
  getSecurityLimits,
} from '../services/cdp-wallet.service.js';
import { sendTextMessage } from '../services/whatsapp.service.js';

/**
 * Handle "balance" command
 */
export async function handleBalanceCommand(phoneNumber: string): Promise<void> {
  console.log(`\n💰 BALANCE command from +${phoneNumber}`);

  try {
    // Check if user has a wallet
    const userWallet = await getUserWallet(phoneNumber);
    if (!userWallet) {
      await sendTextMessage(
        phoneNumber,
        `❌ No wallet found!\n\n` +
          `Send "start" to create your SIPPY wallet first.`
      );
      return;
    }

    // Check session validity
    if (!(await isSessionValid(phoneNumber))) {
      await sendTextMessage(
        phoneNumber,
        `⏰ Session expired!\n\n` +
          `Send "start" to renew your 24-hour session.`
      );
      return;
    }

    // Update activity
    await updateLastActivity(phoneNumber);

    // Get current balance
    console.log(`📊 Fetching balance for +${phoneNumber}...`);
    const balance = await getUserBalance(phoneNumber);
    const limits = getSecurityLimits();

    // Calculate daily spending info
    const dailySpent = userWallet.dailySpent;
    const dailyRemaining = limits.dailyLimit - dailySpent;

    const message =
      `💰 SIPPY Balance\n\n` +
      `🏦 PYUSD Balance: ${balance.toFixed(2)} PYUSD\n` +
      `📍 Wallet: ${userWallet.walletAddress.substring(
        0,
        6
      )}...${userWallet.walletAddress.substring(38)}\n\n` +
      `📊 Daily Spending:\n` +
      `• Spent today: $${dailySpent.toFixed(2)}\n` +
      `• Remaining: $${dailyRemaining.toFixed(2)}\n` +
      `• Daily limit: $${limits.dailyLimit}\n\n` +
      `💸 Send money: "send 10 to +57XXX"\n` +
      `📞 Get help: "help"\n\n` +
      `⏰ Session active until: ${new Date(
        userWallet.lastActivity + limits.sessionDurationHours * 60 * 60 * 1000
      ).toLocaleString()}`;

    await sendTextMessage(phoneNumber, message);

    console.log(`✅ Balance sent to +${phoneNumber}: ${balance} PYUSD`);
  } catch (error) {
    console.error(`❌ Failed to get balance for +${phoneNumber}:`, error);

    await sendTextMessage(
      phoneNumber,
      `❌ Error getting your balance.\n\n` +
        `This might be a temporary issue. Please try again in a moment.\n\n` +
        `If the problem persists, send "start" to refresh your session.`
    );
  }
}
