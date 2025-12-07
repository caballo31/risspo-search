import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Si las variables de entorno no están definidas, lanza un error para evitar exponer credenciales o usar valores incorrectos.
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Supabase URL and Anon Key must be defined in .env file");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

