alter function public.admin_daily_results(timestamptz, timestamptz)
  set schema private;
alter function private.admin_daily_results(timestamptz, timestamptz)
  security definer;

revoke all on function private.admin_daily_results(timestamptz, timestamptz)
  from public;
grant usage on schema private to authenticated;
grant execute on function private.admin_daily_results(timestamptz, timestamptz)
  to authenticated;

create function public.admin_daily_results(
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.admin_daily_results(p_from, p_to);
$$;

grant execute on function public.admin_daily_results(timestamptz, timestamptz)
  to authenticated;
