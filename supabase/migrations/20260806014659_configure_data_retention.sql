-- Retention jobs filter by these timestamps. Permanent account, organization,
-- profile, page and template tables are deliberately excluded.
create index if not exists news_items_retention_idx
  on public.news_items (created_at);

create index if not exists publications_retention_idx
  on public.publications (published_at);

create index if not exists metric_snapshots_retention_idx
  on public.metric_snapshots (captured_at);

create index if not exists instagram_profile_daily_stats_retention_idx
  on public.instagram_profile_daily_stats (report_date);

create index if not exists audit_logs_retention_idx
  on public.audit_logs (created_at);

comment on table public.news_items is
  'Operational news data retained for six months; heavy media is retained for 48 hours.';
