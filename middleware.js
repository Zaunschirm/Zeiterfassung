
import { NextResponse } from 'next/server'; import { jwtVerify } from 'jose';
async function getPayload(req){ const t=req.cookies.get('session')?.value; if(!t) return null; try{ const s=new TextEncoder().encode(process.env.JWT_SECRET); const {payload}=await jwtVerify(t,s); return payload; }catch{return null;}}
export async function middleware(req){ const url=req.nextUrl; if(url.pathname.startsWith('/dashboard')||url.pathname.startsWith('/admin')){ const p=await getPayload(req); if(!p){ url.pathname='/login'; return NextResponse.redirect(url);} if(url.pathname.startsWith('/admin')&&p.role!=='admin'){ url.pathname='/dashboard'; return NextResponse.redirect(url);} } return NextResponse.next(); }
export const config={ matcher:['/dashboard/:path*','/admin/:path*'] };
