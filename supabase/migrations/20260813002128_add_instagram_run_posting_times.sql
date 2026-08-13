alter table public.instagram_collection_runs
  add column posting_times jsonb not null default '[]'::jsonb;

comment on column public.instagram_collection_runs.posting_times is
  'Horários locais HH:MM das publicações encontradas no dia da coleta.';
