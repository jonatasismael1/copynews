# Arquitetura do Copy News

```text
React/Vite (Netlify)
  ├─ Supabase Auth + PostgreSQL + RLS
  ├─ Edge Functions (admin, validação, IA curta, URLs assinadas)
  └─ processing_jobs (fila persistente)
       └─ Worker Railway
           ├─ Cobalt externo → mídia
           ├─ ffmpeg → áudio e frames
           ├─ OpenRouter STT → transcrição
           ├─ OpenRouter Vision → OCR modular
           └─ OpenRouter Structured Outputs → copy
```

O navegador nunca recebe chaves privadas. A mídia fica em bucket privado, com URL assinada curta e retenção temporária. O áudio é segmentado antes do endpoint dedicado de STT; OCR e copy usam JSON validado com Zod. Cada etapa concluída é gravada em `step_results`; uma retomada começa na primeira etapa ausente.

O dashboard consulta `publications.published_at` no fuso `America/Maceio`, com filtros de período, metas, produção por usuário, distribuição por página, ranking e snapshots atuais. `news_items` continua separado de `publications`, permitindo várias publicações vinculadas ou publicações externas.
