import { NextRequest, NextResponse } from 'next/server';
import { createFundToken, verifyFundToken } from '@/lib/fund-token';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('NEXT_PUBLIC_BACKEND_URL is required in production') })() : 'http://localhost:3001');

/**
 * POST /api/fund-token — Create a signed fund link for a phone number.
 * Body: { phone: string }
 * Returns: { token: string, url: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json();

    if (!phone || typeof phone !== 'string') {
      return NextResponse.json(
        { error: 'phone is required' },
        { status: 400 }
      );
    }

    const token = createFundToken(phone);
    // Fund app lives at the root — URL is baseUrl/?t=token (no /fund path)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://fund.sippy.lat';
    const url = `${baseUrl}?t=${token}`;

    return NextResponse.json({ token, url });
  } catch (error) {
    console.error('fund-token create error:', error);
    return NextResponse.json(
      { error: 'Failed to create fund token' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/fund-token?t=<token> — Verify a fund token and resolve the recipient wallet.
 * Returns: { maskedPhone: string, address: string } or 401/404.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('t');

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    const phone = verifyFundToken(token);
    if (!phone) {
      return NextResponse.json(
        { error: 'Invalid or expired fund link' },
        { status: 401 }
      );
    }

    const response = await fetch(
      `${BACKEND_URL}/resolve-phone?phone=${encodeURIComponent(phone)}`
    );

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(
        data || { error: 'Recipient not found' },
        { status: response.status }
      );
    }

    const maskedPhone = phone.replace(/.(?=.{4})/g, '*');

    return NextResponse.json({
      maskedPhone,
      address: data.address,
    });
  } catch (error) {
    console.error('fund-token verify error:', error);
    return NextResponse.json(
      { error: 'Failed to verify fund token' },
      { status: 500 }
    );
  }
}
