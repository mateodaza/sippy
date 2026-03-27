import { ethers } from 'hardhat'

async function main() {
  const contractAddress = process.env.REFUEL_CONTRACT_ADDRESS

  if (!contractAddress) {
    console.error('Set REFUEL_CONTRACT_ADDRESS in .env')
    process.exit(1)
  }

  console.log('Updating GasRefuelV2 params...\n')
  console.log('Contract:', contractAddress)

  const GasRefuelV2 = await ethers.getContractFactory('GasRefuelV2')
  const gasRefuel = GasRefuelV2.attach(contractAddress)

  const curMin = await gasRefuel.minBalance()
  const curRefuel = await gasRefuel.refuelAmount()
  console.log('\nCurrent values:')
  console.log('  minBalance:', ethers.formatEther(curMin), 'ETH')
  console.log('  refuelAmount:', ethers.formatEther(curRefuel), 'ETH')

  const newMinBalance = ethers.parseEther('0.0005')
  const newRefuelAmount = ethers.parseEther('0.0005')

  console.log('\nNew values:')
  console.log('  minBalance:', ethers.formatEther(newMinBalance), 'ETH')
  console.log('  refuelAmount:', ethers.formatEther(newRefuelAmount), 'ETH')

  console.log('\nSetting minBalance...')
  const tx1 = await gasRefuel.setMinBalance(newMinBalance)
  console.log('  TX:', tx1.hash)
  await tx1.wait()
  console.log('  Confirmed')

  console.log('Setting refuelAmount...')
  const tx2 = await gasRefuel.setRefuelAmount(newRefuelAmount)
  console.log('  TX:', tx2.hash)
  await tx2.wait()
  console.log('  Confirmed')

  const updatedMin = await gasRefuel.minBalance()
  const updatedRefuel = await gasRefuel.refuelAmount()
  console.log('\nVerified:')
  console.log('  minBalance:', ethers.formatEther(updatedMin), 'ETH')
  console.log('  refuelAmount:', ethers.formatEther(updatedRefuel), 'ETH')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
