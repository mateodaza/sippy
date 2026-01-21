import {
  getUserWallet,
  getUserBalance,
  isSessionValid,
  updateLastActivity,
} from '../services/cdp-wallet.service.js';
import {
  getEmbeddedWallet,
  getEmbeddedBalance,
  getRemainingAllowance,
} from '../services/embedded-wallet.service.js';
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

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.sippy.lat';

export async function handleBalanceCommand(phoneNumber: string): Promise<void> {
  console.log(`BALANCE command from +${phoneNumber}`);

  try {
    // Check for embedded wallet first (new self-custodial system)
    const embeddedWallet = await getEmbeddedWallet(phoneNumber);

    if (embeddedWallet) {
      await handleEmbeddedBalance(phoneNumber, embeddedWallet);
      return;
    }

    // Fall back to legacy server wallet flow
    const userWallet = await getUserWallet(phoneNumber);
    if (!userWallet) {
      await sendTextMessage(phoneNumber, formatNoWalletMessage());
      return;
    }

    if (!(await isSessionValid(phoneNumber))) {
      await sendTextMessage(phoneNumber, formatSessionExpiredMessage());
      return;
    }

    await updateLastActivity(phoneNumber);

    console.log(`Fetching balance for +${phoneNumber}...`);
    const balance = await getUserBalance(phoneNumber);

    let ethBalance: string | undefined;
    try {
      const refuelService = getRefuelService();
      if (refuelService.isAvailable()) {
        ethBalance = await refuelService.getUserBalance(
          userWallet.walletAddress
        );
        console.log(`ETH balance: ${ethBalance} ETH`);
      }
    } catch (error) {
      console.warn('Failed to get ETH balance:', error);
    }

    let message = formatBalanceMessage({
      balance,
      wallet: userWallet.walletAddress,
      ethBalance,
      phoneNumber,
    });

    if (ethBalance && parseFloat(ethBalance) < 0.00001) {
      message += `\n\nLow transfer balance detected. We top you up daily automatically, so transfers will continue working.`;
    }

    await sendTextMessage(phoneNumber, message);

    console.log(`Balance sent to +${phoneNumber}: ${balance} USD`);
  } catch (error) {
    console.error(`Failed to get balance for +${phoneNumber}:`, error);

    const errorMessage = toUserErrorMessage(error);
    await sendTextMessage(phoneNumber, `Error: ${errorMessage}`);
  }
}

/**
 * Handle balance for embedded wallet users
 */
async function handleEmbeddedBalance(
  phoneNumber: string,
  wallet: { phoneNumber: string; walletAddress: string; spendPermissionHash: string | null; dailyLimit: number | null }
): Promise<void> {
  console.log(`Fetching embedded wallet balance for +${phoneNumber}...`);

  const balance = await getEmbeddedBalance(phoneNumber);

  let message = formatBalanceMessage({
    balance,
    wallet: wallet.walletAddress,
    phoneNumber,
  });

  // Add spending limit info for embedded wallets
  if (wallet.spendPermissionHash) {
    const allowanceInfo = await getRemainingAllowance(phoneNumber);
    if (allowanceInfo) {
      const remaining = allowanceInfo.remaining.toFixed(2);
      const total = allowanceInfo.allowance.toFixed(2);
      message += `\n\nSpending limit: $${remaining} of $${total}/day remaining`;

      const hoursUntilReset = Math.ceil((allowanceInfo.periodEndsAt - Date.now()) / (1000 * 60 * 60));
      if (hoursUntilReset <= 24) {
        message += ` (resets in ${hoursUntilReset}h)`;
      }
    }
  } else {
    // No permission - prompt to complete setup
    const setupUrl = `${FRONTEND_URL}/setup?phone=${encodeURIComponent('+' + phoneNumber)}`;
    message += `\n\nComplete setup to enable sending:\n${setupUrl}`;
  }

  await sendTextMessage(phoneNumber, message);

  console.log(`Balance sent to +${phoneNumber}: ${balance} USD`);
}
