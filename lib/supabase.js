import { createClient } from '@supabase/supabase-js';

export function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE fehlen');
  return createClient(url, key, { auth: { persistSession: false } });
}
