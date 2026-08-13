alter table public.instagram_collection_runs
  drop constraint if exists instagram_collection_runs_status_check;

alter table public.instagram_collection_runs
  add constraint instagram_collection_runs_status_check
  check (status in ('running', 'success', 'partial', 'error')),
  add column profiles_succeeded jsonb not null default '[]'::jsonb,
  add column profiles_failed jsonb not null default '[]'::jsonb,
  add column posts_found integer not null default 0 check (posts_found >= 0),
  add column posts_new integer not null default 0 check (posts_new >= 0),
  add column posts_updated integer not null default 0 check (posts_updated >= 0),
  add column collaborations_found integer not null default 0 check (collaborations_found >= 0),
  add column views_monitored bigint not null default 0 check (views_monitored >= 0),
  add column notification_status text not null default 'pending'
    check (notification_status in ('pending', 'sent', 'failed', 'disabled')),
  add column notification_sent_at timestamptz,
  add column notification_error text;

comment on column public.instagram_collection_runs.notification_status is
  'Estado do alerta consolidado via Evolution API; falhas não alteram o resultado da coleta.';
