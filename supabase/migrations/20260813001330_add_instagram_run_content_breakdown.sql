alter table public.instagram_collection_runs
  add column collaborations_made integer not null default 0 check (collaborations_made >= 0),
  add column collaborations_received integer not null default 0 check (collaborations_received >= 0),
  add column reels_count integer not null default 0 check (reels_count >= 0),
  add column posts_count integer not null default 0 check (posts_count >= 0),
  add column carousels_count integer not null default 0 check (carousels_count >= 0);

comment on column public.instagram_collection_runs.collaborations_made is
  'Posts colaborativos cujo autor é um dos perfis acompanhados.';
comment on column public.instagram_collection_runs.collaborations_received is
  'Participações dos perfis acompanhados em posts cujo autor é outro perfil.';
