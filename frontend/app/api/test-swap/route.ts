import { NextResponse } from 'next/server';

/**
 * API endpoint to test PYUSD swap
 * This would normally be triggered by the backend when detecting incoming tokens
 */
export async function POST(request: Request) {
  try {
    const { phoneNumber, token, amount } = await request.json();

    console.log('🧪 Test swap request received:');
    console.log(`  Phone: ${phoneNumber}`);
    console.log(`  Token: ${token}`);
    console.log(`  Amount: ${amount}`);

    // In a real implementation, this would:
    // 1. Look up the wallet for the phone number
    // 2. Call the PyusdSwapService to swap the token to PYUSD
    // 3. Notify the user via WhatsApp

    // For now, return mock response
    return NextResponse.json({
      success: true,
      message: `Would swap ${amount} ${token} to PYUSD for ${phoneNumber}`,
      note: 'This is a test endpoint. Real implementation in backend service.',
    });
  } catch (error: any) {
    console.error('Test swap error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
