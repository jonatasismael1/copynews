do $$
declare job record;
begin
  for job in
    select jobid from cron.job
    where jobname like 'copy-news-instagram-%'
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end $$;

delete from vault.secrets
where name in ('copy_news_instagram_sync_secret', 'copy_news_instagram_report_secret');

update public.tracked_instagram_profiles
set sync_provider = null,
    sync_job_id = null,
    sync_job_stage = null,
    sync_job_context = null,
    sync_job_started_at = null,
    last_sync_status = 'pending',
    last_error = null
where sync_provider = 'bright-data'
   or sync_job_id is not null;

comment on table public.tracked_instagram_profiles is
  'Perfis públicos do Instagram acompanhados pela API própria Copy News.';
