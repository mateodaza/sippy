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
  type Lang,
  formatBalanceMessage,
  formatNoWalletMessage,
  formatSessionExpiredMessage,
  formatLowTransferBalanceMessage,
  formatBalanceErrorMessage,
  formatSpendingLimitBalance,
  formatCompleteSetupMessage,
} from '../utils/messages.js';
import { toUserErrorMessage } from '../utils/errors.js';
import { getRefuelService } from '../services/refuel.service.js';

export async function handleBalanceCommand(phoneNumber: string, lang: Lang = 'en'): Promise<void> {
  console.log(`BALANCE command from +${phoneNumber}`);

  try {
    // Check for embedded wallet first (new self-custodial system)
    const embeddedWallet = await getEmbeddedWallet(phoneNumber);

    if (embeddedWallet) {
      await handleEmbeddedBalance(phoneNumber, embeddedWallet, lang);
      return;
    }

    // Fall back to legacy server wallet flow
    const userWallet = await getUserWallet(phoneNumber);
    if (!userWallet) {
      await sendTextMessage(phoneNumber, formatNoWalletMessage(lang), lang);
      return;
    }

    if (!(await isSessionValid(phoneNumber))) {
      await sendTextMessage(phoneNumber, formatSessionExpiredMessage(lang), lang);
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
    }, lang);

    if (ethBalance && parseFloat(ethBalance) < 0.00001) {
      message += `\n\n${formatLowTransferBalanceMessage(lang)}`;
    }

    await sendTextMessage(phoneNumber, message, lang);

    console.log(`Balance sent to +${phoneNumber}: ${balance} USD`);
  } catch (error) {
    console.error(`Failed to get balance for +${phoneNumber}:`, error);

    const errorMessage = toUserErrorMessage(error, lang);
    await sendTextMessage(phoneNumber, formatBalanceErrorMessage(errorMessage, lang), lang);
  }
}

async function handleEmbeddedBalance(
  phoneNumber: string,
  wallet: { phoneNumber: string; walletAddress: string; spendPermissionHash: string | null; dailyLimit: number | null },
  lang: Lang
): Promise<void> {
  console.log(`Fetching embedded wallet balance for +${phoneNumber}...`);

  const balance = await getEmbeddedBalance(phoneNumber);

  let message = formatBalanceMessage({
    balance,
    wallet: wallet.walletAddress,
    phoneNumber,
  }, lang);

  if (wallet.spendPermissionHash) {
    const allowanceInfo = await getRemainingAllowance(phoneNumber);
    if (allowanceInfo) {
      const remaining = allowanceInfo.remaining.toFixed(2);
      const total = allowanceInfo.allowance.toFixed(2);
      const hoursUntilReset = Math.ceil((allowanceInfo.periodEndsAt - Date.now()) / (1000 * 60 * 60));
      message += `\n\n${formatSpendingLimitBalance(remaining, total, hoursUntilReset, lang)}`;
    }
  } else {
    message += `\n\n${formatCompleteSetupMessage(phoneNumber, lang)}`;
  }

  await sendTextMessage(phoneNumber, message, lang);

  console.log(`Balance sent to +${phoneNumber}: ${balance} USD`);
}
