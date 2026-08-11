create table public.instagram_profile_snapshots (
  id uuid primary key default gen_random_uuid(),
  tracked_profile_id uuid not null references public.tracked_instagram_profiles(id) on delete cascade,
  followers bigint not null default 0 check (followers >= 0),
  following bigint not null default 0 check (following >= 0),
  media_count bigint not null default 0 check (media_count >= 0),
  provider text not null,
  collected_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'
);

create index instagram_profile_snapshots_profile_time_idx
  on public.instagram_profile_snapshots (tracked_profile_id, collected_at desc);

alter table public.instagram_profile_snapshots enable row level security;
create policy instagram_profile_snapshots_read_organization
on public.instagram_profile_snapshots for select to authenticated
using (exists (
  select 1 from public.tracked_instagram_profiles profile
  where profile.id = tracked_profile_id
    and profile.organization_id = private.current_organization_id()
    and private.is_active()
));

revoke all on public.instagram_profile_snapshots from anon;
revoke insert, update, delete on public.instagram_profile_snapshots from authenticated;
grant select on public.instagram_profile_snapshots to authenticated;

comment on table public.instagram_profile_snapshots is
  'Histórico imutável de métricas públicas dos perfis monitorados.';
