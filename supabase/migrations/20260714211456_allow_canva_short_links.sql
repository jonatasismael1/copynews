alter table public.profiles
  drop constraint if exists profiles_canva_video_url_check;
alter table public.profiles
  add constraint profiles_canva_video_url_check
  check (
    canva_video_url is null or
    canva_video_url ~ '^https://([^/]+\.)?(canva\.com|canva\.link)(/|$)'
  );

alter table public.profiles
  drop constraint if exists profiles_canva_image_url_check;
alter table public.profiles
  add constraint profiles_canva_image_url_check
  check (
    canva_image_url is null or
    canva_image_url ~ '^https://([^/]+\.)?(canva\.com|canva\.link)(/|$)'
  );

comment on column public.profiles.canva_video_url is
  'HTTPS Canva editor link, including short links from canva.link.';
comment on column public.profiles.canva_image_url is
  'HTTPS Canva editor link, including short links from canva.link.';
