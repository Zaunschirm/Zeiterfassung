import supa from '../lib/supabase.js';

export async function signIn(email, password) {
  const { data, error } = await supa.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}
