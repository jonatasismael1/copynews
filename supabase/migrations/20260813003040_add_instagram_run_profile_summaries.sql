alter table public.instagram_collection_runs
  add column profile_summaries jsonb not null default '[]'::jsonb;

comment on column public.instagram_collection_runs.profile_summaries is
  'Resumo diário individual por perfil, exibido antes do consolidado da execução.';
