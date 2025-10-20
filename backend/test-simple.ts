#!/usr/bin/env ts-node
/**
 * Simple Test - Verificar funciones core
 */

import 'dotenv/config';
import {
  getUserWallet,
  getUserBalance,
} from './src/services/cdp-wallet.service';

async function test() {
  console.log('🧪 Sippy - Quick Test\n');

  const PHONE = '573116613414';

  console.log(`1. Checking wallet for +${PHONE}...`);
  const wallet = await getUserWallet(PHONE);

  if (!wallet) {
    console.log('❌ Wallet not found');
    process.exit(1);
  }

  console.log(`✅ Wallet: ${wallet.walletAddress}`);

  console.log(`\n2. Checking PYUSD balance...`);
  const balance = await getUserBalance(PHONE);
  console.log(`✅ Balance: ${balance} PYUSD`);

  console.log('\n✅ All core functions working!\n');
}

test();
