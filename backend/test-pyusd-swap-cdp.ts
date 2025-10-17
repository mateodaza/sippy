/**
 * Test PYUSD swap using CDP wallet
 * 
 * This script:
 * 1. Gets the CDP wallet for phone "57"
 * 2. Exports private key from CDP
 * 3. Uses PyusdSwapService to swap ETH → PYUSD
 * 
 * Usage:
 *   npx tsx test-pyusd-swap-cdp.ts
 */

import { ethers } from 'ethers';
import { PyusdSwapService } from './src/services/pyusd-swap.service';
import { promises as fs } from 'fs';
import path from 'path';

async function swapWithCDPWallet() {
  console.log('🔄 PYUSD Swap with CDP Wallet\n');

  // Load wallet data
  const WALLET_STORAGE_PATH = path.join(process.cwd(), 'wallets.json');
  const walletsData = JSON.parse(await fs.readFile(WALLET_STORAGE_PATH, 'utf8'));
  
  const phoneNumber = '57';
  const walletData = walletsData[phoneNumber];
  
  if (!walletData) {
    throw new Error(`Wallet for phone ${phoneNumber} not found`);
  }

  console.log('📱 Wallet Info:');
  console.log(`   Phone: ${walletData.phoneNumber}`);
  console.log(`   Address: ${walletData.walletAddress}`);
  console.log(`   CDP Wallet ID: ${walletData.cdpWalletId}\n`);

  // For CDP wallets, we need to export the private key
  // This requires using the CDP SDK
  console.log('⚠️  CDP Wallet Limitation:');
  console.log('   CDP wallets use MPC (Multi-Party Computation)');
  console.log('   They don\'t expose private keys directly');
  console.log('   We need to use CDP SDK to sign transactions\n');

  // Alternative approach: Use CDP SDK to interact with smart contracts
  console.log('💡 Alternative Approaches:\n');
  console.log('1. **Use CDP SDK directly for swaps**');
  console.log('   - CDP can call smart contracts');
  console.log('   - We\'d need to adapt PyusdSwapService to work with CDP\n');
  
  console.log('2. **Transfer ETH to a regular wallet first**');
  console.log('   - Send ETH from CDP wallet to a test wallet');
  console.log('   - Use that wallet for the swap');
  console.log('   - Send PYUSD back to CDP wallet\n');

  console.log('3. **Export CDP wallet seed (if available)**');
  console.log('   - Check if CDP provides seed phrase export');
  console.log('   - Derive private key from seed\n');

  // Let's try approach 2: Check ETH balance
  const provider = new ethers.providers.JsonRpcProvider('https://arb1.arbitrum.io/rpc');
  
  console.log('💰 Checking CDP Wallet Balance on Arbitrum:');
  console.log('─'.repeat(50));
  
  const ethBalance = await provider.getBalance(walletData.walletAddress);
  console.log(`ETH Balance: ${ethers.utils.formatEther(ethBalance)} ETH`);
  
  const pyusdContract = new ethers.Contract(
    '0x6c3ea9036406852006290770BEdFcAbA0e23A0e8',
    ['function balanceOf(address) view returns (uint256)'],
    provider
  );
  const pyusdBalance = await pyusdContract.balanceOf(walletData.walletAddress);
  console.log(`PYUSD Balance: ${ethers.utils.formatUnits(pyusdBalance, 6)} PYUSD\n`);

  if (parseFloat(ethers.utils.formatEther(ethBalance)) < 0.0001) {
    console.log('❌ Not enough ETH in CDP wallet');
    console.log('   The test transfer might not have arrived yet');
    console.log('   Check Arbiscan: https://arbiscan.io/address/' + walletData.walletAddress);
    return;
  }

  console.log('✅ CDP wallet has ETH!');
  console.log('\n📋 Next Steps:');
  console.log('1. We need to integrate CDP SDK with Uniswap swap');
  console.log('2. Or create a helper wallet for swaps');
  console.log('3. For now, let\'s verify the CDP wallet can send transactions\n');

  // Try to get CDP wallet details
  try {
    console.log('🔍 Attempting to load CDP wallet from storage...');
    
    // CDP wallets are stored in ~/.coinbase
    const cdpWalletPath = path.join(
      process.env.HOME || '',
      '.coinbase',
      'wallets',
      walletData.cdpWalletId
    );
    
    console.log(`   Looking for: ${cdpWalletPath}`);
    
    // Check if wallet data exists
    try {
      await fs.access(cdpWalletPath);
      console.log('   ✅ CDP wallet data found!');
      console.log('   We can potentially use this to sign transactions');
    } catch {
      console.log('   ❌ CDP wallet data not found in expected location');
      console.log('   May need to use CDP API for signing');
    }
    
  } catch (error: any) {
    console.log('   ⚠️  Could not access CDP wallet data');
  }

  console.log('\n🎯 Recommendation:');
  console.log('For testing, use a regular wallet with private key');
  console.log('For production, we\'ll need to integrate CDP SDK with Uniswap\n');
}

// Run
swapWithCDPWallet().catch((error) => {
  console.error('\n💥 Error:', error.message);
  process.exit(1);
});

