alter table public.news_send_history
  drop constraint if exists news_send_history_status_check;

alter table public.news_send_history
  add constraint news_send_history_status_check
    check (status in ('queued','processing','success','partial','failed')),
  add column queued_at timestamptz not null default now(),
  add column processing_started_at timestamptz,
  add column attempts integer not null default 0 check (attempts between 0 and 3),
  add column lease_owner text,
  add column lease_expires_at timestamptz,
  add column title_label_message_id text,
  add column title_content_message_id text,
  add column caption_label_message_id text,
  add column caption_content_message_id text,
  alter column status set default 'queued';

drop index if exists public.news_send_history_one_active_idx;
create unique index news_send_history_one_active_idx
  on public.news_send_history (organization_id, news_id, recipient_id)
  where status in ('queued', 'processing');

create index news_send_history_queue_idx
  on public.news_send_history (status, queued_at)
  where status in ('queued', 'processing');

update public.news_send_history
set title_content_message_id = title_message_id,
    caption_content_message_id = caption_message_id
where title_content_message_id is null
   or caption_content_message_id is null;
