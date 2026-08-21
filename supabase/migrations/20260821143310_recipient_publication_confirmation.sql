alter table public.news_send_history
  add column if not exists recipient_confirmed_at timestamptz,
  add column if not exists confirmed_by_recipient_name text,
  add column if not exists confirmed_publication_id uuid references public.publications(id) on delete set null;

alter table public.publications
  add column if not exists confirmed_recipient_id uuid references public.distribution_recipients(id) on delete set null,
  add column if not exists confirmed_recipient_name text;

create index if not exists publications_confirmed_recipient_idx
  on public.publications (confirmed_recipient_id, published_at desc)
  where confirmed_recipient_id is not null;

comment on column public.news_send_history.recipient_confirmed_at is
  'When the receiver used the secret delivery link to confirm publication.';
