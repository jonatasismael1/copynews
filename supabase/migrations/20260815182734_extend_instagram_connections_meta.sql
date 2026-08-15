alter table public.connected_accounts
  add column if not exists username text,
  add column if not exists profile_picture_url text,
  add column if not exists last_refresh_at timestamptz,
  add column if not exists refresh_error text,
  add column if not exists needs_attention boolean not null default false,
  add column if not exists data_source text not null default 'apify'
    check (data_source in ('meta', 'apify', 'meta+apify'));

create index if not exists connected_accounts_refresh_due_idx
  on public.connected_accounts(token_expires_at)
  where provider = 'instagram' and status = 'connected';

comment on column public.connected_accounts.data_source is
  'Fonte ativa: Meta oficial, Apify ou composição das duas.';

alter table public.metric_snapshots
  alter column views drop not null,
  alter column reach drop not null,
  alter column impressions drop not null,
  alter column likes drop not null,
  alter column comments drop not null,
  alter column shares drop not null,
  alter column saves drop not null,
  alter column clicks drop not null,
  alter column followers_gained drop not null,
  alter column reposts drop not null;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'copy-news-meta-sync') then
    perform cron.unschedule('copy-news-meta-sync');
  end if;
end $$;

select cron.schedule(
  'copy-news-meta-sync',
  '0 0,17 * * *',
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
