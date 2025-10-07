export const runtime = 'nodejs';

import { adminClient } from '../../../../lib/supabase';
import { createSalt, hashPin } from '../../../../lib/pin';

export async function GET() {
  const supa = adminClient();
  const { data, error } = await supa.from('employees')
    .select('id, code, display_name, role, disabled')
    .order('code', { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data || []);
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { code, display_name, role = 'employee', pin } = body || {};
    if (!code || !display_name) return Response.json({ error: 'code & display_name erforderlich' }, { status: 400 });

    const pin_salt = createSalt();
    const pin_hash = hashPin(pin || '0000', pin_salt);

    const supa = adminClient();
    const { data, error } = await supa.from('employees').insert({
      code, display_name, role, pin_salt, pin_hash, disabled: false
    }).select('id').single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, id: data.id });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Serverfehler' }, { status: 500 });
  }
}
