export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
const cookieName = 'zauni_session';

export async function POST() {
  const res = NextResponse.json({ ok:true });
  res.headers.set('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  return res;
}
