create policy versions_update_own
on public.news_versions
for update
to authenticated
using (created_by = (select auth.uid()))
with check (created_by = (select auth.uid()));

create or replace function public.apply_news_revision(
  p_news_id uuid,
  p_field text,
  p_value text,
  p_instruction text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  affected integer;
begin
  if actor_id is null then
    raise exception 'Unauthorized';
  end if;
  if p_field not in ('title', 'caption') or length(trim(p_value)) < 3 then
    raise exception 'Invalid revision';
  end if;

  if p_field = 'title' then
    update public.news_items set generated_title = trim(p_value) where id = p_news_id;
  else
    update public.news_items set generated_caption = trim(p_value) where id = p_news_id;
  end if;
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'News item not found or forbidden';
  end if;

  update public.news_versions
  set change_type = 'ai', instruction = nullif(trim(p_instruction), '')
  where id = (
    select id
    from public.news_versions
    where news_item_id = p_news_id
      and field = p_field
      and created_by = actor_id
    order by created_at desc
    limit 1
  );
end;
$$;

grant execute on function public.apply_news_revision(uuid, text, text, text) to authenticated;
