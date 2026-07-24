drop policy if exists news_designs_insert_own on public.news_designs;
create policy news_designs_insert_own
on public.news_designs
for insert
to authenticated
with check (
  organization_id = private.current_organization_id()
  and private.current_role() in ('admin', 'editor', 'writer')
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and exists (
    select 1
    from public.news_items news
    where news.id = news_id
  )
  and exists (
    select 1
    from public.design_templates template
    where template.id = template_id
      and template.organization_id = private.current_organization_id()
      and template.is_active
  )
);

drop policy if exists news_designs_update_own on public.news_designs;
create policy news_designs_update_own
on public.news_designs
for update
to authenticated
using (
  organization_id = private.current_organization_id()
  and private.current_role() in ('admin', 'editor', 'writer')
  and exists (
    select 1
    from public.news_items news
    where news.id = news_id
  )
)
with check (
  organization_id = private.current_organization_id()
  and private.current_role() in ('admin', 'editor', 'writer')
  and updated_by = (select auth.uid())
  and exists (
    select 1
    from public.design_templates template
    where template.id = template_id
      and template.organization_id = private.current_organization_id()
      and template.is_active
  )
);

create or replace function private.guard_selected_news_design()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_news_id uuid;
  selected_organization_id uuid;
begin
  if new.selected_design_id is null then
    return new;
  end if;

  select design.news_id, design.organization_id
  into selected_news_id, selected_organization_id
  from public.news_designs design
  where design.id = new.selected_design_id;

  if selected_news_id is distinct from new.id then
    raise exception 'A arte selecionada deve pertencer a esta notícia';
  end if;

  if (select auth.uid()) is not null
     and selected_organization_id is distinct from private.current_organization_id() then
    raise exception 'A arte selecionada deve pertencer à organização atual';
  end if;

  return new;
end
$$;

revoke all on function private.guard_selected_news_design() from public;

drop trigger if exists guard_selected_news_design on public.news_items;
create trigger guard_selected_news_design
before update of selected_design_id on public.news_items
for each row execute function private.guard_selected_news_design();
