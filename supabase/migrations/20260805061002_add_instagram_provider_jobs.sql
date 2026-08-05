alter table public.tracked_instagram_profiles
  add column sync_provider text,
  add column sync_job_id text,
  add column sync_job_stage text,
  add column sync_job_context jsonb;

comment on column public.tracked_instagram_profiles.sync_job_id is
  'Identificador temporário do snapshot assíncrono do provedor de Instagram.';
