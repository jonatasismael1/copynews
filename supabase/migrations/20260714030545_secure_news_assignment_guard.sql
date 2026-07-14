create or replace function private.guard_news_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.user_role;
begin
  if new.assigned_to is distinct from old.assigned_to
     and (select auth.uid()) is not null then
    select role
      into actor_role
      from public.profiles
     where id = (select auth.uid())
       and is_active;

    if actor_role is distinct from 'admin'::public.user_role then
      raise exception 'Somente administradores podem trocar o responsavel';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_news_assignment() from public;
