-- Stripe subscription state, synced by the /api/stripe-webhook handler.
-- One row per user. status mirrors Stripe's subscription status verbatim
-- ('active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | ...).
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text,
  status text not null default 'inactive',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_user_id_key unique (user_id)
);

-- Webhook looks rows up by customer id on subscription.updated/deleted
create index subscriptions_stripe_customer_id_idx on public.subscriptions (stripe_customer_id);

-- Writes go through the server's service-role key only; clients may read
-- their own row to render billing state.
alter table public.subscriptions enable row level security;
create policy "Users see own subscription" on public.subscriptions
  for select using (auth.uid() = user_id);
