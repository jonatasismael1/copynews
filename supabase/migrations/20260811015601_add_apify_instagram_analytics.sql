create table public.instagram_posts (
  id uuid primary key default gen_random_uuid(),
  tracked_profile_id uuid not null references public.tracked_instagram_profiles(id) on delete cascade,
  instagram_id text not null,
  shortcode text,
  url text not null,
  caption text,
  published_at timestamptz,
  owner_username text,
  collaborators jsonb not null default '[]'::jsonb,
  media_type text,
  thumbnail_url text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tracked_profile_id, instagram_id)
);

create index instagram_posts_profile_published_idx on public.instagram_posts (tracked_profile_id, published_at desc);
create index instagram_posts_shortcode_idx on public.instagram_posts (shortcode) where shortcode is not null;

create table public.post_metrics_history (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.instagram_posts(id) on delete cascade,
  collected_at timestamptz not null default now(),
  likes bigint check (likes is null or likes >= 0),
  comments bigint check (comments is null or comments >= 0),
  views bigint check (views is null or views >= 0),
  plays bigint check (plays is null or plays >= 0)
);

create index post_metrics_history_post_time_idx on public.post_metrics_history (post_id, collected_at desc);

create table public.instagram_collection_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status text not null check (status in ('running', 'success', 'error')),
  trigger text not null check (trigger in ('manual', 'scheduled')),
  apify_run_id text,
  profiles jsonb not null default '[]'::jsonb,
  posts_received integer not null default 0 check (posts_received >= 0),
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index instagram_collection_runs_org_time_idx on public.instagram_collection_runs (organization_id, started_at desc);
create unique index instagram_collection_runs_one_active_idx on public.instagram_collection_runs (organization_id) where status = 'running';

alter table public.instagram_posts enable row level security;
alter table public.post_metrics_history enable row level security;
alter table public.instagram_collection_runs enable row level security;

create policy instagram_posts_read_organization on public.instagram_posts for select to authenticated
using (exists (select 1 from public.tracked_instagram_profiles p where p.id = tracked_profile_id and p.organization_id = private.current_organization_id() and private.is_active()));
create policy post_metrics_history_read_organization on public.post_metrics_history for select to authenticated
using (exists (select 1 from public.instagram_posts post join public.tracked_instagram_profiles p on p.id = post.tracked_profile_id where post.id = post_id and p.organization_id = private.current_organization_id() and private.is_active()));
create policy instagram_collection_runs_read_organization on public.instagram_collection_runs for select to authenticated
using (organization_id = private.current_organization_id() and private.is_active());

revoke all on public.instagram_posts, public.post_metrics_history, public.instagram_collection_runs from anon;
revoke insert, update, delete on public.instagram_posts, public.post_metrics_history, public.instagram_collection_runs from authenticated;
grant select on public.instagram_posts, public.post_metrics_history, public.instagram_collection_runs to authenticated;

comment on table public.instagram_posts is 'Publicações públicas coletadas exclusivamente pelo Apify.';
comment on table public.post_metrics_history is 'Histórico esparso: uma linha somente quando alguma métrica muda.';
comment on table public.instagram_collection_runs is 'Auditoria das execuções manuais e agendadas do Actor Apify.';
