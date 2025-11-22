import { NextRequest, NextResponse } from 'next/server';

// GET - ตรวจสอบ session
export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get('session');
    
    if (!sessionCookie) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const session = JSON.parse(sessionCookie.value);
    
    return NextResponse.json({
      authenticated: true,
      user: session
    });
  } catch (error) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}
