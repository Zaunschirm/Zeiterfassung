// /src/lib/supabase.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('⚠️ Supabase ENV fehlen: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
}

const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Beide Varianten exportieren -> egal wie du importierst, es klappt
export default supa;
export { supa as supabase, supa };
