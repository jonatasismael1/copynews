alter table public.news_items
  add column highlight text,
  add column editorial_tone text;

alter table public.news_items
  add constraint news_items_highlight_length
    check (highlight is null or char_length(highlight) between 2 and 50),
  add constraint news_items_editorial_tone_length
    check (editorial_tone is null or char_length(editorial_tone) between 2 and 100);

comment on column public.news_items.highlight is
  'Chamada curta gerada pela IA para uso visual, como tema, ocorrência ou cidade.';
comment on column public.news_items.editorial_tone is
  'Tom editorial classificado automaticamente durante o processamento.';
