alter table public.news_items
  add column if not exists transcribe_audio boolean not null default false;

alter table public.profiles
  add column if not exists canva_video_url text,
  add column if not exists canva_image_url text;

alter table public.profiles
  drop constraint if exists profiles_canva_video_url_check;
alter table public.profiles
  add constraint profiles_canva_video_url_check
  check (canva_video_url is null or canva_video_url ~ '^https://(www\.)?canva\.com/');

alter table public.profiles
  drop constraint if exists profiles_canva_image_url_check;
alter table public.profiles
  add constraint profiles_canva_image_url_check
  check (canva_image_url is null or canva_image_url ~ '^https://(www\.)?canva\.com/');

alter table public.metric_snapshots
  add column if not exists reposts bigint not null default 0 check (reposts >= 0);

create index if not exists connected_accounts_page_status_idx
  on public.connected_accounts(page_id, provider, status);

create or replace function public.admin_daily_results(
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with bounds as (
  select p_from as dfrom, p_to as dto
), days as (
  select generate_series(
    (select dfrom from bounds),
    (select dto from bounds) - interval '1 microsecond',
    interval '1 day'
  ) as day_start
), latest_metrics as (
  select distinct on (ms.publication_id)
    ms.publication_id,
    ms.likes,
    ms.comments,
    ms.shares,
    ms.saves,
    ms.reposts
  from public.metric_snapshots ms
  order by ms.publication_id, ms.captured_at desc
), rows as (
  select
    d.day_start,
    to_char(d.day_start at time zone 'America/Maceio', 'YYYY-MM-DD') as day,
    pr.id as user_id,
    pr.name as user_name,
    coalesce(pr.daily_goal, 0)::int as daily_goal,
    coalesce(news.news_created, 0)::int as news_created,
    coalesce(news.news_completed, 0)::int as news_completed,
    coalesce(pubs.publications, 0)::int as publications,
    coalesce(pubs.interactions, 0)::bigint as interactions
  from days d
  cross join public.profiles pr
  left join lateral (
    select
      count(*)::int as news_created,
      count(*) filter (
        where n.status not in ('processing', 'failed', 'cancelled', 'archived')
      )::int as news_completed
    from public.news_items n
    where n.created_by = pr.id
      and n.created_at >= d.day_start
      and n.created_at < d.day_start + interval '1 day'
  ) news on true
  left join lateral (
    select
      count(*)::int as publications,
      coalesce(sum(
        coalesce(lm.likes, 0) + coalesce(lm.comments, 0) +
        coalesce(lm.shares, 0) + coalesce(lm.saves, 0) + coalesce(lm.reposts, 0)
      ), 0)::bigint as interactions
    from public.publications pub
    left join latest_metrics lm on lm.publication_id = pub.id
    where coalesce(pub.posted_by, pub.created_by) = pr.id
      and pub.published_at >= d.day_start
      and pub.published_at < d.day_start + interval '1 day'
      and pub.archived_at is null
  ) pubs on true
  where pr.is_active
    and private.current_role() = 'admin'
)
select coalesce(jsonb_agg(jsonb_build_object(
  'day', day,
  'user_id', user_id,
  'user_name', user_name,
  'daily_goal', daily_goal,
  'news_created', news_created,
  'news_completed', news_completed,
  'publications', publications,
  'interactions', interactions
) order by day_start desc, user_name), '[]'::jsonb)
from rows;
$$;

grant execute on function public.admin_daily_results(timestamptz, timestamptz)
  to authenticated;
