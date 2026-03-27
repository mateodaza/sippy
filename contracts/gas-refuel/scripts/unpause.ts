import { ethers } from 'hardhat'

async function main() {
  const contractAddress = process.env.REFUEL_CONTRACT_ADDRESS

  if (!contractAddress) {
    console.error('Set REFUEL_CONTRACT_ADDRESS in .env')
    process.exit(1)
  }

  console.log('Unpausing GasRefuelV2...\n')
  console.log('Contract:', contractAddress)

  const GasRefuelV2 = await ethers.getContractFactory('GasRefuelV2')
  const gasRefuel = GasRefuelV2.attach(contractAddress)

  const isPaused = await gasRefuel.paused()
  console.log('Current status: Paused =', isPaused)

  if (!isPaused) {
    console.log('Contract is already unpaused.')
    return
  }

  console.log('\nSending unpause transaction...')
  const tx = await gasRefuel.unpause()
  console.log('Transaction hash:', tx.hash)

  await tx.wait()
  console.log('Transaction confirmed!')

  const newStatus = await gasRefuel.paused()
  console.log('New status: Paused =', newStatus)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
