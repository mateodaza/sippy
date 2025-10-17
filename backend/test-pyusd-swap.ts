/**
 * Test script for PYUSD swap functionality
 *
 * Usage:
 *   npx tsx test-pyusd-swap.ts
 */

import { ethers } from 'ethers';
import { PyusdSwapService } from './src/services/pyusd-swap.service';
import * as dotenv from 'dotenv';

dotenv.config();

async function testPyusdSwap() {
  console.log('🧪 Testing PYUSD Swap Service\n');

  // Create wallet from private key
  const privateKey = process.env.TEST_WALLET_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('TEST_WALLET_PRIVATE_KEY not found in .env');
  }

  const wallet = new ethers.Wallet(privateKey);
  console.log(`👛 Wallet address: ${wallet.address}\n`);

  // Create swap service
  const swapService = new PyusdSwapService();

  // Test 1: Get quote for ETH → PYUSD
  console.log('📊 Test 1: Get Quote for 0.001 ETH → PYUSD');
  console.log('─'.repeat(50));
  try {
    const quote = await swapService.getETHtoPYUSDQuote('0.001');
    console.log(`✅ Quote received: ${quote} PYUSD\n`);
  } catch (error) {
    console.error(`❌ Quote failed:`, error);
    console.log('');
  }

  // Test 2: Check balances before swap
  console.log('💰 Test 2: Check Balances');
  console.log('─'.repeat(50));
  const provider = new ethers.JsonRpcProvider('https://arb1.arbitrum.io/rpc');
  const connectedWallet = wallet.connect(provider);

  const ethBalance = await provider.getBalance(wallet.address);
  console.log(`ETH Balance: ${ethers.formatEther(ethBalance)} ETH`);

  const pyusdContract = new ethers.Contract(
    '0x6c3ea9036406852006290770BEdFcAbA0e23A0e8',
    ['function balanceOf(address) view returns (uint256)'],
    provider
  );
  const pyusdBalanceBefore = await pyusdContract.balanceOf(wallet.address);
  console.log(
    `PYUSD Balance (before): ${ethers.formatUnits(
      pyusdBalanceBefore,
      6
    )} PYUSD\n`
  );

  // Test 3: Execute swap (0.001 ETH → PYUSD)
  console.log('🔄 Test 3: Execute Swap (0.001 ETH → PYUSD)');
  console.log('─'.repeat(50));

  const SWAP_AMOUNT = '0.001'; // Small amount for testing

  // Ask for confirmation
  console.log(`⚠️  About to swap ${SWAP_AMOUNT} ETH to PYUSD`);
  console.log(`⚠️  This will cost gas + swap fees`);
  console.log(`⚠️  Press Ctrl+C to cancel, or wait 5 seconds to continue...\n`);

  await new Promise((resolve) => setTimeout(resolve, 5000));

  try {
    const txHash = await swapService.swapToPYUSD(wallet, 'ETH', SWAP_AMOUNT);
    console.log(`✅ Swap successful!`);
    console.log(`📋 Transaction: https://arbiscan.io/tx/${txHash}\n`);

    // Check balance after swap
    console.log('💰 Test 4: Check Balances After Swap');
    console.log('─'.repeat(50));

    const ethBalanceAfter = await provider.getBalance(wallet.address);
    console.log(`ETH Balance: ${ethers.formatEther(ethBalanceAfter)} ETH`);

    const pyusdBalanceAfter = await pyusdContract.balanceOf(wallet.address);
    console.log(
      `PYUSD Balance (after): ${ethers.formatUnits(pyusdBalanceAfter, 6)} PYUSD`
    );

    const pyusdReceived = pyusdBalanceAfter - pyusdBalanceBefore;
    console.log(`\n🎉 Received: ${ethers.formatUnits(pyusdReceived, 6)} PYUSD`);
  } catch (error: any) {
    console.error(`❌ Swap failed:`, error.message);
    if (error.transaction) {
      console.log('Transaction data:', error.transaction);
    }
  }
}

// Run test
testPyusdSwap().catch(console.error);
