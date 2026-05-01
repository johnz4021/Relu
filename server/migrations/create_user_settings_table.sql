create table public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  anthropic_api_key_encrypted text,
  would_pay boolean not null default false,
  would_pay_amount text,
  other_classes text,
  comments text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_settings_user_id_key unique (user_id)
);

alter table public.user_settings enable row level security;
create policy "Users see own settings" on public.user_settings
  for all using (auth.uid() = user_id);
