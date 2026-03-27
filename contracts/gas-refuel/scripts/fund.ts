import { ethers } from 'hardhat'

async function main() {
  const contractAddress = process.env.REFUEL_CONTRACT_ADDRESS
  const fundAmount = process.env.FUND_AMOUNT || '0.002'

  if (!contractAddress) {
    console.error('Set REFUEL_CONTRACT_ADDRESS in .env')
    process.exit(1)
  }

  console.log('Funding GasRefuelV2...\n')
  console.log('Contract:', contractAddress)
  console.log('Amount:', fundAmount, 'ETH')

  const [signer] = await ethers.getSigners()
  const balance = await ethers.provider.getBalance(signer.address)
  console.log('Signer balance:', ethers.formatEther(balance), 'ETH\n')

  const tx = await signer.sendTransaction({
    to: contractAddress,
    value: ethers.parseEther(fundAmount),
  })
  console.log('Transaction hash:', tx.hash)

  await tx.wait()
  console.log('Confirmed!')

  const contractBalance = await ethers.provider.getBalance(contractAddress)
  console.log('Contract balance:', ethers.formatEther(contractBalance), 'ETH')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
