import { supabase } from './supabase';

// POST to a billing endpoint with the Supabase access token, then follow the
// returned Stripe-hosted URL (Checkout or Customer Portal).
async function billingRedirect(path) {
  if (!supabase) throw new Error('Sign in to manage billing');
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Sign in to manage billing');

  // In the leetcode extension the app runs in a cross-origin iframe. Pass that
  // along so the server can flag Checkout's success_url for popup auto-close.
  const inEmbed = new URLSearchParams(window.location.search).get('embed') === '1';

  const res = await fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ embed: inEmbed }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.url) throw new Error(body.error || `Request failed (${res.status})`);

  // Stripe's hosted Checkout / Customer Portal refuse to be framed
  // (X-Frame-Options + CSP frame-ancestors) — navigating the iframe to body.url
  // just blanks the panel. In embed mode open a top-level tab instead; the
  // standalone web app keeps the in-place full-page redirect. The webhook is the
  // source of truth for the subscription either way, and the embed panel
  // re-checks the gate when the user returns to it (visibilitychange), so it
  // unlocks without a return navigation into the frame.
  if (inEmbed) {
    window.open(body.url, '_blank', 'noopener');
  } else {
    window.location.href = body.url;
  }

  // true → opened a new tab and the caller stays mounted (so it must clear its
  // own loading state, and can offer "reopen"); false → the page is navigating
  // away, so caller state is moot.
  return inEmbed;
}

export const startCheckout = () => billingRedirect('/api/checkout');
export const openBillingPortal = () => billingRedirect('/api/billing-portal');
