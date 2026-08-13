alter table public.instagram_collection_runs
  add column profile_summaries jsonb not null default '[]'::jsonb,
  add column report_payload jsonb not null default '{}'::jsonb,
  add column profile_appearances integer not null default 0 check (profile_appearances >= 0),
  add column unique_views bigint not null default 0 check (unique_views >= 0),
  add column internal_collaborations integer not null default 0 check (internal_collaborations >= 0),
  add column external_collaborations integer not null default 0 check (external_collaborations >= 0);

comment on column public.instagram_collection_runs.profile_summaries is
  'Resumo diário individual por perfil, exibido antes do consolidado da execução.';
