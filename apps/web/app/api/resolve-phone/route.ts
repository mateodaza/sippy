import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('NEXT_PUBLIC_BACKEND_URL is required in production') })() : 'http://localhost:3001');

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const phone = searchParams.get('phone');

    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }

    const response = await fetch(
      `${BACKEND_URL}/resolve-phone?phone=${encodeURIComponent(phone)}`
    );

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(
        data || { error: 'Failed to resolve phone number' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('resolve-phone proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
