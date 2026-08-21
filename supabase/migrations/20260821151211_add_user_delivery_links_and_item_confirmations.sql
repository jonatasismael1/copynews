alter table public.profiles
  add column if not exists phone text
  check (phone is null or phone ~ '^55[1-9][0-9]{9,10}$');

create unique index if not exists profiles_org_phone_unique
  on public.profiles (organization_id, phone)
  where phone is not null;

alter table public.distribution_recipients
  add column if not exists profile_id uuid references public.profiles(id) on delete set null;

create unique index if not exists distribution_recipients_profile_unique
  on public.distribution_recipients (profile_id)
  where profile_id is not null;

create table if not exists public.news_send_item_confirmations (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.news_send_history(id) on delete cascade,
  item_position integer not null check (item_position > 0),
  publication_id uuid not null references public.publications(id) on delete cascade,
  recipient_id uuid references public.distribution_recipients(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz not null default now(),
  unique (delivery_id, item_position)
);

create index if not exists news_send_item_confirmations_delivery_idx
  on public.news_send_item_confirmations (delivery_id, item_position);

alter table public.news_send_item_confirmations enable row level security;

create table if not exists public.daily_publication_report_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_date date not null,
  status text not null default 'processing' check (status in ('processing','sent','failed','disabled')),
  message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (organization_id, report_date)
);

alter table public.daily_publication_report_runs enable row level security;

create or replace function private.link_profile_recipient_by_phone()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  if tg_table_name = 'profiles' then
    if new.phone is not null then
      update public.distribution_recipients
      set profile_id = new.id, updated_at = now()
      where organization_id = new.organization_id and phone = new.phone
        and (profile_id is null or profile_id = new.id);
    end if;
  else
    if new.phone is not null and new.profile_id is null then
      select id into new.profile_id from public.profiles
      where organization_id = new.organization_id and phone = new.phone and is_active
      limit 1;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_link_recipient_phone on public.profiles;
create trigger profiles_link_recipient_phone after insert or update of phone on public.profiles
for each row execute function private.link_profile_recipient_by_phone();

drop trigger if exists recipients_link_profile_phone on public.distribution_recipients;
create trigger recipients_link_profile_phone before insert or update of phone on public.distribution_recipients
for each row execute function private.link_profile_recipient_by_phone();

update public.distribution_recipients recipient
set profile_id = profile.id, updated_at = now()
from public.profiles profile
where recipient.organization_id = profile.organization_id
  and recipient.phone = profile.phone
  and profile.phone is not null
  and recipient.profile_id is null;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'copy-news-daily-publication-report') then
    perform cron.unschedule('copy-news-daily-publication-report');
  end if;
end $$;

select cron.schedule(
  'copy-news-daily-publication-report',
  '30 0 * * *',
  $cron$
  select net.http_post(
    url := 'https://supabase1.dbe.digital/functions/v1/daily-publication-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'copy_news_publishable_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'copy_news_instagram_report_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $cron$
);
