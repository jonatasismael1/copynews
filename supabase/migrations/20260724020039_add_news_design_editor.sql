create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.organizations (id, name, slug)
values ('00000000-0000-4000-8000-000000000001', 'Francês News', 'frances-news')
on conflict (id) do nothing;

alter table public.profiles
  add column organization_id uuid references public.organizations(id);

update public.profiles
set organization_id = '00000000-0000-4000-8000-000000000001'
where organization_id is null;

alter table public.profiles
  alter column organization_id set default '00000000-0000-4000-8000-000000000001',
  alter column organization_id set not null;

create index profiles_organization_idx
  on public.profiles (organization_id);

create or replace function private.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select organization_id
  from public.profiles
  where id = (select auth.uid())
    and is_active
$$;

grant execute on function private.current_organization_id() to authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    name,
    email,
    role,
    organization_id
  )
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new.email,
    coalesce(
      (new.raw_app_meta_data->>'role')::public.user_role,
      'writer'
    ),
    coalesce(
      nullif(new.raw_app_meta_data->>'organization_id', '')::uuid,
      '00000000-0000-4000-8000-000000000001'
    )
  );
  return new;
end
$$;

create table public.design_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  format text not null default 'story' check (format in ('story')),
  width integer not null check (width between 320 and 4320),
  height integer not null check (height between 320 and 7680),
  thumbnail_url text,
  config_json jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  is_default boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create unique index design_templates_one_default_idx
  on public.design_templates (organization_id)
  where is_default and is_active;

create table public.design_template_layers (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.design_templates(id) on delete cascade,
  layer_key text not null,
  layer_type text not null check (
    layer_type in (
      'background',
      'media',
      'overlay',
      'image',
      'shape',
      'text',
      'credits'
    )
  ),
  z_index integer not null default 0,
  config_json jsonb not null default '{}'::jsonb,
  is_visible boolean not null default true,
  is_locked boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, layer_key)
);

create table public.news_designs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  news_id uuid not null references public.news_items(id) on delete cascade,
  template_id uuid not null references public.design_templates(id),
  title_text text not null,
  category_text text not null default '',
  media_asset_path text,
  media_mime_type text,
  config_json jsonb not null default '{}'::jsonb,
  preview_path text,
  exported_file_path text,
  export_format text check (export_format in ('png', 'jpg')),
  status text not null default 'draft' check (
    status in ('draft', 'rendering', 'ready', 'failed')
  ),
  error_message text,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index news_designs_current_template_idx
  on public.news_designs (news_id, template_id);
create index news_designs_organization_idx
  on public.news_designs (organization_id, updated_at desc);

create table public.news_design_versions (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.news_designs(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  title_text text not null,
  category_text text not null default '',
  media_asset_path text,
  config_json jsonb not null,
  preview_path text,
  exported_file_path text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (design_id, version_number)
);

create table public.generated_media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  news_id uuid not null references public.news_items(id) on delete cascade,
  design_id uuid not null references public.news_designs(id) on delete cascade,
  storage_path text not null,
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg')),
  width integer not null default 1080,
  height integer not null default 1920,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.news_items
  add column selected_design_id uuid references public.news_designs(id) on delete set null;

create trigger organizations_touch
before update on public.organizations
for each row execute function private.touch_updated_at();

create trigger design_templates_touch
before update on public.design_templates
for each row execute function private.touch_updated_at();

create trigger design_template_layers_touch
before update on public.design_template_layers
for each row execute function private.touch_updated_at();

create trigger news_designs_touch
before update on public.news_designs
for each row execute function private.touch_updated_at();

alter table public.organizations enable row level security;
alter table public.design_templates enable row level security;
alter table public.design_template_layers enable row level security;
alter table public.news_designs enable row level security;
alter table public.news_design_versions enable row level security;
alter table public.generated_media enable row level security;

create policy organizations_read_own
on public.organizations
for select
to authenticated
using (
  id = private.current_organization_id()
  and private.is_active()
);

create policy organizations_admin_update
on public.organizations
for update
to authenticated
using (
  id = private.current_organization_id()
  and private.current_role() = 'admin'
)
with check (
  id = private.current_organization_id()
  and private.current_role() = 'admin'
);

create policy design_templates_read_own
on public.design_templates
for select
to authenticated
using (
  organization_id = private.current_organization_id()
  and private.is_active()
);

create policy design_templates_admin_insert
on public.design_templates
for insert
to authenticated
with check (
  organization_id = private.current_organization_id()
  and private.current_role() = 'admin'
  and created_by = (select auth.uid())
);

create policy design_templates_admin_update
on public.design_templates
for update
to authenticated
using (
  organization_id = private.current_organization_id()
  and private.current_role() = 'admin'
)
with check (
  organization_id = private.current_organization_id()
  and private.current_role() = 'admin'
);

create policy design_templates_admin_delete
on public.design_templates
for delete
to authenticated
using (
  organization_id = private.current_organization_id()
  and private.current_role() = 'admin'
);

create policy design_template_layers_read_own
on public.design_template_layers
for select
to authenticated
using (
  exists (
    select 1
    from public.design_templates template
    where template.id = template_id
      and template.organization_id = private.current_organization_id()
  )
);

create policy design_template_layers_admin_insert
on public.design_template_layers
for insert
to authenticated
with check (
  private.current_role() = 'admin'
  and exists (
    select 1
    from public.design_templates template
    where template.id = template_id
      and template.organization_id = private.current_organization_id()
  )
);

create policy design_template_layers_admin_update
on public.design_template_layers
for update
to authenticated
using (
  private.current_role() = 'admin'
  and exists (
    select 1
    from public.design_templates template
    where template.id = template_id
      and template.organization_id = private.current_organization_id()
  )
)
with check (
  private.current_role() = 'admin'
  and exists (
    select 1
    from public.design_templates template
    where template.id = template_id
      and template.organization_id = private.current_organization_id()
  )
);

create policy design_template_layers_admin_delete
on public.design_template_layers
for delete
to authenticated
using (
  private.current_role() = 'admin'
  and exists (
    select 1
    from public.design_templates template
    where template.id = template_id
      and template.organization_id = private.current_organization_id()
  )
);

create policy news_designs_read_own
on public.news_designs
for select
to authenticated
using (
  organization_id = private.current_organization_id()
  and exists (
    select 1
    from public.news_items news
    where news.id = news_id
  )
);

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
);

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
);

create policy news_designs_admin_delete
on public.news_designs
for delete
to authenticated
using (
  organization_id = private.current_organization_id()
  and private.current_role() = 'admin'
);

create policy news_design_versions_read_own
on public.news_design_versions
for select
to authenticated
using (
  exists (
    select 1
    from public.news_designs design
    where design.id = design_id
      and design.organization_id = private.current_organization_id()
  )
);

create policy news_design_versions_insert_own
on public.news_design_versions
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1
    from public.news_designs design
    where design.id = design_id
      and design.organization_id = private.current_organization_id()
  )
);

create policy generated_media_read_own
on public.generated_media
for select
to authenticated
using (
  organization_id = private.current_organization_id()
  and exists (
    select 1
    from public.news_designs design
    where design.id = design_id
      and design.organization_id = private.current_organization_id()
  )
);

create policy generated_media_insert_own
on public.generated_media
for insert
to authenticated
with check (
  organization_id = private.current_organization_id()
  and created_by = (select auth.uid())
  and private.current_role() in ('admin', 'editor', 'writer')
  and exists (
    select 1
    from public.news_designs design
    where design.id = design_id
      and design.organization_id = private.current_organization_id()
  )
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'news-designs',
  'news-designs',
  false,
  31457280,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy news_design_assets_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'news-designs'
  and (storage.foldername(name))[1] = private.current_organization_id()::text
);

create policy news_design_assets_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'news-designs'
  and (storage.foldername(name))[1] = private.current_organization_id()::text
  and private.current_role() in ('admin', 'editor', 'writer')
);

create policy news_design_assets_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'news-designs'
  and (storage.foldername(name))[1] = private.current_organization_id()::text
  and private.current_role() in ('admin', 'editor', 'writer')
)
with check (
  bucket_id = 'news-designs'
  and (storage.foldername(name))[1] = private.current_organization_id()::text
  and private.current_role() in ('admin', 'editor', 'writer')
);

create policy news_design_assets_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'news-designs'
  and (storage.foldername(name))[1] = private.current_organization_id()::text
  and private.current_role() = 'admin'
);

with inserted_template as (
  insert into public.design_templates (
    id,
    organization_id,
    name,
    slug,
    format,
    width,
    height,
    config_json,
    is_active,
    is_default
  )
  values (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000001',
    'Francês News — Story padrão',
    'frances-news-story-padrao',
    'story',
    1080,
    1920,
    jsonb_build_object(
      'fontFamily', 'Open Sans',
      'fontSizeMin', 30,
      'fontSizeMax', 36,
      'brandGradient', jsonb_build_array('#fb0039', '#d20836'),
      'titleMaxLines', 5,
      'brandAssetUrl', '/brand/frances-news-vertical.png'
    ),
    true,
    true
  )
  on conflict (id) do update
  set
    config_json = excluded.config_json,
    is_active = true,
    is_default = true,
    updated_at = now()
  returning id
)
insert into public.design_template_layers (
  template_id,
  layer_key,
  layer_type,
  z_index,
  config_json,
  is_visible,
  is_locked
)
select
  inserted_template.id,
  layer.layer_key,
  layer.layer_type,
  layer.z_index,
  layer.config_json,
  true,
  layer.is_locked
from inserted_template
cross join (
  values
    (
      'background',
      'background',
      0,
      '{"x":0,"y":0,"width":1080,"height":1920,"fill":"#111111"}'::jsonb,
      true
    ),
    (
      'media',
      'media',
      10,
      '{"x":0,"y":0,"width":1080,"height":1920,"fit":"cover","zoom":1,"offsetX":0,"offsetY":0}'::jsonb,
      false
    ),
    (
      'overlay',
      'overlay',
      20,
      '{"x":0,"y":1180,"width":1080,"height":740,"fill":"#000000","opacity":0.06}'::jsonb,
      true
    ),
    (
      'brand-signature',
      'image',
      30,
      '{"assetUrl":"/brand/frances-news-vertical.png","x":930,"y":110,"width":90,"height":535,"crop":{"x":930,"y":110,"width":90,"height":535}}'::jsonb,
      true
    ),
    (
      'brand-circle',
      'image',
      31,
      '{"assetUrl":"/brand/frances-news-vertical.png","x":930,"y":630,"width":90,"height":90,"crop":{"x":930,"y":630,"width":90,"height":90}}'::jsonb,
      true
    ),
    (
      'title-stripe',
      'shape',
      40,
      '{"x":82,"y":1572,"width":916,"height":15,"fillLinearGradientColorStops":[0,"#fb0039",1,"#d20836"]}'::jsonb,
      true
    ),
    (
      'title-box',
      'shape',
      41,
      '{"x":62,"y":1362,"width":956,"height":212,"fill":"#ffffff"}'::jsonb,
      true
    ),
    (
      'title',
      'text',
      42,
      '{"x":102,"y":1404,"width":876,"height":142,"fontFamily":"Open Sans","fontSize":36,"fontStyle":"700","lineHeight":1.22,"align":"center","verticalAlign":"middle","fill":"#050505","maxLines":5}'::jsonb,
      false
    ),
    (
      'category',
      'text',
      50,
      '{"x":282,"y":1327,"width":516,"height":62,"cornerRadius":31,"fontFamily":"Open Sans","fontSize":36,"fontStyle":"700","align":"center","verticalAlign":"middle","fill":"#ffffff","fillLinearGradientColorStops":[0,"#fb0039",1,"#d20836"]}'::jsonb,
      false
    ),
    (
      'credits',
      'credits',
      60,
      '{"x":62,"y":1790,"width":700,"height":44,"fontFamily":"Open Sans","fontSize":24,"fill":"#ffffff","opacity":0.9}'::jsonb,
      false
    )
) as layer(layer_key, layer_type, z_index, config_json, is_locked)
on conflict (template_id, layer_key) do update
set
  layer_type = excluded.layer_type,
  z_index = excluded.z_index,
  config_json = excluded.config_json,
  is_visible = excluded.is_visible,
  is_locked = excluded.is_locked,
  updated_at = now();
