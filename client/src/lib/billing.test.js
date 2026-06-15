import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// billingRedirect needs a signed-in Supabase session to attach the bearer
// token; stub it so the test exercises only the redirect-vs-new-tab branch.
vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'tok_test' } } }),
    },
  },
}));

import { startCheckout } from './billing';

const STRIPE_URL = 'https://checkout.stripe.com/c/pay/test_session';

// No jsdom in this project (the other client test is a pure function). billing.js
// only touches window.location.{search,href} and window.open, so stub a minimal
// window on the node global instead of pulling in a DOM environment.
describe('billingRedirect — must not navigate the extension iframe to Stripe', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ url: STRIPE_URL }),
    }));
  });

  afterEach(() => {
    delete globalThis.window;
    vi.restoreAllMocks();
  });

  const stubWindow = (search) => {
    globalThis.window = { location: { search }, open: vi.fn() };
  };

  it('embed mode (?embed=1) opens a top-level tab and never sets location.href — Stripe blocks framing', async () => {
    stubWindow('?embed=1');

    const openedNewTab = await startCheckout();

    expect(window.open).toHaveBeenCalledWith(STRIPE_URL, '_blank', 'noopener');
    // The bug was navigating the cross-origin iframe to Stripe — assert we did not.
    expect(window.location.href).toBeUndefined();
    // Returns true so the caller (SessionGate) knows it stayed mounted and must
    // clear its loading state / allow reopening.
    expect(openedNewTab).toBe(true);
    // Server needs embed:true to flag the success_url for popup auto-close.
    expect(global.fetch).toHaveBeenCalledWith('/api/checkout', expect.objectContaining({
      body: JSON.stringify({ embed: true }),
    }));
  });

  it('web mode (no embed param) does an in-place full-page redirect', async () => {
    stubWindow('');

    const openedNewTab = await startCheckout();

    expect(window.location.href).toBe(STRIPE_URL);
    expect(window.open).not.toHaveBeenCalled();
    expect(openedNewTab).toBe(false);
    expect(global.fetch).toHaveBeenCalledWith('/api/checkout', expect.objectContaining({
      body: JSON.stringify({ embed: false }),
    }));
  });
});
