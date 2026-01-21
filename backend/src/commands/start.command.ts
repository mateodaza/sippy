import { getUserWallet, updateLastActivity } from '../services/cdp-wallet.service.js';
import {
  getEmbeddedWallet,
  hasSpendPermission,
} from '../services/embedded-wallet.service.js';
import { sendTextMessage } from '../services/whatsapp.service.js';
import { formatWelcomeMessage } from '../utils/messages.js';
import { toUserErrorMessage } from '../utils/errors.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.sippy.lat';

export async function handleStartCommand(phoneNumber: string): Promise<void> {
  console.log(`START command from +${phoneNumber}`);

  try {
    // Check for embedded wallet first (new self-custodial system)
    const embeddedWallet = await getEmbeddedWallet(phoneNumber);

    if (embeddedWallet) {
      await updateLastActivity(phoneNumber);

      // Check if they have spend permission
      if (embeddedWallet.spendPermissionHash) {
        // Fully set up - show welcome back message
        const message = formatWelcomeMessage({
          wallet: embeddedWallet.walletAddress,
          isNew: false,
        });
        await sendTextMessage(phoneNumber, message);
      } else {
        // Has wallet but no permission - prompt to complete setup
        const setupUrl = `${FRONTEND_URL}/setup?phone=${encodeURIComponent('+' + phoneNumber)}`;
        await sendTextMessage(
          phoneNumber,
          `Your wallet is created but not fully set up.\n\n` +
            `Please complete the setup to enable sending:\n${setupUrl}`
        );
      }
      return;
    }

    // Check for legacy server wallet (old custodial system)
    const legacyWallet = await getUserWallet(phoneNumber);

    if (legacyWallet) {
      // Legacy user - show wallet info but suggest upgrade
      await updateLastActivity(phoneNumber);

      const message = formatWelcomeMessage({
        wallet: legacyWallet.walletAddress,
        isNew: false,
      });
      await sendTextMessage(phoneNumber, message);
      return;
    }

    // New user - send setup link for embedded wallet
    const setupUrl = `${FRONTEND_URL}/setup?phone=${encodeURIComponent('+' + phoneNumber)}`;
    await sendTextMessage(
      phoneNumber,
      `Welcome to Sippy!\n\n` +
        `To get started, set up your wallet (takes 60 seconds):\n\n` +
        `${setupUrl}\n\n` +
        `You'll:\n` +
        `1. Verify your phone number\n` +
        `2. Set your spending limit\n` +
        `3. Start sending dollars via WhatsApp!`
    );

    console.log(`Setup link sent to +${phoneNumber}`);
  } catch (error) {
    console.error(`Failed to handle start command:`, error);

    const errorMessage = toUserErrorMessage(error);
    await sendTextMessage(
      phoneNumber,
      `Sorry, there was an error.\n\n${errorMessage}`
    );
  }
}
