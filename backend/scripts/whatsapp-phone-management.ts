/**
 * WhatsApp Phone Number Management
 *
 * This script manages WhatsApp Business API phone numbers via Meta Graph API.
 * Use it to register new numbers, deregister old ones, and check status.
 *
 * =============================================================================
 * WORKFLOW: Adding a New Phone Number
 * =============================================================================
 *
 * 1. ADD NUMBER IN META DASHBOARD:
 *    - Go to: https://business.facebook.com > WhatsApp > Configuration
 *    - Click "Add Phone Number" and complete embedded signup
 *    - Note the Phone Number ID from the dashboard (e.g., 849955741544171)
 *
 * 2. REGISTER THE NUMBER (with PIN):
 *    npx ts-node scripts/whatsapp-phone-management.ts register <phone_number_id> <6_digit_pin>
 *
 *    IMPORTANT: The PIN is your WhatsApp two-step verification PIN.
 *    If you get error "The parameter pin is required", you MUST provide the PIN.
 *
 * 3. VERIFY IT'S WORKING:
 *    npx ts-node scripts/check-whatsapp-status.ts <phone_number_id>
 *
 * 4. UPDATE ENVIRONMENT:
 *    - Update WHATSAPP_PHONE_NUMBER_ID in .env (local)
 *    - Update WHATSAPP_PHONE_NUMBER_ID in Railway/deployment environment
 *    - Restart the backend server
 *
 * 5. CONFIGURE WEBHOOK (if new WABA):
 *    - Go to Meta Dashboard > WhatsApp > Configuration > Webhook
 *    - Set callback URL: https://your-domain.com/webhook
 *    - Set verify token: your WHATSAPP_VERIFY_TOKEN from .env
 *    - Subscribe to: messages, message_deliveries, message_reads
 *
 * =============================================================================
 * WORKFLOW: Removing/Replacing a Phone Number
 * =============================================================================
 *
 * 1. DEREGISTER OLD NUMBER:
 *    npx ts-node scripts/whatsapp-phone-management.ts deregister <old_phone_number_id>
 *
 * 2. Follow "Adding a New Phone Number" workflow above
 *
 * =============================================================================
 * COMMON ERRORS & SOLUTIONS
 * =============================================================================
 *
 * ERROR: "(#100) The parameter pin is required"
 *   CAUSE: Two-step verification is enabled on the WhatsApp number
 *   FIX: Add your 6-digit PIN as the last argument:
 *        npx ts-node scripts/whatsapp-phone-management.ts register <id> <pin>
 *
 * ERROR: "Object with ID does not exist"
 *   CAUSE: Wrong phone number ID or wrong WABA
 *   FIX: Get the correct ID from Meta Dashboard > WhatsApp > Phone Numbers
 *
 * ERROR: "(#133016) Too many requests for phone number registration"
 *   CAUSE: Rate limited - max 10 register/deregister attempts per 72 hours
 *   FIX: Wait 72 hours before trying again
 *
 * ERROR: "Phone number not verified"
 *   CAUSE: Number wasn't verified during embedded signup
 *   FIX: Use request-code and verify commands, or re-add via dashboard
 *
 * ERROR: "LIMITED" health status for PHONE_NUMBER
 *   CAUSE: Usually SIP calling not configured (safe to ignore for messaging)
 *   CHECK: Run check-whatsapp-status.ts - if WABA/BUSINESS/APP are AVAILABLE,
 *          messaging will work fine
 *
 * =============================================================================
 * RATE LIMITS
 * =============================================================================
 *
 * - Register/Deregister: 10 attempts per 72 hours per phone number
 * - Verification codes: Limited requests, wait between retries
 * - Messaging: Starts at TIER_250 (250/day), upgrades with usage
 *
 * =============================================================================
 * COMMANDS
 * =============================================================================
 *
 *   npx ts-node scripts/whatsapp-phone-management.ts list
 *   npx ts-node scripts/whatsapp-phone-management.ts register <phone_number_id> [pin]
 *   npx ts-node scripts/whatsapp-phone-management.ts deregister <phone_number_id>
 *   npx ts-node scripts/whatsapp-phone-management.ts request-code <phone_number_id> [SMS|VOICE]
 *   npx ts-node scripts/whatsapp-phone-management.ts verify <phone_number_id> <code>
 *
 * =============================================================================
 * EXAMPLES
 * =============================================================================
 *
 *   # List all phone numbers in your WABA
 *   npx ts-node scripts/whatsapp-phone-management.ts list
 *
 *   # Register a new number (with PIN for two-step verification)
 *   npx ts-node scripts/whatsapp-phone-management.ts register 849955741544171 153266
 *
 *   # Deregister an old/unused number
 *   npx ts-node scripts/whatsapp-phone-management.ts deregister 786205717917216
 *
 *   # Request SMS verification code (if needed)
 *   npx ts-node scripts/whatsapp-phone-management.ts request-code 849955741544171 SMS
 *
 *   # Verify with received code
 *   npx ts-node scripts/whatsapp-phone-management.ts verify 849955741544171 123456
 *
 * =============================================================================
 * ENVIRONMENT VARIABLES REQUIRED
 * =============================================================================
 *
 *   WHATSAPP_ACCESS_TOKEN - Your Meta app access token (from App Dashboard)
 *   WHATSAPP_PHONE_NUMBER_ID - Default phone number ID (used by list command)
 *
 */

import 'dotenv/config';

const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const KNOWN_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '974967405691917';

const command = process.argv[2];
const phoneNumberId = process.argv[3];

async function getWABAId(): Promise<string | null> {
  try {
    // First, get the app info to find the WABA
    // Try getting phone number owner
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${KNOWN_PHONE_ID}`,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
      }
    );
    const data = await response.json();
    console.log('Phone number info:', JSON.stringify(data, null, 2));

    if (data.error) {
      console.error('❌ Error:', data.error.message);
      return null;
    }

    // The WABA ID might be in a different location - let's check the app's owned WABAs
    // Try the business portfolio approach
    const businessResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/whatsapp_business_accounts`,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
      }
    );
    const businessData = await businessResponse.json();
    console.log('WABA accounts:', JSON.stringify(businessData, null, 2));

    if (businessData.data && businessData.data.length > 0) {
      return businessData.data[0].id;
    }

    return null;
  } catch (error) {
    console.error('❌ Failed to get WABA ID:', error);
    return null;
  }
}

async function listPhoneNumbers() {
  console.log('\n📱 Listing all phone numbers in WABA...\n');

  const wabaId = await getWABAId();
  if (!wabaId) {
    console.error('❌ Could not determine WABA ID');
    return;
  }
  console.log(`WABA ID: ${wabaId}\n`);

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status`,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
      }
    );

    const data = await response.json();

    if (data.error) {
      console.error('❌ Error:', data.error.message);
      return;
    }

    if (data.data && data.data.length > 0) {
      console.log('Phone Numbers:');
      console.log('------------------------');
      for (const phone of data.data) {
        console.log(`ID: ${phone.id}`);
        console.log(`Number: ${phone.display_phone_number}`);
        console.log(`Name: ${phone.verified_name || 'N/A'}`);
        console.log(`Quality: ${phone.quality_rating || 'N/A'}`);
        console.log(`Status: ${phone.code_verification_status || 'N/A'}`);
        console.log('------------------------');
      }
    } else {
      console.log('No phone numbers found.');
    }
  } catch (error) {
    console.error('❌ Failed:', error);
  }
}

async function deregisterPhoneNumber(id: string) {
  console.log(`\n🗑️  Deregistering phone number ${id}...\n`);

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${id}/deregister`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await response.json();

    if (data.error) {
      console.error('❌ Error:', data.error.message);
      console.error('   Code:', data.error.code);
      if (data.error.error_subcode) {
        console.error('   Subcode:', data.error.error_subcode);
      }
      return;
    }

    if (data.success) {
      console.log('✅ Phone number deregistered successfully!');
    } else {
      console.log('Response:', JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('❌ Failed:', error);
  }
}

async function registerPhoneNumber(id: string, pin?: string) {
  console.log(`\n📝 Registering phone number ${id}...\n`);

  try {
    const body: any = {
      messaging_product: 'whatsapp',
    };

    // Add PIN if provided (for two-step verification)
    if (pin) {
      body.pin = pin;
    }

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${id}/register`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();

    if (data.error) {
      console.error('❌ Error:', data.error.message);
      console.error('   Code:', data.error.code);
      if (data.error.error_subcode) {
        console.error('   Subcode:', data.error.error_subcode);
      }
      if (data.error.error_user_msg) {
        console.error('   User message:', data.error.error_user_msg);
      }
      return;
    }

    if (data.success) {
      console.log('✅ Phone number registered successfully!');
    } else {
      console.log('Response:', JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('❌ Failed:', error);
  }
}

async function requestVerificationCode(id: string, method: 'SMS' | 'VOICE' = 'SMS') {
  console.log(`\n📲 Requesting verification code via ${method} for ${id}...\n`);

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${id}/request_code`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code_method: method,
          language: 'en',
        }),
      }
    );

    const data = await response.json();

    if (data.error) {
      console.error('❌ Error:', data.error.message);
      console.error('   Code:', data.error.code);
      if (data.error.error_subcode) {
        console.error('   Subcode:', data.error.error_subcode);
      }
      return;
    }

    if (data.success) {
      console.log('✅ Verification code sent!');
      console.log('   Check your phone for the code.');
    } else {
      console.log('Response:', JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('❌ Failed:', error);
  }
}

async function verifyCode(id: string, code: string) {
  console.log(`\n✅ Verifying code for ${id}...\n`);

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${id}/verify_code`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: code,
        }),
      }
    );

    const data = await response.json();

    if (data.error) {
      console.error('❌ Error:', data.error.message);
      console.error('   Code:', data.error.code);
      if (data.error.error_subcode) {
        console.error('   Subcode:', data.error.error_subcode);
      }
      return;
    }

    if (data.success) {
      console.log('✅ Code verified successfully!');
      console.log('   Now run: npx ts-node scripts/whatsapp-phone-management.ts register <phone_number_id>');
    } else {
      console.log('Response:', JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('❌ Failed:', error);
  }
}

async function registerWithCert(id: string, cert: string) {
  console.log(`\n📝 Registering phone number ${id} with certificate...\n`);

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${id}/register`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          data_localization_region: 'US',
        }),
      }
    );

    const data = await response.json();

    if (data.error) {
      console.error('❌ Error:', data.error.message);
      console.error('   Code:', data.error.code);
      if (data.error.error_subcode) {
        console.error('   Subcode:', data.error.error_subcode);
      }
      if (data.error.error_user_msg) {
        console.error('   User message:', data.error.error_user_msg);
      }
      console.log('\nFull error:', JSON.stringify(data, null, 2));
      return;
    }

    if (data.success) {
      console.log('✅ Phone number registered successfully!');
    } else {
      console.log('Response:', JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('❌ Failed:', error);
  }
}

async function main() {
  if (!command) {
    console.log(`
Usage:
  npx ts-node scripts/whatsapp-phone-management.ts list
  npx ts-node scripts/whatsapp-phone-management.ts deregister <phone_number_id>
  npx ts-node scripts/whatsapp-phone-management.ts request-code <phone_number_id> [SMS|VOICE]
  npx ts-node scripts/whatsapp-phone-management.ts verify <phone_number_id> <code>
  npx ts-node scripts/whatsapp-phone-management.ts register <phone_number_id> [pin]

Examples:
  npx ts-node scripts/whatsapp-phone-management.ts list
  npx ts-node scripts/whatsapp-phone-management.ts deregister 974967405691917
  npx ts-node scripts/whatsapp-phone-management.ts request-code 123456789 SMS
  npx ts-node scripts/whatsapp-phone-management.ts verify 123456789 123456
  npx ts-node scripts/whatsapp-phone-management.ts register 123456789
`);
    return;
  }

  const arg3 = process.argv[4]; // For code or method

  switch (command) {
    case 'list':
      await listPhoneNumbers();
      break;
    case 'deregister':
      if (!phoneNumberId) {
        console.error('❌ Please provide a phone number ID');
        return;
      }
      await deregisterPhoneNumber(phoneNumberId);
      break;
    case 'request-code':
      if (!phoneNumberId) {
        console.error('❌ Please provide a phone number ID');
        return;
      }
      await requestVerificationCode(phoneNumberId, (arg3 as 'SMS' | 'VOICE') || 'SMS');
      break;
    case 'verify':
      if (!phoneNumberId || !arg3) {
        console.error('❌ Please provide phone number ID and verification code');
        console.log('   Usage: npx ts-node scripts/whatsapp-phone-management.ts verify <phone_number_id> <code>');
        return;
      }
      await verifyCode(phoneNumberId, arg3);
      break;
    case 'register':
      if (!phoneNumberId) {
        console.error('❌ Please provide a phone number ID');
        return;
      }
      await registerPhoneNumber(phoneNumberId, arg3);
      break;
    default:
      console.error(`❌ Unknown command: ${command}`);
      console.log('   Available commands: list, deregister, request-code, verify, register');
  }
}

main();
