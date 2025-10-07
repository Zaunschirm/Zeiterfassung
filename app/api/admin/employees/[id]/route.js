export const runtime = 'nodejs';

import { adminClient } from '../../../../../lib/supabase';
import { createSalt, hashPin } from '../../../../../lib/pin';

export async function PATCH(req, { params }) {
  try {
    const id = params.id;
    const body = await req.json();
    const { disabled, role, display_name, newPin } = body || {};

    const updates = {};
    if (typeof disabled === 'boolean') updates.disabled = disabled;
    if (role) updates.role = role;
    if (display_name) updates.display_name = display_name;
    if (newPin) {
      const salt = createSalt();
      const hash = hashPin(newPin, salt);
      updates.pin_salt = salt;
      updates.pin_hash = hash;
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: 'nichts zu aktualisieren' }, { status: 400 });
    }

    const supa = adminClient();
    const { error } = await supa.from('employees').update(updates).eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Serverfehler' }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const id = params.id;
    const supa = adminClient();
    const { error } = await supa.from('employees').delete().eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Serverfehler' }, { status: 500 });
  }
}
