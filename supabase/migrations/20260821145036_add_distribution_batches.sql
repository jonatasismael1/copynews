alter table public.news_send_history
  drop constraint if exists news_send_history_source_type_check;

alter table public.news_send_history
  add constraint news_send_history_source_type_check
  check (source_type in ('existing_news', 'direct_url', 'direct_batch'));

alter table public.news_send_history
  add column if not exists confirmed_publication_ids uuid[] not null default '{}';

comment on column public.news_send_history.direct_payload is
  'Snapshot of a direct delivery. For direct_batch, contains an ordered items array and each item delivery_media_paths.';
