with administrator as (
  select id, organization_id
  from public.profiles
  where role = 'admin' and is_active
  order by created_at
  limit 1
)
insert into public.tracked_instagram_profiles (
  organization_id,
  username,
  display_name,
  profile_url,
  last_sync_status,
  sync_provider,
  is_fixed,
  created_by
)
select
  administrator.organization_id,
  'francesfmdelmiro',
  'francesfmdelmiro',
  'https://www.instagram.com/francesfmdelmiro/',
  'pending',
  'bright-data',
  true,
  administrator.id
from administrator
where not exists (
  select 1
  from public.tracked_instagram_profiles existing
  where existing.organization_id = administrator.organization_id
    and lower(existing.username) = 'francesfmdelmiro'
);

update public.tracked_instagram_profiles
set
  is_fixed = true,
  sync_provider = 'bright-data',
  last_sync_status = case when last_sync_status = 'error' then 'pending' else last_sync_status end,
  last_error = case when last_sync_status = 'error' then null else last_error end,
  updated_at = now()
where lower(username) in (
  'francesfmagreste',
  'francesfmpenedo',
  'francesfmarapiraca',
  'francesfmcoruripee',
  'francesfmdelmiro',
  'quilombofm'
)
and organization_id = (
  select organization_id
  from public.profiles
  where role = 'admin' and is_active
  order by created_at
  limit 1
);

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'copy-news-instagram-report-start') then
    perform cron.unschedule('copy-news-instagram-report-start');
  end if;
  if exists (select 1 from cron.job where jobname = 'copy-news-instagram-report-poll') then
    perform cron.unschedule('copy-news-instagram-report-poll');
  end if;
end $$;

select cron.schedule(
  'copy-news-instagram-report-start',
  '45 21 * * *',
  $cron$
  select net.http_post(
    url := 'https://supabase1.dbe.digital/functions/v1/sync-instagram-profile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'copy_news_publishable_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'copy_news_instagram_report_secret')
    ),
    body := jsonb_build_object(
      'profile_id', profile.id,
      'start_date', to_char(now() at time zone 'America/Maceio', 'MM-DD-YYYY'),
      'end_date', to_char((now() at time zone 'America/Maceio') + interval '1 day', 'MM-DD-YYYY')
    ),
    timeout_milliseconds := 25000
  )
  from public.tracked_instagram_profiles profile
  where profile.is_fixed;
  $cron$
);

select cron.schedule(
  'copy-news-instagram-report-poll',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://supabase1.dbe.digital/functions/v1/sync-instagram-profile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'copy_news_publishable_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'copy_news_instagram_report_secret')
    ),
    body := jsonb_build_object('profile_id', profile.id),
    timeout_milliseconds := 25000
  )
  from public.tracked_instagram_profiles profile
  where profile.is_fixed
    and profile.sync_job_id is not null;
  $cron$
);
