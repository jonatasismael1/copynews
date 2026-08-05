alter table public.design_templates
  drop constraint if exists design_templates_format_check;

alter table public.design_templates
  add constraint design_templates_format_check
  check (format in ('story', 'portrait', 'square'));

update public.design_templates
set
  name = 'Francês News — Story/Reel',
  config_json = config_json || jsonb_build_object(
    'ratio', '9:16',
    'fontFamilies', jsonb_build_array('Open Sans', 'Sora'),
    'recommendedFor', 'Vídeos verticais',
    'titleSurface', 'box'
  )
where slug = 'frances-news-story-padrao';

insert into public.design_templates (
  organization_id,
  name,
  slug,
  format,
  width,
  height,
  config_json,
  is_active,
  is_default
)
select
  organization.id,
  template.name,
  template.slug,
  template.format,
  1080,
  template.height,
  template.config_json,
  true,
  false
from public.organizations organization
cross join (
  values
    (
      'Francês News — Post vertical',
      'frances-news-post-vertical',
      'portrait',
      1350,
      '{"ratio":"4:5","fontFamilies":["Sora","Open Sans"],"recommendedFor":"Feed e carrossel","titleSurface":"gradient"}'::jsonb
    ),
    (
      'Francês News — Post quadrado',
      'frances-news-post-quadrado',
      'square',
      1080,
      '{"ratio":"1:1","fontFamilies":["Sora","Open Sans"],"recommendedFor":"Imagens quadradas","titleSurface":"gradient"}'::jsonb
    )
) as template(name, slug, format, height, config_json)
on conflict (organization_id, slug) do update
set
  name = excluded.name,
  format = excluded.format,
  width = excluded.width,
  height = excluded.height,
  config_json = excluded.config_json,
  is_active = true,
  updated_at = now();

insert into public.design_template_layers (
  template_id,
  layer_key,
  layer_type,
  z_index,
  config_json,
  is_visible,
  is_locked
)
select
  template.id,
  layer.layer_key,
  layer.layer_type,
  layer.z_index,
  layer.config_json,
  true,
  layer.is_locked
from public.design_templates template
cross join lateral (
  values
    ('background', 'background', 0, jsonb_build_object('x',0,'y',0,'width',template.width,'height',template.height,'fill','#111111'), true),
    ('media', 'media', 10, jsonb_build_object('x',0,'y',0,'width',template.width,'height',template.height,'fit','cover'), false),
    ('overlay', 'overlay', 20, jsonb_build_object(
      'style', case when template.format = 'story' then 'subtle' else 'bottom-gradient' end,
      'y', case template.format when 'story' then 1120 when 'portrait' then 690 else 520 end,
      'width', template.width,
      'height', template.height - case template.format when 'story' then 1120 when 'portrait' then 690 else 520 end
    ), true),
    ('brand-signature', 'image', 30, jsonb_build_object(
      'assetUrl','/brand/frances-news-vertical.png',
      'x',930,
      'y',round(template.height * 0.057),
      'width',90,
      'height',least(610,round(template.height * 0.45)),
      'locked',true
    ), true),
    ('title', 'text', 42, jsonb_build_object(
      'x',case when template.format = 'story' then 42 else 70 end,
      'y',case template.format when 'story' then 1390 when 'portrait' then 934 else 754 end,
      'width',case when template.format = 'story' then 996 else 940 end,
      'height',case template.format when 'story' then 250 when 'portrait' then 300 else 236 end,
      'fontFamily',case when template.format = 'story' then 'Open Sans' else 'Sora' end,
      'fontFamilies',jsonb_build_array('Sora','Open Sans'),
      'fontSize',case template.format when 'story' then 64 when 'portrait' then 58 else 52 end,
      'lineHeight',case template.format when 'story' then 1.04 when 'portrait' then 1.08 else 1.06 end,
      'paddingX',case when template.format = 'story' then 26 else 12 end,
      'paddingY',case template.format when 'story' then 20 when 'portrait' then 12 else 10 end,
      'maxLines',case when template.format = 'story' then 3 else 4 end,
      'surface',case when template.format = 'story' then 'box' else 'gradient' end
    ), false),
    ('category', 'text', 50, jsonb_build_object(
      'y',case template.format when 'story' then 1316 when 'portrait' then 866 else 694 end,
      'height',case template.format when 'story' then 64 when 'portrait' then 58 else 56 end,
      'fontSize',case template.format when 'story' then 36 when 'portrait' then 34 else 32 end,
      'minWidth',case when template.format = 'square' then 320 else 330 end,
      'maxWidth',case template.format when 'story' then 820 when 'portrait' then 760 else 740 end,
      'autoWidth',true,
      'lockedPosition',true
    ), false)
) as layer(layer_key, layer_type, z_index, config_json, is_locked)
where template.slug in (
  'frances-news-story-padrao',
  'frances-news-post-vertical',
  'frances-news-post-quadrado'
)
on conflict (template_id, layer_key) do update
set
  layer_type = excluded.layer_type,
  z_index = excluded.z_index,
  config_json = design_template_layers.config_json || excluded.config_json,
  is_visible = excluded.is_visible,
  is_locked = excluded.is_locked,
  updated_at = now();
