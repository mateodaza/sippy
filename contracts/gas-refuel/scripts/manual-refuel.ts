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
      'Usage: npx hardhat run scripts/manual-refuel.ts --network arbitrum -- <user_address>'
    )
    console.error('Or set REFUEL_USER_ADDRESS in .env')
    process.exit(1)
  }

  console.log('Manual Refuel\n')
  console.log('Contract:', contractAddress)
  console.log('User:', userAddress, '\n')

  const GasRefuelV2 = await ethers.getContractFactory('GasRefuelV2')
  const gasRefuel = GasRefuelV2.attach(contractAddress)

  const userBalanceBefore = await ethers.provider.getBalance(userAddress)
  const contractBalance = await gasRefuel.contractBalance()
  const canRefuel = await gasRefuel.canRefuel(userAddress)
  const isAllowlisted = await gasRefuel.allowlisted(userAddress)

  console.log('Before:')
  console.log('  User Balance:', ethers.formatEther(userBalanceBefore), 'ETH')
  console.log('  Contract Balance:', ethers.formatEther(contractBalance), 'ETH')
  console.log('  Allowlisted:', isAllowlisted)
  console.log('  Can Refuel:', canRefuel, '\n')

  if (!isAllowlisted) {
    console.log('User not allowlisted. Adding...')
    const tx = await gasRefuel.addToAllowlist(userAddress)
    await tx.wait()
    console.log('Allowlisted. TX:', tx.hash, '\n')
  }

  if (!(await gasRefuel.canRefuel(userAddress))) {
    console.log('User cannot be refueled. Check balance/cooldown/daily limit.')
    return
  }

  console.log('Attempting refuel...')
  try {
    const tx = await gasRefuel.refuel(userAddress)
    console.log('  TX:', tx.hash)
    const receipt = await tx.wait()
    console.log('  Gas used:', receipt.gasUsed.toString())

    const userBalanceAfter = await ethers.provider.getBalance(userAddress)
    console.log('\nRefueled!')
    console.log('  User balance after:', ethers.formatEther(userBalanceAfter), 'ETH')
  } catch (error: any) {
    console.log('\nRefuel failed:', error.reason || error.message)
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
