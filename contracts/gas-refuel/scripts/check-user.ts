import { ethers } from 'hardhat';

async function main() {
  const contractAddress = '0xC8367a549e05D9184B8e320856cb9A10FDc1DE46';
  const userAddress = '0x2DaB49B266f91D99eeF75072535FC6A86C73FCfF'; // Phone: 57356547372

  console.log('🔍 Checking user refuel status...\n');
  console.log('Contract:', contractAddress);
  console.log('User:', userAddress);
  console.log('');

  const GasRefuel = await ethers.getContractFactory('GasRefuel');
  const gasRefuel = GasRefuel.attach(contractAddress);

  // Check user data
  const lastRefuelTime = await gasRefuel.lastRefuelTime(userAddress);
  const dailyRefuelCount = await gasRefuel.dailyRefuelCount(userAddress);
  const lastResetDay = await gasRefuel.lastResetDay(userAddress);
  const canRefuel = await gasRefuel.canRefuel(userAddress);
  const userBalance = await ethers.provider.getBalance(userAddress);

  console.log('📊 User Status:');
  console.log('  • ETH Balance:', ethers.formatEther(userBalance), 'ETH');
  console.log(
    '  • Last Refuel Time:',
    lastRefuelTime.toString(),
    '(' + new Date(Number(lastRefuelTime) * 1000).toLocaleString() + ')'
  );
  console.log('  • Daily Refuel Count:', dailyRefuelCount.toString());
  console.log('  • Last Reset Day:', lastResetDay.toString());
  console.log('  • Can Refuel:', canRefuel ? '✅ YES' : '❌ NO');

  const currentTime = Math.floor(Date.now() / 1000);
  const cooldownEnd = Number(lastRefuelTime) + 3600; // 1 hour cooldown
  const timeUntilCooldown = cooldownEnd - currentTime;

  if (timeUntilCooldown > 0) {
    console.log('\n⏰ Cooldown Status:');
    console.log(
      '  • Time until cooldown ends:',
      Math.floor(timeUntilCooldown / 60),
      'minutes'
    );
    console.log(
      '  • Cooldown ends at:',
      new Date(cooldownEnd * 1000).toLocaleString()
    );
  }

  console.log('\n📋 Contract Constants:');
  const MIN_BALANCE = await gasRefuel.MIN_BALANCE();
  const REFUEL_AMOUNT = await gasRefuel.REFUEL_AMOUNT();
  const MAX_DAILY_REFUELS = await gasRefuel.MAX_DAILY_REFUELS();
  const REFUEL_COOLDOWN = await gasRefuel.REFUEL_COOLDOWN();

  console.log('  • MIN_BALANCE:', ethers.formatEther(MIN_BALANCE), 'ETH');
  console.log('  • REFUEL_AMOUNT:', ethers.formatEther(REFUEL_AMOUNT), 'ETH');
  console.log('  • MAX_DAILY_REFUELS:', MAX_DAILY_REFUELS.toString());
  console.log('  • REFUEL_COOLDOWN:', REFUEL_COOLDOWN.toString(), 'seconds');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
