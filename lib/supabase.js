import { createClient } from '@supabase/supabase-js';

/**
 * Returns a Supabase admin client (service role).
 * Throws a helpful error if required env vars are missing.
 */
export function getAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE;

  if (!url || !serviceRole) {
    throw new Error(
      `Missing Supabase env. url=${!!url} service=${!!serviceRole} (Node runtime)`
    );
  }

  return createClient(url, serviceRole, {
    auth: { persistSession: false },
    global: { headers: { 'X-Client-Info': 'zauni-pin-app' } },
  });
}
