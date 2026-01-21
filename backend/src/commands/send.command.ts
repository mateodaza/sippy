import {
  getUserWallet,
  isSessionValid,
  updateLastActivity,
  sendUSDCToUser,
  getUserBalance,
  checkSecurityLimits,
} from '../services/cdp-wallet.service.js';
import {
  getEmbeddedWallet,
  getEmbeddedBalance,
  sendToPhoneNumber,
} from '../services/embedded-wallet.service.js';
import {
  sendTextMessage,
  sendButtonMessage,
} from '../services/whatsapp.service.js';
import { getRefuelService } from '../services/refuel.service.js';
import {
  formatSendProcessingMessage,
  formatSendSuccessMessage,
  formatSendRecipientMessage,
  formatInsufficientBalanceMessage,
  formatNoWalletMessage,
  formatSessionExpiredMessage,
  formatRecipientNotFoundMessage,
  formatInvalidAmountMessage,
} from '../utils/messages.js';
import { toUserErrorMessage } from '../utils/errors.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.sippy.lat';

export async function handleSendCommand(
  fromPhoneNumber: string,
  amount: number,
  toPhoneNumber: string
): Promise<void> {
  console.log(
    `SEND command: +${fromPhoneNumber} -> +${toPhoneNumber} (${amount} USD)`
  );

  try {
    if (amount <= 0 || isNaN(amount)) {
      await sendTextMessage(fromPhoneNumber, formatInvalidAmountMessage());
      return;
    }

    // Check for embedded wallet first (new self-custodial system)
    const embeddedWallet = await getEmbeddedWallet(fromPhoneNumber);

    if (embeddedWallet) {
      // Use embedded wallet flow with spend permissions
      await handleEmbeddedSend(
        fromPhoneNumber,
        toPhoneNumber,
        amount,
        embeddedWallet
      );
      return;
    }

    // Fall back to legacy server wallet flow
    const senderWallet = await getUserWallet(fromPhoneNumber);
    if (!senderWallet) {
      await sendTextMessage(fromPhoneNumber, formatNoWalletMessage());
      return;
    }

    if (!(await isSessionValid(fromPhoneNumber))) {
      await sendTextMessage(fromPhoneNumber, formatSessionExpiredMessage());
      return;
    }

    // Check recipient has a wallet (either embedded or legacy)
    const recipientEmbedded = await getEmbeddedWallet(toPhoneNumber);
    const recipientLegacy = await getUserWallet(toPhoneNumber);

    if (!recipientEmbedded && !recipientLegacy) {
      await sendTextMessage(
        fromPhoneNumber,
        formatRecipientNotFoundMessage(toPhoneNumber)
      );
      return;
    }

    const senderBalance = await getUserBalance(fromPhoneNumber);
    if (senderBalance < amount) {
      await sendTextMessage(
        fromPhoneNumber,
        formatInsufficientBalanceMessage({
          balance: senderBalance,
          needed: amount,
        })
      );
      return;
    }

    // Check security limits
    const limitsCheck = await checkSecurityLimits(fromPhoneNumber, amount);
    if (!limitsCheck.allowed) {
      await sendTextMessage(
        fromPhoneNumber,
        `Transaction blocked.\n\n${limitsCheck.reason}\n\nThese limits help keep your account secure.`
      );
      return;
    }

    const updateResult = await updateLastActivity(fromPhoneNumber);
    if (!updateResult) {
      console.error('Failed to update last activity');
    }

    await sendTextMessage(
      fromPhoneNumber,
      formatSendProcessingMessage({
        amount,
        toPhone: toPhoneNumber,
      })
    );

    let refuelTxHash = '';
    try {
      const refuelService = getRefuelService();

      if (refuelService.isAvailable()) {
        console.log(
          'Checking if refuel is needed for',
          senderWallet.walletAddress
        );
        const refuelResult = await refuelService.checkAndRefuel(
          senderWallet.walletAddress
        );

        if (refuelResult.success) {
          refuelTxHash = refuelResult.txHash || '';
          console.log('Gas auto-refueled via smart contract');
          console.log('Refuel TX:', refuelTxHash);
        } else {
          console.log('No refuel needed:', refuelResult.error);
        }
      } else {
        console.log('Refuel service not configured');
      }
    } catch (refuelError) {
      console.error('Refuel check failed:', refuelError);
    }

    console.log(`Executing transfer...`);
    const result = await sendUSDCToUser(
      fromPhoneNumber,
      toPhoneNumber,
      amount
    );

    const successMessage = formatSendSuccessMessage({
      amount,
      toPhone: toPhoneNumber,
      txHash: result.transactionHash,
      gasCovered: !!refuelTxHash,
    });

    await sendTextMessage(fromPhoneNumber, successMessage);

    const recipientMessage = formatSendRecipientMessage({
      amount,
      fromPhone: fromPhoneNumber,
      txHash: result.transactionHash,
    });

    await sendTextMessage(toPhoneNumber, recipientMessage);

    await sendButtonMessage(fromPhoneNumber, 'Need anything else?', [
      { title: 'Balance' },
      { title: 'Help' },
    ]);

    console.log(`Transfer completed. Hash: ${result.transactionHash}`);
  } catch (error) {
    console.error(`Failed to send USDC:`, error);

    const errorMessage = toUserErrorMessage(error);
    await sendTextMessage(
      fromPhoneNumber,
      `Transfer failed.\n\n${errorMessage}`
    );
  }
}

/**
 * Handle send using embedded wallet with spend permissions
 */
async function handleEmbeddedSend(
  fromPhoneNumber: string,
  toPhoneNumber: string,
  amount: number,
  senderWallet: { phoneNumber: string; walletAddress: string; spendPermissionHash: string | null; dailyLimit: number | null }
): Promise<void> {
  // Check if sender has spend permission
  if (!senderWallet.spendPermissionHash) {
    const setupUrl = `${FRONTEND_URL}/setup?phone=${encodeURIComponent('+' + fromPhoneNumber)}`;
    await sendTextMessage(
      fromPhoneNumber,
      `You need to complete your wallet setup before sending.\n\n` +
        `Please finish setup here:\n${setupUrl}`
    );
    return;
  }

  // Check recipient has a wallet (either embedded or legacy)
  const recipientEmbedded = await getEmbeddedWallet(toPhoneNumber);
  const recipientLegacy = await getUserWallet(toPhoneNumber);

  if (!recipientEmbedded && !recipientLegacy) {
    await sendTextMessage(
      fromPhoneNumber,
      formatRecipientNotFoundMessage(toPhoneNumber)
    );
    return;
  }

  // Check balance
  const senderBalance = await getEmbeddedBalance(fromPhoneNumber);
  if (senderBalance < amount) {
    await sendTextMessage(
      fromPhoneNumber,
      formatInsufficientBalanceMessage({
        balance: senderBalance,
        needed: amount,
      })
    );
    return;
  }

  // Check daily limit
  if (senderWallet.dailyLimit && amount > senderWallet.dailyLimit) {
    const settingsUrl = `${FRONTEND_URL}/settings?phone=${encodeURIComponent('+' + fromPhoneNumber)}`;
    await sendTextMessage(
      fromPhoneNumber,
      `Amount exceeds your daily limit of $${senderWallet.dailyLimit}.\n\n` +
        `You can change your limit here:\n${settingsUrl}`
    );
    return;
  }

  await sendTextMessage(
    fromPhoneNumber,
    formatSendProcessingMessage({
      amount,
      toPhone: toPhoneNumber,
    })
  );

  console.log(`Executing embedded wallet transfer via spend permission...`);

  // Execute transfer using spend permission
  const result = await sendToPhoneNumber(fromPhoneNumber, toPhoneNumber, amount);

  // Build success message with remaining allowance info
  let successMessage = formatSendSuccessMessage({
    amount,
    toPhone: toPhoneNumber,
    txHash: result.transactionHash,
    gasCovered: true, // Embedded wallets use paymaster
  });

  // Add remaining allowance info if available
  if (result.remainingAllowance !== undefined) {
    const remaining = result.remainingAllowance.toFixed(2);
    successMessage += `\n\nSpending limit: $${remaining} remaining`;

    if (result.periodEndsAt) {
      const resetDate = new Date(result.periodEndsAt);
      const daysUntilReset = Math.ceil((result.periodEndsAt - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysUntilReset <= 1) {
        successMessage += ` (resets tomorrow)`;
      } else {
        successMessage += ` (resets in ${daysUntilReset} days)`;
      }
    }
  }

  await sendTextMessage(fromPhoneNumber, successMessage);

  const recipientMessage = formatSendRecipientMessage({
    amount,
    fromPhone: fromPhoneNumber,
    txHash: result.transactionHash,
  });

  await sendTextMessage(toPhoneNumber, recipientMessage);

  await sendButtonMessage(fromPhoneNumber, 'Need anything else?', [
    { title: 'Balance' },
    { title: 'Help' },
  ]);

  console.log(`Embedded transfer completed. Hash: ${result.transactionHash}`);
}

/**
 * Parse phone number from string (helper function)
 */
export function parsePhoneNumber(phoneStr: string): string {
  // Remove all non-digits
  const digits = phoneStr.replace(/\D/g, '');

  // If starts with +57, remove +57 and add colombia code
  if (phoneStr.includes('+57')) {
    return digits.replace(/^57/, '57');
  }

  // If starts with 57 (already has country code)
  if (digits.startsWith('57') && digits.length > 10) {
    return digits;
  }

  // If it's a 10-digit Colombian number, add country code
  if (digits.length === 10) {
    return '57' + digits;
  }

  // Return as-is if we can't parse it
  return digits;
}
