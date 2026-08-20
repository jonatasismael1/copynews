alter table public.news_send_history
  alter column news_id drop not null,
  add column source_type text not null default 'existing_news'
    check (source_type in ('existing_news', 'direct_url')),
  add column direct_payload jsonb;

drop index if exists public.news_send_history_one_active_idx;
create unique index news_send_history_one_active_news_idx
  on public.news_send_history (organization_id, news_id, recipient_id)
  where status in ('queued', 'processing') and news_id is not null;
create unique index news_send_history_one_active_url_idx
  on public.news_send_history (organization_id, source_url, recipient_id)
  where status in ('queued', 'processing') and source_type = 'direct_url';

create table public.distribution_direct_previews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_url text not null,
  normalized_url text not null,
  status text not null default 'queued' check (status in ('queued','processing','ready','failed')),
  media_kind text check (media_kind in ('image','video','carousel')),
  media_count integer not null default 0,
  original_title text,
  original_caption text,
  title_state text check (title_state in ('found','absent','failed')),
  caption_state text check (caption_state in ('found','absent','failed')),
  error_message text,
  attempts integer not null default 0 check (attempts between 0 and 3),
  lease_owner text,
  lease_expires_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours')
);

create index distribution_direct_previews_queue_idx
  on public.distribution_direct_previews (status, created_at)
  where status in ('queued','processing');

alter table public.distribution_direct_previews enable row level security;
create policy distribution_direct_previews_read on public.distribution_direct_previews
for select to authenticated using (
  private.is_active() and organization_id = private.current_organization_id()
  and created_by = (select auth.uid())
);
create policy distribution_direct_previews_insert on public.distribution_direct_previews
for insert to authenticated with check (
  private.is_active() and organization_id = private.current_organization_id()
  and created_by = (select auth.uid())
);
