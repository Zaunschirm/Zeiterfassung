import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

async function getSessionPayload(req) {
  const token = req.cookies.get('session')?.value;
  if (!token) return null;
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}

export async function middleware(req) {
  const url = req.nextUrl;
  if (url.pathname.startsWith('/dashboard') || url.pathname.startsWith('/admin')) {
    const payload = await getSessionPayload(req);
    if (!payload) {
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
    if (url.pathname.startsWith('/admin') && payload.role !== 'admin') {
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*'],
};
