create unique index if not exists publications_one_manual_per_news_idx
  on public.publications (news_item_id)
  where news_item_id is not null
    and published_url = ''
    and archived_at is null;

create or replace function private.guard_news_transition() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor public.user_role;
begin
  if (select auth.uid()) is null then return new; end if;
  actor := private.current_role();
  if actor is null or actor = 'viewer' then raise exception 'Not allowed'; end if;
  if old.status is distinct from new.status
    and actor = 'writer'
    and new.status not in ('processing','draft','awaiting_approval','published','cancelled','archived')
  then
    raise exception 'Writers cannot move news to %', new.status;
  end if;
  if new.status = 'published'
    and old.status is distinct from new.status
    and not new.published_without_link_confirmed
    and not exists(
      select 1 from public.publications p
      where p.news_item_id = new.id and p.archived_at is null
    )
  then
    raise exception 'Published status requires a publication or explicit confirmation';
  end if;
  return new;
end$$;

comment on table public.news_items is
  'Operational news text and metadata retained for three months; heavy media has shorter temporary retention.';
