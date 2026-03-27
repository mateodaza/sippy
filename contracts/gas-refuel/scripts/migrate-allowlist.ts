/**
 * Migrate existing Sippy wallet addresses into GasRefuelV2 allowlist.
 *
 * Usage:
 *   REFUEL_V2_ADDRESS=0x... DATABASE_URL=postgres://... \
 *   npx hardhat run scripts/migrate-allowlist.ts --network arbitrum
 *
 * Reads all wallet_address values from phone_registry and calls
 * batchAddToAllowlist in chunks of 100.
 */
import { ethers } from 'hardhat'
import pg from 'pg'

const BATCH_SIZE = 100

async function main() {
  const v2Address = process.env.REFUEL_V2_ADDRESS
  const dbUrl = process.env.DATABASE_URL

  if (!v2Address) {
    throw new Error('Set REFUEL_V2_ADDRESS to the deployed GasRefuelV2 address')
  }
  if (!dbUrl) {
    throw new Error('Set DATABASE_URL to the backend Postgres connection string')
  }

  // Fetch wallet addresses from phone_registry
  const client = new pg.Client({ connectionString: dbUrl })
  await client.connect()

  const result = await client.query(
    `SELECT DISTINCT wallet_address FROM phone_registry WHERE wallet_address IS NOT NULL`
  )
  await client.end()

  const addresses: string[] = result.rows
    .map((r: any) => r.wallet_address)
    .filter((a: string) => ethers.isAddress(a))

  console.log(`Found ${addresses.length} wallet addresses to allowlist\n`)

  if (addresses.length === 0) {
    console.log('Nothing to migrate.')
    return
  }

  // Connect to V2 contract
  const [deployer] = await ethers.getSigners()
  const GasRefuelV2 = await ethers.getContractFactory('GasRefuelV2')
  const contract = GasRefuelV2.attach(v2Address).connect(deployer)

  // Process in batches
  let total = 0
  for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
    const batch = addresses.slice(i, i + BATCH_SIZE)
    console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: adding ${batch.length} addresses...`)

    const tx = await contract.batchAddToAllowlist(batch)
    const receipt = await tx.wait()
    total += batch.length

    console.log(`  TX: ${receipt.hash}`)
    console.log(`  Progress: ${total}/${addresses.length}\n`)
  }

  const count = await contract.allowlistCount()
  console.log(`Migration complete. Allowlist count: ${count}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
