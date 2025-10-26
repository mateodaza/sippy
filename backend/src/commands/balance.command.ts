import {
  getUserWallet,
  getUserBalance,
  isSessionValid,
  updateLastActivity,
} from '../services/cdp-wallet.service.js';
import {
  sendTextMessage,
  sendButtonMessage,
} from '../services/whatsapp.service.js';
import {
  formatBalanceMessage,
  formatNoWalletMessage,
  formatSessionExpiredMessage,
} from '../utils/messages.js';
import { toUserErrorMessage } from '../utils/errors.js';
import { getRefuelService } from '../services/refuel.service.js';

export async function handleBalanceCommand(phoneNumber: string): Promise<void> {
  console.log(`BALANCE command from +${phoneNumber}`);

  try {
    const userWallet = await getUserWallet(phoneNumber);
    if (!userWallet) {
      await sendTextMessage(phoneNumber, formatNoWalletMessage());
      return;
    }

    if (!(await isSessionValid(phoneNumber))) {
      await sendTextMessage(phoneNumber, formatSessionExpiredMessage());
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
    });

    if (ethBalance && parseFloat(ethBalance) < 0.00001) {
      message += `\n\nLow transfer balance detected. We top you up daily automatically, so transfers will continue working.`;
    }

    await sendTextMessage(phoneNumber, message);

    console.log(`Balance sent to +${phoneNumber}: ${balance} PYUSD`);
  } catch (error) {
    console.error(`Failed to get balance for +${phoneNumber}:`, error);

    const errorMessage = toUserErrorMessage(error);
    await sendTextMessage(phoneNumber, `Error: ${errorMessage}`);
  }
}
