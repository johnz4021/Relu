import { supabase } from './supabase';

// POST to a billing endpoint with the Supabase access token, then follow the
// returned Stripe-hosted URL (Checkout or Customer Portal).
async function billingRedirect(path) {
  if (!supabase) throw new Error('Sign in to manage billing');
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Sign in to manage billing');

  const res = await fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.url) throw new Error(body.error || `Request failed (${res.status})`);
  window.location.href = body.url;
}

export const startCheckout = () => billingRedirect('/api/checkout');
export const openBillingPortal = () => billingRedirect('/api/billing-portal');
