create table public.instagram_oauth_states (
  nonce_hash text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  page_id uuid not null references public.pages(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.instagram_oauth_states enable row level security;
revoke all on table public.instagram_oauth_states from anon, authenticated;

create index instagram_oauth_states_expiry_idx
  on public.instagram_oauth_states(expires_at);

comment on table public.instagram_oauth_states is
  'One-time, backend-only CSRF state records for Instagram OAuth.';
