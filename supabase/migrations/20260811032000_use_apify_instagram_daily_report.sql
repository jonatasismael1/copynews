drop view if exists public.instagram_daily_report;

create view public.instagram_daily_report
with (security_invoker = true)
as
select
  profile.organization_id,
  profile.id as tracked_profile_id,
  profile.username,
  profile.display_name,
  (post.published_at at time zone 'America/Maceio')::date as report_date,
  count(*)::integer as posts_count,
  count(*) filter (where lower(post.owner_username) = lower(profile.username))::integer as authored_posts_count,
  count(*) filter (where post.owner_username is distinct from profile.username)::integer as collaborations_count,
  coalesce(sum(metric.likes), 0)::bigint as likes,
  coalesce(sum(metric.comments), 0)::bigint as comments,
  max(metric.collected_at) as last_sync_at
from public.tracked_instagram_profiles profile
join public.instagram_posts post on post.tracked_profile_id = profile.id
left join lateral (
  select history.likes, history.comments, history.collected_at
  from public.post_metrics_history history
  where history.post_id = post.id
  order by history.collected_at desc
  limit 1
) metric on true
where profile.organization_id = private.current_organization_id()
group by profile.organization_id, profile.id, profile.username, profile.display_name,
  (post.published_at at time zone 'America/Maceio')::date;

revoke all on public.instagram_daily_report from anon;
grant select on public.instagram_daily_report to authenticated;

comment on view public.instagram_daily_report is
  'Resumo diário calculado dos posts e métricas coletados exclusivamente pelo Apify.';
