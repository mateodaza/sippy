import { NextRequest, NextResponse } from 'next/server';
import { generateJwt } from '@coinbase/cdp-sdk/auth';

const CDP_API_KEY_ID = process.env.CDP_API_KEY_ID || '';
const CDP_API_KEY_SECRET = process.env.CDP_API_KEY_SECRET || '';

/**
 * POST /api/onramp-token — Generate a Coinbase Onramp session token.
 * Body: { address: string }
 * Returns: { token: string }
 */
export async function POST(request: NextRequest) {
  if (!CDP_API_KEY_ID || !CDP_API_KEY_SECRET) {
    return NextResponse.json(
      { error: 'CDP API credentials not configured' },
      { status: 500 }
    );
  }

  try {
    const { address } = await request.json();

    if (!address || typeof address !== 'string') {
      return NextResponse.json(
        { error: 'address is required' },
        { status: 400 }
      );
    }

    // Generate CDP JWT for authenticating with the Onramp API
    const jwt = await generateJwt({
      apiKeyId: CDP_API_KEY_ID,
      apiKeySecret: CDP_API_KEY_SECRET,
      requestMethod: 'POST',
      requestHost: 'api.developer.coinbase.com',
      requestPath: '/onramp/v1/token',
      expiresIn: 120,
    });

    // Resolve the end-user's IP for Coinbase's fraud checks.
    // In production, Vercel sets x-forwarded-for. Locally, fetch the public IP.
    const forwardedIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip');
    const isPrivate = !forwardedIp || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|localhost)/.test(forwardedIp);
    let clientIp = forwardedIp || '';
    if (isPrivate) {
      const ipRes = await fetch('https://api.ipify.org');
      clientIp = await ipRes.text();
    }

    // Request a session token from Coinbase Onramp API
    const response = await fetch(
      'https://api.developer.coinbase.com/onramp/v1/token',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          addresses: [
            {
              address,
              blockchains: ['arbitrum'],
            },
          ],
          assets: ['USDC'],
          clientIp,
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Coinbase Onramp token error:', response.status, response.statusText, errorBody);
      return NextResponse.json(
        { error: 'Failed to generate onramp token' },
        { status: 502 }
      );
    }

    const data = await response.json();
    return NextResponse.json({ token: data.token });
  } catch (error) {
    console.error('onramp-token error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
