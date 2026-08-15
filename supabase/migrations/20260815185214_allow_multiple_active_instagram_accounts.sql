drop index if exists public.connected_accounts_one_active_instagram_per_user;

create unique index if not exists connected_accounts_one_active_instagram_account
  on public.connected_accounts(user_id, provider_account_id)
  where provider = 'instagram' and status = 'connected';

comment on index public.connected_accounts_one_active_instagram_account is
  'Allows several Instagram accounts per Copy News user while preventing the same account from being connected twice.';
