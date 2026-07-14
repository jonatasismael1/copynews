drop policy if exists lookups_write_pages on public.pages;
create policy lookups_insert_pages on public.pages for insert to authenticated
  with check (private.current_role() in ('admin', 'editor'));
create policy lookups_update_pages on public.pages for update to authenticated
  using (private.current_role() in ('admin', 'editor'))
  with check (private.current_role() in ('admin', 'editor'));
create policy lookups_delete_pages on public.pages for delete to authenticated
  using (private.current_role() in ('admin', 'editor'));

drop policy if exists lookups_write_categories on public.categories;
create policy lookups_insert_categories on public.categories for insert to authenticated
  with check (private.current_role() in ('admin', 'editor'));
create policy lookups_update_categories on public.categories for update to authenticated
  using (private.current_role() in ('admin', 'editor'))
  with check (private.current_role() in ('admin', 'editor'));
create policy lookups_delete_categories on public.categories for delete to authenticated
  using (private.current_role() in ('admin', 'editor'));
