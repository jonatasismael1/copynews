create policy temp_media_source_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'temporary-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[2] = 'sources'
  and private.is_active()
);

create policy temp_media_source_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'temporary-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[2] = 'sources'
  and private.is_active()
);
