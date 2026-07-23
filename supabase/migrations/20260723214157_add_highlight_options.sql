alter table public.news_items
  add column highlight_options text[] not null default '{}';

update public.news_items
set highlight_options = array[highlight]
where highlight is not null
  and cardinality(highlight_options) = 0;

alter table public.news_items
  add constraint news_items_highlight_options_count
    check (cardinality(highlight_options) <= 3);

comment on column public.news_items.highlight_options is
  'Até três chamadas curtas geradas pela IA; highlight armazena a opção escolhida.';
