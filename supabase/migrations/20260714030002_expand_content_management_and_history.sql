alter table public.connected_accounts
  add column if not exists history_window_days integer not null default 90,
  add column if not exists sync_from timestamptz not null default (now() - interval '90 days'),
  add column if not exists sync_cursor text;

alter table public.connected_accounts
  drop constraint if exists connected_accounts_history_window_days_check;
alter table public.connected_accounts
  add constraint connected_accounts_history_window_days_check
  check (history_window_days between 1 and 90);

update public.connected_accounts
set history_window_days = 90,
    sync_from = now() - interval '90 days';

alter table public.publications
  add column if not exists connected_account_id uuid
  references public.connected_accounts(id) on delete set null;

create index if not exists publications_connected_account_idx
  on public.publications(connected_account_id, published_at desc);
create unique index if not exists publications_connected_media_unique
  on public.publications(connected_account_id, external_media_id)
  where connected_account_id is not null and external_media_id is not null;

drop policy if exists news_delete on public.news_items;
create policy news_delete on public.news_items
for delete to authenticated
using (
  private.current_role() in ('admin', 'editor')
  or (
    private.current_role() = 'writer'
    and (created_by = (select auth.uid()) or assigned_to = (select auth.uid()))
  )
);

drop policy if exists publications_delete on public.publications;
create policy publications_delete on public.publications
for delete to authenticated
using (
  private.current_role() in ('admin', 'editor')
  or (
    private.current_role() = 'writer'
    and (created_by = (select auth.uid()) or posted_by = (select auth.uid()))
  )
);
