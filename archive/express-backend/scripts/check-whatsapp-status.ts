/**
 * Check WhatsApp Phone Number Status
 *
 * Use this script to verify a phone number is properly configured and ready
 * to send/receive messages. Run it after registering a new number or when
 * troubleshooting messaging issues.
 *
 * =============================================================================
 * USAGE
 * =============================================================================
 *
 *   # Check the default number (from .env WHATSAPP_PHONE_NUMBER_ID)
 *   npx ts-node scripts/check-whatsapp-status.ts
 *
 *   # Check a specific phone number by ID
 *   npx ts-node scripts/check-whatsapp-status.ts 849955741544171
 *
 * =============================================================================
 * UNDERSTANDING THE OUTPUT
 * =============================================================================
 *
 * PHONE NUMBER DETAILS:
 *   - Display Name: Your verified business name (shown to users)
 *   - Phone Number: The actual phone number
 *   - Name Status: AVAILABLE_WITHOUT_REVIEW means approved
 *   - Quality Rating: GREEN/YELLOW/RED - affects messaging limits
 *   - Messaging Tier: Your daily messaging limit (TIER_250, TIER_1K, etc.)
 *
 * HEALTH STATUS (what matters for messaging):
 *   - PHONE_NUMBER: ⚠️ LIMITED is OK if it's just SIP calling
 *   - WABA: Must be ✅ AVAILABLE
 *   - BUSINESS: Must be ✅ AVAILABLE
 *   - APP: Must be ✅ AVAILABLE
 *
 * =============================================================================
 * COMMON ISSUES
 * =============================================================================
 *
 * "LIMITED" for PHONE_NUMBER with SIP error:
 *   This is about voice calling, NOT messaging. If WABA/BUSINESS/APP are
 *   AVAILABLE, your bot will work fine for text messages.
 *
 * "NOT READY" but entities show AVAILABLE:
 *   The overall status might show LIMITED due to SIP, but check individual
 *   entities. If WABA, BUSINESS, APP are AVAILABLE, messaging works.
 *
 * TIER_250 messaging limit:
 *   This is normal for new numbers. To upgrade:
 *   - Have 125+ conversations in a 7-day period
 *   - Maintain good quality rating (GREEN)
 *   - Tiers: 250 → 1K → 10K → 100K → Unlimited
 *
 * =============================================================================
 * ENVIRONMENT VARIABLES
 * =============================================================================
 *
 *   WHATSAPP_ACCESS_TOKEN - Your Meta app access token
 *   WHATSAPP_PHONE_NUMBER_ID - Default phone number ID to check
 *
 * =============================================================================
 * RELATED SCRIPTS
 * =============================================================================
 *
 *   whatsapp-phone-management.ts - Register/deregister phone numbers
 *
 */

import 'dotenv/config';

const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.argv[2] || process.env.WHATSAPP_PHONE_NUMBER_ID;

async function checkPhoneStatus() {
  console.log('\n📱 Checking WhatsApp Phone Number Status...\n');
  console.log(`Phone Number ID: ${PHONE_NUMBER_ID}\n`);

  try {
    // Get phone number details
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}?fields=verified_name,code_verification_status,display_phone_number,name_status,quality_rating,messaging_limit_tier`,
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

    console.log('📋 Phone Number Details:');
    console.log('------------------------');
    console.log(`Display Name: ${data.verified_name || 'Not set'}`);
    console.log(`Phone Number: ${data.display_phone_number || 'N/A'}`);
    console.log(`Name Status: ${data.name_status || 'N/A'}`);
    console.log(`Quality Rating: ${data.quality_rating || 'N/A'}`);
    console.log(`Messaging Tier: ${data.messaging_limit_tier || 'N/A'}`);

    // Get health status
    const healthResponse = await fetch(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}?fields=health_status`,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
      }
    );

    const healthData = await healthResponse.json();

    if (healthData.health_status) {
      console.log('\n🏥 Health Status:');
      console.log('------------------------');
      console.log(`Can Send Messages: ${healthData.health_status.can_send_message}`);

      if (healthData.health_status.entities) {
        for (const entity of healthData.health_status.entities) {
          const status = entity.can_send_message || 'UNKNOWN';
          const icon = status === 'AVAILABLE' ? '✅' : status === 'LIMITED' ? '⚠️' : '❌';
          console.log(`${icon} ${entity.entity_type}: ${status}`);

          if (entity.errors && entity.errors.length > 0) {
            for (const error of entity.errors) {
              console.log(`   └─ ${error.error_description || 'Unknown error'}`);
            }
          }
        }
      }
    }

    // Summary - Check individual entities, not just overall status
    console.log('\n📊 Summary:');
    console.log('------------------------');

    const entities = healthData.health_status?.entities || [];
    const wabaStatus = entities.find((e: any) => e.entity_type === 'WABA')?.can_send_message;
    const businessStatus = entities.find((e: any) => e.entity_type === 'BUSINESS')?.can_send_message;
    const appStatus = entities.find((e: any) => e.entity_type === 'APP')?.can_send_message;
    const phoneStatus = entities.find((e: any) => e.entity_type === 'PHONE_NUMBER')?.can_send_message;

    // Messaging works if WABA, BUSINESS, and APP are available
    // PHONE_NUMBER being LIMITED due to SIP is OK for text messaging
    const messagingReady =
      wabaStatus === 'AVAILABLE' &&
      businessStatus === 'AVAILABLE' &&
      appStatus === 'AVAILABLE';

    if (messagingReady) {
      console.log('✅ READY TO SEND MESSAGES');
      if (phoneStatus === 'LIMITED') {
        console.log('   (PHONE_NUMBER shows LIMITED but that\'s just SIP calling - messaging works!)');
      }
    } else {
      console.log('❌ NOT READY - Check health status above for details');
      if (wabaStatus !== 'AVAILABLE') console.log('   └─ WABA is not available');
      if (businessStatus !== 'AVAILABLE') console.log('   └─ BUSINESS is not available');
      if (appStatus !== 'AVAILABLE') console.log('   └─ APP is not available');
    }

  } catch (error) {
    console.error('❌ Failed to check status:', error);
  }
}

checkPhoneStatus();
