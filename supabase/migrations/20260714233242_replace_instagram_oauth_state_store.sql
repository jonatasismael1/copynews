create table public.oauth_states (
  state_hash text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  page_id uuid not null references public.pages(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.oauth_states enable row level security;
revoke all on table public.oauth_states from anon, authenticated;

create index oauth_states_expires_at_idx
  on public.oauth_states(expires_at);

comment on table public.oauth_states is
  'Backend-only, one-time OAuth states. Raw state values are never persisted.';

drop table if exists public.instagram_oauth_states;
