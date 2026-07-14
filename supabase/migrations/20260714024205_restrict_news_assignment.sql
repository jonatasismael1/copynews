drop policy if exists news_insert on public.news_items;
create policy news_insert on public.news_items
for insert to authenticated
with check (
  private.current_role() in ('admin', 'editor', 'writer')
  and created_by = (select auth.uid())
  and assigned_to = (select auth.uid())
);

create or replace function private.guard_news_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.assigned_to is distinct from old.assigned_to
     and (select auth.uid()) is not null
     and private.current_role() <> 'admin' then
    raise exception 'Somente administradores podem trocar o responsável';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_news_assignment on public.news_items;
create trigger guard_news_assignment
before update of assigned_to on public.news_items
for each row execute function private.guard_news_assignment();
