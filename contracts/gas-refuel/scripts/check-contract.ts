import { ethers } from 'hardhat'

async function main() {
  const contractAddress = process.env.REFUEL_CONTRACT_ADDRESS

  if (!contractAddress) {
    console.error('Set REFUEL_CONTRACT_ADDRESS in .env')
    process.exit(1)
  }

  console.log('Checking GasRefuelV2 at:', contractAddress, '\n')

  const GasRefuelV2 = await ethers.getContractFactory('GasRefuelV2')
  const gasRefuel = GasRefuelV2.attach(contractAddress)

  try {
    const owner = await gasRefuel.owner()
    const paused = await gasRefuel.paused()
    const balance = await gasRefuel.contractBalance()
    const allowlistCount = await gasRefuel.allowlistCount()

    console.log('Status:')
    console.log('  Owner:', owner)
    console.log('  Paused:', paused)
    console.log('  Balance:', ethers.formatEther(balance), 'ETH')
    console.log('  Allowlisted wallets:', allowlistCount.toString())
    console.log('')

    const minBalance = await gasRefuel.minBalance()
    const refuelAmount = await gasRefuel.refuelAmount()
    const maxDaily = await gasRefuel.maxDailyRefuels()
    const cooldown = await gasRefuel.refuelCooldown()

    console.log('Configuration:')
    console.log('  minBalance:', ethers.formatEther(minBalance), 'ETH')
    console.log('  refuelAmount:', ethers.formatEther(refuelAmount), 'ETH')
    console.log('  maxDailyRefuels:', maxDaily.toString())
    console.log('  refuelCooldown:', cooldown.toString(), 'seconds')
    console.log('')

    const balanceNum = Number(ethers.formatEther(balance))
    const refuelNum = Number(ethers.formatEther(refuelAmount))
    const capacity = refuelNum > 0 ? Math.floor(balanceNum / refuelNum) : 0

    console.log('Capacity:', capacity, 'refuels remaining')

    if (paused) console.log('\nWARNING: Contract is PAUSED.')
    if (balanceNum < 0.001) console.log('\nWARNING: Low balance.')
    if (Number(allowlistCount) === 0)
      console.log('\nWARNING: Allowlist is empty. Run migrate-allowlist.ts.')
  } catch (error: any) {
    console.error('Error:', error.message)
    process.exit(1)
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
