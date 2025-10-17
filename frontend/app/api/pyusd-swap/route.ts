import { NextRequest, NextResponse } from 'next/server';

/**
 * API endpoint to trigger backend PYUSD swap and transfer
 * 
 * This notifies our backend to:
 * 1. Detect ETH received on Arbitrum
 * 2. Swap ETH → PYUSD on Uniswap
 * 3. Transfer PYUSD to recipient
 */
export async function POST(request: NextRequest) {
  try {
    const { phoneNumber, recipientAddress, amount } = await request.json();

    if (!phoneNumber || !recipientAddress || !amount) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Call your backend service
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    const response = await fetch(`${backendUrl}/pyusd-swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber,
        recipientAddress,
        amount,
      }),
    });

    const data = await response.json();

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('PYUSD swap API error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

