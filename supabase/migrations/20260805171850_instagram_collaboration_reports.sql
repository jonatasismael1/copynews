alter table public.instagram_profile_daily_stats
  add column if not exists authored_posts_count integer not null default 0 check (authored_posts_count between 0 and 200),
  add column if not exists collaborations_count integer not null default 0 check (collaborations_count between 0 and 200);

drop view if exists public.instagram_daily_report;
create view public.instagram_daily_report
with (security_invoker = true)
as
select stats.organization_id, stats.tracked_profile_id, profile.username,
  profile.display_name, stats.report_date, stats.posts_count,
  stats.authored_posts_count, stats.collaborations_count,
  stats.likes, stats.comments, stats.collected_at as last_sync_at
from public.instagram_profile_daily_stats stats
join public.tracked_instagram_profiles profile on profile.id = stats.tracked_profile_id
where stats.organization_id = private.current_organization_id();

revoke all on public.instagram_daily_report from anon;
grant select on public.instagram_daily_report to authenticated;

comment on column public.instagram_profile_daily_stats.authored_posts_count is
  'Posts cujo user_posted corresponde ao perfil monitorado.';
comment on column public.instagram_profile_daily_stats.collaborations_count is
  'Posts exibidos no perfil, mas publicados originalmente por outro perfil.';
