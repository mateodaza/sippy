import { ethers } from 'hardhat'

async function main() {
  const contractAddress = process.env.REFUEL_CONTRACT_ADDRESS
  const userAddress = process.argv[2] || process.env.REFUEL_USER_ADDRESS

  if (!contractAddress) {
    console.error('Set REFUEL_CONTRACT_ADDRESS in .env')
    process.exit(1)
  }
  if (!userAddress) {
    console.error('Usage: npx hardhat run scripts/debug.ts --network arbitrum -- <user_address>')
    process.exit(1)
  }

  const GasRefuelV2 = await ethers.getContractFactory('GasRefuelV2')
  const gasRefuel = GasRefuelV2.attach(contractAddress)

  console.log('Contract:', contractAddress)
  console.log('User:', userAddress)

  console.log('\nContract state:')
  console.log('  paused:', await gasRefuel.paused())
  console.log(
    '  balance:',
    ethers.formatEther(await ethers.provider.getBalance(contractAddress)),
    'ETH'
  )
  console.log('  minBalance:', ethers.formatEther(await gasRefuel.minBalance()), 'ETH')
  console.log('  refuelAmount:', ethers.formatEther(await gasRefuel.refuelAmount()), 'ETH')
  console.log('  allowlistCount:', (await gasRefuel.allowlistCount()).toString())

  console.log('\nUser state:')
  console.log(
    '  balance:',
    ethers.formatEther(await ethers.provider.getBalance(userAddress)),
    'ETH'
  )
  console.log('  allowlisted:', await gasRefuel.allowlisted(userAddress))
  console.log('  canRefuel:', await gasRefuel.canRefuel(userAddress))
  console.log('  dailyRefuelCount:', (await gasRefuel.dailyRefuelCount(userAddress)).toString())
  console.log('  lastRefuelTime:', (await gasRefuel.lastRefuelTime(userAddress)).toString())

  console.log('\nTrying staticCall refuel...')
  try {
    await gasRefuel.refuel.staticCall(userAddress)
    console.log('staticCall succeeded -- refuel should work')
  } catch (error: any) {
    console.log('staticCall failed:', error.message)
  }
}

main().catch(console.error)
