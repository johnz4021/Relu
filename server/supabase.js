import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  console.warn('[Supabase] Missing SUPABASE_URL or SUPABASE_SECRET_KEY — auth will be disabled');
}

export const supabase = supabaseUrl && supabaseSecretKey
  ? createClient(supabaseUrl, supabaseSecretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

/**
 * Verify a JWT token and return the user, or null if invalid.
 */
export async function verifyJWT(token) {
  if (!supabase) return null;
  if (!token) return null;

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return user;
  } catch (err) {
    console.error('[Supabase] verifyJWT error:', err.message);
    return null;
  }
}
