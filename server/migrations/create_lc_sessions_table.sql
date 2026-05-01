-- Add lc_sessions table for LeetCode practice tracking.
create table if not exists public.lc_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  problem_title text,
  algorithm_key text,
  confidence float,
  has_viz boolean not null default false,
  mastered boolean not null default false,
  attempted_at timestamptz not null default now()
);

alter table public.lc_sessions enable row level security;

create policy "Users see own lc_sessions" on public.lc_sessions
  for all using (auth.uid() = user_id);
