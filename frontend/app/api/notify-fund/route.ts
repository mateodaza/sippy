import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.sippy.lat/';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    console.log(
      '📲 Frontend proxy: Forwarding notification to backend:',
      BACKEND_URL
    );
    console.log('📋 Notification payload:', body);

    const response = await fetch(`${BACKEND_URL}/notify-fund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    console.log('📥 Backend response:', { status: response.status, data });

    if (!response.ok) {
      console.error('❌ Backend returned error:', data);
      return NextResponse.json(data, { status: response.status });
    }

    console.log('✅ Notification forwarded successfully');
    return NextResponse.json(data);
  } catch (error) {
    console.error('❌ Error proxying notification request:', error);
    return NextResponse.json(
      {
        error: 'Failed to send notification',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
