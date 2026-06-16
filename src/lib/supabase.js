// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const missingSupabaseConfig = !supabaseUrl || !supabaseAnonKey;

const missingConfigMessage =
  '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY';

function createMissingConfigClient() {
  return new Proxy({}, {
    get() {
      throw new Error(missingConfigMessage);
    },
  });
}

if (missingSupabaseConfig) {
  console.warn(missingConfigMessage);
}

export const supabase = missingSupabaseConfig
  ? createMissingConfigClient()
  : createClient(supabaseUrl, supabaseAnonKey);

export default supabase;
