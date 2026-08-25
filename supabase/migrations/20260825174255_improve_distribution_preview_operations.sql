alter table public.distribution_direct_previews
  add column stage text not null default 'queued'
    check (stage in ('queued','metadata','download','frames','ocr','finalizing','ready','failed')),
  add column progress smallint not null default 0
    check (progress between 0 and 100),
  add column stage_started_at timestamptz not null default now(),
  add column heartbeat_at timestamptz,
  add column completed_at timestamptz,
  add column timings jsonb not null default '{}'::jsonb,
  add column ocr_confidence numeric(5,4)
    check (ocr_confidence between 0 and 1),
  add column confidence_level text
    check (confidence_level in ('high','medium','low','unavailable')),
  add column cache_hit boolean not null default false,
  add column cached_from uuid references public.distribution_direct_previews(id) on delete set null;

update public.distribution_direct_previews
set stage = case status
  when 'ready' then 'ready'
  when 'failed' then 'failed'
  when 'processing' then 'download'
  else 'queued'
end,
progress = case status when 'ready' then 100 when 'failed' then 100 when 'processing' then 20 else 0 end,
completed_at = case when status in ('ready','failed') then updated_at else null end,
confidence_level = case
  when title_state = 'found' then 'medium'
  when title_state in ('absent','failed') then 'unavailable'
  else null
end;

create index distribution_direct_previews_user_recent_idx
  on public.distribution_direct_previews (created_by, created_at desc);

create index distribution_direct_previews_cache_idx
  on public.distribution_direct_previews (organization_id, normalized_url, completed_at desc)
  where status = 'ready';

create index distribution_direct_previews_stalled_idx
  on public.distribution_direct_previews (heartbeat_at)
  where status = 'processing';

create table public.distribution_operational_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  alert_type text not null
    check (alert_type in ('slow_processing','download_failures','stalled_queue')),
  severity text not null default 'warning'
    check (severity in ('warning','critical')),
  title text not null,
  details jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  status text not null default 'open'
    check (status in ('open','resolved')),
  occurrences integer not null default 1 check (occurrences > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index distribution_operational_alerts_open_dedupe_idx
  on public.distribution_operational_alerts (organization_id, dedupe_key)
  where status = 'open';

create index distribution_operational_alerts_recent_idx
  on public.distribution_operational_alerts (organization_id, status, last_seen_at desc);

alter table public.distribution_operational_alerts enable row level security;

create policy distribution_operational_alerts_admin_read
on public.distribution_operational_alerts
for select to authenticated
using (
  private.is_active()
  and private.current_role() = 'admin'
  and organization_id = private.current_organization_id()
);

create policy distribution_operational_alerts_admin_update
on public.distribution_operational_alerts
for update to authenticated
using (
  private.is_active()
  and private.current_role() = 'admin'
  and organization_id = private.current_organization_id()
)
with check (
  private.is_active()
  and private.current_role() = 'admin'
  and organization_id = private.current_organization_id()
);
