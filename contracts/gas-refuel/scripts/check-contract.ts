import { ethers } from "hardhat";

async function main() {
  const contractAddress = process.env.REFUEL_CONTRACT_ADDRESS;

  if (!contractAddress) {
    console.error('❌ Please set REFUEL_CONTRACT_ADDRESS in .env');
    process.exit(1);
  }

  console.log('🔍 Checking GasRefuel contract at:', contractAddress);
  console.log('');

  const GasRefuel = await ethers.getContractFactory("GasRefuel");
  const gasRefuel = GasRefuel.attach(contractAddress);

  try {
    // Basic info
    console.log('📋 Contract Status:');
    const owner = await gasRefuel.owner();
    const paused = await gasRefuel.paused();
    const balance = await gasRefuel.contractBalance();

    console.log('  • Owner:', owner);
    console.log('  • Paused:', paused ? '⏸️  Yes' : '▶️  No');
    console.log('  • Balance:', ethers.formatEther(balance), 'ETH');
    console.log('');

    // Constants
    console.log('⚙️  Configuration:');
    const minBalance = await gasRefuel.MIN_BALANCE();
    const refuelAmount = await gasRefuel.REFUEL_AMOUNT();
    const maxDaily = await gasRefuel.MAX_DAILY_REFUELS();
    const cooldown = await gasRefuel.REFUEL_COOLDOWN();

    console.log('  • MIN_BALANCE:', ethers.formatEther(minBalance), 'ETH');
    console.log('  • REFUEL_AMOUNT:', ethers.formatEther(refuelAmount), 'ETH');
    console.log('  • MAX_DAILY_REFUELS:', maxDaily.toString());
    console.log('  • REFUEL_COOLDOWN:', cooldown.toString(), 'seconds');
    console.log('');

    // Estimate capacity
    const balanceNum = Number(ethers.formatEther(balance));
    const refuelNum = Number(ethers.formatEther(refuelAmount));
    const capacity = refuelNum > 0 ? Math.floor(balanceNum / refuelNum) : 0;

    console.log('📊 Capacity:');
    console.log('  • Refuels remaining:', capacity);
    console.log('  • Users serviceable:', capacity);
    console.log('');

    // Warnings
    if (paused) {
      console.log('⚠️  WARNING: Contract is PAUSED. Run unpause() to activate.');
    }

    if (balanceNum < 0.01) {
      console.log('⚠️  WARNING: Low balance. Consider adding more ETH.');
    }

    if (balanceNum === 0) {
      console.log('❌ ERROR: Contract has no ETH. Send ETH before unpausing.');
    }

    console.log('');
    console.log('✅ Contract check complete!');

  } catch (error: any) {
    console.error('❌ Error checking contract:', error.message);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

