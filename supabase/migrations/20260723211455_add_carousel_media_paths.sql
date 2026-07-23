alter table public.news_items
  add column if not exists temporary_media_paths text[] not null default '{}';

update public.news_items
set temporary_media_paths = array[temporary_media_path]
where temporary_media_path is not null
  and cardinality(temporary_media_paths) = 0;

comment on column public.news_items.temporary_media_paths is
  'Ordered paths for every downloadable item in a temporary media set or carousel.';
