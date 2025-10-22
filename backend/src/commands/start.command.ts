/**
 * START Command (CDP Server Wallet Version)
 *
 * When user sends "start", we:
 * 1. Create CDP Server Wallet instantly
 * 2. Register phone → wallet mapping
 * 3. Send confirmation with wallet address
 */

import {
  createUserWallet,
  getUserWallet,
  isSessionValid,
  updateLastActivity,
} from '../services/cdp-wallet.service.js';
import { sendTextMessage } from '../services/whatsapp.service.js';
import { formatWelcomeMessage } from '../utils/messages.js';
import { toUserErrorMessage } from '../utils/errors.js';

/**
 * Handle "start" command with CDP Server Wallet
 */
export async function handleStartCommand(phoneNumber: string): Promise<void> {
  console.log(`\n🚀 START command from +${phoneNumber}`);

  try {
    // Check if user already has a wallet
    let userWallet = await getUserWallet(phoneNumber);

    if (userWallet) {
      // Check if session is still valid
      if (await isSessionValid(phoneNumber)) {
        await updateLastActivity(phoneNumber);

        const message = formatWelcomeMessage({
          wallet: userWallet.walletAddress,
          isNew: false,
        });
        await sendTextMessage(phoneNumber, message);
        return;
      } else {
        // Session expired, reactivate
        await updateLastActivity(phoneNumber);

        const message = formatWelcomeMessage({
          wallet: userWallet.walletAddress,
          isNew: false,
        });
        await sendTextMessage(phoneNumber, `🔄 Session renewed!\n\n${message}`);
        return;
      }
    }

    // Create new CDP Server Wallet
    console.log(`📱 Creating new wallet for +${phoneNumber}...`);
    userWallet = await createUserWallet(phoneNumber);

    // Send success message
    const message = formatWelcomeMessage({
      wallet: userWallet.walletAddress,
      isNew: true,
    });

    await sendTextMessage(phoneNumber, message);

    console.log(`✅ Wallet created and registered for +${phoneNumber}`);
  } catch (error) {
    console.error(`❌ Failed to handle start command:`, error);

    const errorMessage = toUserErrorMessage(error);
    await sendTextMessage(
      phoneNumber,
      `❌ Sorry, there was an error.\n\n${errorMessage}`
    );
  }
}
