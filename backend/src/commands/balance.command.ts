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
} from '../services/cdp-wallet.service.js';
import {
  sendTextMessage,
  sendButtonMessage,
} from '../services/whatsapp.service.js';
import {
  formatBalanceMessage,
  formatNoWalletMessage,
  formatSessionExpiredMessage,
} from '../utils/messages.js';
import { toUserErrorMessage } from '../utils/errors.js';

/**
 * Handle "balance" command
 */
export async function handleBalanceCommand(phoneNumber: string): Promise<void> {
  console.log(`\n💰 BALANCE command from +${phoneNumber}`);

  try {
    // Check if user has a wallet
    const userWallet = await getUserWallet(phoneNumber);
    if (!userWallet) {
      await sendTextMessage(phoneNumber, formatNoWalletMessage());
      return;
    }

    // Check session validity
    if (!(await isSessionValid(phoneNumber))) {
      await sendTextMessage(phoneNumber, formatSessionExpiredMessage());
      return;
    }

    // Update activity
    await updateLastActivity(phoneNumber);

    // Get current balance
    console.log(`📊 Fetching balance for +${phoneNumber}...`);
    const balance = await getUserBalance(phoneNumber);

    const message = formatBalanceMessage({
      balance,
      wallet: userWallet.walletAddress,
    });

    await sendTextMessage(phoneNumber, message);

    // Optional: send quick action buttons
    await sendButtonMessage(phoneNumber, 'Quick actions:', [
      { title: 'Send' },
      { title: 'Help' },
    ]);

    console.log(`✅ Balance sent to +${phoneNumber}: ${balance} PYUSD`);
  } catch (error) {
    console.error(`❌ Failed to get balance for +${phoneNumber}:`, error);

    const errorMessage = toUserErrorMessage(error);
    await sendTextMessage(phoneNumber, `❌ ${errorMessage}`);
  }
}
