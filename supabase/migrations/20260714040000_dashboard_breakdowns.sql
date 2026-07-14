create or replace function public.dashboard_summary(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with bounds as (
  select
    coalesce(
      p_from,
      date_trunc('day', now() at time zone 'America/Maceio') at time zone 'America/Maceio'
    ) as dfrom,
    coalesce(
      p_to,
      (date_trunc('day', now() at time zone 'America/Maceio') + interval '1 day') at time zone 'America/Maceio'
    ) as dto
), period as (
  select greatest(1, ceil(extract(epoch from (dto - dfrom)) / 86400)::int) as days
  from bounds
), days as (
  select generate_series(
    (select dfrom from bounds),
    (select dto from bounds) - interval '1 microsecond',
    interval '1 day'
  ) as day_start
), series as (
  select
    to_char(d.day_start at time zone 'America/Maceio', 'DD/MM') as label,
    count(p.id)::int as total
  from days d
  left join public.publications p
    on p.published_at >= d.day_start
    and p.published_at < d.day_start + interval '1 day'
    and p.archived_at is null
  group by d.day_start
  order by d.day_start
), latest_metrics as (
  select distinct on (ms.publication_id)
    ms.publication_id,
    ms.views,
    ms.likes,
    ms.comments,
    ms.shares,
    ms.saves
  from public.metric_snapshots ms
  order by ms.publication_id, ms.captured_at desc
), production_by_user as (
  select
    pr.id,
    pr.name,
    pr.daily_goal,
    count(n.id)::int as total
  from public.profiles pr
  cross join bounds b
  left join public.news_items n
    on n.created_by = pr.id
    and n.created_at >= b.dfrom
    and n.created_at < b.dto
  where pr.is_active
  group by pr.id, pr.name, pr.daily_goal
  order by total desc, pr.name
), publications_by_page as (
  select
    coalesce(pg.name, 'Sem página') as name,
    count(pub.id)::int as total
  from public.publications pub
  cross join bounds b
  left join public.pages pg on pg.id = pub.page_id
  where pub.published_at >= b.dfrom
    and pub.published_at < b.dto
    and pub.archived_at is null
  group by coalesce(pg.name, 'Sem página')
  order by total desc, name
), user_ranking as (
  select
    pr.id,
    pr.name,
    count(pub.id)::int as publications,
    coalesce(sum(
      coalesce(lm.likes, 0) + coalesce(lm.comments, 0) +
      coalesce(lm.shares, 0) + coalesce(lm.saves, 0)
    ), 0)::bigint as interactions
  from public.profiles pr
  cross join bounds b
  left join public.publications pub
    on coalesce(pub.posted_by, pub.created_by) = pr.id
    and pub.published_at >= b.dfrom
    and pub.published_at < b.dto
    and pub.archived_at is null
  left join latest_metrics lm on lm.publication_id = pub.id
  where pr.is_active
  group by pr.id, pr.name
  order by publications desc, interactions desc, pr.name
)
select jsonb_build_object(
  'news_created', (
    select count(*) from public.news_items, bounds
    where created_at >= dfrom and created_at < dto
  ),
  'awaiting_approval', (
    select count(*) from public.news_items where status = 'awaiting_approval'
  ),
  'approved', (
    select count(*) from public.news_items, bounds
    where status = 'approved' and updated_at >= dfrom and updated_at < dto
  ),
  'scheduled', (
    select count(*) from public.news_items where status = 'scheduled'
  ),
  'publications', (
    select count(*) from public.publications, bounds
    where published_at >= dfrom and published_at < dto and archived_at is null
  ),
  'external_publications', (
    select count(*) from public.publications, bounds
    where source_type = 'external' and published_at >= dfrom and published_at < dto and archived_at is null
  ),
  'daily_goal', coalesce((select sum(daily_goal) from public.profiles where is_active), 0),
  'period_goal', coalesce((select sum(daily_goal) from public.profiles where is_active), 0) * (select days from period),
  'period_days', (select days from period),
  'daily_series', (
    select coalesce(jsonb_agg(jsonb_build_object('day', label, 'total', total)), '[]'::jsonb)
    from series
  ),
  'production_by_user', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'total', total, 'daily_goal', daily_goal
    )), '[]'::jsonb) from production_by_user
  ),
  'publications_by_page', (
    select coalesce(jsonb_agg(jsonb_build_object('name', name, 'total', total)), '[]'::jsonb)
    from publications_by_page
  ),
  'ranking', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'publications', publications, 'interactions', interactions
    )), '[]'::jsonb) from user_ranking
  ),
  'top_publications', (
    select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb)
    from (
      select
        pub.id,
        pub.title,
        coalesce(lm.views, 0)::bigint as views,
        (coalesce(lm.likes, 0) + coalesce(lm.comments, 0) +
         coalesce(lm.shares, 0) + coalesce(lm.saves, 0))::bigint as interactions
      from public.publications pub
      cross join bounds b
      left join latest_metrics lm on lm.publication_id = pub.id
      where pub.published_at >= b.dfrom
        and pub.published_at < b.dto
        and pub.archived_at is null
      order by views desc, interactions desc
      limit 5
    ) x
  )
);
$$;

grant execute on function public.dashboard_summary(timestamptz, timestamptz) to authenticated;
