// Stripe billing integration. Three surfaces:
//   POST /api/stripe-webhook   — Stripe → us. Source of truth for subscription
//                                state; syncs the subscriptions table.
//   POST /api/checkout         — authed user → hosted Stripe Checkout URL.
//   POST /api/billing-portal   — authed user → hosted Customer Portal URL
//                                (cancel, update card) so we build no billing UI.
//
// The webhook route MUST be registered before express.json() — Stripe
// signature verification needs the raw request body. index.js calls
// registerStripeWebhook(app) before the json middleware and
// registerStripeRoutes(app) after it.
//
// All routes 503 cleanly when STRIPE_SECRET_KEY is unset, so dev environments
// without Stripe config run unchanged.
import express from 'express';
import Stripe from 'stripe';
import { verifyJWT } from './supabase.js';
import { getSubscription, upsertSubscription, updateSubscriptionByCustomer } from './db.js';

const stripeKey = process.env.STRIPE_SECRET_KEY;
export const stripe = stripeKey ? new Stripe(stripeKey) : null;

export const billingEnabled = !!(stripeKey && process.env.STRIPE_PRICE_ID);

if (stripeKey && !process.env.STRIPE_PRICE_ID) {
  console.warn('[Stripe] STRIPE_SECRET_KEY set but STRIPE_PRICE_ID missing — billing disabled');
}

// Statuses that grant access. past_due gets grace until current_period_end
// (card failures shouldn't hard-cut someone mid-cycle).
export function isSubscriptionActive(sub) {
  if (!sub) return false;
  if (sub.status === 'active' || sub.status === 'trialing') return true;
  if (sub.status === 'past_due' && sub.current_period_end) {
    return new Date(sub.current_period_end) > new Date();
  }
  return false;
}

// current_period_end lives on subscription items in newer Stripe API
// versions; fall back to the legacy top-level field.
function periodEnd(subscription) {
  const ts = subscription.items?.data?.[0]?.current_period_end || subscription.current_period_end;
  return ts ? new Date(ts * 1000).toISOString() : null;
}

function appUrl(req) {
  return process.env.APP_URL || `${req.headers.origin || 'http://localhost:5173'}`;
}

// Bearer-token auth for the user-initiated routes. WS auth happens at upgrade
// time; these are plain HTTP so they carry the Supabase JWT in the header.
async function requireUser(req, res) {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  const user = token ? await verifyJWT(token) : null;
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  return user;
}

export function registerStripeWebhook(app) {
  app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).end();

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('[Stripe] Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const userId = session.client_reference_id;
          if (!userId) {
            console.error('[Stripe] checkout.session.completed without client_reference_id');
            break;
          }
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          await upsertSubscription(userId, {
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            status: subscription.status,
            current_period_end: periodEnd(subscription),
          });
          console.log(`[Stripe] Subscription started for user ${userId} (${subscription.status})`);
          break;
        }
        case 'customer.subscription.updated': {
          const subscription = event.data.object;
          await updateSubscriptionByCustomer(subscription.customer, {
            stripe_subscription_id: subscription.id,
            status: subscription.status,
            current_period_end: periodEnd(subscription),
          });
          console.log(`[Stripe] Subscription updated for customer ${subscription.customer} → ${subscription.status}`);
          break;
        }
        case 'customer.subscription.deleted': {
          const subscription = event.data.object;
          await updateSubscriptionByCustomer(subscription.customer, {
            status: 'canceled',
            current_period_end: periodEnd(subscription),
          });
          console.log(`[Stripe] Subscription canceled for customer ${subscription.customer}`);
          break;
        }
        default:
          break; // unsubscribed event types are fine to ignore
      }
    } catch (err) {
      // 500 → Stripe retries with backoff; handlers are idempotent upserts so
      // replays are safe.
      console.error(`[Stripe] Webhook handler error (${event.type}):`, err.message);
      return res.status(500).json({ error: 'Webhook handler failed' });
    }

    res.json({ received: true });
  });
}

export function registerStripeRoutes(app) {
  app.post('/api/checkout', async (req, res) => {
    if (!billingEnabled) return res.status(503).json({ error: 'Billing not configured' });
    const user = await requireUser(req, res);
    if (!user) return;

    try {
      const existing = await getSubscription(user.id);
      if (isSubscriptionActive(existing)) {
        return res.status(400).json({ error: 'Already subscribed' });
      }
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
        client_reference_id: user.id,
        // Reuse the Stripe customer on resubscribe; otherwise let Checkout
        // create one, prefilled with the account email.
        ...(existing?.stripe_customer_id
          ? { customer: existing.stripe_customer_id }
          : { customer_email: user.email }),
        success_url: `${appUrl(req)}/?checkout=success`,
        cancel_url: `${appUrl(req)}/?checkout=cancel`,
      });
      res.json({ url: session.url });
    } catch (err) {
      console.error('[Stripe] Checkout session creation failed:', err.message);
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  });

  app.post('/api/billing-portal', async (req, res) => {
    if (!stripe) return res.status(503).json({ error: 'Billing not configured' });
    const user = await requireUser(req, res);
    if (!user) return;

    try {
      const sub = await getSubscription(user.id);
      if (!sub?.stripe_customer_id) return res.status(404).json({ error: 'No subscription found' });
      const portal = await stripe.billingPortal.sessions.create({
        customer: sub.stripe_customer_id,
        return_url: appUrl(req),
      });
      res.json({ url: portal.url });
    } catch (err) {
      console.error('[Stripe] Portal session creation failed:', err.message);
      res.status(500).json({ error: 'Failed to create portal session' });
    }
  });
}
