/**
 * Simple PYUSD swap test with a fresh test wallet
 * 
 * This script creates a temporary test wallet, shows you how to fund it,
 * and then performs the ETH → PYUSD swap.
 * 
 * Usage:
 *   npx tsx test-pyusd-simple.ts
 */

import { ethers } from 'ethers';
import { PyusdSwapService } from './src/services/pyusd-swap.service';

async function simpleSwapTest() {
  console.log('🧪 Simple PYUSD Swap Test\n');
  console.log('This will:');
  console.log('1. Create a temporary test wallet');
  console.log('2. Show you the address to send ETH to');
  console.log('3. Wait for ETH to arrive on Arbitrum');
  console.log('4. Swap ETH → PYUSD\n');
  console.log('─'.repeat(60));

  // Create a random test wallet
  const testWallet = ethers.Wallet.createRandom();
  console.log('\n🔑 Test Wallet Created:');
  console.log(`   Address: ${testWallet.address}`);
  console.log(`   Private Key: ${testWallet.privateKey}`);
  console.log(`   ⚠️  Save this private key if you want to check results later!\n`);

  // Connect to Arbitrum
  const provider = new ethers.providers.JsonRpcProvider('https://arb1.arbitrum.io/rpc');
  const connectedWallet = testWallet.connect(provider);

  console.log('📋 Next Steps:');
  console.log('─'.repeat(60));
  console.log(`1. Send some ETH to this address on Arbitrum:`);
  console.log(`   ${testWallet.address}\n`);
  console.log(`2. You can:`);
  console.log(`   a) Use the CDP wallet to send: "57" → this address`);
  console.log(`   b) Use the frontend test button again`);
  console.log(`   c) Use any other wallet to send to Arbitrum\n`);
  console.log(`3. Recommended amount: 0.002-0.003 ETH`);
  console.log(`   (0.001 for swap + 0.001-0.002 for gas)\n`);

  // Wait for funds
  console.log('⏳ Waiting for ETH to arrive...');
  console.log('   (Press Ctrl+C to cancel and try again later)\n');

  let ethBalance = ethers.BigNumber.from(0);
  let attempts = 0;
  const maxAttempts = 120; // 10 minutes max

  while (ethBalance.isZero() && attempts < maxAttempts) {
    ethBalance = await provider.getBalance(testWallet.address);
    
    if (ethBalance.isZero()) {
      attempts++;
      process.stdout.write(`\r   Checking... (${attempts}/${maxAttempts}) - Still waiting for ETH`);
      await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5 seconds
    }
  }

  if (ethBalance.isZero()) {
    console.log('\n\n❌ No ETH received after 10 minutes');
    console.log('   Please send ETH and run the script again');
    console.log(`   npx tsx test-pyusd-simple.ts\n`);
    return;
  }

  console.log(`\n\n✅ ETH received: ${ethers.utils.formatEther(ethBalance)} ETH\n`);

  // Check PYUSD balance before
  const pyusdContract = new ethers.Contract(
    '0x6c3ea9036406852006290770BEdFcAbA0e23A0e8',
    ['function balanceOf(address) view returns (uint256)'],
    provider
  );
  const pyusdBefore = await pyusdContract.balanceOf(testWallet.address);
  console.log(`PYUSD Balance (before): ${ethers.utils.formatUnits(pyusdBefore, 6)} PYUSD`);

  // Calculate swap amount (leave some for gas)
  const gasReserve = ethers.utils.parseEther('0.002'); // Reserve 0.002 ETH for gas
  const swapAmount = ethBalance.sub(gasReserve);

  if (swapAmount.lte(0)) {
    console.log('\n❌ Not enough ETH for swap after gas reserve');
    console.log('   Please send more ETH (at least 0.003 ETH recommended)');
    return;
  }

  const swapAmountFormatted = ethers.utils.formatEther(swapAmount);
  console.log(`\n🔄 Will swap: ${swapAmountFormatted} ETH → PYUSD`);
  console.log(`   (Keeping ${ethers.utils.formatEther(gasReserve)} ETH for gas)\n`);

  // Confirm
  console.log('⚠️  About to execute swap');
  console.log('⚠️  Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Execute swap
  console.log('🚀 Executing swap...\n');
  const swapService = new PyusdSwapService();

  try {
    const txHash = await swapService.swapToPYUSD(
      connectedWallet,
      'ETH',
      swapAmountFormatted
    );

    console.log('\n✅ Swap completed!');
    console.log(`📋 Transaction: https://arbiscan.io/tx/${txHash}\n`);

    // Check PYUSD balance after
    const pyusdAfter = await pyusdContract.balanceOf(testWallet.address);
    const pyusdReceived = pyusdAfter.sub(pyusdBefore);
    
    console.log('💰 Final Balances:');
    console.log('─'.repeat(60));
    const ethAfter = await provider.getBalance(testWallet.address);
    console.log(`ETH Balance: ${ethers.utils.formatEther(ethAfter)} ETH`);
    console.log(`PYUSD Balance: ${ethers.utils.formatUnits(pyusdAfter, 6)} PYUSD`);
    console.log(`\n🎉 Received: ${ethers.utils.formatUnits(pyusdReceived, 6)} PYUSD`);
    
    console.log('\n✅ SUCCESS! The swap worked!');
    console.log(`\n📍 Check your wallet:`);
    console.log(`   https://arbiscan.io/address/${testWallet.address}`);
    console.log(`\n🔑 Wallet private key (if you need it):`);
    console.log(`   ${testWallet.privateKey}\n`);

  } catch (error: any) {
    console.error('\n❌ Swap failed:', error.message);
    throw error;
  }
}

// Run
simpleSwapTest().catch((error) => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});

