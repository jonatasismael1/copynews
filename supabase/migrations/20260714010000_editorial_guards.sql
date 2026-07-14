alter table public.news_items add column if not exists published_without_link_confirmed boolean not null default false;

create or replace function private.guard_news_transition() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor public.user_role;
begin
  if (select auth.uid()) is null then return new; end if;
  actor := private.current_role();
  if actor is null or actor = 'viewer' then raise exception 'Not allowed'; end if;
  if old.status is distinct from new.status and actor = 'writer' and new.status not in ('processing','draft','awaiting_approval','cancelled','archived') then
    raise exception 'Writers cannot move news to %', new.status;
  end if;
  if new.status = 'published' and old.status is distinct from new.status and not new.published_without_link_confirmed and not exists(select 1 from public.publications p where p.news_item_id=new.id and p.archived_at is null) then
    raise exception 'Published status requires a publication or explicit confirmation';
  end if;
  return new;
end$$;

create trigger guard_news_transition before update on public.news_items for each row execute function private.guard_news_transition();
