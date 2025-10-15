#!/usr/bin/env ts-node
/**
 * Test wallet creation
 */

import 'dotenv/config';
import { createUserWallet, getUserWallet } from './src/services/cdp-wallet.service';

async function test() {
  console.log('🧪 Testing Wallet Creation\n');

  // Use a random test phone
  const TEST_PHONE = `573${Math.floor(Math.random() * 100000000)}`;

  console.log(`Creating wallet for +${TEST_PHONE}...`);

  try {
    const wallet = await createUserWallet(TEST_PHONE);
    console.log(`✅ Wallet created successfully!`);
    console.log(`   Address: ${wallet.walletAddress}`);
    console.log(`   CDP ID: ${wallet.cdpWalletId}`);

    // Verify we can retrieve it
    console.log(`\nVerifying retrieval...`);
    const retrieved = await getUserWallet(TEST_PHONE);

    if (retrieved && retrieved.walletAddress === wallet.walletAddress) {
      console.log(`✅ Wallet retrieved successfully!`);
      console.log(`\n✅ Wallet creation system working perfectly!\n`);
    } else {
      console.log(`❌ Failed to retrieve wallet`);
      process.exit(1);
    }
  } catch (error: any) {
    console.error(`❌ Error:`, error.message);
    process.exit(1);
  }
}

test();

