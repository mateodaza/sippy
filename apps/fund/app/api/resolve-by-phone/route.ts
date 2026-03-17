import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('NEXT_PUBLIC_BACKEND_URL is required in production') })() : 'http://localhost:3001');

/**
 * POST /api/resolve-by-phone — Look up a Sippy wallet by phone number.
 * Body: { phone: string }
 * Returns: { maskedPhone: string, address: string } or 404.
 *
 * Used by the fund page when no signed token is present — lets anyone
 * enter a phone number and fund it if the account exists.
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

    // Normalize to E.164
    const canonical = phone.startsWith('+') ? phone : `+${phone.replace(/\D/g, '')}`;
    if (canonical.replace(/\D/g, '').length < 7) {
      return NextResponse.json(
        { error: 'Invalid phone number' },
        { status: 400 }
      );
    }

    const response = await fetch(
      `${BACKEND_URL}/resolve-phone?phone=${encodeURIComponent(canonical)}`
    );

    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.address) {
      return NextResponse.json(
        { error: 'No Sippy account found for this number' },
        { status: 404 }
      );
    }

    const maskedPhone = canonical.replace(/.(?=.{4})/g, '*');

    return NextResponse.json({
      maskedPhone,
      address: data.address,
    });
  } catch (error) {
    console.error('resolve-by-phone error:', error);
    return NextResponse.json(
      { error: 'Failed to look up phone number' },
      { status: 500 }
    );
  }
}
