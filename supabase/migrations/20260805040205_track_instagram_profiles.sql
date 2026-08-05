create table public.tracked_instagram_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9._]{1,30}$'),
  display_name text,
  profile_url text not null,
  avatar_url text,
  followers_count bigint check (followers_count is null or followers_count >= 0),
  following_count bigint check (following_count is null or following_count >= 0),
  media_count bigint check (media_count is null or media_count >= 0),
  last_sync_at timestamptz,
  last_sync_status text not null default 'pending'
    check (last_sync_status in ('pending', 'success', 'error')),
  last_error text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index tracked_instagram_profiles_org_username_unique
  on public.tracked_instagram_profiles (organization_id, lower(username));
create index tracked_instagram_profiles_org_sync_idx
  on public.tracked_instagram_profiles (organization_id, last_sync_at desc);

create trigger tracked_instagram_profiles_touch
before update on public.tracked_instagram_profiles
for each row execute function private.touch_updated_at();

alter table public.publications
  add column tracked_profile_id uuid
  references public.tracked_instagram_profiles(id) on delete set null;

create index publications_tracked_profile_date_idx
  on public.publications (tracked_profile_id, published_at desc)
  where tracked_profile_id is not null and archived_at is null;
create unique index publications_tracked_profile_media_unique
  on public.publications (tracked_profile_id, external_media_id)
  where tracked_profile_id is not null and external_media_id is not null;

alter table public.tracked_instagram_profiles enable row level security;

create policy tracked_instagram_profiles_read_organization
on public.tracked_instagram_profiles
for select
to authenticated
using (
  organization_id = private.current_organization_id()
  and private.is_active()
);

revoke all on table public.tracked_instagram_profiles from anon;
revoke insert, update, delete on table public.tracked_instagram_profiles
  from authenticated;
grant select on table public.tracked_instagram_profiles to authenticated;

comment on table public.tracked_instagram_profiles is
  'Perfis públicos do Instagram acompanhados por organização via Instaloader.';
comment on column public.publications.tracked_profile_id is
  'Perfil público monitorado que originou a publicação.';
