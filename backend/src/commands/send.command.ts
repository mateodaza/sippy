/**
 * SEND Command
 *
 * Handles PYUSD transfers between users
 */

import {
  getUserWallet,
  isSessionValid,
  updateLastActivity,
  sendPYUSDToUser,
  getUserBalance,
} from '../services/cdp-wallet.service.js';
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

/**
 * Handle "send X to +57XXX" command
 */
export async function handleSendCommand(
  fromPhoneNumber: string,
  amount: number,
  toPhoneNumber: string
): Promise<void> {
  console.log(
    `\n💸 SEND command: +${fromPhoneNumber} → +${toPhoneNumber} (${amount} PYUSD)`
  );

  try {
    // Validate amount
    if (amount <= 0 || isNaN(amount)) {
      await sendTextMessage(fromPhoneNumber, formatInvalidAmountMessage());
      return;
    }

    // Check if sender has wallet
    const senderWallet = await getUserWallet(fromPhoneNumber);
    if (!senderWallet) {
      await sendTextMessage(fromPhoneNumber, formatNoWalletMessage());
      return;
    }

    // Check sender session
    if (!(await isSessionValid(fromPhoneNumber))) {
      await sendTextMessage(fromPhoneNumber, formatSessionExpiredMessage());
      return;
    }

    // Check if recipient has wallet
    const recipientWallet = await getUserWallet(toPhoneNumber);
    if (!recipientWallet) {
      await sendTextMessage(
        fromPhoneNumber,
        formatRecipientNotFoundMessage(toPhoneNumber)
      );
      return;
    }

    // Check sufficient balance
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

    // Update activity
    const updateResult = await updateLastActivity(fromPhoneNumber);
    if (!updateResult) {
      console.error('⚠️ Failed to update last activity');
    }

    // Send confirmation to sender
    await sendTextMessage(
      fromPhoneNumber,
      formatSendProcessingMessage({
        amount,
        toPhone: toPhoneNumber,
      })
    );

    // Check and refuel gas if needed using the GasRefuel smart contract
    let refuelTxHash = '';
    try {
      const refuelService = getRefuelService();

      if (refuelService.isAvailable()) {
        console.log(
          '⛽ Checking if refuel is needed for',
          senderWallet.walletAddress
        );
        const refuelResult = await refuelService.checkAndRefuel(
          senderWallet.walletAddress
        );

        if (refuelResult.success) {
          refuelTxHash = refuelResult.txHash || '';
          console.log('✅ Gas auto-refueled via smart contract');
          console.log('  • Refuel TX:', refuelTxHash);
        } else {
          console.log('ℹ️ No refuel needed:', refuelResult.error);
        }
      } else {
        console.log('⚠️ Refuel service not configured');
      }
    } catch (refuelError) {
      console.error('⚠️ Refuel check failed:', refuelError);
      // Continue with transfer even if refuel fails
    }

    // Execute transfer
    console.log(`🔄 Executing transfer...`);
    const result = await sendPYUSDToUser(
      fromPhoneNumber,
      toPhoneNumber,
      amount
    );

    // Send success confirmation to sender
    const successMessage = formatSendSuccessMessage({
      amount,
      toPhone: toPhoneNumber,
      txHash: result.transactionHash,
      gasCovered: !!refuelTxHash,
    });

    await sendTextMessage(fromPhoneNumber, successMessage);

    // Notify recipient
    const recipientMessage = formatSendRecipientMessage({
      amount,
      fromPhone: fromPhoneNumber,
      txHash: result.transactionHash,
    });

    await sendTextMessage(toPhoneNumber, recipientMessage);

    // Quick action buttons after send
    await sendButtonMessage(fromPhoneNumber, 'Need anything else?', [
      { title: 'Balance' },
      { title: 'Help' },
    ]);

    console.log(`✅ Transfer completed! Hash: ${result.transactionHash}`);
  } catch (error) {
    console.error(`❌ Failed to send PYUSD:`, error);

    const errorMessage = toUserErrorMessage(error);
    await sendTextMessage(
      fromPhoneNumber,
      `❌ Transfer failed\n\n${errorMessage}`
    );
  }
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
