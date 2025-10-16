import { ethers } from 'hardhat';

async function main() {
  const contractAddress = '0xC8367a549e05D9184B8e320856cb9A10FDc1DE46';
  const userAddress = '0x5Aa5B05d77C45E00C023ff90a7dB2c9FBD9bcde4';

  console.log('⛽ Manual Refuel Test\n');
  console.log('Contract:', contractAddress);
  console.log('User:', userAddress);
  console.log('');

  const GasRefuel = await ethers.getContractFactory('GasRefuel');
  const gasRefuel = GasRefuel.attach(contractAddress);

  // Check status before
  console.log('📊 Before Refuel:');
  const userBalanceBefore = await ethers.provider.getBalance(userAddress);
  const contractBalanceBefore = await gasRefuel.contractBalance();
  const canRefuel = await gasRefuel.canRefuel(userAddress);
  const isPaused = await gasRefuel.paused();

  console.log(
    '  • User Balance:',
    ethers.formatEther(userBalanceBefore),
    'ETH'
  );
  console.log(
    '  • Contract Balance:',
    ethers.formatEther(contractBalanceBefore),
    'ETH'
  );
  console.log('  • Can Refuel:', canRefuel ? '✅ YES' : '❌ NO');
  console.log('  • Contract Paused:', isPaused ? '⏸️  YES' : '▶️  NO');
  console.log('');

  if (!canRefuel) {
    console.log('❌ User cannot be refueled. Checking why...\n');

    const MIN_BALANCE = await gasRefuel.MIN_BALANCE();
    console.log(
      '  • MIN_BALANCE required:',
      ethers.formatEther(MIN_BALANCE),
      'ETH'
    );
    console.log('  • User has:', ethers.formatEther(userBalanceBefore), 'ETH');
    console.log(
      '  • User balance < MIN_BALANCE?',
      userBalanceBefore.lt(MIN_BALANCE) ? '✅ YES' : '❌ NO'
    );

    return;
  }

  // Try to refuel
  console.log('⏳ Attempting refuel...');
  try {
    const tx = await gasRefuel.refuel(userAddress);
    console.log('  • TX sent:', tx.hash);

    const receipt = await tx.wait();
    console.log('  • TX confirmed!');
    console.log('  • Gas used:', receipt.gasUsed.toString());

    // Check balance after
    const userBalanceAfter = await ethers.provider.getBalance(userAddress);
    console.log('\n✅ Refuel successful!');
    console.log(
      '  • User balance after:',
      ethers.formatEther(userBalanceAfter),
      'ETH'
    );
    console.log(
      '  • Difference:',
      ethers.formatEther(userBalanceAfter.sub(userBalanceBefore)),
      'ETH'
    );
  } catch (error: any) {
    console.log('\n❌ Refuel failed!');
    console.log('  • Error:', error.message);

    if (error.reason) {
      console.log('  • Reason:', error.reason);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
