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
  type Lang,
  formatSendProcessingMessage,
  formatSendSuccessMessage,
  formatSendRecipientMessage,
  formatInsufficientBalanceMessage,
  formatNoWalletMessage,
  formatSessionExpiredMessage,
  formatRecipientNotFoundMessage,
  formatInvalidAmountMessage,
  formatTransactionBlockedMessage,
  formatTransferFailedMessage,
  formatSetupRequiredMessage,
  formatDailyLimitExceededMessage,
  formatSpendingLimitInfo,
  buttonNeedAnythingElse,
  buttonBalance,
  buttonHelp,
} from '../utils/messages.js';
import { toUserErrorMessage } from '../utils/errors.js';
import { getUserLanguage } from '../services/db.js';

export async function handleSendCommand(
  fromPhoneNumber: string,
  amount: number,
  toPhoneNumber: string,
  lang: Lang = 'en'
): Promise<void> {
  console.log(
    `SEND command: +${fromPhoneNumber} -> +${toPhoneNumber} (${amount} USD)`
  );

  try {
    if (amount <= 0 || isNaN(amount)) {
      await sendTextMessage(fromPhoneNumber, formatInvalidAmountMessage(lang), lang);
      return;
    }

    // Check for embedded wallet first (new self-custodial system)
    const embeddedWallet = await getEmbeddedWallet(fromPhoneNumber);

    if (embeddedWallet) {
      await handleEmbeddedSend(
        fromPhoneNumber,
        toPhoneNumber,
        amount,
        embeddedWallet,
        lang
      );
      return;
    }

    // Fall back to legacy server wallet flow
    const senderWallet = await getUserWallet(fromPhoneNumber);
    if (!senderWallet) {
      await sendTextMessage(fromPhoneNumber, formatNoWalletMessage(lang), lang);
      return;
    }

    if (!(await isSessionValid(fromPhoneNumber))) {
      await sendTextMessage(fromPhoneNumber, formatSessionExpiredMessage(lang), lang);
      return;
    }

    // Check recipient has a wallet (either embedded or legacy)
    const recipientEmbedded = await getEmbeddedWallet(toPhoneNumber);
    const recipientLegacy = await getUserWallet(toPhoneNumber);

    if (!recipientEmbedded && !recipientLegacy) {
      await sendTextMessage(
        fromPhoneNumber,
        formatRecipientNotFoundMessage(toPhoneNumber, lang),
        lang
      );
      return;
    }

    const senderBalance = await getUserBalance(fromPhoneNumber);
    if (senderBalance < amount) {
      await sendTextMessage(
        fromPhoneNumber,
        formatInsufficientBalanceMessage({ balance: senderBalance, needed: amount }, lang),
        lang
      );
      return;
    }

    // Check security limits
    const limitsCheck = await checkSecurityLimits(fromPhoneNumber, amount);
    if (!limitsCheck.allowed) {
      await sendTextMessage(
        fromPhoneNumber,
        formatTransactionBlockedMessage(limitsCheck.reason || '', lang),
        lang
      );
      return;
    }

    const updateResult = await updateLastActivity(fromPhoneNumber);
    if (!updateResult) {
      console.error('Failed to update last activity');
    }

    await sendTextMessage(
      fromPhoneNumber,
      formatSendProcessingMessage({ amount, toPhone: toPhoneNumber }, lang),
      lang
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
    }, lang);

    await sendTextMessage(fromPhoneNumber, successMessage, lang);

    const recipientLang = await getUserLanguage(toPhoneNumber) || 'en';
    const recipientMessage = formatSendRecipientMessage({
      amount,
      fromPhone: fromPhoneNumber,
      txHash: result.transactionHash,
    }, recipientLang);

    await sendTextMessage(toPhoneNumber, recipientMessage, recipientLang);

    await sendButtonMessage(fromPhoneNumber, buttonNeedAnythingElse(lang), [
      { title: buttonBalance(lang) },
      { title: buttonHelp(lang) },
    ], lang);

    console.log(`Transfer completed. Hash: ${result.transactionHash}`);
  } catch (error) {
    console.error(`Failed to send USDC:`, error);

    const errorMessage = toUserErrorMessage(error, lang);
    await sendTextMessage(
      fromPhoneNumber,
      formatTransferFailedMessage(errorMessage, lang),
      lang
    );
  }
}

async function handleEmbeddedSend(
  fromPhoneNumber: string,
  toPhoneNumber: string,
  amount: number,
  senderWallet: { phoneNumber: string; walletAddress: string; spendPermissionHash: string | null; dailyLimit: number | null },
  lang: Lang
): Promise<void> {
  if (!senderWallet.spendPermissionHash) {
    await sendTextMessage(
      fromPhoneNumber,
      formatSetupRequiredMessage(fromPhoneNumber, lang),
      lang
    );
    return;
  }

  // Check recipient has a wallet (either embedded or legacy)
  const recipientEmbedded = await getEmbeddedWallet(toPhoneNumber);
  const recipientLegacy = await getUserWallet(toPhoneNumber);

  if (!recipientEmbedded && !recipientLegacy) {
    await sendTextMessage(
      fromPhoneNumber,
      formatRecipientNotFoundMessage(toPhoneNumber, lang),
      lang
    );
    return;
  }

  // Check balance
  const senderBalance = await getEmbeddedBalance(fromPhoneNumber);
  if (senderBalance < amount) {
    await sendTextMessage(
      fromPhoneNumber,
      formatInsufficientBalanceMessage({ balance: senderBalance, needed: amount }, lang),
      lang
    );
    return;
  }

  // Check daily limit
  if (senderWallet.dailyLimit && amount > senderWallet.dailyLimit) {
    await sendTextMessage(
      fromPhoneNumber,
      formatDailyLimitExceededMessage(senderWallet.dailyLimit, fromPhoneNumber, lang),
      lang
    );
    return;
  }

  await sendTextMessage(
    fromPhoneNumber,
    formatSendProcessingMessage({ amount, toPhone: toPhoneNumber }, lang),
    lang
  );

  console.log(`Executing embedded wallet transfer via spend permission...`);

  const result = await sendToPhoneNumber(fromPhoneNumber, toPhoneNumber, amount);

  console.log(`Embedded transfer completed. Hash: ${result.transactionHash}`);

  let successMessage = formatSendSuccessMessage({
    amount,
    toPhone: toPhoneNumber,
    txHash: result.transactionHash,
    gasCovered: true,
  }, lang);

  if (result.remainingAllowance !== undefined) {
    const remaining = result.remainingAllowance.toFixed(2);
    let resetInfo = '';
    if (result.periodEndsAt) {
      const daysUntilReset = Math.ceil((result.periodEndsAt - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysUntilReset <= 1) {
        resetInfo = lang === 'en' ? ' (resets tomorrow)' : lang === 'es' ? ' (se renueva manana)' : ' (renova amanha)';
      } else {
        resetInfo = lang === 'en' ? ` (resets in ${daysUntilReset} days)` : lang === 'es' ? ` (se renueva en ${daysUntilReset} dias)` : ` (renova em ${daysUntilReset} dias)`;
      }
    }
    successMessage += `\n\n${formatSpendingLimitInfo(remaining, resetInfo, lang)}`;
  }

  // Send notifications - errors here are non-critical since transfer succeeded
  try {
    await sendTextMessage(fromPhoneNumber, successMessage, lang);
  } catch (notifyError) {
    console.error('Failed to send success notification to sender:', notifyError);
  }

  try {
    const recipientLang = await getUserLanguage(toPhoneNumber) || 'en';
    const recipientMessage = formatSendRecipientMessage({
      amount,
      fromPhone: fromPhoneNumber,
      txHash: result.transactionHash,
    }, recipientLang);
    await sendTextMessage(toPhoneNumber, recipientMessage, recipientLang);
  } catch (notifyError) {
    console.error('Failed to send notification to recipient:', notifyError);
  }

  await sendButtonMessage(fromPhoneNumber, buttonNeedAnythingElse(lang), [
    { title: buttonBalance(lang) },
    { title: buttonHelp(lang) },
  ], lang);
}

export function parsePhoneNumber(phoneStr: string): string {
  const digits = phoneStr.replace(/\D/g, '');

  if (phoneStr.includes('+57')) {
    return digits.replace(/^57/, '57');
  }

  if (digits.startsWith('57') && digits.length > 10) {
    return digits;
  }

  if (digits.length === 10) {
    return '57' + digits;
  }

  return digits;
}
