/**
 * Import Wallets from JSON to PostgreSQL
 *
 * One-time script to migrate existing wallets.json data to the database
 */

import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import { query, initDb } from '../services/db.js';

interface WalletData {
  phoneNumber: string;
  cdpWalletId: string;
  walletAddress: string;
  createdAt: number;
  lastActivity: number;
  dailySpent: number;
  lastResetDate: string;
}

async function importWallets() {
  console.log('\n🔄 Starting wallet import from JSON to PostgreSQL...\n');

  try {
    // Initialize database
    await initDb();

    // Read wallets.json
    const walletsPath = path.join(process.cwd(), 'wallets.json');
    const data = await fs.readFile(walletsPath, 'utf8');
    const walletsData = JSON.parse(data);

    console.log(
      `📂 Found ${Object.keys(walletsData).length} wallets in JSON file\n`
    );

    let imported = 0;
    let skipped = 0;

    // Import each wallet
    for (const [phoneNumber, walletData] of Object.entries(walletsData)) {
      const wallet = walletData as WalletData;

      try {
        await query(
          `INSERT INTO phone_registry 
           (phone_number, cdp_wallet_name, wallet_address, created_at, last_activity, daily_spent, last_reset_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (phone_number) 
           DO UPDATE SET 
             cdp_wallet_name = EXCLUDED.cdp_wallet_name,
             wallet_address = EXCLUDED.wallet_address,
             created_at = EXCLUDED.created_at,
             last_activity = EXCLUDED.last_activity,
             daily_spent = EXCLUDED.daily_spent,
             last_reset_date = EXCLUDED.last_reset_date`,
          [
            phoneNumber,
            wallet.cdpWalletId,
            wallet.walletAddress,
            wallet.createdAt,
            wallet.lastActivity,
            wallet.dailySpent,
            wallet.lastResetDate,
          ]
        );

        console.log(`✅ Imported: +${phoneNumber} → ${wallet.walletAddress}`);
        imported++;
      } catch (error) {
        console.error(`❌ Failed to import +${phoneNumber}:`, error);
        skipped++;
      }
    }

    console.log(`\n📊 Import Summary:`);
    console.log(`   ✅ Imported: ${imported}`);
    console.log(`   ❌ Skipped: ${skipped}`);
    console.log(`   📝 Total: ${imported + skipped}\n`);

    // Verify import
    const result = await query<{ count: string }>(
      'SELECT COUNT(*) as count FROM phone_registry'
    );
    console.log(`✅ Database now contains ${result.rows[0].count} wallets\n`);

    console.log('🎉 Import completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  }
}

importWallets();
