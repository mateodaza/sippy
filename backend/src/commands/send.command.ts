/**
 * SEND Command
 *
 * Handles PYUSD transfers between users
 */

import {
  getUserWallet,
  isSessionValid,
  updateLastActivity,
  checkSecurityLimits,
  sendPYUSDToUser,
  getUserBalance,
} from '../services/cdp-wallet.service.js';
import { sendTextMessage } from '../services/whatsapp.service.js';
import { getRefuelService } from '../services/refuel.service.js';

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
    if (amount <= 0) {
      await sendTextMessage(
        fromPhoneNumber,
        `❌ Invalid amount: ${amount}\n\n` +
          `Please send a positive amount.\n` +
          `Example: "send 5 to +573001234567"`
      );
      return;
    }

    // Check if sender has wallet
    const senderWallet = await getUserWallet(fromPhoneNumber);
    if (!senderWallet) {
      await sendTextMessage(
        fromPhoneNumber,
        `❌ No wallet found!\n\n` +
          `Send "start" to create your Sippy wallet first.`
      );
      return;
    }

    // Check sender session
    if (!(await isSessionValid(fromPhoneNumber))) {
      await sendTextMessage(
        fromPhoneNumber,
        `⏰ Session expired!\n\n` +
          `Send "start" to renew your session and try again.`
      );
      return;
    }

    // Check if recipient has wallet
    const recipientWallet = await getUserWallet(toPhoneNumber);
    if (!recipientWallet) {
      await sendTextMessage(
        fromPhoneNumber,
        `❌ Recipient not found!\n\n` +
          `+${toPhoneNumber} is not registered with Sippy.\n\n` +
          `Ask them to send "start" to this number to create their wallet.`
      );
      return;
    }

    // Check security limits
    const securityCheck = await checkSecurityLimits(fromPhoneNumber, amount);
    if (!securityCheck.allowed) {
      await sendTextMessage(
        fromPhoneNumber,
        `🚫 Transaction blocked\n\n` +
          `${securityCheck.reason}\n\n` +
          `Check your limits with "balance" command.`
      );
      return;
    }

    // Check sufficient balance
    const senderBalance = await getUserBalance(fromPhoneNumber);
    if (senderBalance < amount) {
      await sendTextMessage(
        fromPhoneNumber,
        `💸 Insufficient balance\n\n` +
          `Balance: ${senderBalance.toFixed(2)} PYUSD\n` +
          `Needed: ${amount.toFixed(2)} PYUSD\n\n` +
          `Please add more PYUSD to your wallet:\n${senderWallet.walletAddress}`
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
      `⏳ Sending ${amount} PYUSD to +${toPhoneNumber}...\n\n` +
        `Please wait while we process your transaction.`
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
    let successMessage =
      `✅ Enviado exitosamente\n` +
      `• Monto: ${amount} PYUSD\n` +
      `• Para: +${toPhoneNumber}\n` +
      `• TX: ${result.transactionHash.substring(
        0,
        10
      )}...${result.transactionHash.substring(54)}\n`;

    // Only show gas covered message if refuel was successful
    if (refuelTxHash) {
      successMessage += `• Gas: Cubierto por Sippy\n`;
    }

    successMessage += `\nBalance: "balance"`;

    await sendTextMessage(fromPhoneNumber, successMessage);

    // Notify recipient
    await sendTextMessage(
      toPhoneNumber,
      `💰 Money received!\n\n` +
        `You received ${amount} PYUSD from +${fromPhoneNumber}!\n\n` +
        `🔗 Transaction: ${result.transactionHash.substring(
          0,
          10
        )}...${result.transactionHash.substring(54)}\n` +
        `⏰ ${new Date(result.timestamp).toLocaleString()}\n\n` +
        `💸 Send money: "send X to +57..."\n` +
        `💰 Check balance: "balance"\n` +
        `📞 Get help: "help"`
    );

    console.log(`✅ Transfer completed! Hash: ${result.transactionHash}`);
  } catch (error) {
    console.error(`❌ Failed to send PYUSD:`, error);

    // Determine error type and send appropriate message
    let errorMessage = `❌ Transfer failed\n\n`;

    if (error instanceof Error) {
      if (error.message.includes('insufficient')) {
        errorMessage += `Insufficient balance or network fees.\n\n`;
      } else if (error.message.includes('network')) {
        errorMessage += `Network error. Please try again.\n\n`;
      } else {
        errorMessage += `${error.message}\n\n`;
      }
    }

    errorMessage +=
      `Please try again or contact support if the problem persists.\n\n` +
      `Check your balance: "balance"`;

    await sendTextMessage(fromPhoneNumber, errorMessage);
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
