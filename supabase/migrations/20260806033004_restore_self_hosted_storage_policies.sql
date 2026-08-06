-- The managed Supabase export does not include policies owned by the Storage
-- extension. Recreate the application policies explicitly on self-hosted
-- installations so authenticated users can open and prepare media.
drop policy if exists temp_media_read on storage.objects;
create policy temp_media_read
on storage.objects for select to authenticated
using (bucket_id = 'temporary-media' and private.is_active());

drop policy if exists temp_media_source_insert on storage.objects;
create policy temp_media_source_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'temporary-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[2] = 'sources'
  and private.is_active()
);

drop policy if exists temp_media_source_delete on storage.objects;
create policy temp_media_source_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'temporary-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[2] = 'sources'
  and private.is_active()
);

drop policy if exists news_design_assets_select on storage.objects;
create policy news_design_assets_select
on storage.objects for select to authenticated
using (
  bucket_id = 'news-designs'
  and (storage.foldername(name))[1] = private.current_organization_id()::text
);

drop policy if exists news_design_assets_insert on storage.objects;
create policy news_design_assets_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'news-designs'
  and (storage.foldername(name))[1] = private.current_organization_id()::text
  and private.current_role() in ('admin', 'editor', 'writer')
);

drop policy if exists news_design_assets_update on storage.objects;
create policy news_design_assets_update
on storage.objects for update to authenticated
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

drop policy if exists news_design_assets_delete on storage.objects;
create policy news_design_assets_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'news-designs'
  and (storage.foldername(name))[1] = private.current_organization_id()::text
  and private.current_role() = 'admin'
);
