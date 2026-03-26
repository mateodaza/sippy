/**
 * Debug script: Find all CDP users for a phone number
 * Run: npx tsx --env-file=apps/backend/.env scripts/debug-cdp-accounts.ts
 */
import { CdpClient } from '@coinbase/cdp-sdk'

async function main() {
  const cdp = new CdpClient()
  const phone = '+573116613414'

  console.log(`=== Finding all users for ${phone} ===\n`)

  let page = await cdp.endUser.listEndUsers({ pageSize: 50 })
  const allUsers = [...(page.endUsers ?? [])]
  while (page.nextPageToken) {
    page = await cdp.endUser.listEndUsers({ pageSize: 50, pageToken: page.nextPageToken })
    allUsers.push(...(page.endUsers ?? []))
  }

  const matches = allUsers.filter((u: any) => {
    const methods = u.authenticationMethods || []
    return methods.some((m: any) => m.phoneNumber === phone || m.sub === phone)
  })

  console.log(`Found ${matches.length} user(s):\n`)
  for (const u of matches) {
    console.log(JSON.stringify(u, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2))
    console.log()
  }
}

main().catch(console.error)
