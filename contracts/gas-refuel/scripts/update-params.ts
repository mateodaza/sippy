/**
 * Update GasRefuel admin params (minBalance / refuelAmount).
 *
 * SAFETY-FIRST DESIGN — this script previously hardcoded both new values
 * to 0.0005 ETH which would silently undo a deliberate drip reduction.
 * Now:
 *   1. Reads current on-chain values and prints them.
 *   2. Requires explicit env vars for any new value (omitted = no change
 *      to that param).
 *   3. Refuses to send unless `CONFIRM=yes` is set in env.
 *
 * Compatible with both V1 (`0xE4e5...4936`, currently deployed) and V2
 * (when it ships) — both contracts share the same `setMinBalance(uint256)`
 * / `setRefuelAmount(uint256)` signatures. We attach via a minimal ABI so
 * we don't depend on a specific compiled contract being present in the
 * hardhat artifact cache.
 *
 * Usage:
 *   # Inspect current values (dry-run, default):
 *   REFUEL_CONTRACT_ADDRESS=0xE4e5... pnpm hardhat run scripts/update-params.ts --network arbitrum
 *
 *   # Set refuelAmount only, leave minBalance alone:
 *   NEW_REFUEL_AMOUNT_ETH=0.00005 CONFIRM=yes \
 *     pnpm hardhat run scripts/update-params.ts --network arbitrum
 *
 *   # Set both:
 *   NEW_MIN_BALANCE_ETH=0.00005 NEW_REFUEL_AMOUNT_ETH=0.00005 CONFIRM=yes \
 *     pnpm hardhat run scripts/update-params.ts --network arbitrum
 */

import { ethers } from 'hardhat'

const ABI = [
  'function minBalance() view returns (uint256)',
  'function refuelAmount() view returns (uint256)',
  'function setMinBalance(uint256)',
  'function setRefuelAmount(uint256)',
]

async function main() {
  const contractAddress = process.env.REFUEL_CONTRACT_ADDRESS
  if (!contractAddress) {
    console.error('Set REFUEL_CONTRACT_ADDRESS in .env')
    process.exit(1)
  }

  const [signer] = await ethers.getSigners()
  const c = new ethers.Contract(contractAddress, ABI, signer)

  console.log('GasRefuel params:')
  console.log('  contract:', contractAddress)
  console.log('  signer:  ', signer.address)
  console.log('')

  const curMin = await c.minBalance()
  const curRefuel = await c.refuelAmount()
  console.log('Current values:')
  console.log('  minBalance:  ', ethers.formatEther(curMin), 'ETH')
  console.log('  refuelAmount:', ethers.formatEther(curRefuel), 'ETH')
  console.log('')

  const newMinEnv = process.env.NEW_MIN_BALANCE_ETH
  const newRefuelEnv = process.env.NEW_REFUEL_AMOUNT_ETH
  if (!newMinEnv && !newRefuelEnv) {
    console.log('Dry-run: no NEW_MIN_BALANCE_ETH or NEW_REFUEL_AMOUNT_ETH set. Nothing to do.')
    console.log('')
    console.log('To change a param, set the matching env var (in ETH) and rerun with CONFIRM=yes:')
    console.log('  NEW_MIN_BALANCE_ETH=0.00005 NEW_REFUEL_AMOUNT_ETH=0.00005 CONFIRM=yes …')
    return
  }

  // Pre-flight: print intended changes so a human can sanity-check.
  console.log('Planned changes:')
  const planned: Array<{ name: string; method: string; oldWei: bigint; newWei: bigint }> = []
  if (newMinEnv) {
    const newWei = ethers.parseEther(newMinEnv)
    planned.push({ name: 'minBalance', method: 'setMinBalance', oldWei: curMin, newWei })
    console.log(`  minBalance:   ${ethers.formatEther(curMin)} → ${ethers.formatEther(newWei)} ETH`)
  }
  if (newRefuelEnv) {
    const newWei = ethers.parseEther(newRefuelEnv)
    planned.push({ name: 'refuelAmount', method: 'setRefuelAmount', oldWei: curRefuel, newWei })
    console.log(
      `  refuelAmount: ${ethers.formatEther(curRefuel)} → ${ethers.formatEther(newWei)} ETH`
    )
  }
  console.log('')

  // Invariant guard: the live operating invariant is
  //   backend GAS_MIN_BALANCE_ETH ≤ on-chain refuelAmount ≤ on-chain minBalance
  //
  // Violating either bound breaks onboarding:
  //  - refuelAmount < GAS_MIN_BALANCE_ETH → single refuel doesn't satisfy
  //    backend ready-check → frontend retries → contract cooldown error
  //  - minBalance < GAS_MIN_BALANCE_ETH → contract refuses to refuel
  //    users that the backend still considers "needs gas" → same loop
  const BACKEND_MIN_GAS = ethers.parseEther('0.00005')
  const finalRefuel = planned.find((p) => p.name === 'refuelAmount')?.newWei ?? curRefuel
  const finalMin = planned.find((p) => p.name === 'minBalance')?.newWei ?? curMin

  if (finalRefuel < BACKEND_MIN_GAS) {
    console.error(
      `\nABORT: planned refuelAmount (${ethers.formatEther(finalRefuel)} ETH) is below the backend's GAS_MIN_BALANCE_ETH (${ethers.formatEther(BACKEND_MIN_GAS)} ETH). This would break onboarding. Update packages/shared/src/constants.ts first.`
    )
    process.exit(1)
  }
  if (finalMin < BACKEND_MIN_GAS) {
    console.error(
      `\nABORT: planned minBalance (${ethers.formatEther(finalMin)} ETH) is below the backend's GAS_MIN_BALANCE_ETH (${ethers.formatEther(BACKEND_MIN_GAS)} ETH). Contract would refuse refuels for users the backend thinks still need gas. Update packages/shared/src/constants.ts first.`
    )
    process.exit(1)
  }
  if (finalRefuel > finalMin) {
    // Operationally wasteful, not breaking: the contract would let users
    // refuel even after they're already above the trigger threshold, so
    // ETH leaks faster than necessary. Warn but allow.
    console.warn(
      `\nWARNING: refuelAmount (${ethers.formatEther(finalRefuel)} ETH) > minBalance (${ethers.formatEther(finalMin)} ETH). Users will land above the refuel-trigger threshold after each drip — wasteful but not breaking. Proceeding.`
    )
  }

  if (process.env.CONFIRM !== 'yes') {
    console.log('CONFIRM=yes not set — not sending. Re-run with CONFIRM=yes to apply.')
    return
  }

  for (const p of planned) {
    if (p.oldWei === p.newWei) {
      console.log(`Skipping ${p.method} (no change).`)
      continue
    }
    console.log(`Sending ${p.method}(${p.newWei})...`)
    const tx = await (
      c as unknown as Record<
        string,
        (...args: unknown[]) => Promise<{ hash: string; wait: () => Promise<unknown> }>
      >
    )[p.method](p.newWei)
    console.log(`  tx: ${tx.hash}`)
    await tx.wait()
    console.log('  confirmed')
  }
  console.log('')

  const postMin = await c.minBalance()
  const postRefuel = await c.refuelAmount()
  console.log('Verified post-state:')
  console.log('  minBalance:  ', ethers.formatEther(postMin), 'ETH')
  console.log('  refuelAmount:', ethers.formatEther(postRefuel), 'ETH')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
