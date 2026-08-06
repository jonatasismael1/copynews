-- Supabase platform dumps exclude triggers attached to the managed auth schema.
-- Recreate the application trigger explicitly on self-hosted restores.
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();
