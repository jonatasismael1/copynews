-- Pre-existing helper in this project must not be callable through the Data API.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
