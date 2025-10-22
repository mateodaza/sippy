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
import { getRefuelService } from '../services/refuel.service.js';

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

    // Get ETH (gas) balance
    let ethBalance: string | undefined;
    try {
      const refuelService = getRefuelService();
      if (refuelService.isAvailable()) {
        ethBalance = await refuelService.getUserBalance(
          userWallet.walletAddress
        );
        console.log(`⛽ ETH balance: ${ethBalance} ETH`);
      }
    } catch (error) {
      console.warn('⚠️ Failed to get ETH balance:', error);
      // Continue without ETH balance
    }

    let message = formatBalanceMessage({
      balance,
      wallet: userWallet.walletAddress,
      ethBalance,
      phoneNumber,
    });

    // Add warning if ETH balance is critically low (below refuel threshold)
    // Contract refuels when balance drops below 0.00001 ETH
    if (ethBalance && parseFloat(ethBalance) < 0.00001) {
      message += `\n\n⚠️ Low transfer balance!\nDon't worry - we top you up daily automatically. Your transfers will keep working!`;
    }

    await sendTextMessage(phoneNumber, message);

    console.log(`✅ Balance sent to +${phoneNumber}: ${balance} PYUSD`);
  } catch (error) {
    console.error(`❌ Failed to get balance for +${phoneNumber}:`, error);

    const errorMessage = toUserErrorMessage(error);
    await sendTextMessage(phoneNumber, `❌ ${errorMessage}`);
  }
}
