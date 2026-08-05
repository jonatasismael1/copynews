update public.design_templates
set
  config_json = config_json || case format
    when 'portrait' then '{"titleColor":"#ffffff","categoryMinWidth":540,"categoryMaxWidth":860,"categoryHeight":72}'::jsonb
    when 'square' then '{"titleColor":"#ffffff","categoryMinWidth":520,"categoryMaxWidth":820,"categoryHeight":68}'::jsonb
    else '{}'::jsonb
  end,
  updated_at = now()
where slug in (
  'frances-news-post-vertical',
  'frances-news-post-quadrado'
);

update public.design_template_layers as layer
set
  config_json = layer.config_json || case
    when layer.layer_key = 'title' then
      jsonb_build_object('textColor', '#ffffff')
    when template.format = 'portrait' then
      jsonb_build_object(
        'y', 852,
        'height', 72,
        'fontSize', 36,
        'minWidth', 540,
        'maxWidth', 860
      )
    else
      jsonb_build_object(
        'y', 682,
        'height', 68,
        'fontSize', 34,
        'minWidth', 520,
        'maxWidth', 820
      )
  end,
  updated_at = now()
from public.design_templates as template
where layer.template_id = template.id
  and template.slug in (
    'frances-news-post-vertical',
    'frances-news-post-quadrado'
  )
  and layer.layer_key in ('title', 'category');
