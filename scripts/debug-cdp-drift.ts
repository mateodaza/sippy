/**
 * Test server-side transfer from old smart account to new one
 *
 * Run: npx tsx --env-file=apps/backend/.env scripts/debug-cdp-drift.ts
 * Add --transfer to execute 1 USDC test transfer
 */
import { CdpClient } from '@coinbase/cdp-sdk'
import { ethers } from 'ethers'

const DO_TRANSFER = process.argv.includes('--transfer')
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
const USDC_DECIMALS = 6

async function main() {
  const cdp = new CdpClient()

  // Find drifted users
  console.log('=== Finding drifted users ===\n')
  let page = await cdp.endUser.listEndUsers({ pageSize: 50 })
  const allUsers = [...(page.endUsers ?? [])]
  while (page.nextPageToken) {
    page = await cdp.endUser.listEndUsers({ pageSize: 50, pageToken: page.nextPageToken })
    allUsers.push(...(page.endUsers ?? []))
  }

  const byPhone = new Map<string, any[]>()
  for (const u of allUsers) {
    for (const m of u.authenticationMethods ?? []) {
      const phone = m.phoneNumber || m.sub
      if (phone) {
        if (!byPhone.has(phone)) byPhone.set(phone, [])
        byPhone.get(phone)!.push({ ...u, authType: m.type })
      }
    }
  }

  for (const [phone, users] of byPhone) {
    if (users.length > 1) {
      console.log(`DRIFT: ${phone}`)
      for (const u of users) {
        console.log(
          `  ${u.authType}: Smart=${u.evmSmartAccounts?.[0] ?? 'none'} EOA=${u.evmAccounts?.[0] ?? 'none'}`
        )
      }
    }
  }

  if (!DO_TRANSFER) {
    console.log('\nRun with --transfer to execute 1 USDC test.')
    return
  }

  // Get first drifted user pair
  const driftEntry = [...byPhone.entries()].find(([, users]) => users.length > 1)
  if (!driftEntry) {
    console.log('No drift found')
    return
  }

  const [, users] = driftEntry
  const smsUser = users.find((u: any) => u.authType === 'sms')
  const jwtUser = users.find((u: any) => u.authType === 'jwt')
  if (!smsUser || !jwtUser) {
    console.log('Missing user pair')
    return
  }

  const oldSmart = smsUser.evmSmartAccounts[0]
  const oldEoa = smsUser.evmAccounts[0]
  const newSmart = jwtUser.evmSmartAccounts[0]

  console.log(`\n=== Transferring 1 USDC ===`)
  console.log(`  ${oldSmart} → ${newSmart}`)
  console.log(`  Using SMS user's EOA: ${oldEoa}\n`)

  // The SMS user's EOA is a CDP-managed server account (created via SMS auth).
  // Try using getOrCreateAccount to retrieve it by name pattern, or create a
  // server account that wraps the same key.

  // Approach: Use the existing spender pattern from embedded_wallet.service.ts
  // but instead of the spender account, use the SMS user's account directly.
  // The CdpClient's sendUserOperation on the REST API should work if we can
  // get a handle to the smart account.

  // Let's try: create a server-side "wrapper" account, then get the smart account
  try {
    // The SMS user's EOA was created by CDP's embedded wallet infra.
    // The server SDK's getOrCreateAccount only works for "server wallets" (named accounts).
    // But the REST API's prepareAndSendUserOperation should work for ANY smart account
    // whose owner is a CDP-managed key (which the SMS user's EOA is).

    // Access the internal API client from CdpClient
    // @ts-ignore - accessing internal
    const apiClient = cdp._apiClients?.evmSmartAccounts || cdp._apiClient

    if (!apiClient) {
      // Fallback: use the spender approach — the spender already has a spend permission
      // and can move funds. This is what already works via the backend.
      console.log('Cannot access CDP internal API client.')
      console.log('Falling back to spender approach...\n')

      // Use the existing spender flow
      const erc20Interface = new ethers.utils.Interface([
        'function transfer(address to, uint256 amount) returns (bool)',
      ])
      const transferData = erc20Interface.encodeFunctionData('transfer', [
        newSmart,
        ethers.utils.parseUnits('1', USDC_DECIMALS).toString(),
      ])

      // Get spender account (same as embedded_wallet.service.ts)
      const ownerAccount = await cdp.evm.getOrCreateAccount({ name: 'sippy-spender-owner' })
      const spenderAccount = await cdp.evm.getOrCreateSmartAccount({
        name: 'sippy-spender',
        owner: ownerAccount,
      })

      console.log(`Spender: ${spenderAccount.address}`)

      // The spender has a spend permission on oldSmart.
      // Use the existing batched spend+transfer pattern.
      const SPEND_PERMISSION_MANAGER = '0xEc60DbA4F84deD47cFD04c64Dcfe49cF8C6D3041'
      const spendAbi = [
        'function spend(tuple(address account, address spender, address token, uint160 allowance, uint48 period, uint48 start, uint48 end, uint256 salt, bytes extraData) spendPermission, uint160 value)',
      ]
      const spendInterface = new ethers.utils.Interface(spendAbi)

      // Get the active spend permission
      const allPerms = await cdp.evm.listSpendPermissions({
        address: oldSmart as `0x${string}`,
      })

      const activePerms = ((allPerms.spendPermissions ?? []) as any[]).filter(
        (p: any) =>
          !p.revoked &&
          p.permission?.spender?.toLowerCase() === spenderAccount.address.toLowerCase() &&
          p.permission?.token?.toLowerCase() === USDC.toLowerCase() &&
          p.network === 'arbitrum'
      )

      if (activePerms.length === 0) {
        console.log('No active spend permission found!')
        return
      }

      const perm = activePerms[activePerms.length - 1].permission
      console.log(
        `Using permission with allowance: ${ethers.utils.formatUnits(perm.allowance, USDC_DECIMALS)} USDC/day`
      )

      const amountInUnits = ethers.utils.parseUnits('1', USDC_DECIMALS)

      const spendCallData = spendInterface.encodeFunctionData('spend', [
        {
          account: perm.account,
          spender: perm.spender,
          token: perm.token,
          allowance: perm.allowance,
          period: perm.period,
          start: perm.start,
          end: perm.end,
          salt: perm.salt,
          extraData: perm.extraData || '0x',
        },
        amountInUnits.toString(),
      ])

      console.log('Sending batched spend+transfer UserOp...')
      const userOpResult = await cdp.evm.sendUserOperation({
        smartAccount: spenderAccount,
        network: 'arbitrum' as any,
        calls: [
          {
            to: SPEND_PERMISSION_MANAGER as `0x${string}`,
            value: BigInt(0),
            data: spendCallData as `0x${string}`,
          },
          {
            to: USDC as `0x${string}`,
            value: BigInt(0),
            data: transferData as `0x${string}`,
          },
        ],
      })

      const receipt = await spenderAccount.waitForUserOperation(userOpResult)
      const userOp = await spenderAccount.getUserOperation({ userOpHash: receipt.userOpHash })
      console.log(`Success! Tx: https://arbitrum.blockscout.com/tx/${userOp.transactionHash}`)
    }
  } catch (err: any) {
    console.error('Failed:', err.message || err)
    if (err.errorMessage) console.error('CDP:', err.errorMessage)
    if (err.correlationId) console.error('ID:', err.correlationId)
  }
}

main().catch(console.error)
