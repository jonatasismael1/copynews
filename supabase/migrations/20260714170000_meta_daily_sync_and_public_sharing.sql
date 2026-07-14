drop index if exists public.publications_connected_media_unique;
create unique index if not exists publications_connected_media_unique
  on public.publications(connected_account_id, external_media_id);

alter table public.news_items
  add column if not exists public_slug text,
  add column if not exists share_enabled boolean not null default false,
  add column if not exists shared_at timestamptz;

create unique index if not exists news_items_public_slug_unique
  on public.news_items(public_slug)
  where public_slug is not null;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'copy-news-meta-sync') then
    perform cron.unschedule('copy-news-meta-sync');
  end if;
end $$;

select cron.schedule(
  'copy-news-meta-sync',
  '*/30 * * * *',
  $cron$
  select net.http_post(
    url := 'https://bfrhtnwgzhcubfrvrylf.supabase.co/functions/v1/sync-instagram-publications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'copy_news_publishable_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'copy_news_meta_sync_secret')
    ),
    body := '{"action":"scheduled"}'::jsonb,
    timeout_milliseconds := 25000
  );
  $cron$
);

comment on column public.news_items.public_slug is
  'Identificador público não sequencial, disponibilizado apenas quando share_enabled=true.';
