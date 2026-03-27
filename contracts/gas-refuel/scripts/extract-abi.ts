import * as fs from 'fs'
import * as path from 'path'

async function main() {
  const artifactPath = path.join(
    __dirname,
    '../artifacts/contracts/GasRefuelV2.sol/GasRefuelV2.json'
  )

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'))
  const abi = artifact.abi

  console.log('GasRefuelV2 ABI:')
  console.log(JSON.stringify(abi, null, 2))

  const outputPath = path.join(__dirname, '../GasRefuelV2.abi.json')
  fs.writeFileSync(outputPath, JSON.stringify(abi, null, 2))
  console.log('\nABI saved to:', outputPath)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
