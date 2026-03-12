import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const notifySecret = process.env.NOTIFY_SECRET;

    if (!notifySecret) {
      console.error('NOTIFY_SECRET is not configured on the fund app');
      return NextResponse.json(
        { error: 'Notification endpoint not configured' },
        { status: 503 }
      );
    }

    // Resolve phone from address if only address is provided
    let phone = body.phone as string | undefined;
    if (!phone && body.address) {
      const res = await fetch(
        `${BACKEND_URL}/resolve-address?address=${encodeURIComponent(body.address)}`
      );
      if (res.ok) {
        const data = await res.json().catch(() => null);
        phone = data?.phone ?? undefined;
      }
    }

    if (!phone) {
      return NextResponse.json(
        { error: 'Could not resolve recipient phone number' },
        { status: 404 }
      );
    }

    const { type, amount, txHash } = body;

    const response = await fetch(`${BACKEND_URL}/notify-fund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-notify-secret': notifySecret,
      },
      body: JSON.stringify({ phone, type, amount, txHash }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      console.error('notify-fund backend error:', data);
      return NextResponse.json(
        data || { error: 'Failed to send notification' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('notify-fund proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 }
    );
  }
}
