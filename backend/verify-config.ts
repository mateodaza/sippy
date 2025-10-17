/**
 * Configuration Verification Script
 *
 * Run this before deploying to verify all required environment variables are set
 * Usage: npm run verify-config OR tsx verify-config.ts
 */

import 'dotenv/config';

interface ConfigCheck {
  name: string;
  value: string | undefined;
  required: boolean;
  description: string;
}

const checks: ConfigCheck[] = [
  {
    name: 'WHATSAPP_PHONE_NUMBER_ID',
    value: process.env.WHATSAPP_PHONE_NUMBER_ID,
    required: true,
    description: 'WhatsApp Business Phone Number ID from Meta Developers',
  },
  {
    name: 'WHATSAPP_ACCESS_TOKEN',
    value: process.env.WHATSAPP_ACCESS_TOKEN,
    required: true,
    description: 'WhatsApp Permanent Access Token from Meta',
  },
  {
    name: 'WHATSAPP_VERIFY_TOKEN',
    value: process.env.WHATSAPP_VERIFY_TOKEN,
    required: true,
    description: 'Webhook verify token (must match Meta configuration)',
  },
  {
    name: 'CDP_API_KEY_ID',
    value: process.env.CDP_API_KEY_ID,
    required: true,
    description: 'Coinbase CDP API Key ID',
  },
  {
    name: 'CDP_API_KEY_SECRET',
    value: process.env.CDP_API_KEY_SECRET,
    required: true,
    description: 'Coinbase CDP API Key Secret',
  },
  {
    name: 'CDP_WALLET_SECRET',
    value: process.env.CDP_WALLET_SECRET,
    required: true,
    description: 'Coinbase CDP Wallet Secret (EC Private Key)',
  },
  {
    name: 'ARBITRUM_RPC_URL',
    value: process.env.ARBITRUM_RPC_URL,
    required: false,
    description: 'Arbitrum RPC URL (defaults to public RPC if not set)',
  },
  {
    name: 'REFUEL_CONTRACT_ADDRESS',
    value: process.env.REFUEL_CONTRACT_ADDRESS,
    required: false,
    description: 'Gas Refuel Contract Address (optional)',
  },
  {
    name: 'REFUEL_ADMIN_PRIVATE_KEY',
    value: process.env.REFUEL_ADMIN_PRIVATE_KEY,
    required: false,
    description: 'Private key with funds to refuel user wallets (optional)',
  },
  {
    name: 'PORT',
    value: process.env.PORT,
    required: false,
    description: 'Server port (defaults to 3001)',
  },
];

console.log('\n╔════════════════════════════════════════════════╗');
console.log('║   🔍 SIPPY Configuration Verification          ║');
console.log('╚════════════════════════════════════════════════╝\n');

let hasErrors = false;
let hasWarnings = false;

checks.forEach((check) => {
  // Check if value is set and not a template placeholder
  const value = check.value || '';
  const lowerValue = value.toLowerCase();

  // Fields that can be short
  const canBeShort = [
    'PORT',
    'BASE_CHAIN_ID',
    'WHATSAPP_VERIFY_TOKEN',
  ].includes(check.name);

  const isPlaceholder =
    !value ||
    (!canBeShort && value.length < 10) || // Most tokens/keys are longer
    lowerValue.startsWith('your_') ||
    lowerValue.startsWith('your-') ||
    lowerValue.includes('_here') ||
    lowerValue.includes('example') ||
    lowerValue.includes('replace') ||
    lowerValue.includes('todo') ||
    value === 'your_' + check.name.toLowerCase();

  const isSet = !!value && !isPlaceholder;
  const status = check.required ? (isSet ? '✅' : '❌') : isSet ? '✅' : '⚠️ ';

  if (check.required && !isSet) {
    hasErrors = true;
  } else if (!check.required && !isSet) {
    hasWarnings = true;
  }

  console.log(`${status} ${check.name}`);
  console.log(`   ${check.description}`);

  if (isSet && check.value) {
    // Show masked value for security
    const maskedValue =
      check.value.length > 20
        ? `${check.value.substring(0, 8)}...${check.value.substring(
            check.value.length - 4
          )}`
        : `${check.value.substring(0, 4)}...`;
    console.log(`   Value: ${maskedValue}`);
  } else if (check.required) {
    console.log(`   ⚠️  NOT SET - This is required!`);
  } else {
    console.log(`   ℹ️  Not set (optional)`);
  }

  console.log('');
});

console.log('═══════════════════════════════════════════════════\n');

if (hasErrors) {
  console.log('❌ Configuration check FAILED!');
  console.log('   Please set all required environment variables.');
  console.log('   Copy ENV-TEMPLATE.txt to .env and fill in your values.\n');
  process.exit(1);
} else if (hasWarnings) {
  console.log('⚠️  Configuration check passed with warnings.');
  console.log('   Some optional features may not work.\n');
  console.log('✅ You can proceed with deployment, but consider:');
  console.log('   - Setting up Gas Refuel for better UX');
  console.log('   - Using a custom Arbitrum RPC for better reliability\n');
} else {
  console.log('✅ All configuration checks passed!');
  console.log('   Your bot is ready for deployment! 🚀\n');
}

// Test WhatsApp API connection
console.log('═══════════════════════════════════════════════════');
console.log('🔗 Testing WhatsApp API connection...\n');

async function testWhatsAppAPI() {
  try {
    const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

    if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
      console.log('⚠️  Skipping API test (credentials not set)\n');
      return;
    }

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}`,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
      }
    );

    if (response.ok) {
      const data = (await response.json()) as any;
      console.log('✅ WhatsApp API connection successful!');
      console.log(`   Phone: ${data.display_phone_number || 'N/A'}`);
      console.log(`   Quality: ${data.quality_rating || 'N/A'}`);
      console.log(`   Verified: ${data.verified_name || 'Not verified'}\n`);
    } else {
      const error = (await response.json()) as any;
      console.log('❌ WhatsApp API connection failed!');
      console.log(`   Status: ${response.status}`);
      console.log(`   Error: ${error.error?.message || 'Unknown error'}\n`);
      console.log('💡 Tips:');
      console.log('   - Check your WHATSAPP_ACCESS_TOKEN');
      console.log('   - Check your WHATSAPP_PHONE_NUMBER_ID');
      console.log('   - Ensure your token has not expired\n');
    }
  } catch (error) {
    console.log('❌ Failed to test WhatsApp API');
    console.log(`   Error: ${error}\n`);
  }
}

if (!hasErrors) {
  testWhatsAppAPI().then(() => {
    console.log('═══════════════════════════════════════════════════\n');
    console.log('📋 Next steps:');
    console.log('   1. Deploy your backend to a hosting service');
    console.log('   2. Configure the webhook URL in Meta Developers');
    console.log('   3. Test by sending "start" to your WhatsApp number');
    console.log(
      '\n   See WHATSAPP-PRODUCTION-SETUP.md for detailed instructions.\n'
    );
  });
}
