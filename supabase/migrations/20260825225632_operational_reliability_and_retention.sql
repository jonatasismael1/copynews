alter table public.distribution_direct_previews
  add column if not exists error_code text,
  add column if not exists retry_count integer not null default 0 check (retry_count between 0 and 5),
  add column if not exists cancel_requested_at timestamptz;

alter table public.news_send_history
  add column if not exists cancel_requested_at timestamptz;

create index if not exists distribution_previews_active_created_idx
  on public.distribution_direct_previews (created_at)
  where status in ('queued','processing');

create table if not exists public.retention_cleanup_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('running','success','failed','dry_run')),
  media_cutoff timestamptz not null,
  data_cutoff timestamptz not null,
  removed_media jsonb not null default '{}'::jsonb,
  deleted_rows jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists retention_cleanup_runs_recent_idx
  on public.retention_cleanup_runs (started_at desc);

alter table public.retention_cleanup_runs enable row level security;

create policy retention_cleanup_runs_admin_read
on public.retention_cleanup_runs for select to authenticated
using (private.is_active() and private.current_role() = 'admin');

comment on table public.retention_cleanup_runs is
  'Audit trail for the 48-hour heavy-media and 90-day operational-data retention job.';
