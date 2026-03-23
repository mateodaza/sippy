import { ethers } from 'hardhat'

/**
 * Update GasRefuel contract parameters.
 *
 * The createSpendPermission UserOp costs ~0.0005 ETH on Arbitrum,
 * so both minBalance and refuelAmount need to be high enough to cover that.
 */
async function main() {
  const contractAddress = '0xE4e5474E97E89d990082505fC5708A6a11849936'

  console.log('Updating GasRefuel params...\n')
  console.log('Contract:', contractAddress)

  const GasRefuel = await ethers.getContractFactory('GasRefuel')
  const gasRefuel = GasRefuel.attach(contractAddress)

  // Show current values
  const curMin = await gasRefuel.minBalance()
  const curRefuel = await gasRefuel.refuelAmount()
  console.log('\nCurrent values:')
  console.log('  minBalance:', ethers.formatEther(curMin), 'ETH')
  console.log('  refuelAmount:', ethers.formatEther(curRefuel), 'ETH')

  // New values: 0.0005 ETH min, 0.001 ETH refuel (covers ~2 UserOps)
  const newMinBalance = ethers.parseEther('0.0005')
  const newRefuelAmount = ethers.parseEther('0.001')

  console.log('\nNew values:')
  console.log('  minBalance:', ethers.formatEther(newMinBalance), 'ETH')
  console.log('  refuelAmount:', ethers.formatEther(newRefuelAmount), 'ETH')

  // Update minBalance
  console.log('\nSetting minBalance...')
  const tx1 = await gasRefuel.setMinBalance(newMinBalance)
  console.log('  TX:', tx1.hash)
  await tx1.wait()
  console.log('  Confirmed')

  // Update refuelAmount
  console.log('Setting refuelAmount...')
  const tx2 = await gasRefuel.setRefuelAmount(newRefuelAmount)
  console.log('  TX:', tx2.hash)
  await tx2.wait()
  console.log('  Confirmed')

  // Verify
  const updatedMin = await gasRefuel.minBalance()
  const updatedRefuel = await gasRefuel.refuelAmount()
  console.log('\nVerified:')
  console.log('  minBalance:', ethers.formatEther(updatedMin), 'ETH')
  console.log('  refuelAmount:', ethers.formatEther(updatedRefuel), 'ETH')
  console.log('\nDone!')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
