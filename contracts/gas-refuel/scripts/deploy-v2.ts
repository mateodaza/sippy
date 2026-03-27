import { ethers } from 'hardhat'

async function main() {
  console.log('Deploying GasRefuelV2 contract to Arbitrum mainnet...\n')

  const [deployer] = await ethers.getSigners()
  const balance = await ethers.provider.getBalance(deployer.address)

  console.log('Deploying from:', deployer.address)
  console.log('Account balance:', ethers.formatEther(balance), 'ETH\n')

  const GasRefuelV2 = await ethers.getContractFactory('GasRefuelV2')
  const gasRefuelV2 = await GasRefuelV2.deploy()

  await gasRefuelV2.waitForDeployment()
  const address = await gasRefuelV2.getAddress()
  const deployBlock = await ethers.provider.getBlockNumber()

  console.log('GasRefuelV2 deployed to:', address)
  console.log('Deployed at block:', deployBlock)
  console.log('Owner:', await gasRefuelV2.owner())
  console.log('Paused:', await gasRefuelV2.paused())
  console.log('\nContract details (configurable):')
  console.log('  minBalance:', ethers.formatEther(await gasRefuelV2.minBalance()), 'ETH')
  console.log('  refuelAmount:', ethers.formatEther(await gasRefuelV2.refuelAmount()), 'ETH')
  console.log('  maxDailyRefuels:', (await gasRefuelV2.maxDailyRefuels()).toString())
  console.log('  refuelCooldown:', (await gasRefuelV2.refuelCooldown()).toString(), 'seconds')
  console.log('  allowlistCount:', (await gasRefuelV2.allowlistCount()).toString())

  console.log('\nArbiscan verification:')
  console.log('  npx hardhat verify --network arbitrum', address)

  console.log('\nNEXT STEPS:')
  console.log('  1. Verify contract on Arbiscan')
  console.log('  2. Run migrate-allowlist.ts to seed existing wallets')
  console.log('  3. Send ETH to contract:', address)
  console.log('  4. Unpause contract: gasRefuelV2.unpause()')
  console.log('  5. Update backend .env:')
  console.log('     REFUEL_CONTRACT_ADDRESS=' + address)
  console.log('     ALCHEMY_CUTOVER_BLOCK=' + deployBlock)
  console.log("  6. Reset poller cursor: DELETE FROM onchain.poller_cursor WHERE id = 'gas_refuel'")
  console.log('  7. Restart backend')
  console.log(
    '  8. Withdraw remaining ETH from old contract (0xE4e5474E97E89d990082505fC5708A6a11849936)'
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
