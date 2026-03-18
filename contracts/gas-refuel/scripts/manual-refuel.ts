import { ethers } from 'hardhat';

async function main() {
  const contractAddress = '0xE4e5474E97E89d990082505fC5708A6a11849936';
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

    const minBal = await gasRefuel.minBalance();
    console.log(
      '  • minBalance required:',
      ethers.formatEther(minBal),
      'ETH'
    );
    console.log('  • User has:', ethers.formatEther(userBalanceBefore), 'ETH');
    console.log(
      '  • User balance < minBalance?',
      userBalanceBefore < minBal ? '✅ YES' : '❌ NO'
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
      ethers.formatEther(userBalanceAfter - userBalanceBefore),
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
