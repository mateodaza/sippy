import { getUserWallet, updateLastActivity } from '../services/cdp-wallet.service.js';
import {
  getEmbeddedWallet,
  hasSpendPermission,
} from '../services/embedded-wallet.service.js';
import { sendTextMessage } from '../services/whatsapp.service.js';
import {
  type Lang,
  formatWelcomeMessage,
  formatWalletNotFullySetupMessage,
  formatNewUserSetupMessage,
  formatGenericErrorMessage,
} from '../utils/messages.js';
import { toUserErrorMessage } from '../utils/errors.js';

export async function handleStartCommand(phoneNumber: string, lang: Lang = 'en'): Promise<void> {
  console.log(`START command from +${phoneNumber}`);

  try {
    // Check for embedded wallet first (new self-custodial system)
    const embeddedWallet = await getEmbeddedWallet(phoneNumber);

    if (embeddedWallet) {
      await updateLastActivity(phoneNumber);

      if (embeddedWallet.spendPermissionHash) {
        const message = formatWelcomeMessage({
          wallet: embeddedWallet.walletAddress,
          isNew: false,
        }, lang);
        await sendTextMessage(phoneNumber, message, lang);
      } else {
        await sendTextMessage(
          phoneNumber,
          formatWalletNotFullySetupMessage(phoneNumber, lang),
          lang
        );
      }
      return;
    }

    // Check for legacy server wallet (old custodial system)
    const legacyWallet = await getUserWallet(phoneNumber);

    if (legacyWallet) {
      await updateLastActivity(phoneNumber);

      const message = formatWelcomeMessage({
        wallet: legacyWallet.walletAddress,
        isNew: false,
      }, lang);
      await sendTextMessage(phoneNumber, message, lang);
      return;
    }

    // New user - send setup link for embedded wallet
    await sendTextMessage(
      phoneNumber,
      formatNewUserSetupMessage(phoneNumber, lang),
      lang
    );

    console.log(`Setup link sent to +${phoneNumber}`);
  } catch (error) {
    console.error(`Failed to handle start command:`, error);

    const errorMessage = toUserErrorMessage(error, lang);
    await sendTextMessage(
      phoneNumber,
      formatGenericErrorMessage(errorMessage, lang),
      lang
    );
  }
}
