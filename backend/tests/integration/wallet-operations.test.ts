#!/usr/bin/env tsx
/**
 * Wallet Operations Integration Tests
 * Tests core wallet functionality (balance, create)
 */

import 'dotenv/config';
import {
  getUserWallet,
  getUserBalance,
} from '../../src/services/cdp-wallet.service.js';
import { TestRunner, TEST_PHONES } from '../helpers/test-utils.js';

const runner = new TestRunner('Wallet Operations Tests');

async function testExistingWallet() {
  runner.printSection('Existing Wallet Operations');

  try {
    const wallet = await getUserWallet(TEST_PHONES.MAIN);
    runner.assert(
      !!wallet,
      'Get existing wallet',
      !wallet ? 'Wallet not found' : undefined
    );

    if (wallet) {
      console.log(`   Wallet: ${wallet.walletAddress}`);

      const balance = await getUserBalance(TEST_PHONES.MAIN);
      runner.assert(
        balance !== undefined && balance >= 0,
        'Get wallet balance',
        balance === undefined ? 'Balance is undefined' : undefined
      );

      if (balance !== undefined) {
        console.log(`   Balance: ${balance} PYUSD`);
      }
    }
  } catch (error: any) {
    runner.assert(false, 'Existing wallet operations', error.message);
  }
}

async function testWalletNotFound() {
  runner.printSection('Non-existent Wallet Handling');

  try {
    const nonExistentPhone = '999999999999';
    const wallet = await getUserWallet(nonExistentPhone);

    runner.assert(
      !wallet,
      'Non-existent wallet returns null/undefined',
      wallet ? `Got: ${JSON.stringify(wallet)}` : undefined
    );
  } catch (error: any) {
    runner.assert(false, 'Handle non-existent wallet', error.message);
  }
}

async function runTests() {
  runner.printHeader();

  console.log('ℹ️  These tests require valid wallet configuration\n');

  await testExistingWallet();
  await testWalletNotFound();

  runner.printSummary();
}

runTests().catch((error) => {
  console.error('Test error:', error);
  process.exit(1);
});
