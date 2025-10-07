import { jwtVerify } from 'jose';
import { NextResponse } from 'next/server';
export async function middleware(req){ const url=req.nextUrl; if(url.pathname.startsWith('/dashboard')){ const token=req.cookies.get('session')?.value; if(!token){ url.pathname='/login'; return NextResponse.redirect(url);} try{ const secret=new TextEncoder().encode(process.env.JWT_SECRET); await jwtVerify(token,secret); return NextResponse.next(); }catch{ url.pathname='/login'; return NextResponse.redirect(url);} } return NextResponse.next(); }
export const config={ matcher:['/dashboard/:path*'] };
