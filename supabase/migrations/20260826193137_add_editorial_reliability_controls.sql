alter table public.processing_jobs
  add column if not exists priority smallint not null default 50
    check (priority between 0 and 100),
  add column if not exists requested_by_user boolean not null default false;

create index if not exists processing_jobs_priority_queue_idx
  on public.processing_jobs (priority desc, created_at)
  where status in ('queued', 'retrying');

create table if not exists public.news_title_corrections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  news_item_id uuid not null references public.news_items(id) on delete cascade,
  corrected_by uuid references public.profiles(id) on delete set null,
  detected_title text,
  corrected_title text not null,
  ocr_confidence numeric(5,4) check (ocr_confidence between 0 and 1),
  raw_ocr_text text,
  source_author text,
  created_at timestamptz not null default now(),
  check (length(trim(corrected_title)) > 0)
);

create index if not exists news_title_corrections_learning_idx
  on public.news_title_corrections (organization_id, source_author, created_at desc);

alter table public.news_title_corrections enable row level security;

create policy news_title_corrections_admin_read
on public.news_title_corrections for select to authenticated
using (
  private.is_active()
  and private.current_role() = 'admin'
  and organization_id = private.current_organization_id()
);

create policy news_title_corrections_member_insert
on public.news_title_corrections for insert to authenticated
with check (
  private.is_active()
  and corrected_by = (select auth.uid())
  and organization_id = private.current_organization_id()
  and exists (
    select 1 from public.news_items n
    join public.profiles p on p.id = n.created_by
    where n.id = news_item_id and p.organization_id = organization_id
  )
);

create table if not exists public.system_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  overall_status text not null check (overall_status in ('ok', 'warning', 'critical')),
  services jsonb not null default '{}'::jsonb,
  queues jsonb not null default '{}'::jsonb,
  storage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists system_health_snapshots_recent_idx
  on public.system_health_snapshots (organization_id, created_at desc);

alter table public.system_health_snapshots enable row level security;

create policy system_health_snapshots_admin_read
on public.system_health_snapshots for select to authenticated
using (
  private.is_active()
  and private.current_role() = 'admin'
  and organization_id = private.current_organization_id()
);

create table if not exists public.database_backup_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('running', 'success', 'failed', 'restore_verified')),
  backup_path text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  checksum text,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  restore_verified_at timestamptz
);

create index if not exists database_backup_runs_recent_idx
  on public.database_backup_runs (started_at desc);

alter table public.database_backup_runs enable row level security;

create policy database_backup_runs_admin_read
on public.database_backup_runs for select to authenticated
using (private.is_active() and private.current_role() = 'admin');

alter table public.distribution_operational_alerts
  drop constraint if exists distribution_operational_alerts_alert_type_check;

alter table public.distribution_operational_alerts
  add constraint distribution_operational_alerts_alert_type_check
  check (alert_type in (
    'slow_processing', 'download_failures', 'stalled_queue',
    'worker_offline', 'instagram_offline', 'evolution_offline',
    'storage_pressure', 'backup_stale', 'token_expiring'
  ));

comment on table public.news_title_corrections is
  'Examples of human OCR corrections used for quality analysis without exposing them as automatic facts.';
comment on column public.processing_jobs.priority is
  'Higher values are claimed first. Interactive jobs use 100 and background work uses 50 or lower.';
comment on table public.database_backup_runs is
  'Operational evidence for database backup creation and restore verification.';

do $$ begin
  if exists (select 1 from cron.job where jobname = 'copy-news-system-monitor') then
    perform cron.unschedule('copy-news-system-monitor');
  end if;
end $$;

select cron.schedule(
  'copy-news-system-monitor',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://supabase1.dbe.digital/functions/v1/system-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'copy_news_publishable_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'copy_news_retention_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $cron$
);
