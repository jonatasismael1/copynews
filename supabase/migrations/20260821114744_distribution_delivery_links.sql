alter table public.news_send_history
  add column if not exists share_slug text,
  add column if not exists sender_name text,
  add column if not exists delivery_media_paths text[] not null default '{}',
  add column if not exists delivery_media_expires_at timestamptz;

create unique index if not exists news_send_history_share_slug_unique
  on public.news_send_history (share_slug)
  where share_slug is not null;

comment on column public.news_send_history.share_slug is
  'Identificador público aleatório da página de entrega enviada pelo WhatsApp.';
comment on column public.news_send_history.delivery_media_paths is
  'Cópias temporárias das mídias disponibilizadas na página pública de entrega.';
