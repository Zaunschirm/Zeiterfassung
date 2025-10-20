// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn('Supabase: fehlende Umgebungsvariablen VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
}

const supa = createClient(url, anonKey);

// => Default-Export, damit du überall `import supa from ...` benutzen kannst
export default supa;
