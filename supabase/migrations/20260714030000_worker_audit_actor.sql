create or replace function private.audit_news_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := coalesce((select auth.uid()), new.created_by);
begin
  if old.status is distinct from new.status then
    insert into public.status_history(news_item_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, actor_id);
  end if;

  if old.generated_title is distinct from new.generated_title and new.generated_title is not null then
    insert into public.news_versions(news_item_id, field, previous_value, new_value, change_type, created_by)
    values (new.id, 'title', old.generated_title, new.generated_title, 'manual', actor_id);
  end if;

  if old.generated_caption is distinct from new.generated_caption and new.generated_caption is not null then
    insert into public.news_versions(news_item_id, field, previous_value, new_value, change_type, created_by)
    values (new.id, 'caption', old.generated_caption, new.generated_caption, 'manual', actor_id);
  end if;

  return new;
end;
$$;
