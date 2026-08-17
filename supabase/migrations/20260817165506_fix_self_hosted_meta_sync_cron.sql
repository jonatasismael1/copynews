-- Keep the production Meta sync on the self-hosted Supabase used by Copy News.
-- Required Vault secrets:
--   copy_news_publishable_key
--   copy_news_meta_sync_secret
do $$ begin
  if exists (select 1 from cron.job where jobname = 'copy-news-meta-sync') then
    perform cron.unschedule('copy-news-meta-sync');
  end if;
end $$;

select cron.schedule(
  'copy-news-meta-sync',
  '0 0,17 * * *', -- 21:00 and 14:00 America/Maceio (UTC-3)
  $cron$
  select net.http_post(
    url := 'https://supabase1.dbe.digital/functions/v1/sync-instagram-publications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'copy_news_publishable_key'
      ),
      'x-cron-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'copy_news_meta_sync_secret'
      )
    ),
    body := '{"action":"scheduled"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);
