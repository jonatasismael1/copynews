alter table public.news_designs
  add column if not exists overlay_asset_path text,
  add column if not exists render_progress integer not null default 0
    check (render_progress between 0 and 100),
  add column if not exists render_started_at timestamptz;

alter table public.news_designs
  drop constraint if exists news_designs_export_format_check;

alter table public.news_designs
  add constraint news_designs_export_format_check
  check (export_format in ('png', 'jpg', 'mp4'));

alter table public.generated_media
  drop constraint if exists generated_media_mime_type_check;

alter table public.generated_media
  add constraint generated_media_mime_type_check
  check (mime_type in ('image/png', 'image/jpeg', 'video/mp4'));

update storage.buckets
set
  file_size_limit = 104857600,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
where id = 'news-designs';
