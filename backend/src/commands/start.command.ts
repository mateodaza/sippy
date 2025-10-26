import {
  createUserWallet,
  getUserWallet,
  isSessionValid,
  updateLastActivity,
} from '../services/cdp-wallet.service.js';
import { sendTextMessage } from '../services/whatsapp.service.js';
import { formatWelcomeMessage } from '../utils/messages.js';
import { toUserErrorMessage } from '../utils/errors.js';

export async function handleStartCommand(phoneNumber: string): Promise<void> {
  console.log(`START command from +${phoneNumber}`);

  try {
    let userWallet = await getUserWallet(phoneNumber);

    if (userWallet) {
      if (await isSessionValid(phoneNumber)) {
        await updateLastActivity(phoneNumber);

        const message = formatWelcomeMessage({
          wallet: userWallet.walletAddress,
          isNew: false,
        });
        await sendTextMessage(phoneNumber, message);
        return;
      } else {
        await updateLastActivity(phoneNumber);

        const message = formatWelcomeMessage({
          wallet: userWallet.walletAddress,
          isNew: false,
        });
        await sendTextMessage(phoneNumber, `Session renewed.\n\n${message}`);
        return;
      }
    }

    console.log(`Creating wallet for +${phoneNumber}...`);
    userWallet = await createUserWallet(phoneNumber);

    const message = formatWelcomeMessage({
      wallet: userWallet.walletAddress,
      isNew: true,
    });

    await sendTextMessage(phoneNumber, message);

    console.log(`Wallet created and registered for +${phoneNumber}`);
  } catch (error) {
    console.error(`Failed to handle start command:`, error);

    const errorMessage = toUserErrorMessage(error);
    await sendTextMessage(
      phoneNumber,
      `Sorry, there was an error.\n\n${errorMessage}`
    );
  }
}
