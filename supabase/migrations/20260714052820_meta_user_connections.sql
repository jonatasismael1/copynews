alter table public.connected_accounts
  add column if not exists user_id uuid references public.profiles(id) on delete cascade,
  add column if not exists account_name text,
  add column if not exists provider_page_id text;

update public.connected_accounts
set user_id = (
  select id from public.profiles where role = 'admin' order by created_at limit 1
)
where user_id is null;

alter table public.connected_accounts
  alter column user_id set not null;

alter table public.connected_accounts
  drop constraint if exists connected_accounts_provider_provider_account_id_key;

create unique index if not exists connected_accounts_provider_account_user_unique
  on public.connected_accounts(provider, provider_account_id, user_id);

create index if not exists connected_accounts_user_status_idx
  on public.connected_accounts(user_id, provider, status);

drop policy if exists accounts_admin on public.connected_accounts;
drop policy if exists connected_accounts_read on public.connected_accounts;

create policy connected_accounts_read
on public.connected_accounts
for select
to authenticated
using (
  private.is_active()
  and (user_id = (select auth.uid()) or private.current_role() = 'admin')
);

comment on column public.connected_accounts.user_id is
  'Copy News user who authorized this provider account.';
comment on column public.connected_accounts.provider_page_id is
  'Provider-side Facebook Page id associated with the Instagram professional account.';
