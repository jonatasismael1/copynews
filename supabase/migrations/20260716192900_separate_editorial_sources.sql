alter table public.news_items
  add column original_title text,
  add column original_caption text,
  add column clean_original_caption text,
  add column raw_ocr_text text;

update public.news_items
set
  original_caption = source_caption,
  clean_original_caption = source_caption,
  raw_ocr_text = ocr_text
where source_caption is not null
   or ocr_text is not null;

comment on column public.news_items.original_title is
  'Título jornalístico limpo extraído da fonte e editável pela equipe.';
comment on column public.news_items.original_caption is
  'Legenda original integral recuperada da fonte.';
comment on column public.news_items.clean_original_caption is
  'Legenda original sem assinatura, propaganda ou contatos; fonte editorial da IA.';
comment on column public.news_items.raw_ocr_text is
  'OCR integral mantido somente para auditoria e nunca enviado ao gerador editorial.';
