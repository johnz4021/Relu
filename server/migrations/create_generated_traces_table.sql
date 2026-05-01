-- Persistent cache for AI-generated algorithm trace generators.
-- Replaces the ephemeral in-memory Map so traces survive server restarts.
create table if not exists public.generated_traces (
  id uuid primary key default gen_random_uuid(),
  algorithm_id text not null unique,
  code text not null,
  renderer text not null,
  hit_count integer not null default 0,
  verified_at bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- No auth.uid() needed — this is a global cache table (server-only access via service role).
-- RLS disabled: only the server backend reads/writes this table.
alter table public.generated_traces disable row level security;

-- Index for fast lookups by algorithm_id (already covered by unique constraint, but explicit for clarity).
create index if not exists idx_generated_traces_algorithm_id on public.generated_traces(algorithm_id);
