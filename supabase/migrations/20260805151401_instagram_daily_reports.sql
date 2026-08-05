alter table public.tracked_instagram_profiles
  add column if not exists is_fixed boolean not null default false,
  add column if not exists sync_job_started_at timestamptz;

create or replace function private.enforce_instagram_publication_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_organization uuid;
  local_date date;
  week_start date;
  daily_total integer;
  weekly_total integer;
begin
  if new.tracked_profile_id is null then
    return new;
  end if;

  select organization_id into profile_organization
  from public.tracked_instagram_profiles
  where id = new.tracked_profile_id;

  if profile_organization is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(profile_organization::text, 0));
  local_date := (new.published_at at time zone 'America/Maceio')::date;
  week_start := date_trunc('week', local_date::timestamp)::date;

  select count(*) into daily_total
  from public.publications publication
  join public.tracked_instagram_profiles profile
    on profile.id = publication.tracked_profile_id
  where profile.organization_id = profile_organization
    and publication.archived_at is null
    and (publication.published_at at time zone 'America/Maceio')::date = local_date;

  if daily_total >= 200 then
    raise exception 'Limite diário de 200 publicações monitoradas atingido'
      using errcode = '23514';
  end if;

  select count(*) into weekly_total
  from public.publications publication
  join public.tracked_instagram_profiles profile
    on profile.id = publication.tracked_profile_id
  where profile.organization_id = profile_organization
    and publication.archived_at is null
    and (publication.published_at at time zone 'America/Maceio')::date >= week_start
    and (publication.published_at at time zone 'America/Maceio')::date < week_start + 7;

  if weekly_total >= 10000 then
    raise exception 'Limite semanal de 10.000 publicações monitoradas atingido'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists publications_instagram_limits on public.publications;
create trigger publications_instagram_limits
before insert on public.publications
for each row execute function private.enforce_instagram_publication_limits();

create table if not exists public.instagram_profile_daily_stats (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tracked_profile_id uuid not null references public.tracked_instagram_profiles(id) on delete cascade,
  report_date date not null,
  posts_count integer not null default 0 check (posts_count between 0 and 200),
  views bigint not null default 0 check (views >= 0),
  likes bigint not null default 0 check (likes >= 0),
  comments bigint not null default 0 check (comments >= 0),
  reach bigint check (reach is null or reach >= 0),
  shares bigint check (shares is null or shares >= 0),
  collected_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}',
  unique (tracked_profile_id, report_date)
);

create index if not exists instagram_daily_stats_org_date_idx
  on public.instagram_profile_daily_stats (organization_id, report_date desc);

alter table public.instagram_profile_daily_stats enable row level security;
create policy instagram_daily_stats_read_organization
on public.instagram_profile_daily_stats
for select to authenticated
using (
  organization_id = private.current_organization_id()
  and private.is_active()
);
revoke all on public.instagram_profile_daily_stats from anon;
revoke insert, update, delete on public.instagram_profile_daily_stats from authenticated;
grant select on public.instagram_profile_daily_stats to authenticated;

create or replace function private.enforce_instagram_report_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  other_daily integer;
  other_weekly integer;
  week_start date;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text, 1));
  week_start := date_trunc('week', new.report_date::timestamp)::date;

  select coalesce(sum(posts_count), 0)::integer into other_daily
  from public.instagram_profile_daily_stats
  where organization_id = new.organization_id
    and report_date = new.report_date
    and tracked_profile_id <> new.tracked_profile_id;
  if other_daily + new.posts_count > 200 then
    raise exception 'Limite diário de 200 publicações monitoradas atingido'
      using errcode = '23514';
  end if;

  select coalesce(sum(posts_count), 0)::integer into other_weekly
  from public.instagram_profile_daily_stats
  where organization_id = new.organization_id
    and report_date >= week_start
    and report_date < week_start + 7
    and not (
      tracked_profile_id = new.tracked_profile_id
      and report_date = new.report_date
    );
  if other_weekly + new.posts_count > 10000 then
    raise exception 'Limite semanal de 10.000 publicações monitoradas atingido'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists instagram_daily_stats_limits on public.instagram_profile_daily_stats;
create trigger instagram_daily_stats_limits
before insert or update on public.instagram_profile_daily_stats
for each row execute function private.enforce_instagram_report_limits();

create or replace view public.instagram_daily_report
with (security_invoker = true)
as
select
  stats.organization_id,
  stats.tracked_profile_id,
  profile.username,
  profile.display_name,
  stats.report_date,
  stats.posts_count,
  stats.views,
  stats.likes,
  stats.comments,
  stats.reach,
  stats.shares,
  stats.collected_at as last_sync_at
from public.instagram_profile_daily_stats stats
join public.tracked_instagram_profiles profile
  on profile.id = stats.tracked_profile_id
where stats.organization_id = private.current_organization_id();

revoke all on public.instagram_daily_report from anon;
grant select on public.instagram_daily_report to authenticated;

with administrator as (
  select id, organization_id
  from public.profiles
  where role = 'admin' and is_active
  order by created_at
  limit 1
), requested(username) as (
  values
    ('francesfmagreste'),
    ('francesfmpenedo'),
    ('francesfmarapiraca'),
    ('francesfmcoruripee'),
    ('quilombofm')
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
  requested.username,
  requested.username,
  'https://www.instagram.com/' || requested.username || '/',
  'pending',
  'bright-data',
  true,
  administrator.id
from administrator
cross join requested
where not exists (
  select 1
  from public.tracked_instagram_profiles existing
  where existing.organization_id = administrator.organization_id
    and lower(existing.username) = lower(requested.username)
);

update public.tracked_instagram_profiles
set is_fixed = true
where lower(username) in (
  'francesfmagreste',
  'francesfmpenedo',
  'francesfmarapiraca',
  'francesfmcoruripee',
  'quilombofm'
)
and organization_id = (
  select organization_id from public.profiles
  where role = 'admin' and is_active
  order by created_at limit 1
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
    url := 'https://bfrhtnwgzhcubfrvrylf.supabase.co/functions/v1/sync-instagram-profile',
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
    url := 'https://bfrhtnwgzhcubfrvrylf.supabase.co/functions/v1/sync-instagram-profile',
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

comment on view public.instagram_daily_report is
  'Resumo diário por perfil monitorado; alcance e compartilhamentos ficam nulos quando não são públicos.';
