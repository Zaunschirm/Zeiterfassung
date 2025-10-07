export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';
import { scrypt as _scrypt } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(_scrypt);
const cookieName = 'zauni_session';

function b64(buf){ return Buffer.from(buf).toString('base64') }

export async function POST(req) {
  try {
    const { code, pin } = await req.json();
    if (!code || !pin) {
      return NextResponse.json({ ok:false, error:'MISSING_INPUT' }, { status:400 });
    }

    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('employees')
      .select('id, code, display_name, role, pin_salt, pin_hash, disabled')
      .eq('code', code)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok:false, error:'DB_ERROR', details:error.message }, { status:500 });
    }
    if (!data) return NextResponse.json({ ok:false, error:'NOT_FOUND' }, { status:401 });
    if (data.disabled) return NextResponse.json({ ok:false, error:'DISABLED' }, { status:403 });

    const salt = Buffer.from(data.pin_salt, 'base64');
    const derived = await scrypt(pin, salt, 64);
    const ok = b64(derived) === data.pin_hash;
    if (!ok) return NextResponse.json({ ok:false, error:'INVALID_PIN' }, { status:401 });

    const payload = Buffer.from(JSON.stringify({id:data.id, code:data.code, role:data.role, name:data.display_name})).toString('base64');
    const res = NextResponse.json({ ok:true });
    res.headers.set('Set-Cookie', `${cookieName}=${payload}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`);
    return res;
  } catch (e) {
    return NextResponse.json({ ok:false, error:'SERVER_ERROR', details:String(e) }, { status:500 });
  }
}
