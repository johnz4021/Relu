# Billing (Stripe)

Paid tier: **ReLU Pro, $20/month**, unlimited sessions on the server's API key.
The session gate (`checkSessionGate` in `server/index.js`) allows a session if any
of these hold, checked in order:

1. Lifetime conversation count < `FREE_SESSION_LIMIT` (currently 50)
2. Active Stripe subscription (`subscriptions.status` in `active`/`trialing`,
   or `past_due` with grace until `current_period_end`)
3. BYOK — encrypted Anthropic API key in `user_settings`

All billing code is in `server/stripe.js` + `client/src/lib/billing.js`. Nothing
in the solver / viz / guided-agent pipeline is involved. When the Stripe env vars
are unset, billing routes return 503 and the UI hides the subscribe option — dev
environments run unchanged.

## One-time setup

1. **Database** — run `server/migrations/create_subscriptions_table.sql` in the
   Supabase SQL editor.
2. **Stripe dashboard** (start in test mode):
   - Create a Product ("ReLU Pro") with a recurring $20/month Price. Copy the
     price ID (`price_...`).
   - Developers → Webhooks → Add endpoint: `https://<your-app>/api/stripe-webhook`,
     subscribed to `checkout.session.completed`, `customer.subscription.updated`,
     `customer.subscription.deleted`. Copy the signing secret (`whsec_...`).
   - Settings → Billing → Customer portal: enable it (allows cancel + card update).
3. **Env vars** (Railway → service → Variables, and local `.env`):

   | Var | Value |
   |---|---|
   | `STRIPE_SECRET_KEY` | `sk_test_...` (then `sk_live_...`) |
   | `STRIPE_PRICE_ID` | `price_...` for the $20/mo price |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_...` from the webhook endpoint |
   | `APP_URL` | e.g. `https://relu.up.railway.app` — checkout redirect target |

## Local testing

```sh
stripe listen --forward-to localhost:3001/api/stripe-webhook
# copy the whsec_... it prints into .env as STRIPE_WEBHOOK_SECRET
npm run dev
```

Subscribe with test card `4242 4242 4242 4242`. Verify:
- a `subscriptions` row appears with `status='active'`
- the gate lifts (start a session past the free limit)
- Settings → "Manage subscription" opens the Stripe portal
- canceling in the portal flips the row to `canceled` at period end
  (use Stripe test clocks to fast-forward renewals/cancellations)

## Flow

```
SessionGate "Subscribe" → POST /api/checkout (Supabase JWT) → Stripe Checkout
Stripe → POST /api/stripe-webhook → upsert subscriptions row
redirect back /?checkout=success → check_session_status → gate lifts
```

The webhook is the single source of truth for subscription state; handlers are
idempotent upserts so Stripe retries are safe. The webhook route is registered
before `express.json()` because signature verification needs the raw body —
keep it that way if you reorder middleware.
