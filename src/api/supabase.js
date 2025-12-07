import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://triswlarynvmmfwkkxej.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_zBsoXCbu-e-kGWxlXDlPpw_hd3eMsLt';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

