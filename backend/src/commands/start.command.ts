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
} from '../services/cdp-wallet.service';
import { sendTextMessage } from '../services/whatsapp.service';

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

        await sendTextMessage(
          phoneNumber,
          `✅ Welcome back to SIPPY!\n\n` +
            `Your wallet: ${userWallet.walletAddress.substring(
              0,
              6
            )}...${userWallet.walletAddress.substring(38)}\n\n` +
            `Available commands:\n` +
            `• "balance" - Check your PYUSD balance\n` +
            `• "send 10 to +57XXX" - Send money\n` +
            `• "help" - Show all commands\n\n` +
            `💡 Your session is active for 24 hours from last activity.`
        );
        return;
      } else {
        // Session expired, reactivate
        await updateLastActivity(phoneNumber);
        await sendTextMessage(
          phoneNumber,
          `🔄 Session renewed!\n\n` +
            `Your SIPPY wallet is ready to use again.\n\n` +
            `Wallet: ${userWallet.walletAddress.substring(
              0,
              6
            )}...${userWallet.walletAddress.substring(38)}\n\n` +
            `Available commands:\n` +
            `• "balance" - Check your balance\n` +
            `• "send X to +57..." - Send money\n` +
            `• "help" - Show help`
        );
        return;
      }
    }

    // Create new CDP Server Wallet
    console.log(`📱 Creating new wallet for +${phoneNumber}...`);
    userWallet = await createUserWallet(phoneNumber);

    // Send success message
    const message =
      `🎉 Welcome to SIPPY!\n\n` +
      `Your wallet has been created instantly!\n\n` +
      `💰 Wallet Address:\n${userWallet.walletAddress}\n\n` +
      `🚀 You can now:\n` +
      `• Receive PYUSD at this address\n` +
      `• Send money via: "send 5 to +57XXX"\n` +
      `• Check balance via: "balance"\n` +
      `• Get help via: "help"\n\n` +
      `🔒 Security:\n` +
      `• Your wallet is secured by Coinbase infrastructure\n` +
      `• Sessions last 24 hours\n` +
      `• Daily limit: $500 PYUSD\n` +
      `• Transaction limit: $100 PYUSD\n\n` +
      `Ready to send and receive money via WhatsApp! 💸`;

    await sendTextMessage(phoneNumber, message);

    console.log(`✅ Wallet created and registered for +${phoneNumber}`);
  } catch (error) {
    console.error(`❌ Failed to handle start command:`, error);

    await sendTextMessage(
      phoneNumber,
      `❌ Sorry, there was an error creating your wallet.\n\n` +
        `Please try again with "start" or contact support if the problem persists.\n\n` +
        `Error: ${(error as Error).message}`
    );
  }
}
