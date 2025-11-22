import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ถ้าเป็น API routes ให้ผ่าน
  if (pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // ตรวจสอบ session cookie และ validate
  const sessionCookie = request.cookies.get('session');
  let isAuthenticated = false;
  let userRole = null;

  if (sessionCookie) {
    try {
      const session = JSON.parse(sessionCookie.value);
      // ตรวจสอบว่า session มีข้อมูลครบถ้วน
      if (session.userId && session.username && session.role) {
        isAuthenticated = true;
        userRole = session.role;
      }
    } catch (error) {
      // ถ้า parse ไม่ได้ = session เสีย ให้ลบ cookie
      isAuthenticated = false;
    }
  }

  // หน้า login
  if (pathname === '/login') {
    // ถ้า login แล้วให้ไปหน้า database
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/database', request.url));
    }
    return NextResponse.next();
  }

  // หน้าที่ต้อง login
  const protectedPaths = ['/', '/database', '/log', '/users', '/settings'];
  const isProtectedPath = protectedPaths.some(path => pathname.startsWith(path));

  if (isProtectedPath && !isAuthenticated) {
    const response = NextResponse.redirect(new URL('/login', request.url));
    // ลบ cookie ที่เสียหาย
    response.cookies.delete('session');
    return response;
  }

  // หน้า users และ settings เฉพาะ admin
  if (pathname.startsWith('/users') || pathname.startsWith('/settings')) {
    if (userRole !== 'admin') {
      return NextResponse.redirect(new URL('/database', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/database/:path*',
    '/log/:path*',
    '/users/:path*',
    '/settings/:path*',
    '/login'
  ]
};
