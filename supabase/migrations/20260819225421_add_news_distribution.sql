create table public.distribution_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 100),
  vehicle text not null check (char_length(trim(vehicle)) between 2 and 120),
  phone text not null check (phone ~ '^55[1-9][0-9]{9,10}$'),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, phone)
);

create table public.news_send_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  news_id uuid not null references public.news_items(id) on delete restrict,
  recipient_id uuid references public.distribution_recipients(id) on delete set null,
  source_url text not null,
  news_title text,
  recipient_name text not null,
  recipient_vehicle text not null,
  recipient_phone text not null,
  sent_at timestamptz,
  status text not null default 'sending' check (status in ('sending','success','partial','failed')),
  link_message_id text,
  media_message_ids jsonb,
  title_message_id text,
  caption_message_id text,
  steps jsonb not null default '{}'::jsonb,
  error_message text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index distribution_recipients_org_active_idx
  on public.distribution_recipients (organization_id, is_active, name);
create index news_send_history_org_created_idx
  on public.news_send_history (organization_id, created_at desc);
create index news_send_history_duplicate_idx
  on public.news_send_history (organization_id, news_id, recipient_id, created_at desc);
create unique index news_send_history_one_active_idx
  on public.news_send_history (organization_id, news_id, recipient_id)
  where status = 'sending';

alter table public.distribution_recipients enable row level security;
alter table public.news_send_history enable row level security;

create policy distribution_recipients_read on public.distribution_recipients
for select to authenticated using (
  private.is_active() and organization_id = private.current_organization_id()
);
create policy distribution_recipients_admin_insert on public.distribution_recipients
for insert to authenticated with check (
  private.current_role() = 'admin'
  and organization_id = private.current_organization_id()
  and created_by = (select auth.uid())
);
create policy distribution_recipients_admin_update on public.distribution_recipients
for update to authenticated using (
  private.current_role() = 'admin'
  and organization_id = private.current_organization_id()
) with check (
  private.current_role() = 'admin'
  and organization_id = private.current_organization_id()
);
create policy distribution_recipients_admin_delete on public.distribution_recipients
for delete to authenticated using (
  private.current_role() = 'admin'
  and organization_id = private.current_organization_id()
);
create policy news_send_history_read on public.news_send_history
for select to authenticated using (
  private.is_active() and organization_id = private.current_organization_id()
);

insert into public.distribution_recipients
  (organization_id, name, vehicle, phone)
select organization.id, seed.name, seed.vehicle, seed.phone
from public.organizations organization
cross join (values
  ('Rita', 'Francês FM Delmiro', '5582982154537'),
  ('Deyvison', 'Quilombo FM', '5582993748393'),
  ('Evellyn', 'Francês FM Penedo', '5582993189994'),
  ('Wilford', 'Francês FM Extra', '5582996570940'),
  ('Thayane', 'Francês FM Arapiraca', '5582999348590'),
  ('Ketilly', 'Francês FM Coruripe', '5582998294048'),
  ('Ismael', 'Francês FM Agreste', '5582998264805')
) as seed(name, vehicle, phone)
where organization.slug = 'frances-news'
on conflict (organization_id, phone) do update
set name = excluded.name, vehicle = excluded.vehicle, updated_at = now();
