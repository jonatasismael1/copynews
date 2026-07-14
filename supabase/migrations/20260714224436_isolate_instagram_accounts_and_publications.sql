-- Each person keeps a single active Instagram connection. Older connections
-- remain as an audit/history record, but cannot be used or exposed as active.
with ranked as (
  select id,
         row_number() over (
           partition by user_id, provider
           order by updated_at desc nulls last, created_at desc, id desc
         ) as position
  from public.connected_accounts
  where provider = 'instagram' and status = 'connected'
)
update public.connected_accounts account
set status = 'disconnected',
    encrypted_access_token = 'disconnected',
    token_expires_at = null,
    updated_at = now()
from ranked
where account.id = ranked.id and ranked.position > 1;

create unique index if not exists connected_accounts_one_active_instagram_per_user
  on public.connected_accounts(user_id)
  where provider = 'instagram' and status = 'connected';

-- Only the administrator has a team-wide view. Every other role sees metrics
-- and publications belonging to their own connected account/work.
drop policy if exists publications_read on public.publications;
create policy publications_read
on public.publications
for select
to authenticated
using (
  private.is_active()
  and (
    private.current_role() = 'admin'
    or created_by = (select auth.uid())
    or posted_by = (select auth.uid())
  )
);

drop policy if exists metrics_read on public.metric_snapshots;
create policy metrics_read
on public.metric_snapshots
for select
to authenticated
using (
  private.is_active()
  and exists (
    select 1
    from public.publications publication
    where publication.id = metric_snapshots.publication_id
  )
);

drop policy if exists news_read on public.news_items;
create policy news_read
on public.news_items
for select
to authenticated
using (
  private.is_active()
  and (
    private.current_role() = 'admin'
    or created_by = (select auth.uid())
    or assigned_to = (select auth.uid())
  )
);

drop policy if exists profiles_read on public.profiles;
create policy profiles_read
on public.profiles
for select
to authenticated
using (
  private.is_active()
  and (private.current_role() = 'admin' or id = (select auth.uid()))
);

comment on index public.connected_accounts_one_active_instagram_per_user is
  'Guarantees one persistent active Instagram account per Copy News user.';
