/**
 * Manual test to swap ETH → PYUSD on Arbitrum
 * Use this after sending ETH via the frontend test button
 *
 * Usage:
 *   npx tsx test-pyusd-swap-manual.ts <wallet_address> <amount_eth>
 *
 * Example:
 *   npx tsx test-pyusd-swap-manual.ts 0x8942B30ef2A8EE36802E112e1be0Dd6f42bEB0a1 0.001
 */

import { ethers } from 'ethers';
import { PyusdSwapService } from './src/services/pyusd-swap.service';
import * as dotenv from 'dotenv';

dotenv.config();

async function manualSwap() {
  // Get arguments
  const walletAddress =
    process.argv[2] || '0x8942B30ef2A8EE36802E112e1be0Dd6f42bEB0a1';
  const amountETH = process.argv[3] || '0.001';

  console.log('🔄 Manual PYUSD Swap\n');
  console.log(`Wallet: ${walletAddress}`);
  console.log(`Amount: ${amountETH} ETH\n`);

  // Get private key from wallet that has the ETH
  // For this demo, we'll use a test private key
  // In production, this would come from the phone number → wallet mapping
  const privateKey = process.env.TEST_WALLET_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('TEST_WALLET_PRIVATE_KEY not found in .env');
  }

  const wallet = new ethers.Wallet(privateKey);

  if (wallet.address.toLowerCase() !== walletAddress.toLowerCase()) {
    console.log(
      '⚠️  Warning: Private key does not match the target wallet address'
    );
    console.log(`   Private key wallet: ${wallet.address}`);
    console.log(`   Target wallet: ${walletAddress}`);
    console.log(
      '   Make sure you have the correct private key for the recipient wallet\n'
    );
  }

  // Connect to Arbitrum
  const provider = new ethers.JsonRpcProvider('https://arb1.arbitrum.io/rpc');
  const connectedWallet = wallet.connect(provider);

  // Check balances before
  console.log('💰 Step 1: Check Balances Before Swap');
  console.log('─'.repeat(50));

  const ethBalance = await provider.getBalance(wallet.address);
  console.log(`ETH Balance: ${ethers.formatEther(ethBalance)} ETH`);

  const pyusdContract = new ethers.Contract(
    '0x6c3ea9036406852006290770BEdFcAbA0e23A0e8',
    ['function balanceOf(address) view returns (uint256)'],
    provider
  );
  const pyusdBalanceBefore = await pyusdContract.balanceOf(wallet.address);
  console.log(
    `PYUSD Balance: ${ethers.formatUnits(pyusdBalanceBefore, 6)} PYUSD\n`
  );

  // Get quote
  console.log('📊 Step 2: Get Swap Quote');
  console.log('─'.repeat(50));

  const swapService = new PyusdSwapService();

  try {
    const quote = await swapService.getETHtoPYUSDQuote(amountETH);
    console.log(`✅ Expected to receive: ~${quote} PYUSD\n`);
  } catch (error) {
    console.log('⚠️  Could not get quote, but will try swap anyway\n');
  }

  // Confirm
  console.log('🔄 Step 3: Execute Swap');
  console.log('─'.repeat(50));
  console.log(`⚠️  About to swap ${amountETH} ETH → PYUSD`);
  console.log(`⚠️  This will cost gas (~$0.50-1.00)`);
  console.log(`⚠️  Press Ctrl+C to cancel, or wait 5 seconds to continue...\n`);

  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Execute swap
  try {
    console.log('🚀 Executing swap...\n');

    const txHash = await swapService.swapToPYUSD(
      connectedWallet,
      'ETH',
      amountETH
    );

    console.log('\n✅ Swap completed successfully!');
    console.log(`📋 Transaction: https://arbiscan.io/tx/${txHash}\n`);

    // Check balances after
    console.log('💰 Step 4: Check Balances After Swap');
    console.log('─'.repeat(50));

    const ethBalanceAfter = await provider.getBalance(wallet.address);
    console.log(`ETH Balance: ${ethers.formatEther(ethBalanceAfter)} ETH`);

    const pyusdBalanceAfter = await pyusdContract.balanceOf(wallet.address);
    console.log(
      `PYUSD Balance: ${ethers.formatUnits(pyusdBalanceAfter, 6)} PYUSD`
    );

    const pyusdReceived = pyusdBalanceAfter - pyusdBalanceBefore;
    console.log(`\n🎉 Received: ${ethers.formatUnits(pyusdReceived, 6)} PYUSD`);
    console.log(`\n✅ Success! Check your wallet on Arbiscan:`);
    console.log(`   https://arbiscan.io/address/${wallet.address}`);
  } catch (error: any) {
    console.error('\n❌ Swap failed:', error.message);

    if (error.code === 'INSUFFICIENT_FUNDS') {
      console.log('\n💡 Tip: Make sure you have enough ETH on Arbitrum for:');
      console.log('   1. The swap amount (0.001 ETH)');
      console.log('   2. Gas fees (~0.001-0.002 ETH)');
    }

    if (error.message?.includes('TRANSFER_FROM_FAILED')) {
      console.log('\n💡 Tip: This might be a token approval issue.');
      console.log('   The swap service should handle approvals automatically.');
    }

    throw error;
  }
}

// Run
manualSwap().catch((error) => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});
