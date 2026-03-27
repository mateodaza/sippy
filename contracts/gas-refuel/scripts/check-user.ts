import { ethers } from 'hardhat'

async function main() {
  const contractAddress = process.env.REFUEL_CONTRACT_ADDRESS
  const userAddress = process.argv[2] || process.env.REFUEL_USER_ADDRESS

  if (!contractAddress) {
    console.error('Set REFUEL_CONTRACT_ADDRESS in .env')
    process.exit(1)
  }
  if (!userAddress) {
    console.error(
      'Usage: npx hardhat run scripts/check-user.ts --network arbitrum -- <user_address>'
    )
    process.exit(1)
  }

  console.log('Checking user refuel status\n')
  console.log('Contract:', contractAddress)
  console.log('User:', userAddress, '\n')

  const GasRefuelV2 = await ethers.getContractFactory('GasRefuelV2')
  const gasRefuel = GasRefuelV2.attach(contractAddress)

  const isAllowlisted = await gasRefuel.allowlisted(userAddress)
  const lastRefuelTime = await gasRefuel.lastRefuelTime(userAddress)
  const dailyRefuelCount = await gasRefuel.dailyRefuelCount(userAddress)
  const lastResetDay = await gasRefuel.lastResetDay(userAddress)
  const canRefuel = await gasRefuel.canRefuel(userAddress)
  const userBalance = await ethers.provider.getBalance(userAddress)

  console.log('User Status:')
  console.log('  ETH Balance:', ethers.formatEther(userBalance), 'ETH')
  console.log('  Allowlisted:', isAllowlisted)
  console.log('  Can Refuel:', canRefuel)
  console.log('  Daily Refuel Count:', dailyRefuelCount.toString())
  console.log(
    '  Last Refuel:',
    lastRefuelTime.toString(),
    Number(lastRefuelTime) > 0
      ? `(${new Date(Number(lastRefuelTime) * 1000).toLocaleString()})`
      : '(never)'
  )
  console.log('  Last Reset Day:', lastResetDay.toString())

  const cooldown = await gasRefuel.refuelCooldown()
  const currentTime = Math.floor(Date.now() / 1000)
  const cooldownEnd = Number(lastRefuelTime) + Number(cooldown)
  const timeUntil = cooldownEnd - currentTime

  if (timeUntil > 0) {
    console.log('\n  Cooldown remaining:', Math.floor(timeUntil / 60), 'minutes')
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
